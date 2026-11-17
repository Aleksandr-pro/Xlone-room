import { len3, sub3 } from '../core/math3d';
import type { BakeType, MeshData, PaintSettings, Vec3 } from '../core/types';

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(n)) return [0.9, 0.4, 0.2];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function paintVertexColor(mesh: MeshData, hitLocal: Vec3, paint: PaintSettings): void {
  const rgb = hexToRgb01(paint.color);
  const r = Math.max(0.05, paint.radius);
  const s = Math.max(0.02, Math.min(1, paint.strength));
  for (const v of mesh.vertices) {
    const d = len3(sub3(v.pos, hitLocal));
    if (d < r) {
      const f = (1 - d / r) * s;
      v.color = [
        v.color[0] + (rgb[0] - v.color[0]) * f,
        v.color[1] + (rgb[1] - v.color[1]) * f,
        v.color[2] + (rgb[2] - v.color[2]) * f,
      ];
    }
  }
}

export function paintVertexWeight(mesh: MeshData, hitLocal: Vec3, paint: PaintSettings, weightVal = 1.0): void {
  const r = Math.max(0.05, paint.radius);
  const s = Math.max(0.02, Math.min(1, paint.strength));
  const group = paint.activeBoneId || 'Bone';
  for (const v of mesh.vertices) {
    const d = len3(sub3(v.pos, hitLocal));
    if (d < r) {
      const f = (1 - d / r) * s;
      const cur = v.weights[group] ?? 0;
      v.weights[group] = Math.max(0, Math.min(1, cur + (weightVal - cur) * f));
    }
  }
}

export function autoAssignWeights(mesh: MeshData, boneNames: string[]): void {
  if (boneNames.length === 0) return;
  for (const v of mesh.vertices) {
    const zNorm = Math.max(0, Math.min(1, (v.pos.z + 1) * 0.5));
    boneNames.forEach((bn, idx) => {
      const target = idx / Math.max(1, boneNames.length - 1);
      v.weights[bn] = Math.max(0.05, 1 - Math.abs(zNorm - target) * 1.4);
    });
  }
}

export function paintTextureUv(
  canvas: HTMLCanvasElement,
  u: number,
  v: number,
  paint: PaintSettings
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const x = Math.max(0, Math.min(1, u)) * canvas.width;
  const y = (1 - Math.max(0, Math.min(1, v))) * canvas.height;
  const pxR = Math.max(3, paint.radius * 26);

  const grad = ctx.createRadialGradient(x, y, 0, x, y, pxR);
  grad.addColorStop(0, paint.color);
  grad.addColorStop(1, 'transparent');
  ctx.globalAlpha = Math.max(0.1, paint.strength * 0.65);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, pxR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function bakeMeshMap(mesh: MeshData, mapType: BakeType, size = 128): {
  mapType: BakeType;
  size: number;
  dataUrl: string;
  samplePixels: number;
} {
  if (typeof document === 'undefined') {
    return { mapType, size, dataUrl: '', samplePixels: size * size };
  }
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      const u = px / size;
      const v = py / size;
      const vert = mesh.vertices[(px + py * size) % Math.max(1, mesh.vertices.length)];
      if (mapType === 'normal') {
        const nx = vert ? vert.normal.x * 0.5 + 0.5 : 0.5;
        const ny = vert ? vert.normal.y * 0.5 + 0.5 : 0.5;
        const nz = vert ? vert.normal.z * 0.5 + 0.5 : 1.0;
        img.data[i] = Math.round(nx * 255);
        img.data[i + 1] = Math.round(ny * 255);
        img.data[i + 2] = Math.round(nz * 255);
      } else if (mapType === 'ao') {
        const ao = vert ? Math.max(0.25, Math.min(1, 0.55 + vert.normal.z * 0.45)) : 0.8;
        const val = Math.round(ao * 255);
        img.data[i] = val;
        img.data[i + 1] = val;
        img.data[i + 2] = val;
      } else if (mapType === 'roughness') {
        const rgh = Math.round((0.35 + 0.25 * Math.sin((u + v) * 8)) * 255);
        img.data[i] = rgh;
        img.data[i + 1] = rgh;
        img.data[i + 2] = rgh;
      } else if (mapType === 'position' || mapType === 'uv') {
        img.data[i] = Math.round(u * 255);
        img.data[i + 1] = Math.round(v * 255);
        img.data[i + 2] = 160;
      } else {
        const col = vert?.color ?? [0.75, 0.75, 0.78];
        img.data[i] = Math.round(col[0] * 255);
        img.data[i + 1] = Math.round(col[1] * 255);
        img.data[i + 2] = Math.round(col[2] * 255);
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return {
    mapType,
    size,
    dataUrl: c.toDataURL('image/png'),
    samplePixels: size * size,
  };
}
