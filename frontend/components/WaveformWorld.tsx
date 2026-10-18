"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";
import { fmtTime, windowAround, type TimeWindow } from "@/lib/windowStats";
import { Projector, type Anchor, type AnchorEls } from "@/components/anchors";

const WORLD_WIDTH = 36; // world units the whole track spans
const MAX_HEIGHT = 7; // tallest bar
const PLINTH_H = 1.4; // the desk the bars stand on; its top is y = 0
const FLOOR_Y = -PLINTH_H;
// Even the loudest second only fills this fraction of MAX_HEIGHT — leaves visible headroom.
const PEAK_CAP = 0.88;
// A little wider than the waveform itself, so the desk's ends stay in frame.
const FRAME_WIDTH = WORLD_WIDTH + 8;
export const DIVE_MS = 1400;

type Props = {
  loudnessDb: number[];
  brightnessHz: number[];
  durationSec: number;
  colors: ThemeColors;
  /** Slight mood hint mixed into the bar color; null = none. */
  mood: string | null;
  /** Called (rounded to a whole second) as the pointer moves along the waveform; null on leave. */
  onHover: (w: TimeWindow | null) => void;
  /** Set when the user clicked: the window to dive into. The parent waits DIVE_MS before switching. */
  diveTo: TimeWindow | null;
  onPick: (w: TimeWindow) => void;
};

const timeToX = (t: number, dur: number) => -WORLD_WIDTH / 2 + (t / Math.max(1, dur)) * WORLD_WIDTH;
const xToTime = (x: number, dur: number) => ((x + WORLD_WIDTH / 2) / WORLD_WIDTH) * dur;

/** Fits the whole console across the screen, then sways with the pointer — or dives toward the
 * picked window when `diveTo` is set. */
function CameraRig({ durationSec, diveTo }: { durationSec: number; diveTo: TimeWindow | null }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(0, 3, 0));
  const wantPos = useMemo(() => new THREE.Vector3(), []);
  const wantLook = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / Math.max(1, state.size.height);
    // Distance at which the full width just fits, plus a margin.
    const fit = (FRAME_WIDTH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / aspect) * 1.04;
    const t = state.clock.elapsedTime;

    if (diveTo) {
      const cx = timeToX((diveTo.start + diveTo.end) / 2, durationSec);
      wantPos.set(cx, 2.4, 5.5);
      wantLook.set(cx, 2.8, 0);
    } else {
      wantPos.set(state.pointer.x * 2.4 + Math.sin(t * 0.25) * 1.0, 3.6 + state.pointer.y * 0.9, fit);
      wantLook.set(state.pointer.x * 0.8, 3.0, 0);
    }
    const k = 1 - Math.pow(diveTo ? 0.0008 : 0.01, dt);
    camera.position.lerp(wantPos, k);
    look.current.lerp(wantLook, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Bars({
  loudnessDb,
  brightnessHz,
  durationSec,
  colors,
  mood,
  hover,
  picked,
}: {
  loudnessDb: number[];
  brightnessHz: number[];
  durationSec: number;
  colors: ThemeColors;
  mood: string | null;
  hover: React.MutableRefObject<TimeWindow | null>;
  picked: TimeWindow | null;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const n = loudnessDb.length;
  const pitch = WORLD_WIDTH / Math.max(1, n);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  // Heights span this track's own quiet-to-loud range (5th percentile up to the peak), so a heavily
  // compressed beat still shows its dips and swells instead of a flat wall.
  const heights = useMemo(() => {
    const sorted = [...loudnessDb].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.05)] ?? -60;
    const hi = sorted[sorted.length - 1] ?? 0;
    const span = Math.max(6, hi - lo);
    return loudnessDb.map((db) => (0.12 + 0.88 * Math.min(1, Math.max(0, (db - lo) / span))) * MAX_HEIGHT * PEAK_CAP);
  }, [loudnessDb]);
  // Bone slats; the brighter the second sounds, the lighter the slat. Picked slats go burnt orange.
  const accent = useMemo(() => new THREE.Color(colors.accent), [colors.accent]);
  const baseColors = useMemo(() => {
    const bone = new THREE.Color(colors.bone);
    const dim = new THREE.Color(colors.bone).multiplyScalar(0.62);
    const m = mood ? new THREE.Color(mood) : null;
    return brightnessHz.map((hz) => {
      const c = dim.clone().lerp(bone, Math.min(1, Math.max(0, (hz - 1000) / 3000)));
      return m ? c.lerp(m, 0.06) : c;
    });
  }, [brightnessHz, colors.bone, mood]);
  const tmp = useMemo(() => new THREE.Color(), []);
  const lift = useRef(new Float32Array(n));

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const win = picked ?? hover.current;
    // Taller bars on narrow screens, where the waveform would otherwise sit small in a lot of void.
    const aspect = state.size.width / Math.max(1, state.size.height);
    const tall = 1 + Math.max(0, 1.3 - aspect) * 2.2;
    for (let i = 0; i < n; i++) {
      const sec = ((i + 0.5) / n) * durationSec;
      const inWin = win ? sec >= win.start && sec < win.end : false;
      // Ease each bar's highlight in/out instead of snapping.
      lift.current[i] += ((inWin ? 1 : 0) - lift.current[i]) * 0.18;
      const l = lift.current[i];
      // Rise out of the console on load, staggered left to right.
      const grow = Math.min(1, Math.max(0, (t - i * 0.006) / 0.8));
      const eased = 1 - Math.pow(1 - grow, 3);
      const h = Math.max(0.001, heights[i] * eased * tall * (1 + l * 0.08));
      dummy.position.set(timeToX(sec, durationSec), h / 2, 0);
      dummy.scale.set(pitch * 0.84, h, 1.1 + l * 0.8);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      tmp.copy(baseColors[i]).lerp(accent, l * 0.92);
      m.setColorAt(i, tmp);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} frustumCulled={false} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0} />
    </instancedMesh>
  );
}

