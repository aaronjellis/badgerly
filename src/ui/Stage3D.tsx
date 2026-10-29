import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ViewCube, cubeTransform, quarterTurnOffset, viewOffset } from '../components/ViewCube';
import type { CubeDir, QuarterTurn } from '../components/ViewCube';
import type { Mesh } from '../engine/mesh';
import type { DisplayUnit } from '../engine/model';
import { STAGE_HEX } from './stageColors';
import { fitDistance, meshBounds, toSceneTriangles } from './stage3dMath';
import type { Vec3 } from './stage3dMath';

export interface ReliefMeshes {
  plate: Mesh;
  /** The drop-in parts of a split badge, standing on the bed; null without a split. */
  parts: Mesh | null;
}

interface Stage3DProps {
  meshes: ReliefMeshes;
  /** How far the parts rise from the bed to sit in their recess. */
  partsLiftMm: number;
  unit: DisplayUnit;
  /** The 2D and 3D buttons, which the stage shows beside its own. */
  viewToggle?: React.ReactNode;
}

/** The plate, and the drop-in parts in the app's accent (`--accent`). */
const PLATE_COLOR = '#d9d4c7';
const PARTS_COLOR = '#a8541a';
/** Faces meeting at less than this angle share smooth normals, so a fillet reads round and a wall stays sharp. */
const CREASE_ANGLE = (35 * Math.PI) / 180;
/** A view cube pick swings the camera this long. */
const VIEW_TURN_MS = 450;
const FOV_DEG = 40;
/** The camera first looks from the front, above, and a little to the right. */
const HOME_DIRECTION: CubeDir = [0.15, 1.2, 1];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Scene triangles as shaded geometry. The triangles share no vertices, so `computeVertexNormals` alone
 * would shade every face flat; `toCreasedNormals` computes the normals itself and averages them across
 * gentle angles.
 */
function buildGeometry(triangles: Float32Array): THREE.BufferGeometry {
  const raw = new THREE.BufferGeometry();
  raw.setAttribute('position', new THREE.BufferAttribute(triangles, 3));
  const shaded = toCreasedNormals(raw, CREASE_ANGLE);
  raw.dispose();
  return shaded;
}

const sizeLabel = (size: Vec3, unit: DisplayUnit) =>
  unit === 'in'
    ? `${(size.x / 25.4).toFixed(2)} × ${(size.z / 25.4).toFixed(2)} × ${(size.y / 25.4).toFixed(2)} in`
    : `${size.x.toFixed(1)} × ${size.z.toFixed(1)} × ${size.y.toFixed(1)} mm`;

/**
 * The 3D badge: the plate in a neutral material and, for a split, the parts in the accent color
 * sitting in their recess. Drag to orbit, scroll to zoom, or use the view cube. The scene is y-up, with
 * the badge's top edge away from the viewer so it reads upright (see `toSceneTriangles`).
 */
