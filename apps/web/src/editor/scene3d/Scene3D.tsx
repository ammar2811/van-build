import { Edges, Line, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { getPartDefinition } from "@vanbuild/catalog";
import {
  interiorHeightAt,
  maxHalfWidth,
  type PartCategory,
  type PartInstance,
  partBox,
  shellEdges,
  shellFloorMesh,
  shellWallMesh,
  type TriangleMesh,
  type VanShell,
} from "@vanbuild/core";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type PerspectiveCamera,
  type Ray,
  Vector3,
} from "three";
import { isLocked } from "../../state/actions";
import { useDocStore } from "../../state/docStore";
import { useIssues, useLiveDoc, useShell } from "../../state/selectors";
import { useUiStore } from "../../state/uiStore";
import { FitIcon } from "../../ui/icons";
import { beginPartDrag, endPartDrag, movePartDrag, type PartDrag } from "../interaction/partDrag";

/**
 * The 3D view. It renders the same document as the plan view and drags parts through the
 * same solver; the only thing of its own is turning a pointer ray into a point on the floor.
 *
 * The van frame (X rearward, Y to the passenger side, Z up, millimetres) is mapped into
 * three.js space (Y up, metres) by one group transform, so everything inside it is written
 * in van coordinates.
 */

const MM = 0.001;
const FOV = 35;
const DRAG_THRESHOLD = 4;

/** Van frame to three.js world. */
function toWorld(x: number, y: number, z: number): [number, number, number] {
  return [x * MM, z * MM, -y * MM];
}

/** Where a pointer ray meets the horizontal plane at van height `z`, in van coordinates. */
function floorPoint(ray: Ray, z: number): { x: number; y: number; distance: number } | null {
  const planeY = z * MM;
  if (Math.abs(ray.direction.y) < 1e-6) return null;
  const t = (planeY - ray.origin.y) / ray.direction.y;
  if (t <= 0) return null;
  const hit = ray.origin.clone().addScaledVector(ray.direction, t);
  return { x: hit.x / MM, y: -hit.z / MM, distance: t };
}

interface Palette {
  floor: string;
  wall: string;
  wheelWell: string;
  accent: string;
  danger: string;
  dangerSoft: string;
  part: Record<string, { fill: string; stroke: string }>;
}

const CATEGORIES: PartCategory[] = [
  "bed",
  "galley",
  "storage",
  "appliance",
  "seating",
  "water",
  "electrical",
  "climate",
  "opening",
  "load",
];

/**
 * Colours come from the stylesheet, so the 3D view always matches the plan view and follows
 * light and dark mode without a second palette to keep in step.
 */
function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const value = (name: string) => root.getPropertyValue(name).trim();
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  const part: Palette["part"] = {};
  for (const category of CATEGORIES) {
    probe.className = `part--${category}`;
    const style = getComputedStyle(probe);
    part[category] = {
      fill: style.getPropertyValue("--part-fill").trim(),
      stroke: style.getPropertyValue("--part-stroke").trim(),
    };
  }
  probe.remove();
  return {
    floor: value("--floor"),
    wall: value("--wall"),
    wheelWell: value("--wheelwell"),
    accent: value("--accent"),
    danger: value("--danger"),
    dangerSoft: value("--danger-soft"),
    part,
  };
}

function usePalette(): Palette {
  const [palette, setPalette] = useState(readPalette);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setPalette(readPalette());
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return palette;
}

function toGeometry(mesh: TriangleMesh): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Shell({
  shell,
  palette,
  nearSide,
}: {
  shell: VanShell;
  palette: Palette;
  /** The wall between the camera and the interior, which is hidden like a doll's house. */
  nearSide: 1 | -1;
}) {
  const floor = useMemo(() => toGeometry(shellFloorMesh(shell)), [shell]);
  const walls = useMemo(
    () => ({
      passenger: toGeometry(shellWallMesh(shell, [1])),
      driver: toGeometry(shellWallMesh(shell, [-1])),
    }),
    [shell],
  );
  const edges = useMemo(() => shellEdges(shell), [shell]);
  useEffect(
    () => () => {
      floor.dispose();
      walls.passenger.dispose();
      walls.driver.dispose();
    },
    [floor, walls],
  );
  return (
    <group>
      <mesh geometry={floor}>
        <meshStandardMaterial color={palette.floor} side={DoubleSide} />
      </mesh>
      {/* The far wall is tinted in. The polygon offset keeps it from flickering against
          cabinets and wheel wells that sit exactly on it. */}
      <mesh geometry={nearSide === 1 ? walls.driver : walls.passenger} raycast={() => null}>
        <meshBasicMaterial
          color={palette.wall}
          transparent
          opacity={0.1}
          side={DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>
      {edges.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the edge list is fixed per shell
        <Line key={index} points={line} color={palette.wall} lineWidth={1.5} />
      ))}
      {shell.wheelWells.map((well) => (
        <mesh
          key={`${well.min.x}:${well.min.y}`}
          position={[
            (well.min.x + well.max.x) / 2,
            (well.min.y + well.max.y) / 2,
            (well.min.z + well.max.z) / 2,
          ]}
          scale={[well.max.x - well.min.x, well.max.y - well.min.y, well.max.z - well.min.z]}
          raycast={() => null}
        >
          <boxGeometry />
          <meshStandardMaterial color={palette.wheelWell} />
        </mesh>
      ))}
    </group>
  );
}

