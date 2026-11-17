import { describe, expect, it } from 'vitest';
import { getCameraBasis, inverseRotateVec3, screenDeltaToWorld, type OrbitCamera } from '../core/math3d';
import type { SculptSettings } from '../core/types';
import {
  flipNormals,
  pokeFaces,
  rotateSelection,
  scaleSelection,
  selectMeshElementByHit,
  toggleSharpEdges,
  translateSelection,
} from '../engine/editOps';
import { createDefaultXL3DScene, createSceneObject } from '../engine/primitives';
import { pickSceneAtScreen } from '../engine/renderer3d';
import { applySculptStroke } from '../engine/sculpt';
import { XL3DStore } from '../state/xl3dStore';

describe('XL3D v1.1.0 Front-Face Raycasting, Sculpting & Camera-Space Editing', () => {
  it('picks front-most face via Moller-Trumbore raycast instead of back/bottom face', () => {
    const scene = createDefaultXL3DScene();
    const cam: OrbitCamera = {
      yaw: -Math.PI / 2,
      pitch: 0,
      distance: 6,
      target: { x: 0, y: 0, z: 0 },
      ortho: false,
      fovDeg: 45,
      panoramic: false,
    };
    const cube = scene.objects.find((o) => o.name === 'Cube')!;
    // Camera sits at (0, -6, 0) looking along +Y at the front face (y = -1)
    const hit = pickSceneAtScreen(400, 300, 800, 600, scene, cam);
    expect(hit).not.toBeNull();
    expect(hit!.objectId).toBe(cube.id);
    expect(hit!.hitLocal.y).toBeCloseTo(-1, 2);
    expect(cube.mesh!.faces[hit!.faceIdx].normal.y).toBeLessThan(-0.9);
  });

  it('sculpts only front-facing vertices in camera-space drag direction (never opposite back side)', () => {
    const sphere = createSceneObject('mesh', 'Sphere', 'sphere');
    const mesh = sphere.mesh!;
    const backVertsBefore = mesh.vertices
      .filter((v) => v.pos.y > 0.5)
      .map((v) => ({ idx: v.id, pos: { ...v.pos } }));

    const camForwardLocal = { x: 0, y: 1, z: 0 }; // camera looking along +Y at y < 0 side
    const settings: SculptSettings = {
      brush: 'grab',
      radius: 1.4,
      strength: 0.8,
      symX: false,
      symY: false,
      symZ: false,
      radialSymmetry: 1,
      dyntopo: false,
      voxelSize: 0.12,
      multiresLevel: 0,
      invert: false,
      frontFacesOnly: true,
      activeFaceSet: 0,
    };

    const frontCenter = { x: 0, y: -1, z: 0 };
    const deltaRight = { x: 0.45, y: 0, z: 0 };
    applySculptStroke(mesh, frontCenter, deltaRight, settings, [], camForwardLocal);

    // Front vertices near (0, -1, 0) must move in +X (drag direction)
    const frontMoved = mesh.vertices.filter((v) => v.pos.y < -0.5);
    expect(frontMoved.some((v) => v.pos.x > 0.15)).toBe(true);

    // Opposite back vertices (y > 0.5) must stay completely untouched!
    for (const before of backVertsBefore) {
      const after = mesh.vertices.find((v) => v.id === before.idx)!;
      expect(after.pos.x).toBeCloseTo(before.pos.x, 5);
      expect(after.pos.y).toBeCloseTo(before.pos.y, 5);
      expect(after.pos.z).toBeCloseTo(before.pos.z, 5);
    }
  });

  it('maps screen right/up drags via camera basis and inverseRotateVec3 without axis flipping', () => {
    const cam: OrbitCamera = {
      yaw: Math.PI / 4,
      pitch: 0.3,
      distance: 6,
      target: { x: 0, y: 0, z: 0 },
      ortho: false,
      fovDeg: 45,
      panoramic: false,
    };
    const basis = getCameraBasis(cam);
    const deltaRight = screenDeltaToWorld(50, 0, cam.distance, 600, basis, cam);
    // Dot with camera right vector must be strictly positive (moves right on screen, never mirrored)
    const dotRight = deltaRight.x * basis.right.x + deltaRight.y * basis.right.y + deltaRight.z * basis.right.z;
    expect(dotRight).toBeGreaterThan(0);

    // Rotate object 90 deg around Z and verify inverseRotateVec3 preserves length
    const localDelta = inverseRotateVec3(deltaRight, { x: 0, y: 0, z: 90 });
    expect(Math.hypot(localDelta.x, localDelta.y, localDelta.z)).toBeCloseTo(
      Math.hypot(deltaRight.x, deltaRight.y, deltaRight.z),
      5
    );
  });

  it('selects hit face and performs camera-space edit translate, rotate, scale, poke, flip & sharp', () => {
    const cube = createSceneObject('mesh', 'Cube', 'cube');
    const mesh = cube.mesh!;
    const frontFaceIdx = mesh.faces.findIndex((f) => f.normal.y < -0.9);
    expect(frontFaceIdx).toBeGreaterThanOrEqual(0);

    selectMeshElementByHit(mesh, 'face', frontFaceIdx, { x: 0, y: -1, z: 0 }, false);
    const selFaces = mesh.faces.filter((f) => f.selected);
    expect(selFaces.length).toBe(1);

    // Move selected front face right (+X) and verify back vertices (y = +1) stay unchanged
    translateSelection(mesh, 'face', { x: 0.5, y: 0, z: 0 }, 0, { x: 0, y: 1, z: 0 });
    for (const v of mesh.vertices) {
      if (v.pos.y > 0.5) {
        expect(Math.abs(v.pos.x)).toBeCloseTo(1, 5);
      } else {
        expect(v.pos.x).toBeGreaterThan(-0.6);
      }
    }

    rotateSelection(mesh, 'face', { x: 0, y: 15, z: 0 });
    scaleSelection(mesh, 'face', 1.1);
    const fCountBeforePoke = mesh.faces.length;
    pokeFaces(mesh);
    expect(mesh.faces.length).toBeGreaterThan(fCountBeforePoke);

    toggleSharpEdges(mesh);
    expect(mesh.edges.some((e) => e.sharp)).toBe(true);
    flipNormals(mesh);
  });

  it('saves/loads .xl3d project JSON, manages Shape Keys, VSE clips, and node graph', () => {
    const s = new XL3DStore();
    s.addShapeKey();
    const active = s.getActiveObject()!;
    expect(active.shapeKeys.length).toBe(1);

    const beforeClips = s.scene.vse.clips.length;
    s.addVseClip('video');
    expect(s.scene.vse.clips.length).toBe(beforeClips + 1);

    s.addNodeToActiveGraph('Voronoi', 'Voronoi 5.3');
    const gn = s.scene.nodeGraphs.find((g) => g.id === s.scene.activeNodeGraphId)!;
    expect(gn.nodes.some((n) => n.label === 'Voronoi 5.3')).toBe(true);

    const json = s.saveProjectJson();
    s.resetScene();
    const ok = s.loadProjectJson(json);
    expect(ok).toBe(true);
    expect(s.scene.vse.clips.length).toBe(beforeClips + 1);
  });
});
