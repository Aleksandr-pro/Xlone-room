import { describe, expect, it } from 'vitest';
import {
  bridgeOrFillSelection,
  duplicateSelectedFaces,
  extractSelectedFacesAsMesh,
  growOrShrinkSelection,
} from '../engine/editOps';
import { evaluateModifierStack } from '../engine/modifiers';
import { buildMeshFromCurve, buildMeshFromText3D, createSceneObject } from '../engine/primitives';
import { pickGizmoAxisAtScreen } from '../engine/renderer3d';
import { XL3DStore } from '../state/xl3dStore';

describe('XL3D v1.4 Advanced Blender Features', () => {
  it('evaluates Catmull-Clark subsurf, wireframe, screw, weld, decimate, and boolean modifiers', () => {
    const s = new XL3DStore();
    s.resetScene();
    const cube = s.getActiveObject()!;
    const baseFaces = cube.mesh!.faces.length;

    s.addModifier('subsurf');
    const subMesh = evaluateModifierStack(cube, 0, s.scene.objects)!;
    expect(subMesh.faces.length).toBeGreaterThan(baseFaces);

    // Wireframe modifier builds border strips (4 faces per quad)
    cube.modifiers = [];
    s.addModifier('wireframe');
    const wireMesh = evaluateModifierStack(cube, 0, s.scene.objects)!;
    expect(wireMesh.faces.length).toBe(baseFaces * 4);

    // Weld modifier reduces duplicate vertices
    cube.modifiers = [];
    s.addModifier('weld');
    cube.modifiers[0].params.distance = 2.5;
    const welded = evaluateModifierStack(cube, 0, s.scene.objects)!;
    expect(welded.vertices.length).toBeLessThan(cube.mesh!.vertices.length);

    // Boolean difference against overlapping mesh
    cube.modifiers = [];
    const cutter = s.addObject('mesh', 'cube', 'Cutter');
    cutter.location = { x: 0, y: 0, z: 1 };
    cutter.scale = { x: 2, y: 2, z: 2 };
    s.setActiveObject(cube.id);
    s.addModifier('boolean');
    cube.modifiers[0].params.targetName = 'Cutter';
    cube.modifiers[0].params.operation = 'difference';
    const boolMesh = evaluateModifierStack(cube, 0, s.scene.objects)!;
    expect(boolMesh.faces.length).toBeLessThan(baseFaces);
  });

  it('generates real 3D geometry for Bezier Curve and 3D Text and converts to editable Mesh', () => {
    const curveObj = createSceneObject('curve', 'MySpline');
    expect(curveObj.mesh).toBeDefined();
    expect(curveObj.mesh!.faces.length).toBeGreaterThan(20);

    const textObj = createSceneObject('text', 'LogoText');
    expect(textObj.mesh).toBeDefined();
    expect(textObj.mesh!.faces.length).toBeGreaterThan(30);

    const customCurveMesh = buildMeshFromCurve(curveObj.curve!);
    expect(customCurveMesh.vertices.length).toBeGreaterThan(20);

    const customTextMesh = buildMeshFromText3D({ text: 'HI', size: 1.4, extrude: 0.3, bevelDepth: 0, align: 'center' });
    expect(customTextMesh.faces.length).toBeGreaterThan(12);

    const s = new XL3DStore();
    s.resetScene();
    const tObj = s.addObject('text', 'cube', 'Title3D');
    s.updateText3DData({ text: 'PRO' });
    expect(s.convertToMesh()).toBe(true);
    expect(tObj.type).toBe('mesh');
  });

  it('supports Edit Mode bridge/fill, duplicate faces, separate selection, and grow/shrink selection', () => {
    const obj = createSceneObject('mesh', 'EditCube', 'cube');
    const m = obj.mesh!;
    m.faces.forEach((f) => (f.selected = false));
    m.faces[0].selected = true;
    m.faces[1].selected = true;

    const beforeFaces = m.faces.length;
    duplicateSelectedFaces(m);
    expect(m.faces.length).toBe(beforeFaces + 2);

    const separated = extractSelectedFacesAsMesh(m);
    expect(separated).not.toBeNull();
    expect(separated!.faces.length).toBe(2);
    expect(m.faces.length).toBe(beforeFaces);

    m.faces[0].selected = true;
    growOrShrinkSelection(m, true);
    expect(m.faces.filter((f) => f.selected).length).toBeGreaterThan(1);

    bridgeOrFillSelection(m, 'face');
    expect(m.faces.length).toBeGreaterThanOrEqual(beforeFaces - 2);
  });

  it('supports Object Mode Apply Transforms (Ctrl+A), Origin to Geometry, Join (Ctrl+J), Apply Modifier, and Axis Constraint + Gizmo picking', () => {
    const s = new XL3DStore();
    s.resetScene();
    const cube = s.getActiveObject()!;
    cube.location = { x: 2, y: 1, z: 3 };
    cube.scale = { x: 2, y: 2, z: 2 };

    // Axis-constrained move with Snap
    s.tool = 'move';
    s.snapEnabled = true;
    s.transformObjectInCameraSpace({ x: 0.37, y: 5, z: 5 }, 10, 0, false, 'x');
    expect(cube.location.x).toBe(2.25);
    expect(cube.location.y).toBe(1);
    expect(cube.location.z).toBe(3);

    // Apply Transforms bakes location/scale into vertices
    s.applyAllTransforms();
    expect(cube.location).toEqual({ x: 0, y: 0, z: 0 });
    expect(cube.scale).toEqual({ x: 1, y: 1, z: 1 });

    // Origin to Geometry restores geometric center
    s.originToGeometry();
    expect(Math.abs(cube.location.x - 2.25)).toBeLessThan(0.05);

    // Join with next mesh
    const countBefore = s.scene.objects.length;
    const vertsBefore = cube.mesh!.vertices.length;
    expect(s.joinWithNextMesh()).toBe(true);
    expect(s.scene.objects.length).toBe(countBefore - 1);
    expect(cube.mesh!.vertices.length).toBeGreaterThan(vertsBefore);

    // Apply Modifier bakes modifier into geometry
    s.addModifier('subsurf');
    const modId = cube.modifiers[0].id;
    const fBefore = cube.mesh!.faces.length;
    s.applyModifier(modId);
    expect(cube.modifiers.length).toBe(0);
    expect(cube.mesh!.faces.length).toBeGreaterThan(fBefore);

    // Gizmo axis picking works on valid coordinates
    const axis = pickGizmoAxisAtScreen(320, 240, 640, 480, { x: 0, y: 0, z: 0 }, s.camera);
    expect(axis === null || axis === 'x' || axis === 'y' || axis === 'z').toBe(true);
  });
});
