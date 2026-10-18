"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";
import type { StudioObjectId, StudioReading } from "@/lib/windowStats";

type Vec3 = [number, number, number];
type CameraTarget = { pos: Vec3; look: Vec3; /** Which side of the object its readout card sits on (+1 right, -1 left). */ side: 1 | -1 };

// Where the camera sits for each view. Overview frames the whole room; each object gets a close-up
// that leaves room on the side for its readout card.
const VIEWS: Record<StudioObjectId | "overview", CameraTarget> = {
  overview: { pos: [0, 2.4, 6.2], look: [0, 1.2, -1.4], side: 1 },
  mic: { pos: [-3.3, 2.0, 1.6], look: [-3.3, 1.55, -0.4], side: 1 },
  speaker: { pos: [-2.3, 2.0, 1.2], look: [-2.3, 1.55, -1.6], side: 1 },
  mixer: { pos: [0, 2.5, 1.0], look: [0, 1.0, -1.2], side: 1 },
  amp: { pos: [3.5, 1.6, 2.0], look: [3.5, 0.8, -1.6], side: -1 },
};
// Where the camera starts, before easing in to the overview — the "arrive in the studio" move.
const START_POSITION: Vec3 = [0, 3.4, 11];

/** 0-1 readings for the selected span, normalized by the caller so the props can react to them. */
export type StudioLevels = { loudness01: number; brightness01: number; lowEnd01: number; swing01: number };

type SceneProps = {
  selected: StudioObjectId | null;
  onSelect: (object: StudioObjectId | null) => void;
  levels: StudioLevels;
  readings: Record<StudioObjectId, StudioReading>;
  colors: ThemeColors;
  /** Slight mood hint mixed into the lighting; null = none. */
  mood: string | null;
  /** True on portrait screens, where the parent shows the readout as a bottom sheet instead. */
  hideCards: boolean;
};

function CameraRig({ selected, hideCards }: { selected: StudioObjectId | null; hideCards: boolean }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(...VIEWS.overview.look));
  const wantPos = useMemo(() => new THREE.Vector3(), []);
  const wantLook = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const view = VIEWS[selected ?? "overview"];
    const k = 1 - Math.pow(0.0015, dt);
    const parallax = selected ? 0.05 : 0.35;
    // The vertical fov is fixed, so a narrow canvas sees far less width. In the overview, back the
    // camera up until the objects at the room's edges (about +/-4.8 units) fit; close-ups just
    // get a smaller pull-back so their readout card keeps room.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const fitZ = 4.8 / (Math.tan(THREE.MathUtils.degToRad(22.5)) * aspect) - 1;
    const pullBack = selected ? Math.max(0, 1.6 - aspect) * 3.5 : Math.max(0, fitZ - view.pos[2]);
    // Close-ups: slide the camera sideways so the object sits ~30% in from the edge opposite its
    // readout card, leaving the card room to open beside it.
    const dist = view.pos[2] + pullBack - view.look[2];
    const shift = selected && !hideCards ? view.side * 0.3 * Math.tan(THREE.MathUtils.degToRad(22.5)) * dist * aspect : 0;
    wantPos.set(
      view.pos[0] + shift + state.pointer.x * parallax,
      view.pos[1] + state.pointer.y * parallax * 0.5 + pullBack * 0.2,
      view.pos[2] + pullBack
    );
    wantLook.set(view.look[0] + shift, view.look[1], view.look[2]);
    camera.position.lerp(wantPos, k);
    look.current.lerp(wantLook, k);
    camera.lookAt(look.current);
  });
  return null;
}

/** Wraps a clickable prop: hover lift, pointer cursor, click to select, and — when selected — a
 * readout card floating beside the object. */
