import { maxHalfWidth, type VanShell } from "@vanbuild/core";
import { type RefObject, useLayoutEffect, useMemo, useState } from "react";

export interface PlanTransform {
  /** Size of the drawing surface in CSS pixels. */
  width: number;
  height: number;
  /** Screen pixels per millimetre. */
  scale: number;
  /** True when the van is drawn nose-up to fill a tall screen. */
  portrait: boolean;
  /** Van frame (mm) to screen pixels. */
  toScreen: (x: number, y: number) => { x: number; y: number };
  /** Screen pixels to van frame (mm). */
  toModel: (sx: number, sy: number) => { x: number; y: number };
}

/** Room around the van for the FRONT / REAR labels and door labels. */
const PADDING = 36;

/**
 * Fit the van to the available space. Wide screens show it nose-left; tall screens (phones)
 * turn it nose-up. Both are true top-down views, so the passenger side is never mirrored.
 */
export function usePlanTransform(
  container: RefObject<HTMLElement | null>,
  shell: VanShell,
): PlanTransform {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [container]);

  return useMemo(() => {
    const { width, height } = size;
    const length = shell.cargoLength;
    const half = maxHalfWidth(shell);
    const portrait = height > width;
    const along = portrait ? height : width;
    const across = portrait ? width : height;
    const scale = Math.max(
      0.01,
      Math.min((along - 2 * PADDING) / length, (across - 2 * PADDING) / (2 * half)),
    );
    const startAlong = (along - length * scale) / 2;
    const centreAcross = across / 2;

    const toScreen = portrait
      ? (x: number, y: number) => ({ x: centreAcross + y * scale, y: startAlong + x * scale })
      : (x: number, y: number) => ({ x: startAlong + x * scale, y: centreAcross - y * scale });
    const toModel = portrait
      ? (sx: number, sy: number) => ({
          x: (sy - startAlong) / scale,
          y: (sx - centreAcross) / scale,
        })
      : (sx: number, sy: number) => ({
          x: (sx - startAlong) / scale,
          y: (centreAcross - sy) / scale,
        });

    return { width, height, scale, portrait, toScreen, toModel };
  }, [size, shell]);
}

/** Screen rectangle covering a van-frame box footprint, whatever the orientation. */
export function screenRect(
  view: PlanTransform,
  min: { x: number; y: number },
  max: { x: number; y: number },
) {
  const a = view.toScreen(min.x, min.y);
  const b = view.toScreen(max.x, max.y);
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
