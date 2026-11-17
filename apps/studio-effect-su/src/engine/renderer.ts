import {
  evaluateProp,
  getLayerWorldMatrix,
  isLayerActiveAtTime,
  transformPoint,
} from '../core/interpolation';
import type {
  BlendMode,
  Composition,
  Layer,
  ShapeLayerData,
  TextLayerData,
  WorldMatrix,
} from '../core/types';
import { acquireCanvas, applyEffectStack, releaseCanvas } from './effects';

const mediaCache = new Map<string, HTMLImageElement | HTMLVideoElement>();

export function getMediaElement(layer: Layer): HTMLImageElement | HTMLVideoElement | null {
  if (!layer.mediaData) return null;
  const key = `${layer.id}:${layer.mediaData.src.slice(0, 64)}`;
  const cached = mediaCache.get(key);
  if (cached) return cached;

  if (layer.mediaData.mediaType === 'image') {
    const img = new Image();
    img.src = layer.mediaData.src;
    mediaCache.set(key, img);
    return img;
  }

  const video = document.createElement('video');
  video.src = layer.mediaData.src;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  mediaCache.set(key, video);
  return video;
}

function mapBlendMode(mode: BlendMode): GlobalCompositeOperation {
  switch (mode) {
    case 'add':
      return 'lighter';
    case 'screen':
      return 'screen';
    case 'multiply':
      return 'multiply';
    case 'overlay':
      return 'overlay';
    case 'difference':
      return 'difference';
    case 'lighten':
      return 'lighten';
    case 'darken':
      return 'darken';
    default:
      return 'source-over';
  }
}

