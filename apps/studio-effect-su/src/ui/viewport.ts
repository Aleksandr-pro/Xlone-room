import {
  formatTimecode,
  getLayerWorldMatrix,
  invertMatrix,
  isLayerActiveAtTime,
  transformPoint,
} from '../core/interpolation';
import {
  computeGizmoGeometry,
  getLayerLocalBounds,
  renderComposition,
  renderEditorOverlay,
} from '../engine/renderer';
import { store } from '../state/store';
import { ICONS } from './icons';

export function mountViewport(container: HTMLElement): void {
  container.innerHTML = `
    <div class="viewport-wrap">
      <div class="viewport-stage" data-stage>
        <div class="canvas-frame" data-frame>
          <canvas class="comp-canvas" data-comp-canvas></canvas>
          <canvas class="overlay-canvas" data-overlay-canvas></canvas>
        </div>
        <div class="viewport-hud">
          <span class="hud-badge" data-comp-badge>1080×1920 • 30fps</span>
        </div>
      </div>
      <div class="transport-bar">
        <div class="transport-left">
          <span class="timecode" data-timecode>00:00:00</span>
          <span class="frame-counter" data-frame-counter>F0</span>
        </div>
        <div class="transport-controls">
          <button class="icon-btn" title="To Start" data-action="toStart">${ICONS.toStart}</button>
          <button class="icon-btn" title="Prev Frame" data-action="prevFrame">${ICONS.stepBack}</button>
          <button class="icon-btn play-btn" title="Play / Pause" data-action="play">${ICONS.play}</button>
          <button class="icon-btn" title="Next Frame" data-action="nextFrame">${ICONS.stepFwd}</button>
          <button class="icon-btn" title="Loop" data-action="loop">${ICONS.loop}</button>
        </div>
        <div class="transport-right">
          <button class="pill-btn" title="Preview Resolution" data-action="quality">1/2</button>
          <button class="icon-btn" title="Safe Margins" data-action="safeMargins">${ICONS.safeMargin}</button>
          <button class="icon-btn" title="Transform Gizmo" data-action="gizmo">${ICONS.gizmo}</button>
          <button class="icon-btn" title="Transparency Grid" data-action="grid">${ICONS.grid}</button>
        </div>
      </div>
    </div>
  `;

  const stage = container.querySelector<HTMLElement>('[data-stage]')!;
  const frameEl = container.querySelector<HTMLElement>('[data-frame]')!;
  const compCanvas = container.querySelector<HTMLCanvasElement>('[data-comp-canvas]')!;
  const overlayCanvas = container.querySelector<HTMLCanvasElement>('[data-overlay-canvas]')!;
  const compCtx = compCanvas.getContext('2d')!;
  const overlayCtx = overlayCanvas.getContext('2d')!;

  const badgeEl = container.querySelector<HTMLElement>('[data-comp-badge]')!;
  const timecodeEl = container.querySelector<HTMLElement>('[data-timecode]')!;
  const frameCounterEl = container.querySelector<HTMLElement>('[data-frame-counter]')!;
  const playBtn = container.querySelector<HTMLButtonElement>('[data-action="play"]')!;
  const loopBtn = container.querySelector<HTMLButtonElement>('[data-action="loop"]')!;
  const qualityBtn = container.querySelector<HTMLButtonElement>('[data-action="quality"]')!;
  const safeBtn = container.querySelector<HTMLButtonElement>('[data-action="safeMargins"]')!;
  const gizmoBtn = container.querySelector<HTMLButtonElement>('[data-action="gizmo"]')!;
  const gridBtn = container.querySelector<HTMLButtonElement>('[data-action="grid"]')!;

  function layoutCanvas(): void {
    const comp = store.getActiveComp();
    const state = store.getState();
    const rect = stage.getBoundingClientRect();
    const pad = 16;
    const availW = Math.max(120, rect.width - pad * 2);
    const availH = Math.max(120, rect.height - pad * 2);
    const aspect = comp.width / comp.height;

    let displayW = availW;
    let displayH = displayW / aspect;
    if (displayH > availH) {
      displayH = availH;
      displayW = displayH * aspect;
    }

    frameEl.style.width = `${Math.round(displayW)}px`;
    frameEl.style.height = `${Math.round(displayH)}px`;
    frameEl.classList.toggle('checkerboard', state.transparentGrid);

    const renderW = Math.max(2, Math.round(comp.width * state.previewQuality));
    const renderH = Math.max(2, Math.round(comp.height * state.previewQuality));
    if (compCanvas.width !== renderW || compCanvas.height !== renderH) {
      compCanvas.width = renderW;
      compCanvas.height = renderH;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ovW = Math.max(2, Math.round(displayW * dpr));
    const ovH = Math.max(2, Math.round(displayH * dpr));
    if (overlayCanvas.width !== ovW || overlayCanvas.height !== ovH) {
      overlayCanvas.width = ovW;
      overlayCanvas.height = ovH;
    }
  }

  function drawFrame(): void {
    layoutCanvas();
    const state = store.getState();
    const comp = store.getActiveComp();

    renderComposition(compCtx, comp, state.currentTime, {
      renderScale: state.previewQuality,
      transparentBg: state.transparentGrid,
    });

    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    if (!state.isPlaying) {
      renderEditorOverlay(overlayCtx, comp, store.getSelectedLayer(), state.currentTime, {
        showSafeMargins: state.showSafeMargins,
        showGizmo: state.showGizmo,
      });
    }

    timecodeEl.textContent = formatTimecode(state.currentTime, comp.fps);
    frameCounterEl.textContent = `F${Math.round(state.currentTime * comp.fps)}`;
  }

  function syncToolbar(): void {
    const state = store.getState();
    const comp = store.getActiveComp();
    badgeEl.textContent = `${comp.width}×${comp.height} • ${comp.fps}fps`;
    playBtn.innerHTML = state.isPlaying ? ICONS.pause : ICONS.play;
    playBtn.classList.toggle('active', state.isPlaying);
    loopBtn.classList.toggle('active', state.loop);
    qualityBtn.textContent =
      state.previewQuality === 0.5 ? '1/2' : state.previewQuality === 0.75 ? '3/4' : 'Full';
    safeBtn.classList.toggle('active', state.showSafeMargins);
    gizmoBtn.classList.toggle('active', state.showGizmo);
    gridBtn.classList.toggle('active', state.transparentGrid);
  }

  // Transport button handlers
  container.querySelector('[data-action="toStart"]')!.addEventListener('click', () => {
    store.stopPlay();
    store.setTime(0);
  });
  container.querySelector('[data-action="prevFrame"]')!.addEventListener('click', () => {
    store.stopPlay();
    store.stepFrame(-1);
  });
  playBtn.addEventListener('click', () => store.togglePlay());
  container.querySelector('[data-action="nextFrame"]')!.addEventListener('click', () => {
    store.stopPlay();
    store.stepFrame(1);
  });
  loopBtn.addEventListener('click', () => {
    store.getState().loop = !store.getState().loop;
    syncToolbar();
  });
  qualityBtn.addEventListener('click', () => {
    const cur = store.getState().previewQuality;
    const next = cur === 0.5 ? 0.75 : cur === 0.75 ? 1 : 0.5;
    store.setPreviewQuality(next);
  });
  safeBtn.addEventListener('click', () => store.toggleSafeMargins());
  gizmoBtn.addEventListener('click', () => store.toggleGizmo());
  gridBtn.addEventListener('click', () => store.toggleTransparentGrid());

  // Interactive Gizmo Pointer Events
  type DragMode = 'move' | 'scale' | 'rotate';
  let drag: {
    mode: DragMode;
    layerId: string;
    startCompPt: { x: number; y: number };
    startX: number;
    startY: number;
    startScaleX: number;
    startScaleY: number;
    startRotation: number;
    anchorWorld: { x: number; y: number };
    startDist: number;
    startAngle: number;
    snapshotTaken: boolean;
  } | null = null;

  function toCompCoords(clientX: number, clientY: number): { x: number; y: number } {
    const comp = store.getActiveComp();
    const rect = frameEl.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * comp.width,
      y: ((clientY - rect.top) / rect.height) * comp.height,
    };
  }

  function isPointInLayer(
    pt: { x: number; y: number },
    layer: ReturnType<typeof store.getSelectedLayer>
  ): boolean {
    if (!layer || layer.type === 'adjustment' || layer.type === 'null') return false;
    const comp = store.getActiveComp();
    const t = store.getState().currentTime;
    if (!isLayerActiveAtTime(layer, t)) return false;
    const inv = invertMatrix(getLayerWorldMatrix(layer, comp, t));
    if (!inv) return false;
    const local = transformPoint(inv, pt.x, pt.y);
    const bounds = getLayerLocalBounds(layer);
    return (
      Math.abs(local.x) <= bounds.width / 2 + 24 &&
      Math.abs(local.y) <= bounds.height / 2 + 24
    );
  }

  overlayCanvas.addEventListener('pointerdown', (ev) => {
    const state = store.getState();
    const comp = store.getActiveComp();
    const pt = toCompCoords(ev.clientX, ev.clientY);
    const hitTol = Math.min(comp.width, comp.height) * 0.05;

    const selected = store.getSelectedLayer();
    if (selected && state.showGizmo && !selected.locked && selected.type !== 'adjustment') {
      const g = computeGizmoGeometry(selected, comp, state.currentTime);

      const startX = store.getEvaluatedProp(selected, 'x');
      const startY = store.getEvaluatedProp(selected, 'y');
      const startScaleX = store.getEvaluatedProp(selected, 'scaleX');
      const startScaleY = store.getEvaluatedProp(selected, 'scaleY');
      const startRotation = store.getEvaluatedProp(selected, 'rotation');

      let mode: DragMode | null = null;
      if (Math.hypot(pt.x - g.rotateHandle.x, pt.y - g.rotateHandle.y) <= hitTol) {
        mode = 'rotate';
      } else if (g.corners.some((c) => Math.hypot(pt.x - c.x, pt.y - c.y) <= hitTol)) {
        mode = 'scale';
      } else if (isPointInLayer(pt, selected)) {
        mode = 'move';
      }

      if (mode) {
        overlayCanvas.setPointerCapture(ev.pointerId);
        drag = {
          mode,
          layerId: selected.id,
          startCompPt: pt,
          startX,
          startY,
          startScaleX,
          startScaleY,
          startRotation,
          anchorWorld: g.anchor,
          startDist: Math.max(10, Math.hypot(pt.x - g.anchor.x, pt.y - g.anchor.y)),
          startAngle: Math.atan2(pt.y - g.anchor.y, pt.x - g.anchor.x),
          snapshotTaken: false,
        };
        return;
      }
    }

    // Otherwise try selecting tapped layer top-to-bottom
    for (const layer of comp.layers) {
      if (isPointInLayer(pt, layer)) {
        store.selectLayer(layer.id);
        return;
      }
    }
  });

  overlayCanvas.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const comp = store.getActiveComp();
    const layer = comp.layers.find((l) => l.id === drag!.layerId);
    if (!layer) return;

    if (!drag.snapshotTaken) {
      store.snapshotForUndo();
      drag.snapshotTaken = true;
    }

    const pt = toCompCoords(ev.clientX, ev.clientY);

    if (drag.mode === 'move') {
      const dx = pt.x - drag.startCompPt.x;
      const dy = pt.y - drag.startCompPt.y;

      let localDx = dx;
      let localDy = dy;
      if (layer.parentId) {
        const parent = comp.layers.find((l) => l.id === layer.parentId);
        if (parent) {
          const pMat = getLayerWorldMatrix(parent, comp, store.getState().currentTime);
          const inv = invertMatrix(pMat);
          if (inv) {
            localDx = inv.a * dx + inv.c * dy;
            localDy = inv.b * dx + inv.d * dy;
          }
        }
      }

      store.setTransformValue(layer.id, 'x', Math.round(drag.startX + localDx), { skipUndo: true });
      store.setTransformValue(layer.id, 'y', Math.round(drag.startY + localDy), { skipUndo: true });
    } else if (drag.mode === 'scale') {
      const dist = Math.max(5, Math.hypot(pt.x - drag.anchorWorld.x, pt.y - drag.anchorWorld.y));
      const ratio = dist / drag.startDist;
      store.setTransformValue(layer.id, 'scaleX', Math.round(Math.max(5, drag.startScaleX * ratio)), { skipUndo: true });
      store.setTransformValue(layer.id, 'scaleY', Math.round(Math.max(5, drag.startScaleY * ratio)), { skipUndo: true });
    } else if (drag.mode === 'rotate') {
      const ang = Math.atan2(pt.y - drag.anchorWorld.y, pt.x - drag.anchorWorld.x);
      let deltaDeg = ((ang - drag.startAngle) * 180) / Math.PI;
      if (deltaDeg > 180) deltaDeg -= 360;
      if (deltaDeg < -180) deltaDeg += 360;
      store.setTransformValue(layer.id, 'rotation', Math.round(drag.startRotation + deltaDeg), { skipUndo: true });
    }
  });

  const endDrag = () => {
    drag = null;
  };
  overlayCanvas.addEventListener('pointerup', endDrag);
  overlayCanvas.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', drawFrame);
  store.subscribe(() => {
    syncToolbar();
    drawFrame();
  });
  store.subscribeTime(drawFrame);

  syncToolbar();
  drawFrame();
}