function Clickable({
  id,
  position,
  selected,
  onSelect,
  markerColor,
  markerY,
  reading,
  cardOffset,
  showCard,
  children,
}: {
  id: StudioObjectId;
  position: Vec3;
  selected: StudioObjectId | null;
  onSelect: (o: StudioObjectId | null) => void;
  markerColor: string;
  markerY: number;
  reading: StudioReading;
  cardOffset: Vec3;
  showCard: boolean;
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
      const target = hover || active ? 1.05 : 1;
      group.current.scale.setScalar(group.current.scale.x + (target - group.current.scale.x) * Math.min(1, dt * 10));
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
      <mesh ref={marker} position={[0, markerY, 0]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={markerColor} emissive={markerColor} emissiveIntensity={1.2} flatShading />
      </mesh>
      {active && showCard && (
        <Html position={cardOffset} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="w-64 -translate-y-1/2 rounded-xl border border-white/15 bg-[#0c0a1e]/85 p-3 text-left shadow-2xl backdrop-blur">
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/50">{reading.title}</div>
            <div className="mb-2 font-display text-base uppercase tracking-wide" style={{ color: markerColor }}>
              {reading.subject}
            </div>
            <dl className="mb-2 space-y-1">
              {reading.stats.map((s) => (
                <div key={s.label} className="flex justify-between font-mono text-xs">
                  <dt className="uppercase tracking-widest text-white/50">{s.label}</dt>
                  <dd className="font-semibold text-white">{s.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm leading-snug text-white/90">{reading.summary}</p>
          </div>
        </Html>
      )}
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
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.38, 0.45, 0.08, 8]} />
        <meshStandardMaterial color="#2a2250" flatShading />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.5, 6]} />
        <meshStandardMaterial color="#3a2f6b" flatShading />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <capsuleGeometry args={[0.15, 0.34, 3, 8]} />
        <meshStandardMaterial color="#cfc8ee" emissive={colors.gold} emissiveIntensity={0.25} flatShading />
      </mesh>
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

/** Studio monitor: the woofer cone pulses with the section's loudness; the tweeter glows brighter
 * the brighter the section sounds. */
function Speaker({ brightness01, loudness01, colors }: { brightness01: number; loudness01: number; colors: ThemeColors }) {
  const woofer = useRef<THREE.Mesh>(null);
  const tweeterMat = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (woofer.current) woofer.current.scale.setScalar(1 + Math.sin(t * (4 + loudness01 * 10)) * 0.04 * (0.3 + loudness01));
    if (tweeterMat.current) tweeterMat.current.emissiveIntensity = 0.15 + brightness01 * 1.6;
  });

  return (
    <group>
      <mesh>
        <boxGeometry args={[0.8, 1.3, 0.7]} />
        <meshStandardMaterial color="#17122e" flatShading />
      </mesh>
      <mesh ref={woofer} position={[0, -0.25, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.04, 14]} />
        <meshStandardMaterial color="#2a2250" flatShading />
      </mesh>
      <mesh position={[0, 0.32, 0.37]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.04, 12]} />
        <meshStandardMaterial ref={tweeterMat} color={colors.accent2} emissive={colors.accent2} emissiveIntensity={0.4} flatShading />
      </mesh>
    </group>
  );
}

/** Amp: a glow strip across the grille whose strength follows how much of the section sits in the
 * low end, and knobs along the top. */
function Amp({ lowEnd01, colors }: { lowEnd01: number; colors: ThemeColors }) {
  const strip = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (strip.current) {
      strip.current.emissiveIntensity = 0.2 + lowEnd01 * 1.8 + Math.sin(state.clock.elapsedTime * (2 + lowEnd01 * 4)) * 0.15 * lowEnd01;
    }
  });

  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.5, 1.1, 0.75]} />
        <meshStandardMaterial color="#14101f" flatShading />
      </mesh>
      <mesh position={[0, 0.4, 0.38]}>
        <boxGeometry args={[1.3, 0.7, 0.02]} />
        <meshStandardMaterial color="#241d3a" flatShading />
      </mesh>
      <mesh position={[0, 0.4, 0.4]}>
        <boxGeometry args={[1.2, 0.05, 0.01]} />
        <meshStandardMaterial ref={strip} color={colors.accent} emissive={colors.accent} emissiveIntensity={0.4} />
      </mesh>
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[-0.5 + i * 0.25, 0.97, 0.37]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.06, 10]} />
          <meshStandardMaterial color="#cfc8ee" flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Mixer: faders slide to different heights, and move more the more the section's level swings. */
