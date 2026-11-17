import { describe, expect, it } from 'vitest';
import {
  exportPointCloudToSPZ,
  exportSceneToGLB,
  exportSceneToOBJ,
  exportSceneToPLY,
  exportSceneToSTL,
  importOBJToMeshObject,
} from '../engine/ioFormats';
import {
  evaluateCompositorString,
  evaluateGeometryNodesOnMesh,
  evaluateMaterialColorAt,
} from '../engine/nodesEngine';
import { paintVertexColor, paintVertexWeight } from '../engine/paintAndBake';
import {
  evaluateAnimatedTransform,
  exportVseToOtio,
  gaussianSmoothKeyframes,
  generateRigifyHumanoidArmature,
  insertKeyframe,
  solveTwoBoneIK,
  vseBladeCut,
  vseRippleDelete,
} from '../engine/physicsAndAnim';
import { createDefaultXL3DScene, createSceneObject } from '../engine/primitives';
import { applySculptStroke, voxelRemesh } from '../engine/sculpt';
import { store } from '../state/xl3dStore';

describe('XL3D Sculpt, Nodes, Animation, VSE 5.3 & IO', () => {
  it('sculpts with Draw, Scene Project 5.2, Mask, and Voxel Remesh', () => {
    const sphere = createSceneObject('mesh', 'Sphere', 'sphere');
    const mesh = sphere.mesh!;
    const target = createSceneObject('mesh', 'Plane', 'plane');
    target.location.z = -1;

    const beforePos = { ...mesh.vertices[0].pos };
    applySculptStroke(
      mesh,
      beforePos,
      { x: 0, y: 0, z: 0.1 },
      {
        brush: 'draw',
        radius: 2.0,
        strength: 0.8,
        invert: false,
        symX: true,
        symY: false,
        symZ: false,
        radialSymmetry: 1,
        dyntopo: false,
        voxelSize: 0.25,
        multiresLevel: 0,
        activeFaceSet: 1,
      }
    );
    expect(mesh.vertices[0].pos).not.toEqual(beforePos);

    applySculptStroke(
      mesh,
      mesh.vertices[0].pos,
      { x: 0, y: 0, z: 0 },
      {
        brush: 'sceneProject',
        radius: 3.0,
        strength: 0.8,
        invert: false,
        symX: false,
        symY: false,
        symZ: false,
        radialSymmetry: 1,
        dyntopo: false,
        voxelSize: 0.25,
        multiresLevel: 0,
        activeFaceSet: 1,
      },
      [target]
    );

    const fBefore = mesh.faces.length;
    voxelRemesh(mesh, 0.25);
    expect(mesh.faces.length).toBeGreaterThan(fBefore);
  });

  it('paints vertex color & vertex weights', () => {
    const cube = createSceneObject('mesh', 'Cube', 'cube');
    const mesh = cube.mesh!;
    paintVertexColor(mesh, mesh.vertices[0].pos, {
      mode: 'vertex',
      brush: 'draw',
      color: '#ff0000',
      radius: 2,
      strength: 1,
      activeBoneId: 'Bone',
      bakedMaps: {},
    });
    expect(mesh.vertices[0].color[0]).toBeCloseTo(1, 2);

    paintVertexWeight(
      mesh,
      mesh.vertices[0].pos,
      {
        mode: 'weight',
        brush: 'draw',
        color: '#ff0000',
        radius: 2,
        strength: 1,
        activeBoneId: 'Spine',
        bakedMaps: {},
      },
      0.9
    );
    expect(mesh.vertices[0].weights.Spine).toBeCloseTo(0.9, 2);
  });

  it('evaluates Geometry Nodes 5.3, Procedural Materials, and Compositor String Node', () => {
    const scene = createDefaultXL3DScene();
    const geoGraph = scene.nodeGraphs.find((g) => g.graphKind === 'geometry')!;
    const cube = scene.objects[0];
    const facesBefore = cube.mesh!.faces.length;
    evaluateGeometryNodesOnMesh(cube.mesh!, geoGraph, 1.0, scene.objects);
    expect(cube.mesh!.faces.length).toBeGreaterThan(facesBefore);

    const mat = scene.materials[0];
    mat.procTexture = 'checker';
    const col = evaluateMaterialColorAt(mat, 0.1, 0.1, { x: 0, y: 0, z: 0 });
    expect(col.length).toBe(3);

    const cmpText = evaluateCompositorString(scene);
    expect(cmpText).toContain('EEVEE');
  });

  it('animates F-Curves + Gaussian Smooth 5.1, Rigify IK, and VSE 5.3 Blade/Ripple/OTIO', () => {
    const scene = createDefaultXL3DScene();
    const obj = scene.objects[0];
    insertKeyframe(obj, 'locZ', 1, 0);
    insertKeyframe(obj, 'locZ', 15, 2.5);
    insertKeyframe(obj, 'locZ', 30, 1.0);
    obj.keyframes.locZ = gaussianSmoothKeyframes(obj.keyframes.locZ!, 1.2);

    const trMid = evaluateAnimatedTransform(obj, 15, 24);
    expect(trMid.location.z).toBeGreaterThan(1.0);

    const rig = generateRigifyHumanoidArmature();
    expect(rig.bones.length).toBeGreaterThanOrEqual(10);
    solveTwoBoneIK(rig, 'forearm.L', { x: -0.7, y: 0.2, z: 1.4 });
    expect(rig.bones.find((b) => b.name === 'forearm.L')!.tail.z).toBeCloseTo(1.4, 2);

    const cut = vseBladeCut(scene.vse.clips, scene.vse.clips[0].id, 30);
    expect(cut.length).toBe(scene.vse.clips.length + 1);
    const rippled = vseRippleDelete(cut, cut[0].id);
    expect(rippled.length).toBe(cut.length - 1);
    const otio = exportVseToOtio(scene);
    expect(otio).toContain('Timeline.1');
  });

  it('exports & imports OBJ, STL, PLY, GLB, and SPZ Gaussian Splatting', () => {
    const scene = createDefaultXL3DScene();
    const objStr = exportSceneToOBJ(scene);
    expect(objStr).toContain('v ');
    expect(objStr).toContain('f ');

    const reimported = importOBJToMeshObject(objStr, 'Reimported');
    expect(reimported.mesh!.vertices.length).toBeGreaterThan(4);

    expect(exportSceneToSTL(scene)).toContain('facet normal');
    expect(exportSceneToPLY(scene)).toContain('end_header');
    const glb = exportSceneToGLB(scene);
    expect(glb[0]).toBe(0x67);
    const spz = new TextDecoder().decode(exportPointCloudToSPZ(scene));
    expect(spz).toContain('SPZ1|');
  });

  it('supports livePreviewOnly transform updates without rebuilding UI panels', () => {
    let uiRebuildCount = 0;
    let vpRedrawCount = 0;
    const u1 = store.subscribe(() => { uiRebuildCount++; });
    const u2 = store.subscribeViewport(() => { vpRedrawCount++; });

    store.updateActiveTransform('location', 'x', 2.25, true);
    expect(uiRebuildCount).toBe(0);
    expect(vpRedrawCount).toBe(1);

    store.commitLiveChange();
    expect(uiRebuildCount).toBe(1);
    u1();
    u2();
  });
});