/** Direction the camera looks from: above the rear passenger-side corner. */
const VIEW_FROM = new Vector3(0.62, 0.6, -0.68).normalize();

/**
 * Frames the whole van whatever shape the view is, on first show, when the van changes and
 * when asked to reset. It does not fight the user: orbiting is left alone in between.
 */
function CameraRig({ shell, resetCount }: { shell: VanShell; resetCount: number }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const controls = useThree((state) => state.controls) as {
    target: Vector3;
    update: () => void;
  } | null;
  const invalidate = useThree((state) => state.invalidate);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  // Refit when the view changes shape a lot (split view on and off), not on every pixel.
  const shape = width > height * 1.25 ? "wide" : width < height * 0.8 ? "tall" : "square";

  // biome-ignore lint/correctness/useExhaustiveDependencies: width and height are read once per refit; `shape` and `resetCount` are the triggers
  useLayoutEffect(() => {
    if (!controls) return;
    const top = interiorHeightAt(shell, 0);
    const half = maxHalfWidth(shell);
    const target = new Vector3(...toWorld(shell.cargoLength / 2, 0, top * 0.4));
    const radius = 0.5 * Math.hypot(shell.cargoLength, 2 * half, top) * MM;
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * (width / height));
    // Far enough that the sphere around the van fits the narrower of the two view angles.
    const distance = radius / Math.sin(Math.min(vertical, horizontal) / 2);
    camera.position.copy(target).addScaledVector(VIEW_FROM, distance);
    controls.target.copy(target);
    controls.update();
    invalidate();
  }, [shell, controls, camera, invalidate, shape, resetCount]);
  return null;
}

interface ActiveDrag {
  drag: PartDrag;
  pointerId: number;
  planeZ: number;
  startX: number;
  startY: number;
  moved: boolean;
}

