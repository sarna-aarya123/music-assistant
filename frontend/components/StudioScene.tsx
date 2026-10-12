"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";

export type StudioObject = "monitor" | "mic" | "drums";

type Vec3 = [number, number, number];
type CameraTarget = { pos: Vec3; look: Vec3 };

// Where the camera sits for each view. Overview frames the whole desk; each object gets a close-up.
const VIEWS: Record<StudioObject | "overview", CameraTarget> = {
  overview: { pos: [0.4, 2.3, 4.6], look: [0.4, 1.2, -1.4] },
  monitor: { pos: [-1.2, 2.0, 0.5], look: [-1.2, 1.75, -1.9] },
  drums: { pos: [1.3, 2.35, 0.2], look: [1.3, 0.95, -1.2] },
  mic: { pos: [2.9, 2.0, 1.3], look: [2.9, 1.6, -0.5] },
};
// Where the camera starts before the "zoom into the studio" dolly-in.
const START_POSITION: Vec3 = [0.4, 4.2, 13];

type SceneProps = {
  selected: StudioObject | null;
  onSelect: (object: StudioObject | null) => void;
  /** 0-1 readings for this section, already normalized by the caller. */
  loudness01: number;
  brightness01: number;
  density01: number;
  colors: ThemeColors;
};

/** Eases the camera toward the current view target every frame, with a little pointer parallax. */
function CameraRig({ selected }: { selected: StudioObject | null }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(...VIEWS.overview.look));
  const wantPos = useMemo(() => new THREE.Vector3(), []);
  const wantLook = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const view = VIEWS[selected ?? "overview"];
    // Frame-rate independent exponential smoothing.
    const k = 1 - Math.pow(0.0015, dt);
    const parallax = selected ? 0.05 : 0.35;
    // The vertical fov is fixed, so a portrait/narrow canvas sees much less width — pull the
    // camera back (more for the overview, a little for close-ups) until the desk fits.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const narrow = Math.max(0, 1.6 - aspect);
    const pullBack = narrow * (selected ? 2.2 : 5.5);
    wantPos.set(
      view.pos[0] + state.pointer.x * parallax,
      view.pos[1] + state.pointer.y * parallax * 0.5 + pullBack * 0.25,
      view.pos[2] + pullBack
    );
    wantLook.set(...view.look);
    camera.position.lerp(wantPos, k);
    look.current.lerp(wantLook, k);
    camera.lookAt(look.current);
  });
  return null;
}

