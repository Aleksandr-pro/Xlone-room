import { cubicBezier, getEasingHandles } from '../core/easing';
import type { BezierHandles, EasingType, TransformPropKey } from '../core/types';
import { store } from '../state/store';

export function mountGraphEditor(container: HTMLElement): void {
  function render(): void {
    const state = store.getState();
    const tr = store.t();
    const layer = store.getSelectedLayer();

    if (!layer) {
      container.innerHTML = `<div class="panel-empty">${tr.graphEmptySelect}</div>`;
      return;
    }

    const propKey: TransformPropKey = state.selectedKeyframe?.propKey ?? state.selectedPropKey;
    const prop = layer.transform[propKey];
    const kfs = [...(prop?.keyframes ?? [])].sort((a, b) => a.time - b.time);

    if (kfs.length === 0) {
      container.innerHTML = `
        <div class="panel-empty">
          ${tr.graphNoKfs(tr.propNames[propKey] ?? propKey)}
        </div>
      `;
      return;
    }

    let selectedKf = kfs.find((k) => k.id === state.selectedKeyframe?.kfId) ?? kfs[0];
    const handles = getEasingHandles(selectedKf.easing, selectedKf.bezier);

    const kfButtons = kfs
      .map(
        (k, idx) =>
          `<button class="chip-btn ${k.id === selectedKf.id ? 'active' : ''}" data-graph-pick-kf="${k.id}">KF ${idx + 1} (${k.time.toFixed(2)}s)</button>`
      )
      .join('');

    const easings: Array<{ id: EasingType; label: string }> = [
      { id: 'linear', label: tr.easingLinear },
      { id: 'easyEase', label: tr.easingEasyEase },
      { id: 'easeIn', label: tr.easingEaseIn },
      { id: 'easeOut', label: tr.easingEaseOut },
      { id: 'hold', label: tr.easingHold },
    ];

    container.innerHTML = `
      <div class="graph-wrap">
        <div class="graph-top">
          <div class="chip-row">${kfButtons}</div>
          <div class="chip-row mt-6">
            ${easings
              .map(
                (e) =>
                  `<button class="chip-btn ${selectedKf.easing === e.id ? 'active' : ''}" data-graph-easing="${e.id}">${e.label}</button>`
              )
              .join('')}
            <button class="chip-btn danger" data-graph-del-kf>${tr.deleteKf}</button>
          </div>
        </div>
        <div class="graph-canvas-box">
          <canvas class="graph-canvas" data-graph-canvas width="360" height="220"></canvas>
          <div class="graph-readout">
            <span>${tr.easingLabel}: <b>${selectedKf.easing}</b></span>
            <span>Bezier(${handles.x1.toFixed(2)}, ${handles.y1.toFixed(2)}, ${handles.x2.toFixed(2)}, ${handles.y2.toFixed(2)})</span>
          </div>
        </div>
      </div>
    `;

    const canvas = container.querySelector<HTMLCanvasElement>('[data-graph-canvas]')!;
    drawCurve(canvas, handles, selectedKf.easing);

    container.querySelectorAll<HTMLElement>('[data-graph-pick-kf]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kfId = btn.dataset.graphPickKf!;
        const target = kfs.find((k) => k.id === kfId);
        if (target) {
          store.selectKeyframe({ layerId: layer.id, propKey, kfId });
          store.setTime(target.time);
        }
      });
    });

    container.querySelectorAll<HTMLElement>('[data-graph-easing]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.updateKeyframeEasing(layer.id, propKey, selectedKf.id, btn.dataset.graphEasing as EasingType);
      });
    });

    container.querySelector('[data-graph-del-kf]')?.addEventListener('click', () => {
      store.deleteKeyframe(layer.id, propKey, selectedKf.id);
    });

    // Interactive Bezier Handle Dragging
    let activeHandle: 1 | 2 | null = null;
    let snapped = false;

    const pad = 28;
    const toCanvas = (nx: number, ny: number) => ({
      x: pad + nx * (canvas.width - pad * 2),
      y: canvas.height - pad - ny * (canvas.height - pad * 2),
    });

    const fromCanvas = (cx: number, cy: number) => ({
      nx: Math.min(1, Math.max(0, (cx - pad) / (canvas.width - pad * 2))),
      ny: Math.min(1.3, Math.max(-0.3, (canvas.height - pad - cy) / (canvas.height - pad * 2))),
    });

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const p1 = toCanvas(handles.x1, handles.y1);
      const p2 = toCanvas(handles.x2, handles.y2);

      if (Math.hypot(cx - p1.x, cy - p1.y) < 22) activeHandle = 1;
      else if (Math.hypot(cx - p2.x, cy - p2.y) < 22) activeHandle = 2;

      if (activeHandle) {
        canvas.setPointerCapture(e.pointerId);
        snapped = false;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!activeHandle) return;
      const rect = canvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
      const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
      const { nx, ny } = fromCanvas(cx, cy);

      if (!snapped) {
        store.snapshotForUndo();
        snapped = true;
      }

      const nextHandles: BezierHandles = { ...handles };
      if (activeHandle === 1) {
        nextHandles.x1 = Number(nx.toFixed(2));
        nextHandles.y1 = Number(ny.toFixed(2));
      } else {
        nextHandles.x2 = Number(nx.toFixed(2));
        nextHandles.y2 = Number(ny.toFixed(2));
      }
      store.updateKeyframeEasing(layer.id, propKey, selectedKf.id, 'bezier', nextHandles, true);
    });

    const stopDrag = () => {
      activeHandle = null;
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
  }

  function drawCurve(canvas: HTMLCanvasElement, h: BezierHandles, easing: EasingType): void {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const hPx = canvas.height;
    const pad = 28;
    const gw = w - pad * 2;
    const gh = hPx - pad * 2;

    const pt = (nx: number, ny: number) => ({
      x: pad + nx * gw,
      y: hPx - pad - ny * gh,
    });

    ctx.clearRect(0, 0, w, hPx);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const gx = pad + (gw * i) / 4;
      const gy = pad + (gh * i) / 4;
      ctx.beginPath();
      ctx.moveTo(gx, pad);
      ctx.lineTo(gx, hPx - pad);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad, gy);
      ctx.lineTo(w - pad, gy);
      ctx.stroke();
    }

    // Diagonal reference
    const p0 = pt(0, 0);
    const p3 = pt(1, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve
    ctx.strokeStyle = '#4c8bf5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (easing === 'hold') {
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p3.x, p0.y);
      ctx.lineTo(p3.x, p3.y);
    } else {
      for (let i = 0; i <= 60; i++) {
        const x = i / 60;
        const y = cubicBezier(x, h);
        const p = pt(x, y);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();

    // Handle lines & knobs
    const p1 = pt(h.x1, h.y1);
    const p2 = pt(h.x2, h.y2);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.moveTo(p3.x, p3.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    for (const handle of [p1, p2]) {
      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  store.subscribe(render);
  render();
}