function drawShape(ctx: CanvasRenderingContext2D, s: ShapeLayerData): void {
  const hw = s.width / 2;
  const hh = s.height / 2;

  ctx.beginPath();
  if (s.kind === 'rect') {
    ctx.rect(-hw, -hh, s.width, s.height);
  } else if (s.kind === 'roundedRect') {
    const r = Math.min(s.cornerRadius, hw, hh);
    ctx.roundRect(-hw, -hh, s.width, s.height, r);
  } else if (s.kind === 'ellipse') {
    ctx.ellipse(0, 0, Math.abs(hw), Math.abs(hh), 0, 0, Math.PI * 2);
  } else if (s.kind === 'polygon' || s.kind === 'star') {
    const pts = Math.max(3, Math.round(s.points));
    const outerR = Math.min(hw, hh);
    const innerR = s.kind === 'star' ? outerR * 0.45 : outerR;
    const total = s.kind === 'star' ? pts * 2 : pts;
    for (let i = 0; i < total; i++) {
      const r = s.kind === 'star' && i % 2 === 1 ? innerR : outerR;
      const angle = (i * Math.PI * 2) / total - Math.PI / 2;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  if (s.fillOpacity > 0) {
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, s.fillOpacity / 100));
    ctx.fillStyle = s.fillColor;
    ctx.fill();
    ctx.restore();
  }

  if (s.strokeWidth > 0) {
    ctx.lineWidth = s.strokeWidth;
    ctx.strokeStyle = s.strokeColor;
    ctx.stroke();
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  t: TextLayerData,
  revealOverride?: number
): void {
  ctx.font = `${t.fontWeight} ${t.fontSize}px ${t.fontFamily}`;
  ctx.textAlign = t.align;
  ctx.textBaseline = 'middle';

  const reveal = revealOverride ?? t.revealProgress ?? 100;
  const fullText = t.text;
  const visibleLen = Math.round((fullText.length * Math.max(0, Math.min(100, reveal))) / 100);
  const clipped = fullText.slice(0, visibleLen);
  const lines = clipped.split('\n');
  const lineH = t.fontSize * t.lineHeight;
  const startY = -((lines.length - 1) * lineH) / 2;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = startY + i * lineH;
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${t.letterSpacing}px`;
    }
    if (t.strokeWidth > 0) {
      ctx.lineWidth = t.strokeWidth;
      ctx.strokeStyle = t.strokeColor;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, 0, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, 0, y);
  }
}

function drawSolid(ctx: CanvasRenderingContext2D, layer: Layer): void {
  const s = layer.solidData;
  if (!s) return;
  const hw = s.width / 2;
  const hh = s.height / 2;

  if (s.useGradient && s.gradientColor) {
    const rad = (s.gradientAngle * Math.PI) / 180;
    const dx = Math.cos(rad) * hw;
    const dy = Math.sin(rad) * hh;
    const grad = ctx.createLinearGradient(-dx, -dy, dx, dy);
    grad.addColorStop(0, s.color);
    grad.addColorStop(1, s.gradientColor);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = s.color;
  }
  ctx.fillRect(-hw, -hh, s.width, s.height);
}

function drawMedia(ctx: CanvasRenderingContext2D, layer: Layer, time: number): void {
  const md = layer.mediaData;
  if (!md) return;
  const el = getMediaElement(layer);
  if (!el) return;

  if (el instanceof HTMLImageElement) {
    if (!el.complete || el.naturalWidth === 0) return;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    ctx.drawImage(el, -w / 2, -h / 2, w, h);
  } else if (el instanceof HTMLVideoElement) {
    if (el.readyState < 2) return;
    const spd = layer.speed ?? 1;
    const targetTime = Math.max(0, (time - layer.inPoint) * spd + layer.startTime);
    if (Math.abs(el.currentTime - targetTime) > 0.08 && !el.seeking) {
      el.currentTime = Math.min(targetTime, el.duration || targetTime);
    }
    const w = el.videoWidth || md.naturalWidth || 640;
    const h = el.videoHeight || md.naturalHeight || 360;
    ctx.drawImage(el, -w / 2, -h / 2, w, h);
  }
}

export function getLayerLocalBounds(layer: Layer, allComps?: Composition[]): { width: number; height: number } {
  if (layer.type === 'solid' && layer.solidData) {
    return { width: layer.solidData.width, height: layer.solidData.height };
  }
  if (layer.type === 'shape' && layer.shapeData) {
    return { width: layer.shapeData.width, height: layer.shapeData.height };
  }
  if (layer.type === 'text' && layer.textData) {
    const lines = layer.textData.text.split('\n');
    const maxChars = Math.max(1, ...lines.map((l) => l.length));
    const estW = Math.max(160, maxChars * layer.textData.fontSize * 0.65);
    const estH = Math.max(60, lines.length * layer.textData.fontSize * layer.textData.lineHeight);
    return { width: estW, height: estH };
  }
  if (layer.type === 'media' && layer.mediaData) {
    return {
      width: layer.mediaData.naturalWidth || 400,
      height: layer.mediaData.naturalHeight || 400,
    };
  }
  if (layer.type === 'precomp' && layer.precompData && allComps) {
    const sub = allComps.find((c) => c.id === layer.precompData!.compId);
    if (sub) return { width: sub.width, height: sub.height };
  }
  return { width: 140, height: 140 };
}

function drawLayerContent(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  layerIndex: number,
  comp: Composition,
  time: number,
  scale: number,
  allComps: Composition[],
  visitedComps: Set<string>
): void {
  if (layer.type === 'solid') drawSolid(ctx, layer);
  else if (layer.type === 'shape' && layer.shapeData) drawShape(ctx, layer.shapeData);
  else if (layer.type === 'text' && layer.textData) {
    const reveal = layer.textReveal
      ? evaluateProp(layer.textReveal, time, layerIndex, comp, `${layer.id}:textReveal`)
      : layer.textData.revealProgress;
    drawText(ctx, layer.textData, reveal);
  } else if (layer.type === 'media') drawMedia(ctx, layer, time);
  else if (layer.type === 'precomp' && layer.precompData) {
    const sub = allComps.find((c) => c.id === layer.precompData!.compId);
    if (sub && !visitedComps.has(sub.id)) {
      const subW = Math.max(2, Math.round(sub.width * scale));
      const subH = Math.max(2, Math.round(sub.height * scale));
      const subCanvas = acquireCanvas(subW, subH);
      const subCtx = subCanvas.getContext('2d')!;
      const nextVisited = new Set(visitedComps);
      nextVisited.add(sub.id);
      const spd = layer.speed ?? 1;
      const subTime = Math.max(0, (time - layer.inPoint) * spd + layer.startTime);
      renderCompositionInternal(subCtx, sub, subTime, {
        renderScale: scale,
        transparentBg: true,
        allCompositions: allComps,
        visitedComps: nextVisited,
      });
      ctx.drawImage(subCanvas, -sub.width / 2, -sub.height / 2, sub.width, sub.height);
      releaseCanvas(subCanvas);
    }
  }
}

function applyMaskToLayerCanvas(
  layerCanvas: HTMLCanvasElement,
  layer: Layer,
  matrix: WorldMatrix,
  scale: number
): void {
  const mask = layer.mask;
  if (!mask || !mask.enabled) return;

  const w = layerCanvas.width;
  const h = layerCanvas.height;
  const maskCanvas = acquireCanvas(w, h);
  const mctx = maskCanvas.getContext('2d')!;

  mctx.save();
  mctx.setTransform(
    matrix.a * scale,
    matrix.b * scale,
    matrix.c * scale,
    matrix.d * scale,
    matrix.e * scale,
    matrix.f * scale
  );
  if (mask.feather > 0.2) {
    mctx.filter = `blur(${(mask.feather * scale).toFixed(1)}px)`;
  }
  mctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, Math.min(1, mask.opacity / 100)).toFixed(2)})`;
  mctx.beginPath();
  if (mask.shape === 'ellipse') {
    mctx.ellipse(mask.x, mask.y, Math.abs(mask.width / 2), Math.abs(mask.height / 2), 0, 0, Math.PI * 2);
  } else {
    mctx.rect(mask.x - mask.width / 2, mask.y - mask.height / 2, mask.width, mask.height);
  }
  mctx.fill();
  mctx.restore();

  const lctx = layerCanvas.getContext('2d')!;
  lctx.save();
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = mask.inverted ? 'destination-out' : 'destination-in';
  lctx.drawImage(maskCanvas, 0, 0);
  lctx.restore();

  releaseCanvas(maskCanvas);
}

function renderSingleLayerBuffer(
  layer: Layer,
  layerIndex: number,
  comp: Composition,
  time: number,
  scale: number,
  w: number,
  h: number,
  allComps: Composition[],
  visitedComps: Set<string>
): { canvas: HTMLCanvasElement; opacity: number } | null {
  const matrix = getLayerWorldMatrix(layer, comp, time);
  if (matrix.opacity <= 0.002) return null;

  const layerCanvas = acquireCanvas(w, h);
  const lctx = layerCanvas.getContext('2d')!;
  lctx.setTransform(
    matrix.a * scale,
    matrix.b * scale,
    matrix.c * scale,
    matrix.d * scale,
    matrix.e * scale,
    matrix.f * scale
  );
  drawLayerContent(lctx, layer, layerIndex, comp, time, scale, allComps, visitedComps);

  if (layer.mask?.enabled) {
    applyMaskToLayerCanvas(layerCanvas, layer, matrix, scale);
  }

  const activeFx = layer.effects.filter((fx) => fx.enabled);
  if (activeFx.length === 0) {
    return { canvas: layerCanvas, opacity: matrix.opacity };
  }

  const effected = applyEffectStack(layerCanvas, activeFx, time, layer, layerIndex, comp, scale);
  if (effected !== layerCanvas) releaseCanvas(layerCanvas);
  return { canvas: effected, opacity: matrix.opacity };
}

export function renderComposition(
  targetCtx: CanvasRenderingContext2D,
  comp: Composition,
  time: number,
  options: {
    renderScale?: number;
    transparentBg?: boolean;
    allCompositions?: Composition[];
  } = {}
): void {
  renderCompositionInternal(targetCtx, comp, time, {
    ...options,
    visitedComps: new Set([comp.id]),
  });
}

function renderCompositionInternal(
  targetCtx: CanvasRenderingContext2D,
  comp: Composition,
  time: number,
  options: {
    renderScale?: number;
    transparentBg?: boolean;
    allCompositions?: Composition[];
    visitedComps: Set<string>;
  }
): void {
  const scale = options.renderScale ?? 1;
  const allComps = options.allCompositions ?? [comp];
  const w = Math.max(1, Math.round(comp.width * scale));
  const h = Math.max(1, Math.round(comp.height * scale));

  const mainCanvas = acquireCanvas(w, h);
  const mctx = mainCanvas.getContext('2d')!;

  if (!options.transparentBg) {
    mctx.fillStyle = comp.backgroundColor;
    mctx.fillRect(0, 0, w, h);
  }

  const hasSolo = comp.layers.some((l) => l.solo);

  // Determine which layers are consumed as Track Mattes by the layer directly below them
  const consumedAsMatte = new Set<number>();
  for (let i = 1; i < comp.layers.length; i++) {
    const l = comp.layers[i];
    if (l.trackMatte && l.trackMatte !== 'none' && isLayerActiveAtTime(l, time)) {
      consumedAsMatte.add(i - 1);
    }
  }

  for (let i = comp.layers.length - 1; i >= 0; i--) {
    if (consumedAsMatte.has(i)) continue;
    const layer = comp.layers[i];
    if (!isLayerActiveAtTime(layer, time)) continue;
    if (hasSolo && !layer.solo) continue;
    if (layer.type === 'null' || layer.type === 'audio') continue;

    if (layer.type === 'adjustment') {
      const activeFx = layer.effects.filter((fx) => fx.enabled);
      if (activeFx.length > 0) {
        const processed = applyEffectStack(mainCanvas, activeFx, time, layer, i, comp, scale);
        if (processed !== mainCanvas) {
          mctx.setTransform(1, 0, 0, 1, 0, 0);
          mctx.clearRect(0, 0, w, h);
          mctx.globalCompositeOperation = 'source-over';
          mctx.globalAlpha = 1;
          mctx.drawImage(processed, 0, 0);
          releaseCanvas(processed);
        }
      }
      continue;
    }

    const useMatte =
      layer.trackMatte &&
      layer.trackMatte !== 'none' &&
      i > 0 &&
      comp.layers[i - 1] &&
      comp.layers[i - 1].type !== 'null' &&
      comp.layers[i - 1].type !== 'audio';

    const activeFx = layer.effects.filter((fx) => fx.enabled);
    const needsBuffer = activeFx.length > 0 || Boolean(layer.mask?.enabled) || Boolean(useMatte);

    if (!needsBuffer) {
      const matrix = getLayerWorldMatrix(layer, comp, time);
      if (matrix.opacity <= 0.002) continue;
      mctx.save();
      mctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
      mctx.globalAlpha = matrix.opacity;
      mctx.setTransform(
        matrix.a * scale,
        matrix.b * scale,
        matrix.c * scale,
        matrix.d * scale,
        matrix.e * scale,
        matrix.f * scale
      );
      drawLayerContent(mctx, layer, i, comp, time, scale, allComps, options.visitedComps);
      mctx.restore();
    } else {
      const rendered = renderSingleLayerBuffer(
        layer,
        i,
        comp,
        time,
        scale,
        w,
        h,
        allComps,
        options.visitedComps
      );
      if (!rendered) continue;

      if (useMatte) {
        const matteLayer = comp.layers[i - 1];
        if (isLayerActiveAtTime(matteLayer, time)) {
          const matteBuf = renderSingleLayerBuffer(
            matteLayer,
            i - 1,
            comp,
            time,
            scale,
            w,
            h,
            allComps,
            options.visitedComps
          );
          if (matteBuf) {
            const rctx = rendered.canvas.getContext('2d')!;
            rctx.save();
            rctx.setTransform(1, 0, 0, 1, 0, 0);
            rctx.globalAlpha = matteBuf.opacity;
            rctx.globalCompositeOperation =
              layer.trackMatte === 'alphaInverted' ? 'destination-out' : 'destination-in';
            rctx.drawImage(matteBuf.canvas, 0, 0);
            rctx.restore();
            releaseCanvas(matteBuf.canvas);
          }
        }
      }

      mctx.save();
      mctx.globalCompositeOperation = mapBlendMode(layer.blendMode);
      mctx.globalAlpha = rendered.opacity;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.drawImage(rendered.canvas, 0, 0);
      mctx.restore();

      releaseCanvas(rendered.canvas);
    }
  }

  targetCtx.save();
  targetCtx.setTransform(1, 0, 0, 1, 0, 0);
  targetCtx.clearRect(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  targetCtx.drawImage(mainCanvas, 0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
  targetCtx.restore();

  releaseCanvas(mainCanvas);
}

export interface GizmoGeometry {
  corners: Array<{ x: number; y: number }>;
  rotateHandle: { x: number; y: number };
  anchor: { x: number; y: number };
  matrix: WorldMatrix;
}

export function computeGizmoGeometry(
  layer: Layer,
  comp: Composition,
  time: number,
  allComps?: Composition[]
): GizmoGeometry {
  const mat = getLayerWorldMatrix(layer, comp, time);
  const { width, height } = getLayerLocalBounds(layer, allComps);
  const hw = width / 2;
  const hh = height / 2;

  const corners = [
    transformPoint(mat, -hw, -hh),
    transformPoint(mat, hw, -hh),
    transformPoint(mat, hw, hh),
    transformPoint(mat, -hw, hh),
  ];

  const topMid = {
    x: (corners[0].x + corners[1].x) / 2,
    y: (corners[0].y + corners[1].y) / 2,
  };
  const center = transformPoint(mat, 0, 0);
  const dx = topMid.x - center.x;
  const dy = topMid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const rotateOffset = Math.min(comp.width, comp.height) * 0.065;
  const rotateHandle = {
    x: topMid.x + (dx / len) * rotateOffset,
    y: topMid.y + (dy / len) * rotateOffset,
  };

  const anchorX = layer.transform.anchorX.value;
  const anchorY = layer.transform.anchorY.value;
  const anchor = transformPoint(mat, anchorX, anchorY);

  return { corners, rotateHandle, anchor, matrix: mat };
}

export function renderEditorOverlay(
  ctx: CanvasRenderingContext2D,
  comp: Composition,
  selectedLayer: Layer | null,
  time: number,
  options: {
    showSafeMargins: boolean;
    showGizmo: boolean;
    snapX?: boolean;
    snapY?: boolean;
    allCompositions?: Composition[];
  }
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const sx = cw / comp.width;
  const sy = ch / comp.height;

  ctx.save();

  if (options.showSafeMargins) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(cw * 0.05, ch * 0.05, cw * 0.9, ch * 0.9);
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.32)';
    ctx.strokeRect(cw * 0.1, ch * 0.1, cw * 0.8, ch * 0.8);
    ctx.setLineDash([]);
  }

  // Center magnetic snap guides
  if (options.snapX) {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cw / 2, 0);
    ctx.lineTo(cw / 2, ch);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (options.snapY) {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(0, ch / 2);
    ctx.lineTo(cw, ch / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (
    options.showGizmo &&
    selectedLayer &&
    selectedLayer.type !== 'adjustment' &&
    selectedLayer.type !== 'audio'
  ) {
    const g = computeGizmoGeometry(selectedLayer, comp, time, options.allCompositions);
    const pts = g.corners.map((p) => ({ x: p.x * sx, y: p.y * sy }));
    const rot = { x: g.rotateHandle.x * sx, y: g.rotateHandle.y * sy };
    const anc = { x: g.anchor.x * sx, y: g.anchor.y * sy };

    ctx.strokeStyle = selectedLayer.locked ? '#ef4444' : '#4c8bf5';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.stroke();

    // Mask wireframe preview
    if (selectedLayer.mask?.enabled) {
      const m = selectedLayer.mask;
      const mPts = [
        transformPoint(g.matrix, m.x - m.width / 2, m.y - m.height / 2),
        transformPoint(g.matrix, m.x + m.width / 2, m.y - m.height / 2),
        transformPoint(g.matrix, m.x + m.width / 2, m.y + m.height / 2),
        transformPoint(g.matrix, m.x - m.width / 2, m.y + m.height / 2),
      ].map((p) => ({ x: p.x * sx, y: p.y * sy }));

      ctx.save();
      ctx.strokeStyle = '#f5b041';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(mPts[0].x, mPts[0].y);
      ctx.lineTo(mPts[1].x, mPts[1].y);
      ctx.lineTo(mPts[2].x, mPts[2].y);
      ctx.lineTo(mPts[3].x, mPts[3].y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    const topMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    ctx.beginPath();
    ctx.moveTo(topMid.x, topMid.y);
    ctx.lineTo(rot.x, rot.y);
    ctx.stroke();

    for (const p of pts) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#4c8bf5';
      ctx.lineWidth = 2;
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
      ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
    }

    ctx.beginPath();
    ctx.arc(rot.x, rot.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.arc(anc.x, anc.y, 6, 0, Math.PI * 2);
    ctx.moveTo(anc.x - 10, anc.y);
    ctx.lineTo(anc.x + 10, anc.y);
    ctx.moveTo(anc.x, anc.y - 10);
    ctx.lineTo(anc.x, anc.y + 10);
    ctx.stroke();
  }

  ctx.restore();
}
