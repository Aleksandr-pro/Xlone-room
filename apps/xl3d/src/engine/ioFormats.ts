import { uid } from '../core/math3d';
import type { Face, MeshData, SceneObject, Vertex, XL3DScene } from '../core/types';
import {
  buildEdgesFromFaces,
  createSceneObject,
  defaultPhysics,
  type MeshPrimitiveKind,
  recomputeNormals,
} from './primitives';

export function exportSceneToOBJ(scene: XL3DScene): string {
  const lines: string[] = [`# XL3D (Blender 5.3 Mobile) OBJ Export`, `# Scene: ${scene.name}`];
  let vOffset = 1;
  for (const obj of scene.objects) {
    if (!obj.mesh || !obj.visible) continue;
    lines.push(`o ${obj.name}`);
    for (const v of obj.mesh.vertices) {
      const wx = v.pos.x * obj.scale.x + obj.location.x;
      const wy = v.pos.y * obj.scale.y + obj.location.y;
      const wz = v.pos.z * obj.scale.z + obj.location.z;
      lines.push(`v ${wx.toFixed(5)} ${wy.toFixed(5)} ${wz.toFixed(5)}`);
      lines.push(`vt ${v.uv.x.toFixed(5)} ${v.uv.y.toFixed(5)}`);
      lines.push(`vn ${v.normal.x.toFixed(5)} ${v.normal.y.toFixed(5)} ${v.normal.z.toFixed(5)}`);
    }
    for (const f of obj.mesh.faces) {
      const idxs = f.verts.map((vi) => {
        const idx = vi + vOffset;
        return `${idx}/${idx}/${idx}`;
      });
      lines.push(`f ${idxs.join(' ')}`);
    }
    vOffset += obj.mesh.vertices.length;
  }
  return lines.join('\n');
}

export function importOBJToMeshObject(text: string, name = 'Imported_OBJ'): SceneObject {
  const vertices: Vertex[] = [];
  const faces: Face[] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      const x = parseFloat(parts[1]) || 0;
      const y = parseFloat(parts[2]) || 0;
      const z = parseFloat(parts[3]) || 0;
      vertices.push({
        id: uid('v'),
        pos: { x, y, z },
        normal: { x: 0, y: 0, z: 1 },
        uv: { x: 0.5, y: 0.5 },
        color: [0.85, 0.85, 0.88],
        mask: 0,
        weights: {},
        selected: false,
      });
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      const idxs = parts
        .map((tok) => parseInt(tok.split('/')[0], 10) - 1)
        .filter((i) => Number.isFinite(i) && i >= 0 && i < vertices.length);
      if (idxs.length >= 3) {
        faces.push({
          verts: idxs,
          normal: { x: 0, y: 0, z: 1 },
          smooth: false,
          materialIndex: 0,
          faceSet: 1,
          selected: false,
        });
      }
    }
  }
  if (vertices.length === 0) {
    return createSceneObject('mesh', name, 'cube');
  }
  const mesh: MeshData = {
    vertices,
    edges: buildEdgesFromFaces(faces),
    faces,
    autoSmoothAngle: 35,
    customSplitNormals: false,
    udimTile: 1001,
    uvSyncSelection: true,
  };
  recomputeNormals(mesh);
  return {
    id: uid('obj'),
    name,
    type: 'mesh',
    collection: 'Collection',
    parentId: null,
    visible: true,
    renderable: true,
    locked: false,
    location: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    materialId: 'mat_principled',
    modifiers: [],
    keyframes: {},
    drivers: {},
    shapeKeys: [],
    physics: defaultPhysics(),
    mesh,
  };
}

export function exportSceneToSTL(scene: XL3DScene): string {
  const lines: string[] = [`solid ${scene.name.replace(/\s+/g, '_')}`];
  for (const obj of scene.objects) {
    if (!obj.mesh || !obj.visible) continue;
    for (const f of obj.mesh.faces) {
      for (let i = 1; i < f.verts.length - 1; i++) {
        const v0 = obj.mesh.vertices[f.verts[0]].pos;
        const v1 = obj.mesh.vertices[f.verts[i]].pos;
        const v2 = obj.mesh.vertices[f.verts[i + 1]].pos;
        lines.push(`  facet normal ${f.normal.x.toFixed(5)} ${f.normal.y.toFixed(5)} ${f.normal.z.toFixed(5)}`);
        lines.push('    outer loop');
        lines.push(`      vertex ${v0.x.toFixed(5)} ${v0.y.toFixed(5)} ${v0.z.toFixed(5)}`);
        lines.push(`      vertex ${v1.x.toFixed(5)} ${v1.y.toFixed(5)} ${v1.z.toFixed(5)}`);
        lines.push(`      vertex ${v2.x.toFixed(5)} ${v2.y.toFixed(5)} ${v2.z.toFixed(5)}`);
        lines.push('    endloop');
        lines.push('  endfacet');
      }
    }
  }
  lines.push(`endsolid ${scene.name.replace(/\s+/g, '_')}`);
  return lines.join('\n');
}

