import { describe, expect, it } from 'vitest';
import { createDefaultXL3DScene } from '../engine/primitives';
import { BUILTIN_SCRIPT_TEMPLATES, executeBlenderScript } from '../engine/scriptingEngine';
import { XL3DStore } from '../state/xl3dStore';

describe('XL3D Blender Scripting Engine (bpy, bmesh, Python & JS)', () => {
  it('runs all built-in Blender Python & JS script templates without errors', () => {
    for (const tpl of BUILTIN_SCRIPT_TEMPLATES) {
      const scene = createDefaultXL3DScene();
      const res = executeBlenderScript(scene, tpl.content, tpl.language);
      expect(res.ok, `Template ${tpl.name} failed: ${res.error}`).toBe(true);
      expect(res.createdObjects.length + res.modifiedObjects.length).toBeGreaterThan(0);
    }
  });

  it('creates custom mesh geometry via bpy.data.meshes.from_pydata and links to scene', () => {
    const scene = createDefaultXL3DScene();
    const initialCount = scene.objects.length;
    const pyCode = `
import bpy

verts = [(0, 0, 0), (2, 0, 0), (1, 2, 0), (1, 0.7, 2)]
faces = [(0, 1, 2), (0, 1, 3), (1, 2, 3), (2, 0, 3)]
mesh = bpy.data.meshes.new("PyramidMesh")
mesh.from_pydata(verts, [], faces)
obj = bpy.data.objects.new("CodePyramid", mesh)
bpy.context.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
print("Pyramid verts:", len(mesh.vertices))
`;
    const res = executeBlenderScript(scene, pyCode, 'python');
    expect(res.ok, res.error).toBe(true);
    expect(scene.objects.length).toBe(initialCount + 1);
    const created = scene.objects.find((o) => o.name === 'CodePyramid')!;
    expect(created).toBeDefined();
    expect(created.mesh!.vertices.length).toBe(4);
    expect(created.mesh!.faces.length).toBe(4);
    expect(res.logs[0]).toContain('Pyramid verts: 4');
  });

  it('edits active object with bmesh, bpy.ops, modifiers, transforms & keyframes', () => {
    const scene = createDefaultXL3DScene();
    const cube = scene.objects.find((o) => o.name === 'Cube')!;
    scene.activeObjectId = cube.id;
    const f0 = cube.mesh!.faces.length;

    const pyCode = `
import bpy
import bmesh

obj = bpy.context.active_object
bm = bmesh.new()
bm.from_mesh(obj.data)
res = bmesh.ops.extrude_face_region(bm, geom=[bm.faces[0]])
verts = [g for g in res["geom"] if g.co is not None]
bmesh.ops.translate(bm, verts=verts, vec=(0, 0, 0.8))
bm.to_mesh(obj.data)
bm.free()

obj.location = (1.5, -0.5, 2.0)
obj.modifiers.new("SmoothSub", "SUBSURF")
obj.keyframe_insert(data_path="location", frame=12)
bpy.ops.mesh.bevel(offset=0.05)
`;
    const res = executeBlenderScript(scene, pyCode, 'python');
    expect(res.ok, res.error).toBe(true);
    expect(cube.mesh!.faces.length).toBeGreaterThan(f0);
    expect(cube.location.x).toBeCloseTo(1.5, 4);
    expect(cube.location.z).toBeCloseTo(2.0, 4);
    expect(cube.modifiers.some((m) => m.type === 'subsurf')).toBe(true);
    expect(cube.keyframes.locZ?.some((k) => k.frame === 12 && Math.abs(k.value - 2.0) < 0.01)).toBe(true);
  });

  it('loads external code files in XL3DStore, edits, runs, and cleanly undoes script changes', () => {
    const s = new XL3DStore();
    const startCount = s.scene.objects.length;

    const scr = s.loadScriptFile(
      'custom_pillar.py',
      `import bpy\nbpy.ops.mesh.primitive_cylinder_add(radius=0.6, location=(0, 0, 1))\nbpy.context.active_object.name = "Pillar"`
    );
    expect(scr.language).toBe('python');
    expect(s.getActiveScript()?.id).toBe(scr.id);

    const runRes = s.runActiveScript();
    expect(runRes.ok).toBe(true);
    expect(s.scene.objects.length).toBe(startCount + 1);
    expect(s.scene.objects.some((o) => o.name === 'Pillar')).toBe(true);

    s.undo();
    expect(s.scene.objects.length).toBe(startCount);
    expect(s.scene.objects.some((o) => o.name === 'Pillar')).toBe(false);
  });

  it('protects app from infinite loops in user scripts', () => {
    const scene = createDefaultXL3DScene();
    const res = executeBlenderScript(scene, 'while True:\n    x = 1', 'python');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('лимит итераций');
  });
});
