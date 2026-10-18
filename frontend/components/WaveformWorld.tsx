"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";
import { fmtTime, windowAround, type TimeWindow } from "@/lib/windowStats";
import { RoomShell, Shadowed, Speaker } from "@/components/StudioParts";

const WORLD_WIDTH = 36; // world units the whole track spans
const MAX_HEIGHT = 7; // tallest bar
const PLINTH_H = 1.2; // the wooden console the bars stand on; its top is y = 0
const FLOOR_Y = -PLINTH_H;
const ROOM_SCALE = 3; // the shared studio shell, scaled up so it frames the whole waveform
// Even the loudest second only fills this fraction of MAX_HEIGHT — leaves visible headroom.
const PEAK_CAP = 0.88;
// Wider than the waveform itself, so the monitors on either side stay in frame.
const FRAME_WIDTH = WORLD_WIDTH + 12;
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
  // Ink-black slats; the brighter the second sounds, the lighter the ink. A trace of the mood color.
  const accent = useMemo(() => new THREE.Color(colors.accent), [colors.accent]);
  const baseColors = useMemo(() => {
    const ink = new THREE.Color(colors.ink);
    const pale = new THREE.Color(colors.muted);
    const m = mood ? new THREE.Color(mood) : null;
    return brightnessHz.map((hz) => {
      const c = ink.clone().lerp(pale, Math.min(1, Math.max(0, (hz - 1000) / 3000)) * 0.5);
      return m ? c.lerp(m, 0.05) : c;
    });
  }, [brightnessHz, colors.ink, colors.muted, mood]);
  const tmp = useMemo(() => new THREE.Color(), []);
  const lift = useRef(new Float32Array(n));

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const win = picked ?? hover.current;
    for (let i = 0; i < n; i++) {
      const sec = ((i + 0.5) / n) * durationSec;
      const inWin = win ? sec >= win.start && sec < win.end : false;
      // Ease each bar's highlight in/out instead of snapping.
      lift.current[i] += ((inWin ? 1 : 0) - lift.current[i]) * 0.18;
      const l = lift.current[i];
      // Rise out of the console on load, staggered left to right.
      const grow = Math.min(1, Math.max(0, (t - i * 0.006) / 0.8));
      const eased = 1 - Math.pow(1 - grow, 3);
      const h = Math.max(0.001, heights[i] * eased * (1 + l * 0.08));
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
      <meshStandardMaterial roughness={0.62} metalness={0} envMapIntensity={0.3} />
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

/** The wooden console the waveform stands on, with a ruler along its front edge: a tick every
 * 10 seconds, a label every 30. */
function Console({ durationSec, colors }: { durationSec: number; colors: ThemeColors }) {
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = 0; t <= durationSec; t += 10) out.push(t);
    return out;
  }, [durationSec]);
  const depth = 3.4;

  return (
    <group>
      <mesh position={[0, -PLINTH_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[WORLD_WIDTH + 3, PLINTH_H, depth]} />
        <meshStandardMaterial color="#c9a97c" roughness={0.5} />
      </mesh>
      {/* dark inlay along the top, where the bars stand */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[WORLD_WIDTH + 1.2, 1.8]} />
        <meshStandardMaterial color="#2a2118" roughness={0.7} />
      </mesh>
      {ticks.map((t) => (
        <mesh key={t} position={[timeToX(t, durationSec), -0.35, depth / 2 + 0.005]}>
          <planeGeometry args={[0.05, t % 30 === 0 ? 0.55 : 0.28]} />
          <meshBasicMaterial color={colors.ink} />
        </mesh>
      ))}
      {ticks
        .filter((t) => t % 30 === 0)
        .map((t) => (
          <Html key={t} position={[timeToX(t, durationSec), -0.9, depth / 2 + 0.05]} center style={{ pointerEvents: "none" }}>
            <span className="num select-none font-display text-lg italic text-ink/80">{fmtTime(t)}</span>
          </Html>
        ))}
    </group>
  );
}

/** A monitor on a stand, flanking the console. */
function MonitorOnStand({ x }: { x: number }) {
  return (
    <group position={[x, FLOOR_Y, -1.2]}>
      <Shadowed>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.9, 1.0, 0.12, 32]} />
          <meshStandardMaterial color="#1b1b1d" roughness={0.5} metalness={0.2} />
        </mesh>
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 2.8, 16]} />
          <meshStandardMaterial color="#1b1b1d" roughness={0.5} metalness={0.2} />
        </mesh>
        <group position={[0, 4.2, 0]} scale={2.1} rotation={[0, x < 0 ? 0.35 : -0.35, 0]}>
          <Speaker loudness01={0.45} />
        </group>
      </Shadowed>
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
    <Canvas
      camera={{ position: [0, 3.6, 50], fov: 42 }}
      dpr={[1, 2]}
      shadows
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
    >
      <color attach="background" args={[colors.background]} />
      <Suspense fallback={null}>
        <Environment files="/hdri/studio.hdr" environmentIntensity={0.7} />
      </Suspense>
      {/* Key light "through the window" on the left: warm, low, casting long soft shadows. */}
      <directionalLight
        position={[-24, 16, 12]}
        intensity={2.6}
        color="#ffefd6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={20}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-radius={5}
      />
      <CameraRig durationSec={durationSec} diveTo={diveTo} />

      <group position={[0, FLOOR_Y, 0]}>
        <RoomShell colors={colors} s={ROOM_SCALE} />
      </group>
      <Console durationSec={durationSec} colors={colors} />
      <Suspense fallback={null}>
        <MonitorOnStand x={-(WORLD_WIDTH / 2 + 4.2)} />
        <MonitorOnStand x={WORLD_WIDTH / 2 + 4.2} />
      </Suspense>

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
  );
}
