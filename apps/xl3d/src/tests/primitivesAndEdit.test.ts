import { describe, expect, it } from 'vitest';
import {
  bevelSelection,
  extrudeFaces,
  insetFaces,
  loopToolsCircle,
  loopToolsFlatten,
  loopToolsSpace,
  mergeVerticesToCenter,
  subdivideMesh,
  uvUnwrap,
} from '../engine/editOps';
import { createDefaultModifier, evaluateModifierStack } from '../engine/modifiers';
import { createDefaultXL3DScene, createSceneObject } from '../engine/primitives';

describe('XL3D Primitives, Object Types & Edit Mode', () => {
  it('creates all 12+ Blender 5.x object types', () => {
    const objs = [
      createSceneObject('mesh', 'Cube', 'cube'),
      createSceneObject('mesh', 'Suzanne', 'monkey'),
      createSceneObject('curve'),
      createSceneObject('surface'),
      createSceneObject('metaball'),
      createSceneObject('text'),
      createSceneObject('lattice'),
      createSceneObject('empty'),
      createSceneObject('armature'),
      createSceneObject('volume'),
      createSceneObject('pointcloud'),
      createSceneObject('greasepencil'),
      createSceneObject('light'),
      createSceneObject('camera'),
    ];
    expect(objs.length).toBe(14);
    expect(objs[1].mesh!.vertices.length).toBeGreaterThan(20);
    expect(objs[10].pointCloud!.pointType).toBe('gaussianSplat');
    expect(objs[11].greasePencil!.layers[0].frames[1].length).toBeGreaterThan(0);
  });

  it('creates default scene with camera, light, mesh & AgX', () => {
    const scene = createDefaultXL3DScene();
    expect(scene.objects.length).toBeGreaterThanOrEqual(4);
    expect(scene.render.engine).toBe('eevee');
    expect(scene.render.colorTransform).toBe('agx');
  });

  it('supports Edit Mode extrude, inset, bevel, subdivide, merge & LoopTools 5.2', () => {
    const cube = createSceneObject('mesh', 'Cube', 'cube');
    const mesh = cube.mesh!;
    const v0 = mesh.vertices.length;
    const f0 = mesh.faces.length;

    extrudeFaces(mesh, 0.4);
    expect(mesh.vertices.length).toBeGreaterThan(v0);
    expect(mesh.faces.length).toBeGreaterThan(f0);

    insetFaces(mesh, 0.25);
    bevelSelection(mesh, 0.15);
    subdivideMesh(mesh, false);
    expect(mesh.faces.length).toBeGreaterThan(20);

    loopToolsCircle(mesh, 'face');
    loopToolsFlatten(mesh, 'face');
    loopToolsSpace(mesh, 'face');
    uvUnwrap(mesh, true);
    expect(mesh.vertices[0].uv.x).toBeGreaterThanOrEqual(0);

    const beforeMerge = mesh.faces.length;
    mergeVerticesToCenter(mesh, 'face');
    expect(mesh.faces.length).toBeLessThanOrEqual(beforeMerge);
  });

  it('evaluates non-destructive modifier stack (Subdivision, Mirror, Solidify, Array)', () => {
    const cube = createSceneObject('mesh', 'Cube', 'cube');
    cube.modifiers.push(createDefaultModifier('subsurf'));
    cube.modifiers.push(createDefaultModifier('mirror'));
    cube.modifiers.push(createDefaultModifier('solidify'));
    cube.modifiers.push(createDefaultModifier('array'));

    const evaluated = evaluateModifierStack(cube, 0.5);
    expect(evaluated).not.toBeNull();
    expect(evaluated!.faces.length).toBeGreaterThan(cube.mesh!.faces.length * 4);
  });
});
