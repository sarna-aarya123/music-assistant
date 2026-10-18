"use client";

import { useMemo } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** A point in the 3D scene that a normal page element should follow on screen. */
export type Anchor = {
  id: string;
  world: [number, number, number];
  /** Where the element sits relative to the point: centered on it, or beside it. */
  align: "center" | "right" | "left";
};

export type AnchorEls = MutableRefObject<Record<string, HTMLElement | null>>;

const MARGIN = 14; // px between an anchor point and a card placed beside it

/** Lives inside the <Canvas>. Each frame it projects every anchor to screen pixels and moves the
 * matching element (rendered by the page, outside the canvas) to that spot. This replaces drei's
 * <Html>, which builds its own React root inside the scene and throws on teardown under React 19. */
export function Projector({ anchors, els }: { anchors: Anchor[]; els: AnchorEls }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    for (const a of anchors) {
      const el = els.current[a.id];
      if (!el) continue;
      v.set(a.world[0], a.world[1], a.world[2]).project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const shift =
        a.align === "center"
          ? "translate(-50%, -50%)"
          : a.align === "right"
            ? `translate(${MARGIN}px, -50%)`
            : `translate(calc(-100% - ${MARGIN}px), -50%)`;
      el.style.transform = `translate(${x}px, ${y}px) ${shift}`;
      el.style.opacity = v.z < 1 ? "1" : "0";
    }
  });
  return null;
}