/** Wraps a clickable prop: hover lift + pointer cursor, click selects it. */
function Clickable({
  id,
  position,
  selected,
  onSelect,
  markerColor,
  markerY,
  children,
}: {
  id: StudioObject;
  position: Vec3;
  selected: StudioObject | null;
  onSelect: (o: StudioObject | null) => void;
  markerColor: string;
  markerY: number;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const active = selected === id;

  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  useFrame((state, dt) => {
    if (group.current) {
      const target = hover || active ? 1.06 : 1;
      const s = group.current.scale.x + (target - group.current.scale.x) * Math.min(1, dt * 10);
      group.current.scale.setScalar(s);
    }
    if (marker.current) {
      marker.current.position.y = markerY + Math.sin(state.clock.elapsedTime * 2.2 + position[0]) * 0.06;
      marker.current.rotation.y += dt * 1.6;
      marker.current.visible = !active;
    }
  });

  return (
    <group
      ref={group}
      position={position}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
      }}
      onPointerOut={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
    >
      {children}
      {/* Bobbing diamond: the "you can click this" cue. */}
      <mesh ref={marker} position={[0, markerY, 0]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={1.2} flatShading />
      </mesh>
    </group>
  );
}

const BAR_COUNT = 20;

/** Monitor: a spectrum whose peak sits further right the brighter the section is. */
function Monitor({ brightness01, colors }: { brightness01: number; colors: ThemeColors }) {
  const bars = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < BAR_COUNT; i++) {
      const bar = bars.current[i];
      if (!bar) continue;
      const x = i / (BAR_COUNT - 1);
      const peak = Math.exp(-Math.pow((x - brightness01) / 0.28, 2));
      const wobble = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.9);
      const h = 0.06 + (0.55 * peak + 0.1) * (0.65 + 0.35 * wobble);
      bar.scale.y = h;
      bar.position.y = -0.4 + h / 2;
    }
  });

  return (
    <group>
      {/* stand */}
      <mesh position={[0, -0.7, -0.05]}>
        <boxGeometry args={[0.18, 0.5, 0.12]} />
        <meshStandardMaterial color="#2a2250" flatShading />
      </mesh>
      <mesh position={[0, -0.96, 0.02]}>
        <boxGeometry args={[0.7, 0.05, 0.4]} />
        <meshStandardMaterial color="#2a2250" flatShading />
      </mesh>
      {/* bezel + screen */}
      <mesh>
        <boxGeometry args={[1.8, 1.1, 0.1]} />
        <meshStandardMaterial color="#17122e" flatShading />
      </mesh>
      <mesh position={[0, 0, 0.056]}>
        <planeGeometry args={[1.64, 0.94]} />
        <meshStandardMaterial color="#07061a" emissive={colors.accent2} emissiveIntensity={0.12} />
      </mesh>
      <group position={[0, 0, 0.07]}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              bars.current[i] = el;
            }}
            position={[-0.7 + i * (1.4 / (BAR_COUNT - 1)), 0, 0]}
          >
            <boxGeometry args={[0.045, 1, 0.02]} />
            <meshStandardMaterial color={colors.accent2} emissive={colors.accent2} emissiveIntensity={1.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const PAD_ORDER = [0, 5, 10, 15, 2, 7, 8, 13, 1, 4, 11, 14, 3, 6, 9, 12];

/** Drum machine: a 4x4 pad grid — the busier the section, the more pads are lit and the faster they pulse. */
function DrumMachine({ density01, colors }: { density01: number; colors: ThemeColors }) {
  const pads = useRef<(THREE.Mesh | null)[]>([]);
  const lit = Math.max(1, Math.round(density01 * 16));
  const litSet = useMemo(() => new Set(PAD_ORDER.slice(0, lit)), [lit]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const speed = 2 + density01 * 8;
    for (let i = 0; i < 16; i++) {
      const pad = pads.current[i];
      if (!pad) continue;
      const mat = pad.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = litSet.has(i) ? 0.35 + 1.3 * Math.max(0, Math.sin(t * speed + i * 1.7)) : 0.04;
    }
  });

  return (
    <group>
      <mesh>
        <boxGeometry args={[1.5, 0.16, 1.1]} />
        <meshStandardMaterial color="#1d1740" flatShading />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <mesh
            key={i}
            ref={(el) => {
              pads.current[i] = el;
            }}
            position={[-0.48 + col * 0.32, 0.1, -0.36 + row * 0.24]}
          >
            <boxGeometry args={[0.26, 0.05, 0.19]} />
            <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={0.1} flatShading />
          </mesh>
        );
      })}
    </group>
  );
}

/** Microphone: sound rings radiate from the capsule — louder section, brighter and faster rings. */
function Microphone({ loudness01, colors }: { loudness01: number; colors: ThemeColors }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const speed = 0.35 + loudness01 * 0.9;
    for (let i = 0; i < 3; i++) {
      const ring = rings.current[i];
      if (!ring) continue;
      const phase = (t * speed + i / 3) % 1;
      ring.scale.setScalar(0.6 + phase * 1.8);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * (0.15 + loudness01 * 0.75);
    }
  });

  return (
    <group>
      {/* base, pole, boom */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.38, 0.45, 0.08, 8]} />
        <meshStandardMaterial color="#2a2250" flatShading />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.5, 6]} />
        <meshStandardMaterial color="#3a2f6b" flatShading />
      </mesh>
      {/* capsule */}
      <mesh position={[0, 1.7, 0]}>
        <capsuleGeometry args={[0.15, 0.34, 3, 8]} />
        <meshStandardMaterial color="#cfc8ee" emissive={colors.gold} emissiveIntensity={0.25} flatShading />
      </mesh>
      {/* pop filter */}
      <mesh position={[0, 1.7, 0.28]}>
        <torusGeometry args={[0.34, 0.025, 6, 16]} />
        <meshStandardMaterial color="#17122e" flatShading />
      </mesh>
      {Array.from({ length: 3 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[0, 1.7, 0.4]}
        >
          <torusGeometry args={[0.4, 0.015, 6, 28]} />
          <meshBasicMaterial color={colors.gold} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Speaker({ position, colors }: { position: Vec3; colors: ThemeColors }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.8, 1.3, 0.7]} />
        <meshStandardMaterial color="#17122e" flatShading />
      </mesh>
      <mesh position={[0, 0.2, 0.37]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 10]} />
        <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={0.4} flatShading />
      </mesh>
      <mesh position={[0, -0.35, 0.37]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 10]} />
        <meshStandardMaterial color="#2a2250" flatShading />
      </mesh>
    </group>
  );
}