export const Stage3D: React.FC<Stage3DProps> = ({ meshes, partsLiftMm, unit, viewToggle }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cubeBodyRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  /** Frames the plate in the camera; set by the scene effect. */
  const fitRef = useRef<(() => void) | null>(null);
  /** Whether the camera has framed the first plate yet; later edits keep the view. */
  const framedRef = useRef(false);
  const cubeActionsRef = useRef<{
    orbit: (dx: number, dy: number) => void;
    pickView: (dir: CubeDir) => void;
    quarterTurn: (turn: QuarterTurn) => void;
  }>();
  const [unavailable, setUnavailable] = useState(false);

  const plateTriangles = useMemo(() => toSceneTriangles(meshes.plate.positions, 0), [meshes.plate]);
  const partsTriangles = useMemo(
    () => (meshes.parts ? toSceneTriangles(meshes.parts.positions, partsLiftMm) : null),
    [meshes.parts, partsLiftMm]
  );
  const bounds = useMemo(() => meshBounds(plateTriangles), [plateTriangles]);
  /** The plate's box, for the fit; read through a ref so the scene's one-time setup sees the latest. */
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  // The scene, camera, controls, and renderer live as long as the stage.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    framedRef.current = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(STAGE_HEX);

    const camera = new THREE.PerspectiveCamera(
      FOV_DEG,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.5,
      5000
    );
    camera.position.copy(viewOffset(HOME_DIRECTION, 200));

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 2000;

    // Ambient fill, a warm key from above and the front right, and a cool fill from the back left.
    scene.add(new THREE.AmbientLight('#ffffff', 0.75));
    const key = new THREE.DirectionalLight('#fffbeb', 1.15);
    key.position.set(180, 320, 220);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#93c5fd', 0.45);
    fill.position.set(-220, 140, -180);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // The camera keeps its direction and looks at the middle of the plate from far enough to see it whole.
    fitRef.current = () => {
      const box = boundsRef.current;
      // Spend any coasting from the last drag now, so it does not pull the camera off the fit.
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      const direction = camera.position.clone().sub(controls.target);
      if (direction.lengthSq() < 1e-9) direction.copy(viewOffset(HOME_DIRECTION, 1));
      const center = new THREE.Vector3(box.center.x, box.center.y, box.center.z);
      const distance = fitDistance(box.size, FOV_DEG, camera.aspect);
      controls.target.copy(center);
      camera.position.copy(center).add(direction.normalize().multiplyScalar(distance));
      camera.lookAt(center);
      controls.update();
    };

    // A view cube pick swings the camera round the target at its distance.
    let turn: { from: THREE.Vector3; spin: THREE.Quaternion; distance: number; start: number } | null = null;
    const cancelTurn = () => {
      turn = null;
    };
    controls.addEventListener('start', cancelTurn);

    const placeCamera = (offset: THREE.Vector3) => {
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
    };

    /** Swings the camera to the offset `goalFor` gives; at once under reduced motion. */
    const turnTo = (goalFor: (distance: number, offset: THREE.Vector3) => THREE.Vector3) => {
      // Spend any coasting from the last drag now, so it does not pull the camera off the view.
      controls.enableDamping = false;
      controls.update();
      controls.enableDamping = true;
      const offset = camera.position.clone().sub(controls.target);
      const distance = offset.length();
      const goal = goalFor(distance, offset);
      if (prefersReducedMotion()) {
        turn = null;
        placeCamera(goal);
        return;
      }
      const from = offset.normalize();
      turn = {
        from,
        spin: new THREE.Quaternion().setFromUnitVectors(from, goal.clone().normalize()),
        distance,
        start: performance.now(),
      };
    };

    cubeActionsRef.current = {
      // The same turn per pixel as OrbitControls, so the cube drags like the scene.
      orbit: (dx, dy) => {
        turn = null;
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        const height = Math.max(1, renderer.domElement.clientHeight);
        spherical.theta -= ((2 * Math.PI * dx) / height) * controls.rotateSpeed;
        spherical.phi -= ((2 * Math.PI * dy) / height) * controls.rotateSpeed;
        spherical.makeSafe();
        placeCamera(new THREE.Vector3().setFromSpherical(spherical));
      },
      pickView: (dir) => turnTo((distance) => viewOffset(dir, distance)),
      quarterTurn: (quarter) => turnTo((_, offset) => quarterTurnOffset(offset, quarter)),
    };

    const noSpin = new THREE.Quaternion();
    let cubeTransformShown = '';
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (turn) {
        const t = Math.min(1, (performance.now() - turn.start) / VIEW_TURN_MS);
        const ease = t * t * (3 - 2 * t);
        const step = noSpin.clone().slerp(turn.spin, ease);
        placeCamera(turn.from.clone().applyQuaternion(step).multiplyScalar(turn.distance));
        if (t === 1) turn = null;
      }
      controls.update();
      renderer.render(scene, camera);
      const body = cubeBodyRef.current;
      if (body) {
        const transform = cubeTransform(camera.quaternion);
        if (transform !== cubeTransformShown) {
          body.style.transform = transform;
          cubeTransformShown = transform;
        }
      }
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.removeEventListener('start', cancelTurn);
      cubeActionsRef.current = undefined;
      fitRef.current = null;
      groupRef.current = null;
      controls.dispose();
      renderer.dispose();
      // Frees the WebGL context now, not at garbage collection; browsers cap the live contexts.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  // The triangles become scene objects; a new set replaces and frees the last. The first set frames the camera.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const solids: [Float32Array, string][] = [[plateTriangles, PLATE_COLOR]];
    if (partsTriangles) solids.push([partsTriangles, PARTS_COLOR]);
    for (const [triangles, color] of solids) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 });
      group.add(new THREE.Mesh(buildGeometry(triangles), material));
    }
    if (!framedRef.current) {
      framedRef.current = true;
      fitRef.current?.();
    }
    return () => {
      for (const child of [...group.children]) {
        group.remove(child);
        const solid = child as THREE.Mesh;
        solid.geometry.dispose();
        (solid.material as THREE.Material).dispose();
      }
    };
  }, [plateTriangles, partsTriangles]);

  return (
    <div className="stage viewport-2d-wrapper stage3d" aria-label="3D preview of the badge. Drag to orbit; scroll to zoom.">
      <div className="viewport-2d-hud">
        <div className="hud-scroll">
          <div className="hud-legend">
            <span className="hud-chip" title="The plate">
              <span className="dot" style={{ backgroundColor: PLATE_COLOR }} />
              Plate
            </span>
            {partsTriangles && (
              <span className="hud-chip" title="The drop-in parts">
                <span className="dot" style={{ backgroundColor: PARTS_COLOR }} />
                Parts
              </span>
            )}
            <span className="hud-chip">{sizeLabel(bounds.size, unit)}</span>
          </div>
          <div className="hud-toggles" role="group" aria-label="Stage view">
            {viewToggle}
            <button type="button" className="hud-toggle" onClick={() => fitRef.current?.()} title="Frame the whole badge">
              Fit
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="stage3d-canvas" />
      {unavailable && (
        <p className="stage3d-unavailable" role="alert">
          This browser can’t show 3D. Switch to 2D to keep editing.
        </p>
      )}
      <ViewCube
        bodyRef={cubeBodyRef}
        onOrbit={(dx, dy) => cubeActionsRef.current?.orbit(dx, dy)}
        onPickView={(dir) => cubeActionsRef.current?.pickView(dir)}
        onQuarterTurn={(quarter) => cubeActionsRef.current?.quarterTurn(quarter)}
      />
    </div>
  );
};
