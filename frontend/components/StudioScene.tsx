"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";
import type { StudioObjectId, StudioReading } from "@/lib/windowStats";
import { FitModel, TvScreen } from "@/components/StudioParts";
import { Projector, type Anchor, type AnchorEls } from "@/components/anchors";

type Vec3 = [number, number, number];

type CameraTarget = { pos: Vec3; look: Vec3; /** Which side of the object its readout card sits on (+1 right, -1 left). */ side: 1 | -1 };

// The whole diorama is at real scale, in meters: a 2 m office desk with a TV, radio and cassette
// recorder on it, and a boombox on the floor beside it.
const DESK_TOP = 0.788;
const SPOTS: Record<StudioObjectId, { pos: Vec3; rot: number; scale: number; url: string }> = {
  tv: { pos: [-0.5, DESK_TOP, -0.1], rot: 0.18, scale: 1, url: "/models/Television_01/Television_01.gltf" },
  radio: { pos: [0.5, DESK_TOP, -0.15], rot: -0.25, scale: 1, url: "/models/vintage_radio_transceiver/vintage_radio_transceiver.gltf" },
  cassette: { pos: [0.02, DESK_TOP, 0.22], rot: 0.5, scale: 2.4, url: "/models/cassette_player/cassette_player.gltf" },
  boombox: { pos: [-1.45, 0, 0.2], rot: 0.55, scale: 1, url: "/models/boombox/boombox.gltf" },
};

// Where the camera sits for each view.
const VIEWS: Record<StudioObjectId | "overview", CameraTarget> = {
  overview: { pos: [2.6, 1.75, 3.2], look: [0.0, 0.55, 0.0], side: 1 },
  tv: { pos: [-0.5, 1.2, 1.5], look: [-0.5, 1.0, -0.1], side: 1 },
  radio: { pos: [0.5, 1.2, 1.4], look: [0.5, 1.0, -0.15], side: 1 },
  cassette: { pos: [0.02, 1.15, 1.0], look: [0.02, 0.84, 0.22], side: 1 },
  boombox: { pos: [-1.45, 0.85, 1.6], look: [-1.45, 0.3, 0.2], side: 1 },
};
// Where the camera starts, before easing in to the overview — the "arrive at the desk" move.
const START_POSITION: Vec3 = [4.6, 2.6, 6.2];

type SceneProps = {
  selected: StudioObjectId | null;
  onSelect: (object: StudioObjectId | null) => void;
  readings: Record<StudioObjectId, StudioReading>;
  /** Per-second loudness (dB) of the picked span, drawn on the TV. */
  tvCurveDb: number[];
  tvLabel: string;
  colors: ThemeColors;
  /** Slight mood hint mixed into the backdrop; null = none. */
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
    const k = 1 - Math.pow(0.002, dt);
    const parallax = selected ? 0.03 : 0.25;
    // The vertical fov is fixed, so a narrow canvas sees far less width: back the camera up along
    // its own line of sight until the desk fits.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const pull = Math.max(0, 1.5 - aspect) * (selected ? 0.9 : 3.6);
    const dir = new THREE.Vector3(...view.pos).sub(new THREE.Vector3(...view.look)).normalize();
    // Close-ups: slide sideways so the object sits ~30% in from the edge opposite its readout card.
    const dist = new THREE.Vector3(...view.pos).distanceTo(new THREE.Vector3(...view.look)) + pull;
    const shift = selected && !hideCards ? view.side * 0.3 * Math.tan(THREE.MathUtils.degToRad(17.5)) * dist * aspect : 0;
    wantPos.set(
      view.pos[0] + dir.x * pull + shift + state.pointer.x * parallax,
      view.pos[1] + dir.y * pull + state.pointer.y * parallax * 0.5,
      view.pos[2] + dir.z * pull
    );
    wantLook.set(view.look[0] + shift, view.look[1], view.look[2]);
    camera.position.lerp(wantPos, k);
    look.current.lerp(wantLook, k);
    camera.lookAt(look.current);
  });
  return null;
}

/** A clickable prop: hover feedback and click to select. Its label and readout card are page
 * elements that follow it on screen (see ./anchors), not part of the 3D scene. */
