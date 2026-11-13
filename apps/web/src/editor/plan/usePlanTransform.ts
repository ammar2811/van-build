import { maxHalfWidth, type VanShell } from "@vanbuild/core";
import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface PlanTransform {
  /** Size of the drawing surface in CSS pixels. */
  width: number;
  height: number;
  /** Screen pixels per millimetre at the current zoom. */
  scale: number;
  /** 1 = the whole van fits the view. */
  zoom: number;
  /** True when the van is drawn nose-up to fill a tall screen. */
  portrait: boolean;
  /** Van frame (mm) to screen pixels. */
  toScreen: (x: number, y: number) => { x: number; y: number };
  /** Screen pixels to van frame (mm). */
  toModel: (sx: number, sy: number) => { x: number; y: number };
}

export interface PlanCamera {
  /** Zoom by `factor`, keeping the given screen point where it is. */
  zoomAt: (point: { x: number; y: number }, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  /** Back to the whole van. */
  reset: () => void;
}

/** Room around the van for the FRONT / REAR labels and door labels. */
const PADDING = 36;
export const MAX_ZOOM = 12;

interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

const HOME: Camera = { zoom: 1, panX: 0, panY: 0 };

/** Keep the view over the van: at zoom 1 nothing can be dragged away. */
function clamp(camera: Camera, width: number, height: number): Camera {
  const zoom = Math.min(Math.max(camera.zoom, 1), MAX_ZOOM);
  const limitX = ((zoom - 1) * width) / 2;
  const limitY = ((zoom - 1) * height) / 2;
  return {
    zoom,
    panX: Math.min(Math.max(camera.panX, -limitX), limitX),
    panY: Math.min(Math.max(camera.panY, -limitY), limitY),
  };
}

/**
 * Fit the van to the available space, with zoom and pan on top. Wide screens show it
 * nose-left; tall screens (phones) turn it nose-up. Both are true top-down views, so the
 * passenger side is never mirrored.
 */
export function usePlanTransform(
  container: RefObject<HTMLElement | null>,
  shell: VanShell,
): PlanTransform & PlanCamera {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>(HOME);
  const sizeRef = useRef(size);
  sizeRef.current = size;

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

  const zoomAt = useCallback((point: { x: number; y: number }, factor: number) => {
    setCamera((current) => {
      const { width, height } = sizeRef.current;
      const zoom = Math.min(Math.max(current.zoom * factor, 1), MAX_ZOOM);
      const ratio = zoom / current.zoom;
      // Solve for the pan that leaves the point under the cursor where it was.
      const fromCentreX = point.x - width / 2;
      const fromCentreY = point.y - height / 2;
      return clamp(
        {
          zoom,
          panX: fromCentreX - (fromCentreX - current.panX) * ratio,
          panY: fromCentreY - (fromCentreY - current.panY) * ratio,
        },
        width,
        height,
      );
    });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setCamera((current) =>
      clamp(
        { ...current, panX: current.panX + dx, panY: current.panY + dy },
        sizeRef.current.width,
        sizeRef.current.height,
      ),
    );
  }, []);

  const reset = useCallback(() => setCamera(HOME), []);

  const transform = useMemo<PlanTransform>(() => {
    const { width, height } = size;
    const { zoom, panX, panY } = clamp(camera, width, height);
    const length = shell.cargoLength;
    const half = maxHalfWidth(shell);
    const portrait = height > width;
    const along = portrait ? height : width;
    const across = portrait ? width : height;
    const fit = Math.max(
      0.01,
      Math.min((along - 2 * PADDING) / length, (across - 2 * PADDING) / (2 * half)),
    );
    const startAlong = (along - length * fit) / 2;
    const centreAcross = across / 2;
    const cx = width / 2;
    const cy = height / 2;

    // The fitted view first, then zoom about the centre of the surface, then pan.
    const fitted = portrait
      ? (x: number, y: number) => ({ x: centreAcross + y * fit, y: startAlong + x * fit })
      : (x: number, y: number) => ({ x: startAlong + x * fit, y: centreAcross - y * fit });
    const unfitted = portrait
      ? (sx: number, sy: number) => ({ x: (sy - startAlong) / fit, y: (sx - centreAcross) / fit })
      : (sx: number, sy: number) => ({ x: (sx - startAlong) / fit, y: (centreAcross - sy) / fit });

    return {
      width,
      height,
      scale: fit * zoom,
      zoom,
      portrait,
      toScreen: (x, y) => {
        const p = fitted(x, y);
        return { x: cx + (p.x - cx) * zoom + panX, y: cy + (p.y - cy) * zoom + panY };
      },
      toModel: (sx, sy) => unfitted(cx + (sx - panX - cx) / zoom, cy + (sy - panY - cy) / zoom),
    };
  }, [size, camera, shell]);

  return useMemo(() => ({ ...transform, zoomAt, panBy, reset }), [transform, zoomAt, panBy, reset]);
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
