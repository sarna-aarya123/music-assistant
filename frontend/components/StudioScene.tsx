"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";
import type { StudioObjectId, StudioReading } from "@/lib/windowStats";
import { Amp, FitModel, Microphone, Mixer, RoomShell, Shadowed, Speaker } from "@/components/StudioParts";

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
  /** Slight mood hint mixed into the light; null = none. */
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

/** Wraps a clickable prop: hover lift, pointer cursor, click to select, a small red marker, and —
 * when selected — a readout card beside the object. */
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
  const marker = useRef<THREE.Group>(null);
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
      const target = hover || active ? 1.04 : 1;
      group.current.scale.setScalar(group.current.scale.x + (target - group.current.scale.x) * Math.min(1, dt * 10));
    }
    if (marker.current) {
      const t = state.clock.elapsedTime;
      marker.current.position.y = markerY + Math.sin(t * 2 + position[0]) * 0.04;
      marker.current.scale.setScalar(1 + Math.sin(t * 3 + position[0]) * 0.12);
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
      <Shadowed>{children}</Shadowed>
      {/* "Click me" hotspot: a small solid dot inside a thin ring, like a map pin. */}
      <group ref={marker} position={[0, markerY, 0]}>
        <mesh>
          <sphereGeometry args={[0.07, 16, 12]} />
          <meshBasicMaterial color={markerColor} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.14, 0.012, 6, 28]} />
          <meshBasicMaterial color={markerColor} />
        </mesh>
      </group>
      {active && showCard && (
        <Html position={cardOffset} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="w-64 -translate-y-1/2 border border-ink/70 bg-surface p-4 text-left text-ink shadow-[0_14px_30px_-18px_rgba(22,20,15,0.6)]">
            <div className="text-xs text-muted">{reading.title}</div>
            <div className="font-display text-2xl leading-tight">{reading.subject}</div>
            <dl className="my-2 space-y-0.5 border-y border-ink/15 py-2">
              {reading.stats.map((s) => (
                <div key={s.label} className="flex justify-between text-sm">
                  <dt className="text-muted">{s.label}</dt>
                  <dd className="num font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[15px] leading-snug">{reading.summary}</p>
          </div>
        </Html>
      )}
    </group>
  );
}

/** The close-up room: the shared shell plus the desk, with the real lamp and stool on it. */
function Room({ colors }: { colors: ThemeColors }) {
  return (
    <group>
      <RoomShell colors={colors} />
      <mesh position={[0, 0.82, -1.5]} castShadow receiveShadow>
        <boxGeometry args={[6.6, 0.1, 1.9]} />
        <meshStandardMaterial color="#8b6a46" roughness={0.5} />
      </mesh>
      {[-3.1, 3.1].map((x) => (
        <mesh key={x} position={[x, 0.4, -1.5]} castShadow receiveShadow>
          <boxGeometry args={[0.14, 0.78, 1.7]} />
          <meshStandardMaterial color="#2a2520" roughness={0.6} />
        </mesh>
      ))}
      <Suspense fallback={null}>
        <FitModel url="/models/desk_lamp_arm_01/desk_lamp_arm_01.gltf" height={1.9} position={[2.2, 0.87, -1.95]} rotationY={-0.5} />
        <FitModel url="/models/folding_wooden_stool/folding_wooden_stool.gltf" height={1.0} position={[0.9, 0, 0.5]} rotationY={0.6} />
      </Suspense>
    </group>
  );
}

export default function StudioScene({ selected, onSelect, levels, readings, colors, mood, hideCards }: SceneProps) {
  return (
    <Canvas
      camera={{ position: START_POSITION, fov: 45 }}
      dpr={[1, 2]}
      shadows
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <color attach="background" args={[colors.background]} />
      <fog attach="fog" args={[colors.background, 14, 30]} />
      <Suspense fallback={null}>
        <Environment files="/hdri/studio.hdr" environmentIntensity={0.85} />
      </Suspense>
      <directionalLight
        position={[-6, 8, 5]}
        intensity={2.2}
        color="#fff3df"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={7}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />
      {mood && <pointLight position={[0, 4, 3]} intensity={6} color={mood} />}
      <CameraRig selected={selected} hideCards={hideCards} />
      <Room colors={colors} />
      <ContactShadows position={[0, 0.011, -0.5]} opacity={0.35} scale={16} blur={2.6} far={3} />

      <Clickable id="speaker" position={[-2.3, 1.55, -1.7]} selected={selected} onSelect={onSelect} markerColor={colors.accent} markerY={1.0} reading={readings.speaker} cardOffset={[1.0, 0.2, 0.4]} showCard={!hideCards}>
        <Speaker loudness01={levels.loudness01} />
      </Clickable>
      <Clickable id="mixer" position={[0, 0.99, -1.4]} selected={selected} onSelect={onSelect} markerColor={colors.accent} markerY={0.55} reading={readings.mixer} cardOffset={[1.7, 0.6, 0.2]} showCard={!hideCards}>
        <Mixer swing01={levels.swing01} />
      </Clickable>
      <Clickable id="mic" position={[-3.5, 0, -0.4]} selected={selected} onSelect={onSelect} markerColor={colors.accent} markerY={2.3} reading={readings.mic} cardOffset={[1.2, 1.7, 0.2]} showCard={!hideCards}>
        <Microphone loudness01={levels.loudness01} />
      </Clickable>
      <Clickable id="amp" position={[3.5, 0, -1.6]} selected={selected} onSelect={onSelect} markerColor={colors.accent} markerY={1.5} reading={readings.amp} cardOffset={[-1.1, 1.0, 0.4]} showCard={!hideCards}>
        <Amp lowEnd01={levels.lowEnd01} />
      </Clickable>
    </Canvas>
  );
}