/** Wall of acoustic foam panels — alternating theme colors. */
function FoamWall({ colors }: { colors: ThemeColors }) {
  const panels = useMemo(() => {
    const out: { x: number; y: number; c: number }[] = [];
    for (let ix = 0; ix < 8; ix++) for (let iy = 0; iy < 3; iy++) out.push({ x: -4.2 + ix * 1.2, y: 1.6 + iy * 1.1, c: (ix + iy) % 3 });
    return out;
  }, []);
  const shades = ["#1d1740", "#241c4d", "#191338"];
  return (
    <group position={[0, 0, -3.95]}>
      {panels.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0]}>
          <boxGeometry args={[1.05, 0.95, 0.12]} />
          <meshStandardMaterial color={shades[p.c]} flatShading />
        </mesh>
      ))}
      {/* neon strip */}
      <mesh position={[0, 4.55, 0.05]}>
        <boxGeometry args={[9.6, 0.06, 0.06]} />
        <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function Room({ colors }: { colors: ThemeColors }) {
  return (
    <group>
      {/* floor + back wall */}
      <mesh position={[0, 0, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 10]} />
        <meshStandardMaterial color="#120e26" />
      </mesh>
      <gridHelper args={[14, 28, colors.accent2, colors.accent2]} position={[0, 0.01, -1]} />
      <mesh position={[0, 3, -4]}>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial color="#0e0a20" />
      </mesh>
      <FoamWall colors={colors} />
      {/* desk */}
      <mesh position={[0, 0.82, -1.5]}>
        <boxGeometry args={[6.4, 0.14, 1.9]} />
        <meshStandardMaterial color="#2b2156" flatShading />
      </mesh>
      {[-3, 3].map((x) => (
        <mesh key={x} position={[x, 0.4, -1.5]}>
          <boxGeometry args={[0.16, 0.8, 1.7]} />
          <meshStandardMaterial color="#1d1740" flatShading />
        </mesh>
      ))}
      <Speaker position={[-3.7, 0.65, -2.6]} colors={colors} />
      <Speaker position={[4.3, 0.65, -2.6]} colors={colors} />
    </group>
  );
}

export default function StudioScene({ selected, onSelect, loudness01, brightness01, density01, colors }: SceneProps) {
  return (
    <Canvas
      camera={{ position: START_POSITION, fov: 45 }}
      dpr={[1, 2]}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0a0818"]} />
      <fog attach="fog" args={["#0a0818", 9, 20]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 6, 5]} intensity={0.9} />
      <pointLight position={[-3.5, 3, 1]} intensity={14} color={colors.accent} />
      <pointLight position={[3.5, 3, 1]} intensity={14} color={colors.accent2} />
      <CameraRig selected={selected} />
      <Room colors={colors} />

      <Clickable id="monitor" position={[-1.2, 1.88, -1.9]} selected={selected} onSelect={onSelect} markerColor={colors.accent2} markerY={0.95}>
        <Monitor brightness01={brightness01} colors={colors} />
      </Clickable>
      <Clickable id="drums" position={[1.3, 0.97, -1.2]} selected={selected} onSelect={onSelect} markerColor={colors.accent} markerY={0.45}>
        <DrumMachine density01={density01} colors={colors} />
      </Clickable>
      <Clickable id="mic" position={[2.9, 0, -0.5]} selected={selected} onSelect={onSelect} markerColor={colors.gold} markerY={2.3}>
        <Microphone loudness01={loudness01} colors={colors} />
      </Clickable>
    </Canvas>
  );
}