/** Frame that glides to the hovered (or picked) window. */
function SelectionBand({
  durationSec,
  hover,
  picked,
  color,
}: {
  durationSec: number;
  hover: React.MutableRefObject<TimeWindow | null>;
  picked: TimeWindow | null;
  color: string;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const cur = useRef({ x: 0, w: 0, o: 0 });

  useFrame(() => {
    const win = picked ?? hover.current;
    const c = cur.current;
    if (win) {
      const x0 = timeToX(win.start, durationSec);
      const x1 = timeToX(win.end, durationSec);
      const targetX = (x0 + x1) / 2;
      c.x = c.o < 0.05 ? targetX : c.x + (targetX - c.x) * 0.25; // appear in place, then glide
      c.w += (x1 - x0 - c.w) * 0.25;
    }
    c.o += ((win ? 1 : 0) - c.o) * 0.2;
    if (group.current) {
      const h = MAX_HEIGHT + 1.2;
      group.current.position.set(c.x, h / 2 - 0.1, 0);
      group.current.scale.set(Math.max(0.001, c.w), h, 2.6);
      group.current.visible = c.o > 0.01;
    }
    if (body.current) (body.current.material as THREE.MeshBasicMaterial).opacity = 0.08 * c.o;
  });

  return (
    <group ref={group}>
      <mesh ref={body}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} />
      </lineSegments>
    </group>
  );
}

/** The long desk the waveform stands on: a charcoal top on grey metal legs, like the office desk in
 * the studio close-up, with a ruler painted along its front edge (a tick every 10 seconds, a label
 * every 30). */
function Desk({ durationSec }: { durationSec: number }) {
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= durationSec; t += 10) out.push(t);
    return out;
  }, [durationSec]);
  const depth = 3.2;
  const topH = 0.22;
  const legInset = WORLD_WIDTH / 2 + 0.6;

  return (
    <group>
      <mesh position={[0, -topH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WORLD_WIDTH + 3, topH, depth]} />
        <meshStandardMaterial color="#2b2b2e" roughness={0.6} />
      </mesh>
      {[-legInset, legInset].map((x) =>
        [-depth / 2 + 0.2, depth / 2 - 0.2].map((z) => (
          <mesh key={`${x}${z}`} position={[x, -topH - (PLINTH_H - topH) / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[0.24, PLINTH_H - topH, 0.24]} />
            <meshStandardMaterial color="#8d8e90" roughness={0.45} metalness={0.7} />
          </mesh>
        ))
      )}
      {/* a stretcher bar between the legs */}
      <mesh position={[0, -PLINTH_H + 0.3, 0]} castShadow>
        <boxGeometry args={[WORLD_WIDTH + 1.2, 0.12, 0.12]} />
        <meshStandardMaterial color="#8d8e90" roughness={0.45} metalness={0.7} />
      </mesh>
      {ticks.map((t) => (
        <mesh key={t} position={[timeToX(t, durationSec), -0.07, depth / 2 + 0.005]}>
          <planeGeometry args={[0.05, t % 30 === 0 ? 0.13 : 0.07]} />
          <meshBasicMaterial color="#e6e1d6" />
        </mesh>
      ))}
    </group>
  );
}

