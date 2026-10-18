"use client";

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";

type Vec3 = [number, number, number];

/** Marks every mesh under a group as shadow-casting/receiving, so the placeholder gear (built from
 * a handful of boxes) grounds itself in the room the same way loaded models do. */
export function Shadowed({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    ref.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  });
  return <group ref={ref}>{children}</group>;
}

/** A loaded glTF model, scaled to a target height and set on the floor at `position`. */
export function FitModel({
  url,
  height,
  position,
  rotationY = 0,
}: {
  url: string;
  height: number;
  position: Vec3;
  rotationY?: number;
}) {
  const gltf = useGLTF(url);
  const { object, scale, lift } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const s = size.y > 0 ? height / size.y : 1;
    return { object: clone, scale: s, lift: -box.min.y * s };
  }, [gltf, height]);
  return <primitive object={object} scale={scale} position={[position[0], position[1] + lift, position[2]]} rotation={[0, rotationY, 0]} />;
}

// Materials shared by the placeholder gear: matte black plastic, brushed metal, tolex. Real models
// replace these; until then they at least read as hardware under the studio lighting.
const plastic = { color: "#1b1b1d", roughness: 0.55, metalness: 0.1 } as const;
const steel = { color: "#b9bbbd", roughness: 0.32, metalness: 0.95 } as const;

/** A tiny status LED; glows brighter with `level` (0-1). */
function Led({ level, position, color }: { level: number; position: Vec3; color: string }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((state) => {
    if (mat.current) mat.current.emissiveIntensity = 0.3 + level * 2.2 + Math.sin(state.clock.elapsedTime * 3) * 0.1 * level;
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.03, 12, 10]} />
      <meshStandardMaterial ref={mat} color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  );
}

export function Microphone({ loudness01 }: { loudness01: number }) {
  return (
    <group>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.38, 0.45, 0.08, 32]} />
        <meshStandardMaterial {...plastic} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.6, 16]} />
        <meshStandardMaterial {...plastic} />
      </mesh>
      {/* body + grille */}
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.4, 24]} />
        <meshStandardMaterial color="#26262a" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, 1.83, 0]}>
        <capsuleGeometry args={[0.135, 0.22, 6, 20]} />
        <meshStandardMaterial {...steel} roughness={0.5} />
      </mesh>
      {/* shock mount ring */}
      <mesh position={[0, 1.72, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.012, 8, 32]} />
        <meshStandardMaterial {...plastic} />
      </mesh>
      {/* pop filter */}
      <mesh position={[0, 1.78, 0.3]}>
        <cylinderGeometry args={[0.28, 0.28, 0.025, 36]} />
        <meshStandardMaterial color="#2c2c30" roughness={0.9} transparent opacity={0.85} />
      </mesh>
      <Led level={loudness01} position={[0, 1.4, 0.135]} color="#ff3b2f" />
    </group>
  );
}

/** Studio monitor: the woofer cone pulses with the section's loudness. */
export function Speaker({ loudness01 }: { loudness01: number }) {
  const woofer = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (woofer.current) {
      const t = state.clock.elapsedTime;
      woofer.current.position.z = 0.355 + Math.sin(t * (6 + loudness01 * 14)) * 0.01 * (0.3 + loudness01);
    }
  });
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.8, 1.3, 0.7]} />
        <meshStandardMaterial {...plastic} />
      </mesh>
      {/* woofer: surround ring, cone, dust cap */}
      <mesh position={[0, -0.25, 0.352]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.27, 0.035, 12, 36]} />
        <meshStandardMaterial color="#0c0c0d" roughness={0.9} />
      </mesh>
      <mesh ref={woofer} position={[0, -0.25, 0.355]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.27, 0.12, 0.08, 36, 1, true]} />
        <meshStandardMaterial color="#242427" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.25, 0.37]}>
        <sphereGeometry args={[0.07, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#0e0e10" roughness={0.5} />
      </mesh>
      {/* tweeter dome */}
      <mesh position={[0, 0.34, 0.352]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.02, 10, 28]} />
        <meshStandardMaterial {...steel} />
      </mesh>
      <mesh position={[0, 0.34, 0.358]}>
        <sphereGeometry args={[0.075, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#d8d8d4" roughness={0.35} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Amp: tolex cabinet, grille cloth, a gold control panel, and a jewel light that follows how much
 * of the section sits in the low end. */
export function Amp({ lowEnd01 }: { lowEnd01: number }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.5, 1.1, 0.75]} />
        <meshStandardMaterial color="#17161a" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.38, 0.38]}>
        <boxGeometry args={[1.3, 0.68, 0.02]} />
        <meshStandardMaterial color="#bba783" roughness={1} />
      </mesh>
      <mesh position={[0, 0.96, 0.375]}>
        <boxGeometry args={[1.42, 0.16, 0.02]} />
        <meshStandardMaterial color="#c8a64d" roughness={0.35} metalness={0.85} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i} position={[-0.55 + i * 0.22, 0.97, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 16]} />
          <meshStandardMaterial color="#101012" roughness={0.45} metalness={0.2} />
        </mesh>
      ))}
      <Led level={lowEnd01} position={[0.64, 0.97, 0.4]} color="#ff3b2f" />
    </group>
  );
}

