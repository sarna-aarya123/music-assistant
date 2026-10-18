"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

type Vec3 = [number, number, number];

/** Marks every mesh under a group as shadow-casting/receiving. */
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

/** A loaded glTF scan, set on the floor with its footprint centered on `position`. Poly Haven
 * models are authored in real meters, so `scale` of 1 is true size; use it to enlarge small props
 * (a cassette player is only 13 cm wide) so they read in the scene. */
export function FitModel({
  url,
  position,
  rotationY = 0,
  scale = 1,
}: {
  url: string;
  position: Vec3;
  rotationY?: number;
  scale?: number;
}) {
  const gltf = useGLTF(url);
  const { object, offset } = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const c = box.getCenter(new THREE.Vector3());
    return { object: clone, offset: new THREE.Vector3(-c.x, -box.min.y, -c.z) };
  }, [gltf]);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={object} position={offset} />
    </group>
  );
}

/** A screen drawn from the section's own loudness curve: a bone-white line on a dark glass, with a
 * playhead sweeping across. Sits just in front of the TV's glass. */
export function TvScreen({
  curveDb,
  label,
  width,
  height,
  position,
}: {
  curveDb: number[];
  label: string;
  width: number;
  height: number;
  position: Vec3;
}) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = Math.round((512 * height) / width);
    return c;
  }, [width, height]);
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);
  const last = useRef(0);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((state) => {
    const now = state.clock.elapsedTime;
    if (now - last.current < 1 / 15) return; // redraw ~15 times a second, like a slow screen
    last.current = now;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "#0d1110";
    ctx.fillRect(0, 0, W, H);

    // faint dotted grid
    ctx.fillStyle = "rgba(214,210,200,0.14)";
    for (let x = 16; x < W; x += 32) for (let y = 16; y < H; y += 32) ctx.fillRect(x, y, 2, 2);

    // the curve
    if (curveDb.length > 1) {
      const lo = Math.min(...curveDb);
      const hi = Math.max(...curveDb);
      const span = Math.max(6, hi - lo);
      ctx.strokeStyle = "#e6e1d6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      curveDb.forEach((db, i) => {
        const x = 28 + (i / (curveDb.length - 1)) * (W - 56);
        const y = H - 56 - ((db - lo) / span) * (H - 130);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // playhead sweeping across, with a blinking readout
    const px = 28 + (((now * 0.18) % 1) * (W - 56));
    ctx.strokeStyle = "#c2561f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 40);
    ctx.lineTo(px, H - 28);
    ctx.stroke();

    ctx.fillStyle = "#e6e1d6";
    ctx.font = "bold 24px 'Courier New', monospace";
    ctx.fillText(label, 28, 34);
    if (Math.floor(now * 2) % 2 === 0) ctx.fillRect(W - 44, 14, 14, 24);

    texture.needsUpdate = true;
  });

  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