export function exportSceneToPLY(scene: XL3DScene): string {
  let totalV = 0;
  let totalF = 0;
  for (const o of scene.objects) {
    if (o.mesh && o.visible) {
      totalV += o.mesh.vertices.length;
      totalF += o.mesh.faces.length;
    }
  }
  const lines = [
    'ply',
    'format ascii 1.0',
    `comment XL3D 5.3 Export`,
    `element vertex ${totalV}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    `element face ${totalF}`,
    'property list uchar int vertex_indices',
    'end_header',
  ];
  for (const o of scene.objects) {
    if (!o.mesh || !o.visible) continue;
    for (const v of o.mesh.vertices) {
      const r = Math.round(v.color[0] * 255);
      const g = Math.round(v.color[1] * 255);
      const b = Math.round(v.color[2] * 255);
      lines.push(`${v.pos.x.toFixed(4)} ${v.pos.y.toFixed(4)} ${v.pos.z.toFixed(4)} ${r} ${g} ${b}`);
    }
  }
  let vOff = 0;
  for (const o of scene.objects) {
    if (!o.mesh || !o.visible) continue;
    for (const f of o.mesh.faces) {
      lines.push(`${f.verts.length} ${f.verts.map((vi) => vi + vOff).join(' ')}`);
    }
    vOff += o.mesh.vertices.length;
  }
  return lines.join('\n');
}

export function exportSceneToGLB(scene: XL3DScene): Uint8Array {
  const gltf = {
    asset: { version: '2.0', generator: 'XL3D Blender 5.3 Mobile' },
    scene: 0,
    scenes: [{ name: scene.name, nodes: scene.objects.map((_, i) => i) }],
    nodes: scene.objects.map((o) => ({
      name: o.name,
      translation: [o.location.x, o.location.z, -o.location.y],
      scale: [o.scale.x, o.scale.z, o.scale.y],
    })),
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  const chunkLen = jsonBytes.length + pad;
  const totalLen = 12 + 8 + chunkLen;
  const buf = new ArrayBuffer(totalLen);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, totalLen, true);
  dv.setUint32(12, chunkLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  const out = new Uint8Array(buf);
  out.set(jsonBytes, 20);
  for (let i = 0; i < pad; i++) out[20 + jsonBytes.length + i] = 0x20;
  return out;
}

export function exportPointCloudToSPZ(scene: XL3DScene): Uint8Array {
  const pc = scene.objects.find((o) => o.pointCloud);
  const pts = pc?.pointCloud?.points ?? [];
  const header = `SPZ1|count=${pts.length}|generator=XL3D-5.3\n`;
  const body = pts
    .map((p) => `${p.pos.x.toFixed(4)},${p.pos.y.toFixed(4)},${p.pos.z.toFixed(4)},${p.radius.toFixed(3)},${p.opacity.toFixed(2)}`)
    .join('\n');
  return new TextEncoder().encode(header + body);
}

export interface AssetBrowserPreset {
  id: string;
  name: string;
  category: 'mesh' | 'material' | 'rig' | 'greasepencil' | 'splat';
  primitive?: MeshPrimitiveKind;
  materialHex?: string;
}

export const ASSET_BROWSER_PRESETS: AssetBrowserPreset[] = [
  { id: 'ast-suzanne', name: 'Suzanne Monkey', category: 'mesh', primitive: 'monkey' },
  { id: 'ast-torus', name: 'Torus Knot Ring', category: 'mesh', primitive: 'torus' },
  { id: 'ast-sphere', name: 'Subdiv Sphere', category: 'mesh', primitive: 'icosphere' },
  { id: 'ast-gold', name: 'Brushed Gold (5.3 Aniso)', category: 'material', materialHex: '#e4b34c' },
  { id: 'ast-glass', name: 'Dispersion Glass (5.3)', category: 'material', materialHex: '#bfe8ff' },
  { id: 'ast-clay', name: 'Sculpt Terracotta Clay', category: 'material', materialHex: '#c8684b' },
  { id: 'ast-rigify', name: 'Rigify Humanoid', category: 'rig' },
  { id: 'ast-gp', name: 'Grease Pencil Sketch', category: 'greasepencil' },
  { id: 'ast-spz', name: 'Gaussian Splat Cloud (SPZ)', category: 'splat' },
];
