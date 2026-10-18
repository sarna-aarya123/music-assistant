"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { ThemeColors } from "@/lib/themeColors";
import { windowAround, type TimeWindow } from "@/lib/windowStats";

const WORLD_WIDTH = 36; // world units the whole track spans
const MAX_HEIGHT = 9; // tallest bar (mirrored around the center line)
const FLOOR_Y = -MAX_HEIGHT / 2 - 0.6;
// Even the loudest second only fills this fraction of MAX_HEIGHT — leaves visible headroom.
const PEAK_CAP = 0.85;
export const DIVE_MS = 1400;

type Props = {
  loudnessDb: number[];
  brightnessHz: number[];
  durationSec: number;
  colors: ThemeColors;
  /** Slight mood hint mixed into the bar colors and lighting; null = none. */
  mood: string | null;
  /** Called (rounded to a whole second) as the pointer moves along the waveform; null on leave. */
  onHover: (w: TimeWindow | null) => void;
  /** Set when the user clicked: the window to dive into. The parent waits DIVE_MS before switching. */
  diveTo: TimeWindow | null;
  onPick: (w: TimeWindow) => void;
};

const timeToX = (t: number, dur: number) => -WORLD_WIDTH / 2 + (t / Math.max(1, dur)) * WORLD_WIDTH;
const xToTime = (x: number, dur: number) => ((x + WORLD_WIDTH / 2) / WORLD_WIDTH) * dur;

/** Fits the whole waveform across the screen, then sways with the pointer — or dives toward the
 * picked window when `diveTo` is set. */
function CameraRig({ durationSec, diveTo }: { durationSec: number; diveTo: TimeWindow | null }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(0, 0, 0));
  const wantPos = useMemo(() => new THREE.Vector3(), []);
  const wantLook = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / Math.max(1, state.size.height);
    // Distance at which the full width just fits, plus a margin.
    const fit = (WORLD_WIDTH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / aspect) * 1.08;
    const t = state.clock.elapsedTime;

    if (diveTo) {
      const cx = timeToX((diveTo.start + diveTo.end) / 2, durationSec);
      wantPos.set(cx, 0.4, 4.5);
      wantLook.set(cx, 0, 0);
    } else {
      wantPos.set(state.pointer.x * 2.2 + Math.sin(t * 0.25) * 1.2, 4.2 + state.pointer.y * 0.8, fit);
      wantLook.set(state.pointer.x * 0.8, -0.4, 0);
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
    return loudnessDb.map((db) => (0.1 + 0.9 * Math.min(1, Math.max(0, (db - lo) / span))) * MAX_HEIGHT * PEAK_CAP);
  }, [loudnessDb]);
  // Base color per bar: brightness picks between the two theme colors, with a little mood mixed in.
  const baseColors = useMemo(() => {
    const a = new THREE.Color(colors.accent);
    const b = new THREE.Color(colors.accent2);
    const m = mood ? new THREE.Color(mood) : null;
    return brightnessHz.map((hz) => {
      const c = a.clone().lerp(b, Math.min(1, Math.max(0, (hz - 1000) / 3000)));
      return m ? c.lerp(m, 0.25) : c;
    });
  }, [brightnessHz, colors, mood]);
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
      // Grow in on load, staggered left to right.
      const grow = Math.min(1, Math.max(0, (t - i * 0.006) / 0.8));
      const eased = 1 - Math.pow(1 - grow, 3);
      const h = heights[i] * eased * (1 + l * 0.12);
      dummy.position.set(timeToX(sec, durationSec), 0, 0);
      dummy.scale.set(pitch * 0.72, Math.max(0.001, h), 0.9 + l * 1.1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      tmp.copy(baseColors[i]).multiplyScalar(0.7 + l * 1.1);
      m.setColorAt(i, tmp);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, n]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.35} metalness={0.25} />
    </instancedMesh>
  );
}

/** Translucent frame that glides to the hovered (or picked) window. */
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
      group.current.position.set(c.x, 0, 0);
      group.current.scale.set(Math.max(0.001, c.w), MAX_HEIGHT + 1.4, 2.4);
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
        <lineBasicMaterial color={color} transparent opacity={0.9} />
      </lineSegments>
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

  const accent = mood ?? colors.accent2;

  return (
    <Canvas camera={{ position: [0, 4.2, 40], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#0a0818"]} />
      <fog attach="fog" args={["#0a0818", 30, 90]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 10, 12]} intensity={1.1} />
      <pointLight position={[-14, 4, 8]} intensity={260} color={colors.accent} />
      <pointLight position={[14, 4, 8]} intensity={260} color={colors.accent2} />
      {mood && <pointLight position={[0, 9, 6]} intensity={140} color={mood} />}
      <CameraRig durationSec={durationSec} diveTo={diveTo} />

      <Bars
        loudnessDb={loudnessDb}
        brightnessHz={brightnessHz}
        durationSec={durationSec}
        colors={colors}
        mood={mood}
        hover={hover}
        picked={diveTo}
      />
      <SelectionBand durationSec={durationSec} hover={hover} picked={diveTo} color={accent} />

      {/* floor */}
      <mesh position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[WORLD_WIDTH + 80, 60]} />
        <meshStandardMaterial color="#0c0a1e" roughness={0.9} />
      </mesh>
      <gridHelper args={[WORLD_WIDTH + 80, 80, colors.accent2, colors.accent2]} position={[0, FLOOR_Y + 0.01, 0]} />

      {/* Invisible catcher: pointer position along the waveform -> time. Big on purpose so the
          whole screen is clickable, not just the bars. */}
      <mesh
        position={[0, 0, 0.5]}
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
        <planeGeometry args={[WORLD_WIDTH + 30, 40]} />
        <meshBasicMaterial />
      </mesh>
    </Canvas>
  );
}