export default function WaveformWorld({
  loudnessDb,
  brightnessHz,
  durationSec,
  colors,
  mood,
  onHover,
  diveTo,
  onPick,
}: Props) {
  const hover = useRef<TimeWindow | null>(null);
  const lastSecond = useRef(-1);
  const els = useRef<Record<string, HTMLElement | null>>({}) as AnchorEls;
  // A time label every 30 seconds along the front of the desk, drawn as page elements that follow
  // their points in the scene.
  const labelTimes = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= durationSec; t += 30) out.push(t);
    return out;
  }, [durationSec]);
  const anchors = useMemo<Anchor[]>(
    () => labelTimes.map((t) => ({ id: `t-${t}`, world: [timeToX(t, durationSec), -0.42, 1.7], align: "center" })),
    [labelTimes, durationSec]
  );
  // The seamless backdrop picks up a faint trace of the track's mood.
  const backdrop = useMemo(() => {
    const c = new THREE.Color(colors.void);
    if (mood) c.lerp(new THREE.Color(mood), 0.05);
    return c;
  }, [colors.void, mood]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  function track(e: ThreeEvent<PointerEvent>) {
    const t = Math.min(durationSec, Math.max(0, xToTime(e.point.x, durationSec)));
    const w = windowAround(t, durationSec);
    hover.current = w;
    const s = Math.round(w.start);
    if (s !== lastSecond.current) {
      lastSecond.current = s;
      onHover(w);
    }
  }

  return (
    <div className="relative h-full w-full">
    <Canvas
      camera={{ position: [0, 3.6, 50], fov: 35 }}
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <color attach="background" args={[backdrop]} />
      <fog attach="fog" args={[backdrop, 70, 190]} />
      <Suspense fallback={null}>
        <Environment files="/hdri/studio.hdr" environmentIntensity={0.9} />
      </Suspense>
      <directionalLight
        position={[-18, 22, 16]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={20}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-radius={5}
      />
      <CameraRig durationSec={durationSec} diveTo={diveTo} />
      <Projector anchors={anchors} els={els} />

      {/* Seamless floor: the same grey as the backdrop, so there is no horizon. */}
      <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={backdrop} roughness={1} />
      </mesh>
      <ContactShadows position={[0, FLOOR_Y + 0.002, 0]} opacity={0.45} scale={70} blur={2.6} far={3} resolution={1024} />
      <Desk durationSec={durationSec} />

      <Bars
        loudnessDb={loudnessDb}
        brightnessHz={brightnessHz}
        durationSec={durationSec}
        colors={colors}
        mood={mood}
        hover={hover}
        picked={diveTo}
      />
      <SelectionBand durationSec={durationSec} hover={hover} picked={diveTo} color={colors.accent} />

      {/* Invisible catcher: pointer position along the waveform -> time. Big on purpose so the
          whole screen is clickable, not just the bars. */}
      <mesh
        position={[0, 3, 0.9]}
        visible={false}
        onPointerMove={(e) => {
          if (diveTo) return;
          e.stopPropagation();
          document.body.style.cursor = "pointer";
          track(e);
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
          hover.current = null;
          lastSecond.current = -1;
          onHover(null);
        }}
        onClick={(e) => {
          if (diveTo) return;
          e.stopPropagation();
          const t = Math.min(durationSec, Math.max(0, xToTime(e.point.x, durationSec)));
          onPick(windowAround(t, durationSec));
        }}
      >
        <planeGeometry args={[FRAME_WIDTH + 30, 40]} />
        <meshBasicMaterial />
      </mesh>
    </Canvas>
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {labelTimes.map((t) => (
        <div
          key={t}
          ref={(el) => {
            els.current[`t-${t}`] = el;
          }}
          className="absolute left-0 top-0 opacity-0"
        >
          <span className="whitespace-nowrap bg-black px-1.5 py-0.5 text-[11px] leading-none text-white">{fmtTime(t)}</span>
        </div>
      ))}
    </div>
    </div>
  );
}