/** Mixer: faders slide to different heights, and move more the more the section's level swings. */
export function Mixer({ swing01 }: { swing01: number }) {
  const faders = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < 8; i++) {
      const f = faders.current[i];
      if (!f) continue;
      f.position.z = -0.05 + Math.sin(t * (0.8 + i * 0.23) + i) * (0.05 + swing01 * 0.2);
    }
  });

  return (
    <group rotation={[-0.14, 0, 0]}>
      <mesh>
        <boxGeometry args={[2.6, 0.2, 1.3]} />
        <meshStandardMaterial color="#2a2d31" roughness={0.5} metalness={0.5} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[-1.05 + i * 0.3, 0.11, 0]}>
          <mesh position={[0, 0, 0.1]}>
            <boxGeometry args={[0.035, 0.02, 0.7]} />
            <meshStandardMaterial color="#08080a" roughness={0.8} />
          </mesh>
          <mesh
            ref={(el) => {
              faders.current[i] = el;
            }}
            position={[0, 0.03, 0]}
          >
            <boxGeometry args={[0.13, 0.05, 0.1]} />
            <meshStandardMaterial color="#d9d8d2" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.02, -0.5]}>
            <cylinderGeometry args={[0.06, 0.06, 0.05, 20]} />
            <meshStandardMaterial color={i % 4 === 0 ? "#cd3428" : "#16161a"} roughness={0.45} metalness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}


/** The studio shell shared by both scenes: a wooden floor, a plaster wall hung with felt acoustic
 * panels (a couple in the signal red), and a bright window that the key light appears to come
 * through. `s` scales the whole shell, so the wide waveform view and the close-up studio are the
 * same room at different distances. */
export function RoomShell({ colors, s = 1 }: { colors: ThemeColors; s?: number }) {
  const felt = ["#6c6558", "#85806f", "#514b41"];
  const windowX = -4.6 * s;
  const panels = useMemo(() => {
    const out: { x: number; y: number; c: number; red: boolean }[] = [];
    const cols = Math.ceil(40 / 1.5);
    for (let ix = 0; ix < cols; ix++) {
      const x = (ix - (cols - 1) / 2) * 1.5 * s;
      if (Math.abs(x - windowX) < 1.7 * s) continue; // leave the window clear
      for (let iy = 0; iy < 2; iy++) out.push({ x, y: (1.7 + iy * 1.4) * s, c: (ix * 2 + iy) % 3, red: (ix * 7 + iy * 3) % 11 === 0 });
    }
    return out;
  }, [s, windowX]);

  return (
    <group>
      {/* Generous on purpose: tall/narrow screens see a lot of floor and wall, never an edge. */}
      <mesh position={[0, 0, 18 * s]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[60 * s, 44 * s]} />
        <meshStandardMaterial color="#c8b79a" roughness={0.55} />
      </mesh>
      <mesh position={[0, 8 * s, -4 * s]} receiveShadow>
        <planeGeometry args={[60 * s, 16 * s]} />
        <meshStandardMaterial color="#e8e1d1" roughness={1} />
      </mesh>
      <group position={[windowX, 2.6 * s, -3.93 * s]}>
        <mesh>
          <planeGeometry args={[2.0 * s, 2.6 * s]} />
          <meshBasicMaterial color="#fffdf6" toneMapped={false} />
        </mesh>
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x * s, 0, 0.01 * s]}>
            <boxGeometry args={[0.06 * s, 2.6 * s, 0.04 * s]} />
            <meshStandardMaterial color="#d8d0bd" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.01 * s]}>
          <boxGeometry args={[2.0 * s, 0.06 * s, 0.04 * s]} />
          <meshStandardMaterial color="#d8d0bd" roughness={0.6} />
        </mesh>
      </group>
      {panels.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, -3.9 * s]} castShadow receiveShadow>
          <boxGeometry args={[1.3 * s, 1.2 * s, 0.1 * s]} />
          <meshStandardMaterial color={p.red ? colors.accent : felt[p.c]} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
