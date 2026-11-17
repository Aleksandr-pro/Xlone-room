import type { InteractionMode, RenderEngine, ToolGizmo } from '../core/types';
import { pickSceneAtScreen, renderViewport3D } from '../engine/renderer3d';
import { store } from '../state/xl3dStore';

export function mountViewport(
  container: HTMLElement,
  onOpenAddModal: () => void,
  onOpenRenderModal: () => void
): () => void {
  container.innerHTML = `
    <div class="vp-wrap">
      <canvas class="vp-canvas"></canvas>

      <div class="vp-top-bar">
        <div class="vp-mode-scroll" id="vp-modes"></div>
        <div class="vp-top-actions">
          <button class="xl-btn xl-btn-icon" id="vp-overlay-btn" title="Overlays">◈</button>
          <button class="xl-btn xl-btn-primary" id="vp-render-btn">▶ ${store.t().renderBtn}</button>
        </div>
      </div>

      <div class="vp-shading-bar" id="vp-shading"></div>

      <div class="vp-cam-pills">
        <button class="xl-chip" data-cam="front">Front</button>
        <button class="xl-chip" data-cam="right">Right</button>
        <button class="xl-chip" data-cam="top">Top</button>
        <button class="xl-chip" data-cam="ortho">Ortho</button>
        <button class="xl-chip" data-cam="pano">360°</button>
        <button class="xl-chip" id="vp-zoom-in">＋</button>
        <button class="xl-chip" id="vp-zoom-out">－</button>
      </div>

      <div class="vp-stats-badge" id="vp-stats">XL3D 5.3</div>

      <div class="vp-bottom-tools">
        <div class="vp-tool-group" id="vp-tools"></div>
        <button class="xl-fab-add" id="vp-add-btn">${store.t().addObject}</button>
      </div>
    </div>
  `;

  const canvas = container.querySelector('.vp-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const statsEl = container.querySelector('#vp-stats') as HTMLElement;
  const modesEl = container.querySelector('#vp-modes') as HTMLElement;
  const shadingEl = container.querySelector('#vp-shading') as HTMLElement;
  const toolsEl = container.querySelector('#vp-tools') as HTMLElement;
  const renderBtn = container.querySelector('#vp-render-btn') as HTMLElement;
  const addBtn = container.querySelector('#vp-add-btn') as HTMLElement;

  function renderPills(): void {
    const dict = store.t();
    renderBtn.textContent = `▶ ${dict.renderBtn}`;
    addBtn.textContent = dict.addObject;

    const modes: Array<{ id: InteractionMode; label: string }> = [
      { id: 'object', label: dict.modes.object },
      { id: 'edit', label: dict.modes.edit },
      { id: 'sculpt', label: dict.modes.sculpt },
      { id: 'paint', label: dict.modes.paint },
      { id: 'pose', label: dict.modes.pose },
      { id: 'grease', label: dict.modes.grease },
    ];
    const engines: Array<{ id: RenderEngine; label: string }> = [
      { id: 'workbench', label: dict.engines.workbench },
      { id: 'eevee', label: dict.engines.eevee },
      { id: 'cycles', label: dict.engines.cycles },
    ];
    const tools: Array<{ id: ToolGizmo; label: string; icon: string }> = [
      { id: 'select', label: dict.gizmoSelect, icon: '↖' },
      { id: 'move', label: dict.gizmoMove, icon: '✥' },
      { id: 'rotate', label: dict.gizmoRotate, icon: '↻' },
      { id: 'scale', label: dict.gizmoScale, icon: '⤢' },
    ];

    modesEl.innerHTML = modes
      .map((m) => `<button class="xl-chip ${store.mode === m.id ? 'active' : ''}" data-mode="${m.id}">${m.label}</button>`)
      .join('');
    shadingEl.innerHTML = engines
      .map((s) => `<button class="xl-chip ${store.scene.render.engine === s.id ? 'active' : ''}" data-engine="${s.id}">${s.label}</button>`)
      .join('');
    toolsEl.innerHTML = tools
      .map((tl) => `<button class="xl-chip ${store.tool === tl.id ? 'active' : ''}" data-tool="${tl.id}">${tl.icon} ${tl.label}</button>`)
      .join('');
  }

  function draw(): void {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(240, Math.floor(rect.width));
    const h = Math.max(220, Math.floor(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stats = renderViewport3D(
      ctx,
      w,
      h,
      store.scene,
      store.camera,
      store.mode,
      store.paint,
      store.showOverlays,
      false
    );
    const active = store.getActiveObject();
    statsEl.textContent = `${store.scene.render.engine.toUpperCase()} · ${store.scene.render.colorTransform.toUpperCase()} · ${active ? active.name : '—'} · ${stats.verticesCount}v / ${stats.trisDrawn}f`;
  }

  renderPills();
  draw();

  modesEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-mode]') as HTMLElement | null;
    if (btn) store.setMode(btn.dataset.mode as InteractionMode);
  });
  shadingEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-engine]') as HTMLElement | null;
    if (btn) {
      store.scene.render.engine = btn.dataset.engine as RenderEngine;
      store.commitLiveChange();
    }
  });
  toolsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
    if (btn) store.setTool(btn.dataset.tool as ToolGizmo);
  });

  container.querySelectorAll('[data-cam]').forEach((el) => {
    el.addEventListener('click', () => {
      store.setCameraPreset((el as HTMLElement).dataset.cam as 'front' | 'right' | 'top' | 'ortho' | 'pano');
    });
  });
  container.querySelector('#vp-zoom-in')?.addEventListener('click', () => store.zoomCamera(0.84));
  container.querySelector('#vp-zoom-out')?.addEventListener('click', () => store.zoomCamera(1.18));
  container.querySelector('#vp-overlay-btn')?.addEventListener('click', () => store.toggleOverlays());
  addBtn.addEventListener('click', onOpenAddModal);
  renderBtn.addEventListener('click', onOpenRenderModal);

  const activePointers = new Map<number, { x: number; y: number }>();
  let prevPinchDist = 0;
  let draggingTransform = false;
  let sculptingStroke = false;
  let downPos = { x: 0, y: 0 };
  let moved = false;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downPos = { x: e.clientX, y: e.clientY };
    moved = false;

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      prevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      sculptingStroke = false;
      draggingTransform = false;
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const isBrushMode =
      store.mode === 'sculpt' ||
      store.mode === 'paint' ||
      store.mode === 'grease' ||
      store.getActiveObject()?.type === 'greasepencil';

    if (isBrushMode) {
      const hit = pickSceneAtScreen(sx, sy, rect.width, rect.height, store.scene, store.camera);
      if (hit && hit.objectId === store.scene.activeObjectId) {
        sculptingStroke = true;
        store.pushUndo();
        store.strokeAtLocalPoint(hit.hitLocal, { x: 0, y: 0, z: 0 });
        return;
      }
    }

    if (store.tool !== 'select' && store.mode === 'object' && store.scene.activeObjectId) {
      const hit = pickSceneAtScreen(sx, sy, rect.width, rect.height, store.scene, store.camera);
      if (hit && hit.objectId === store.scene.activeObjectId) {
        draggingTransform = true;
        store.pushUndo();
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) moved = true;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (prevPinchDist > 1 && dist > 1) {
        store.zoomCamera(prevPinchDist / dist);
      }
      prevPinchDist = dist;
      store.panCamera(-dx * 0.6, dy * 0.6);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (sculptingStroke) {
      const hit = pickSceneAtScreen(sx, sy, rect.width, rect.height, store.scene, store.camera);
      if (hit) {
        store.strokeAtLocalPoint(hit.hitLocal, { x: dx * 0.015, y: 0, z: -dy * 0.015 });
      }
      return;
    }

    if (draggingTransform && store.getActiveObject()) {
      const active = store.getActiveObject()!;
      if (store.tool === 'move') {
        store.updateActiveTransform('location', 'x', active.location.x + dx * 0.015, true);
        store.updateActiveTransform('location', 'z', active.location.z - dy * 0.015, true);
      } else if (store.tool === 'rotate') {
        store.updateActiveTransform('rotation', 'z', active.rotation.z + dx * 0.65, true);
        store.updateActiveTransform('rotation', 'x', active.rotation.x + dy * 0.55, true);
      } else if (store.tool === 'scale') {
        const sf = Math.max(0.1, 1 + (dx - dy) * 0.008);
        store.updateActiveTransform('scale', 'x', active.scale.x * sf, true);
        store.updateActiveTransform('scale', 'y', active.scale.y * sf, true);
        store.updateActiveTransform('scale', 'z', active.scale.z * sf, true);
      }
      return;
    }

    store.orbitCamera(-dx * 0.01, dy * 0.009);
  });

  const endPointer = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (!moved && activePointers.size === 1 && !sculptingStroke) {
      const hit = pickSceneAtScreen(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, store.scene, store.camera);
      if (hit) store.setActiveObject(hit.objectId);
    }
    if (draggingTransform || sculptingStroke) {
      store.commitLiveChange();
    }
    draggingTransform = false;
    sculptingStroke = false;
    activePointers.delete(e.pointerId);
    prevPinchDist = 0;
  };

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    store.zoomCamera(e.deltaY > 0 ? 1.1 : 0.9);
  }, { passive: false });

  const ro = new ResizeObserver(() => draw());
  ro.observe(canvas);

  const unsub1 = store.subscribe(() => {
    renderPills();
    draw();
  });
  const unsub2 = store.subscribeViewport(() => draw());

  return () => {
    ro.disconnect();
    unsub1();
    unsub2();
  };
}
