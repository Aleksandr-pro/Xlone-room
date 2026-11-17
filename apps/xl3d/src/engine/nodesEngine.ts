import { add3, scale3 } from '../core/math3d';
import type { MaterialData, MeshData, NodeGraph, SceneObject, XL3DScene } from '../core/types';
import { bevelSelection, subdivideMesh } from './editOps';
import { recomputeNormals } from './primitives';

export function evaluateGeometryNodesOnMesh(
  mesh: MeshData,
  graph: NodeGraph,
  timeSec: number,
  otherObjects: SceneObject[]
): void {
  for (const node of graph.nodes) {
    const kind = node.kind.toLowerCase();
    if (kind.includes('bevel') && node.params.enabled !== false) {
      bevelSelection(mesh, Number(node.params.amount ?? 0.08));
    } else if (kind.includes('sound')) {
      const amp = Number(node.params.amp ?? 0.08);
      if (amp > 0 && timeSec > 0) {
        const pulse = Math.sin(timeSec * 6.28) * amp * 0.4;
        for (const v of mesh.vertices) {
          v.pos = add3(v.pos, scale3(v.normal, pulse));
        }
      }
    } else if (kind.includes('xpbd') && node.params.enabled) {
      const stiff = Number(node.params.stiffness ?? 0.7);
      const sag = (1 - stiff) * 0.25;
      for (const v of mesh.vertices) {
        if (v.pos.z > 0.2) {
          v.pos.z = Math.max(0, v.pos.z - sag * Math.abs(Math.sin(timeSec * 2.5)));
        }
      }
    } else if (kind.includes('raycast') && otherObjects.length > 0 && node.params.enabled) {
      for (const v of mesh.vertices) {
        v.pos.z = Math.max(-1.5, v.pos.z);
      }
    } else if (kind.includes('subdiv') && node.params.enabled) {
      subdivideMesh(mesh, false);
    }
  }
  recomputeNormals(mesh);
}

export function evaluateMaterialColorAt(
  mat: MaterialData | undefined,
  u: number,
  v: number,
  pos: { x: number; y: number; z: number }
): [number, number, number] {
  const hex = mat?.baseColor ?? '#d4d8df';
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16) || 0xd4d8df;
  let r = ((n >> 16) & 255) / 255;
  let g = ((n >> 8) & 255) / 255;
  let b = (n & 255) / 255;

  if (!mat || mat.procTexture === 'none') return [r, g, b];

  const sc = Math.max(0.5, mat.procScale || 4);
  let factor = 0.5;
  switch (mat.procTexture) {
    case 'checker': {
      const cx = Math.floor(u * sc) + Math.floor(v * sc);
      factor = cx % 2 === 0 ? 1.0 : 0.35;
      break;
    }
    case 'noise':
    case 'musgrave':
    case 'magic': {
      factor = 0.55 + 0.45 * Math.sin(pos.x * sc * 1.7 + pos.y * sc * 1.3 + pos.z * sc * 2.1);
      break;
    }
    case 'voronoi': {
      const gx = (u * sc) % 1 - 0.5;
      const gy = (v * sc) % 1 - 0.5;
      factor = Math.min(1, 0.35 + Math.hypot(gx, gy) * 1.3);
      break;
    }
    case 'wave':
    case 'gradient': {
      factor = 0.5 + 0.5 * Math.sin((pos.x + pos.z) * sc * 2.4);
      break;
    }
    case 'brick': {
      const row = Math.floor(v * sc);
      const off = (row % 2) * 0.5;
      const mortarU = (u * sc + off) % 1;
      const mortarV = (v * sc) % 1;
      factor = mortarU < 0.08 || mortarV < 0.12 ? 0.3 : 1.0;
      break;
    }
  }
  r = Math.min(1, r * factor);
  g = Math.min(1, g * factor);
  b = Math.min(1, b * factor);
  return [r, g, b];
}

export function evaluateCompositorString(scene: XL3DScene): string {
  const compGraph = scene.nodeGraphs.find((g) => g.graphKind === 'compositor');
  const strNode = compGraph?.nodes.find((n) => n.kind.toLowerCase().includes('string'));
  const tpl = String(strNode?.params.template ?? 'XL3D #{frame} | {engine}');
  return tpl
    .replace('{frame}', String(scene.currentFrame))
    .replace('{engine}', scene.render.engine.toUpperCase())
    .replace('{scene}', scene.name);
}

export function applyCompositorPostProcess(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scene: XL3DScene
): void {
  const compGraph = scene.nodeGraphs.find((g) => g.graphKind === 'compositor');
  const glare = compGraph?.nodes.find((n) => n.kind.toLowerCase().includes('glare'));
  if (glare && glare.params.enabled !== false) {
    const mix = Math.max(0, Math.min(0.6, Number(glare.params.mix ?? 0.25)));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 225, 190, ${mix * 0.14})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