function Mixer({ swing01, colors }: { swing01: number; colors: ThemeColors }) {
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
        <meshStandardMaterial color="#1d1740" flatShading />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[-1.05 + i * 0.3, 0.11, 0]}>
          <mesh position={[0, 0, 0.1]}>
            <boxGeometry args={[0.035, 0.02, 0.7]} />
            <meshStandardMaterial color="#07061a" />
          </mesh>
          <mesh
            ref={(el) => {
              faders.current[i] = el;
            }}
            position={[0, 0.03, 0]}
          >
            <boxGeometry args={[0.13, 0.05, 0.1]} />
            <meshStandardMaterial color={colors.accent2} emissive={colors.accent2} emissiveIntensity={0.5} flatShading />
          </mesh>
          <mesh position={[0, 0.02, -0.5]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.05, 10]} />
            <meshStandardMaterial color={i % 2 ? "#cfc8ee" : colors.gold} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FoamWall({ colors }: { colors: ThemeColors }) {
  const panels = useMemo(() => {
    const out: { x: number; y: number; c: number }[] = [];
    for (let ix = 0; ix < 10; ix++) for (let iy = 0; iy < 3; iy++) out.push({ x: -5.4 + ix * 1.2, y: 1.6 + iy * 1.1, c: (ix + iy) % 3 });
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
      <mesh position={[0, 4.55, 0.05]}>
        <boxGeometry args={[12, 0.06, 0.06]} />
        <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

function Room({ colors }: { colors: ThemeColors }) {
  return (
    <group>
      <mesh position={[0, 0, -1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 12]} />
        <meshStandardMaterial color="#120e26" />
      </mesh>
      <gridHelper args={[18, 36, colors.accent2, colors.accent2]} position={[0, 0.01, -1]} />
      <mesh position={[0, 3, -4]}>
        <planeGeometry args={[18, 6]} />
        <meshStandardMaterial color="#0e0a20" />
      </mesh>
      <FoamWall colors={colors} />
      <mesh position={[0, 0.82, -1.5]}>
        <boxGeometry args={[6.6, 0.14, 1.9]} />
        <meshStandardMaterial color="#2b2156" flatShading />
      </mesh>
      {[-3.1, 3.1].map((x) => (
        <mesh key={x} position={[x, 0.4, -1.5]}>
          <boxGeometry args={[0.16, 0.8, 1.7]} />
          <meshStandardMaterial color="#1d1740" flatShading />
        </mesh>
      ))}
    </group>
  );
}

export default function StudioScene({ selected, onSelect, levels, readings, colors, mood, hideCards }: SceneProps) {
  return (
    <Canvas
      camera={{ position: START_POSITION, fov: 45 }}
      dpr={[1, 2]}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0a0818"]} />
      <fog attach="fog" args={["#0a0818", 10, 24]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 6, 5]} intensity={0.9} />
      <pointLight position={[-3.5, 3, 1]} intensity={14} color={colors.accent} />
      <pointLight position={[3.5, 3, 1]} intensity={14} color={colors.accent2} />
      {mood && <pointLight position={[0, 4, 2]} intensity={9} color={mood} />}
      <CameraRig selected={selected} hideCards={hideCards} />
      <Room colors={colors} />

      <Clickable id="speaker" position={[-2.3, 1.55, -1.7]} selected={selected} onSelect={onSelect} markerColor={colors.accent2} markerY={1.0} reading={readings.speaker} cardOffset={[1.0, 0.2, 0.4]} showCard={!hideCards}>
        <Speaker brightness01={levels.brightness01} loudness01={levels.loudness01} colors={colors} />
      </Clickable>
      <Clickable id="mixer" position={[0, 0.99, -1.4]} selected={selected} onSelect={onSelect} markerColor={colors.gold} markerY={0.55} reading={readings.mixer} cardOffset={[1.7, 0.6, 0.2]} showCard={!hideCards}>
        <Mixer swing01={levels.swing01} colors={colors} />
      </Clickable>
      <Clickable id="mic" position={[-3.5, 0, -0.4]} selected={selected} onSelect={onSelect} markerColor={colors.gold} markerY={2.3} reading={readings.mic} cardOffset={[1.2, 1.7, 0.2]} showCard={!hideCards}>
        <Microphone loudness01={levels.loudness01} colors={colors} />
      </Clickable>
      <Clickable id="amp" position={[3.5, 0, -1.6]} selected={selected} onSelect={onSelect} markerColor={colors.accent} markerY={1.5} reading={readings.amp} cardOffset={[-1.1, 1.0, 0.4]} showCard={!hideCards}>
        <Amp lowEnd01={levels.lowEnd01} colors={colors} />
      </Clickable>
    </Canvas>
  );
}