function Clickable({
  id,
  selected,
  onSelect,
  onHover,
  children,
}: {
  id: StudioObjectId;
  selected: StudioObjectId | null;
  onSelect: (o: StudioObjectId | null) => void;
  onHover: (id: StudioObjectId | null) => void;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const active = selected === id;
  const pos = SPOTS[id].pos;

  useEffect(() => {
    if (!hover) return;
    document.body.style.cursor = "pointer";
    onHover(id);
    return () => {
      document.body.style.cursor = "";
      onHover(null);
    };
  }, [hover, id, onHover]);

  useFrame((_, dt) => {
    if (!group.current) return;
    const target = hover || active ? 1.025 : 1;
    group.current.scale.setScalar(group.current.scale.x + (target - group.current.scale.x) * Math.min(1, dt * 10));
  });

  return (
    <group
      ref={group}
      position={[pos[0], 0, pos[2]]}
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
    </group>
  );
}

const TAGS: Record<StudioObjectId, { text: string; y: number; card: Vec3 }> = {
  tv: { text: "TV", y: 0.62, card: [0.4, 0.3, 0] },
  radio: { text: "RADIO", y: 0.55, card: [0.3, 0.25, 0] },
  cassette: { text: "CASSETTE", y: 0.22, card: [0.28, 0.2, 0] },
  boombox: { text: "BOOMBOX", y: 0.62, card: [0.42, 0.3, 0] },
};
const OBJECT_IDS = Object.keys(TAGS) as StudioObjectId[];

export default function StudioScene({ selected, onSelect, readings, tvCurveDb, tvLabel, colors, mood, hideCards }: SceneProps) {
  // The backdrop picks up a faint trace of the track's mood.
  const backdrop = useMemo(() => {
    const c = new THREE.Color(colors.void);
    if (mood) c.lerp(new THREE.Color(mood), 0.05);
    return c;
  }, [colors.void, mood]);

  const [hovered, setHovered] = useState<StudioObjectId | null>(null);
  const els = useRef<Record<string, HTMLElement | null>>({}) as AnchorEls;

  // Every tag, and the selected object's card, follows its 3D point on screen.
  const anchors = useMemo<Anchor[]>(() => {
    const out: Anchor[] = OBJECT_IDS.map((id) => ({
      id: `tag-${id}`,
      world: [SPOTS[id].pos[0], SPOTS[id].pos[1] + TAGS[id].y, SPOTS[id].pos[2]],
      align: "center",
    }));
    if (selected) {
      const p = SPOTS[selected].pos;
      const c = TAGS[selected].card;
      out.push({ id: "card", world: [p[0] + c[0], p[1] + c[1], p[2] + c[2]], align: "right" });
    }
    return out;
  }, [selected]);

  const reading = selected ? readings[selected] : null;
  const spot = (id: StudioObjectId, children: ReactNode) => (
    <Clickable id={id} selected={selected} onSelect={onSelect} onHover={setHovered}>
      {children}
    </Clickable>
  );
  const place = (id: StudioObjectId, extra: Record<string, unknown> = {}) => (
    <FitModel url={SPOTS[id].url} position={[0, SPOTS[id].pos[1], 0]} rotationY={SPOTS[id].rot} scale={SPOTS[id].scale} {...extra} />
  );

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: START_POSITION, fov: 35 }}
        dpr={[1, 2]}
        shadows
        onPointerMissed={() => onSelect(null)}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      >
        <color attach="background" args={[backdrop]} />
        <fog attach="fog" args={[backdrop, 9, 22]} />
        <Suspense fallback={null}>
          <Environment files="/hdri/studio.hdr" environmentIntensity={0.9} />
        </Suspense>
        <directionalLight
          position={[-3, 5, 4]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-3.5}
          shadow-camera-right={3.5}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
          shadow-camera-near={0.5}
          shadow-camera-far={14}
          shadow-bias={-0.0003}
          shadow-radius={6}
        />
        <CameraRig selected={selected} hideCards={hideCards} />
        <Projector anchors={anchors} els={els} />

        {/* Seamless floor: the same grey as the backdrop, so there is no horizon. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[120, 120]} />
          <meshStandardMaterial color={backdrop} roughness={1} />
        </mesh>
        <ContactShadows position={[0, 0.002, 0]} opacity={0.5} scale={9} blur={2.2} far={1.6} resolution={1024} />

        <Suspense fallback={null}>
          {/* the desk and what's around it */}
          <FitModel url="/models/metal_office_desk/metal_office_desk.gltf" position={[0, 0, 0]} />
          <FitModel url="/models/modern_arm_chair_01/modern_arm_chair_01.gltf" position={[0.1, 0, -0.95]} rotationY={3.34} />
          <FitModel url="/models/desk_lamp_arm_01/desk_lamp_arm_01.gltf" position={[0.88, DESK_TOP, -0.28]} rotationY={-2.2} />
          <FitModel url="/models/potted_plant_01/potted_plant_01.gltf" position={[1.5, 0, -0.1]} />

          {spot(
            "tv",
            <>
              {place("tv")}
              <group position={[0, SPOTS.tv.pos[1], 0]} rotation={[0, SPOTS.tv.rot, 0]}>
                <TvScreen curveDb={tvCurveDb} label={tvLabel} width={0.285} height={0.215} position={[-0.075, 0.25, 0.236]} />
              </group>
            </>
          )}
          {spot("radio", place("radio"))}
          {spot("cassette", place("cassette"))}
          {spot("boombox", place("boombox"))}
        </Suspense>
      </Canvas>

      {/* Page elements that follow points in the scene. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {OBJECT_IDS.map(
          (id) =>
            selected !== id && (
              <div
                key={id}
                ref={(el) => {
                  els.current[`tag-${id}`] = el;
                }}
                className="absolute left-0 top-0 opacity-0"
              >
                <span
                  className={`whitespace-nowrap border px-1.5 py-0.5 text-[11px] leading-none text-white ${
                    hovered === id ? "border-accent bg-accent" : "border-white/70 bg-black"
                  }`}
                >
                  {TAGS[id].text}
                </span>
              </div>
            )
        )}
        {reading && !hideCards && (
          <div
            ref={(el) => {
              els.current["card"] = el;
            }}
            className="absolute left-0 top-0 opacity-0"
          >
            <div className="w-64 border border-white/80 bg-black p-3 text-left text-[13px] leading-snug text-white">
              <div className="text-white/60">{reading.title}</div>
              <div className="mb-2 text-base font-bold">{reading.subject}</div>
              <dl className="mb-2 space-y-0.5 border-y border-dashed border-white/30 py-2">
                {reading.stats.map((st) => (
                  <div key={st.label} className="flex justify-between gap-3">
                    <dt className="text-white/60">{st.label}</dt>
                    <dd>{st.value}</dd>
                  </div>
                ))}
              </dl>
              <p>{reading.summary}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