function Parts({ shell, palette }: { shell: VanShell; palette: Palette }) {
  const doc = useLiveDoc();
  const selectedId = useUiStore((state) => state.selectedId);
  const dragging = useUiStore((state) => state.drag !== null);
  const issues = useIssues();
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const viewportHeight = useThree((state) => state.size.height);
  const active = useRef<ActiveDrag | null>(null);

  const onPointerDown = (event: ThreeEvent<PointerEvent>, part: PartInstance) => {
    if (event.button !== 0 || active.current) return;
    // Only the nearest part under the pointer reacts.
    event.stopPropagation();
    useUiStore.getState().select(part.id);
    if (isLocked(part)) return;
    const saved = useDocStore.getState().doc;
    const current = saved.parts[part.id];
    const point = current && floorPoint(event.ray, current.position.z);
    if (!current || !point) return;
    (event.target as Element).setPointerCapture(event.pointerId);
    // The camera stays put while a part is being dragged.
    if (controls) controls.enabled = false;
    active.current = {
      drag: beginPartDrag(saved, shell, current, point),
      pointerId: event.pointerId,
      planeZ: current.position.z,
      startX: event.nativeEvent.clientX,
      startY: event.nativeEvent.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    const session = active.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.stopPropagation();
    if (!session.moved) {
      const travel = Math.hypot(
        event.nativeEvent.clientX - session.startX,
        event.nativeEvent.clientY - session.startY,
      );
      if (travel < DRAG_THRESHOLD) return;
      session.moved = true;
    }
    const point = floorPoint(event.ray, session.planeZ);
    if (!point) return;
    // Screen pixels per millimetre at the part, so snapping reaches as far as it does in 2D.
    const metresPerPixel =
      (2 * point.distance * Math.tan((camera.fov * Math.PI) / 360)) / viewportHeight;
    movePartDrag(session.drag, shell, point, {
      pxPerMm: MM / metresPerPixel,
      touch: event.pointerType === "touch",
      units: useUiStore.getState().units,
      noSnap: event.altKey,
    });
  };

  const finish = (event: ThreeEvent<PointerEvent>, commit: boolean) => {
    const session = active.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.stopPropagation();
    active.current = null;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    if (controls) controls.enabled = true;
    endPartDrag(session.drag, commit && session.moved);
  };

  // Draw lower parts first so translucent raised parts blend over them.
  const parts = Object.values(doc.parts).sort(
    (a, b) => a.position.z - b.position.z || a.id.localeCompare(b.id),
  );

  return (
    <group>
      {parts.map((part) => {
        const def = getPartDefinition(part.defId);
        if (!def) return null;
        const box = partBox(part);
        const colours = palette.part[def.category] ?? { fill: "#cccccc", stroke: "#666666" };
        const selected = part.id === selectedId;
        const flagged = issues.has(part.id) && !dragging;
        return (
          <mesh
            key={part.id}
            position={[
              (box.min.x + box.max.x) / 2,
              (box.min.y + box.max.y) / 2,
              (box.min.z + box.max.z) / 2,
            ]}
            scale={[box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]}
            onPointerDown={(event) => onPointerDown(event, part)}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => finish(event, true)}
            onPointerCancel={(event) => finish(event, false)}
          >
            <boxGeometry />
            <meshStandardMaterial
              color={flagged ? palette.dangerSoft : colours.fill}
              // Hollow furniture is see-through enough to show what sits inside it.
              transparent={Boolean(def.hollow)}
              opacity={def.hollow ? 0.82 : 1}
            />
            <Edges
              color={flagged ? palette.danger : selected ? palette.accent : colours.stroke}
              lineWidth={selected || flagged ? 3 : 1.25}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** A point in the van, as page coordinates. Used by the end-to-end tests to aim the mouse. */
export type Project = (x: number, y: number, z: number) => { x: number; y: number };

function ProjectionHandle({ wrapper }: { wrapper: RefObject<HTMLDivElement | null> }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const element = wrapper.current as (HTMLDivElement & { project?: Project }) | null;
    if (!element) return;
    element.project = (x, y, z) => {
      camera.updateMatrixWorld();
      const point = new Vector3(...toWorld(x, y, z)).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return {
        x: rect.left + ((point.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - point.y) / 2) * rect.height,
      };
    };
    element.dataset.ready = "true";
    return () => {
      delete element.project;
      delete element.dataset.ready;
    };
  }, [camera, gl, wrapper]);
  return null;
}

export default function Scene3D() {
  const shell = useShell();
  const palette = usePalette();
  const wrapper = useRef<HTMLDivElement>(null);
  const partCount = useDocStore((state) => Object.keys(state.doc.parts).length);
  const selectedId = useUiStore((state) => state.selectedId);
  const [nearSide, setNearSide] = useState<1 | -1>(1);
  const [resetCount, setResetCount] = useState(0);

  return (
    <div
      className="scene3d"
      ref={wrapper}
      data-testid="scene3d"
      data-parts={partCount}
      data-selected={selectedId ?? ""}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.05, far: 80, position: [6, 5, -6] }}
        onPointerMissed={() => useUiStore.getState().select(null)}
      >
        <ambientLight intensity={1.5} />
        <directionalLight position={[-4, 9, -3]} intensity={2.2} />
        <directionalLight position={[5, 3, 6]} intensity={0.6} />
        <OrbitControls
          makeDefault
          enableDamping={false}
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={1}
          maxDistance={25}
          onChange={(event) => {
            // three.js -Z is the van's passenger side.
            const camera = (event?.target as { object?: { position: Vector3 } } | undefined)
              ?.object;
            if (camera) setNearSide(camera.position.z < 0 ? 1 : -1);
          }}
        />
        <CameraRig shell={shell} resetCount={resetCount} />
        <group rotation={[-Math.PI / 2, 0, 0]} scale={MM}>
          <Shell shell={shell} palette={palette} nearSide={nearSide} />
          <Parts shell={shell} palette={palette} />
        </group>
        <ProjectionHandle wrapper={wrapper} />
      </Canvas>
      <button
        type="button"
        className="icon-button scene3d-reset"
        aria-label="Reset the 3D view"
        title="Reset the 3D view"
        data-testid="scene3d-reset"
        onClick={() => setResetCount((count) => count + 1)}
      >
        <FitIcon />
      </button>
    </div>
  );
}
