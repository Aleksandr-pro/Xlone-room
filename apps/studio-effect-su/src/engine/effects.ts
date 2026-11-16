import { evalWiggle } from '../core/expressions';
import { evaluateProp } from '../core/interpolation';
import type { Composition, EffectInstance, Layer } from '../core/types';

const scratchPool: HTMLCanvasElement[] = [];

export function acquireCanvas(w: number, h: number): HTMLCanvasElement {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const c = scratchPool.pop() ?? document.createElement('canvas');
  if (c.width !== cw) c.width = cw;
  if (c.height !== ch) c.height = ch;
  const ctx = c.getContext('2d');
  ctx?.setTransform(1, 0, 0, 1, 0, 0);
  ctx?.clearRect(0, 0, cw, ch);
  return c;
}

export function releaseCanvas(c: HTMLCanvasElement): void {
  if (scratchPool.length < 10) {
    scratchPool.push(c);
  }
}

function pVal(
  fx: EffectInstance,
  key: string,
  fallback: number,
  time: number,
  layerIndex: number,
  comp: Composition
): number {
  const p = fx.params[key];
  if (!p) return fallback;
  return evaluateProp(p, time, layerIndex, comp, `${fx.id}:${key}`);
}

export function applyEffectStack(
  sourceCanvas: HTMLCanvasElement,
  effects: EffectInstance[],
  time: number,
  layer: Layer,
  layerIndex: number,
  comp: Composition,
  renderScale = 1
): HTMLCanvasElement {
  let current = sourceCanvas;

  for (const fx of effects) {
    if (!fx.enabled) continue;
    const w = current.width;
    const h = current.height;
    const out = acquireCanvas(w, h);
    const octx = out.getContext('2d');
    if (!octx) {
      releaseCanvas(out);
      continue;
    }

    switch (fx.type) {
      case 'blur': {
        const radius = Math.max(0, pVal(fx, 'radius', 8, time, layerIndex, comp)) * renderScale;
        octx.filter = radius > 0.1 ? `blur(${radius.toFixed(1)}px)` : 'none';
        octx.drawImage(current, 0, 0);
        octx.filter = 'none';
        break;
      }

      case 'glow': {
        const radius = Math.max(0, pVal(fx, 'radius', 18, time, layerIndex, comp)) * renderScale;
        const intensity = Math.max(0, pVal(fx, 'intensity', 85, time, layerIndex, comp)) / 100;
        octx.drawImage(current, 0, 0);
        if (radius > 0.2 && intensity > 0.01) {
          octx.save();
          octx.globalCompositeOperation = 'lighter';
          octx.globalAlpha = Math.min(1, intensity);
          octx.filter = `blur(${radius.toFixed(1)}px)`;
          octx.drawImage(current, 0, 0);
          if (intensity > 1) {
            octx.globalAlpha = Math.min(1, intensity - 1);
            octx.filter = `blur(${(radius * 2).toFixed(1)}px)`;
            octx.drawImage(current, 0, 0);
          }
          octx.restore();
        }
        break;
      }

      case 'dropShadow': {
        const distance = pVal(fx, 'distance', 16, time, layerIndex, comp) * renderScale;
        const blur = Math.max(0, pVal(fx, 'blur', 20, time, layerIndex, comp)) * renderScale;
        const opacity = Math.max(0, Math.min(100, pVal(fx, 'opacity', 75, time, layerIndex, comp))) / 100;
        octx.save();
        octx.shadowColor = `rgba(0, 0, 0, ${opacity.toFixed(2)})`;
        octx.shadowBlur = blur;
        octx.shadowOffsetX = distance * 0.7;
        octx.shadowOffsetY = distance;
        octx.drawImage(current, 0, 0);
        octx.restore();
        break;
      }

      case 'hueSat': {
        const hue = pVal(fx, 'hue', 0, time, layerIndex, comp);
        const sat = Math.max(0, pVal(fx, 'saturation', 120, time, layerIndex, comp));
        octx.filter = `hue-rotate(${hue.toFixed(1)}deg) saturate(${sat.toFixed(0)}%)`;
        octx.drawImage(current, 0, 0);
        octx.filter = 'none';
        break;
      }

      case 'contrast': {
        const brightness = Math.max(0, pVal(fx, 'brightness', 105, time, layerIndex, comp));
        const contrast = Math.max(0, pVal(fx, 'contrast', 120, time, layerIndex, comp));
        octx.filter = `brightness(${brightness.toFixed(0)}%) contrast(${contrast.toFixed(0)}%)`;
        octx.drawImage(current, 0, 0);
        octx.filter = 'none';
        break;
      }

      case 'shake': {
        const freq = Math.max(0, pVal(fx, 'frequency', 6, time, layerIndex, comp));
        const amp = pVal(fx, 'amplitude', 22, time, layerIndex, comp) * renderScale;
        const dx = evalWiggle(time, freq, amp, layerIndex * 19 + 3, 0);
        const dy = evalWiggle(time, freq, amp, layerIndex * 37 + 11, 0);
        octx.drawImage(current, dx, dy);
        break;
      }

      case 'motionTile': {
        const tw = Math.max(50, pVal(fx, 'tileWidth', 150, time, layerIndex, comp)) / 100;
        const th = Math.max(50, pVal(fx, 'tileHeight', 150, time, layerIndex, comp)) / 100;
        const mirror = Math.round(pVal(fx, 'mirror', 1, time, layerIndex, comp)) >= 1;
        const tileW = w / tw;
        const tileH = h / th;
        const cols = Math.ceil(tw / 2) + 1;
        const rows = Math.ceil(th / 2) + 1;
        const cx = w / 2;
        const cy = h / 2;

        for (let r = -rows; r <= rows; r++) {
          for (let c = -cols; c <= cols; c++) {
            octx.save();
            const px = cx + c * tileW;
            const py = cy + r * tileH;
            octx.translate(px, py);
            const flipX = mirror && Math.abs(c) % 2 === 1 ? -1 : 1;
            const flipY = mirror && Math.abs(r) % 2 === 1 ? -1 : 1;
            octx.scale(flipX / tw, flipY / th);
            octx.drawImage(current, -w / 2, -h / 2);
            octx.restore();
          }
        }
        break;
      }

      case 'pixelate': {
        const block = Math.max(2, Math.round(pVal(fx, 'size', 10, time, layerIndex, comp) * renderScale));
        const sw = Math.max(1, Math.floor(w / block));
        const sh = Math.max(1, Math.floor(h / block));
        const tiny = acquireCanvas(sw, sh);
        const tctx = tiny.getContext('2d');
        if (tctx) {
          tctx.imageSmoothingEnabled = true;
          tctx.drawImage(current, 0, 0, sw, sh);
          octx.imageSmoothingEnabled = false;
          octx.drawImage(tiny, 0, 0, sw, sh, 0, 0, w, h);
          octx.imageSmoothingEnabled = true;
        }
        releaseCanvas(tiny);
        break;
      }

      case 'rgbSplit': {
        const amount = Math.round(pVal(fx, 'amount', 10, time, layerIndex, comp) * renderScale);
        const angle = (pVal(fx, 'angle', 0, time, layerIndex, comp) * Math.PI) / 180;
        const dx = Math.round(Math.cos(angle) * amount);
        const dy = Math.round(Math.sin(angle) * amount);

        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          octx.drawImage(current, 0, 0);
          break;
        }

        const cctx = current.getContext('2d');
        if (!cctx) {
          octx.drawImage(current, 0, 0);
          break;
        }
        const src = cctx.getImageData(0, 0, w, h);
        const dst = octx.createImageData(w, h);
        const sData = src.data;
        const dData = dst.data;

        for (let y = 0; y < h; y++) {
          const ry = Math.min(h - 1, Math.max(0, y - dy));
          const by = Math.min(h - 1, Math.max(0, y + dy));
          for (let x = 0; x < w; x++) {
            const rx = Math.min(w - 1, Math.max(0, x - dx));
            const bx = Math.min(w - 1, Math.max(0, x + dx));
            const idx = (y * w + x) * 4;
            const rIdx = (ry * w + rx) * 4;
            const bIdx = (by * w + bx) * 4;
            dData[idx] = sData[rIdx];
            dData[idx + 1] = sData[idx + 1];
            dData[idx + 2] = sData[bIdx + 2];
            dData[idx + 3] = Math.max(sData[idx + 3], sData[rIdx + 3], sData[bIdx + 3]);
          }
        }
        octx.putImageData(dst, 0, 0);
        break;
      }

      case 'glitch': {
        const intensity = Math.max(0, pVal(fx, 'intensity', 40, time, layerIndex, comp)) / 100;
        const seed = pVal(fx, 'speed', 25, time, layerIndex, comp);
        octx.drawImage(current, 0, 0);
        if (intensity <= 0.01) break;

        const sliceCount = Math.max(4, Math.round(8 + intensity * 14));
        const frameSeed = Math.floor(time * 24) + seed;
        for (let i = 0; i < sliceCount; i++) {
          const r1 = Math.abs(Math.sin((frameSeed + i * 17.3) * 12.9898) * 43758.5453) % 1;
          const r2 = Math.abs(Math.sin((frameSeed + i * 43.1) * 78.233) * 43758.5453) % 1;
          const r3 = Math.sin((frameSeed + i * 91.7) * 39.425);
          const sy = Math.floor(r1 * h);
          const sh = Math.max(2, Math.floor((r2 * 0.08 + 0.01) * h));
          const shift = Math.round(r3 * intensity * 48 * renderScale);
          if (sy + sh <= h) {
            octx.drawImage(current, 0, sy, w, sh, shift, sy, w, sh);
          }
        }

        // Subtle CRT scanlines
        octx.save();
        octx.fillStyle = `rgba(0, 0, 0, ${(0.18 * intensity).toFixed(2)})`;
        const step = Math.max(2, Math.round(4 * renderScale));
        for (let y = 0; y < h; y += step * 2) {
          octx.fillRect(0, y, w, step);
        }
        octx.restore();
        break;
      }

      case 'vignette': {
        const amount = Math.max(0, Math.min(100, pVal(fx, 'amount', 55, time, layerIndex, comp))) / 100;
        const softness = Math.max(10, Math.min(100, pVal(fx, 'softness', 55, time, layerIndex, comp))) / 100;
        octx.drawImage(current, 0, 0);
        const cx = w / 2;
        const cy = h / 2;
        const outerR = Math.hypot(cx, cy);
        const innerR = outerR * (1 - softness * 0.75);
        const grad = octx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, `rgba(0,0,0,${amount.toFixed(2)})`);
        octx.fillStyle = grad;
        octx.fillRect(0, 0, w, h);
        break;
      }

      default:
        octx.drawImage(current, 0, 0);
        break;
    }

    if (current !== sourceCanvas) {
      releaseCanvas(current);
    }
    current = out;
  }

  // Keep reference clear if unused
  void layer;
  return current;
}
