import { saveDataUrlToDevice } from '../core/fileBridge';
import type { ObjectType, WorkspaceTab } from '../core/types';
import { type MeshPrimitiveKind } from '../engine/primitives';
import { renderViewport3D } from '../engine/renderer3d';
import { store } from '../state/xl3dStore';
import { mountEditorPanel } from './editors';
import { mountViewport } from './viewport';

export function mountXL3DApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="xl-app" id="xl-app-root" data-panel="half">
      <header class="xl-header">
        <div class="xl-brand">
          <span class="xl-logo-dot"></span>
          <strong>XL3D</strong>
          <span class="xl-ver-badge">Blender 5.3</span>
        </div>
        <div class="xl-header-actions">
          <button class="xl-btn xl-btn-icon" id="xl-undo-btn">↶</button>
          <button class="xl-btn xl-btn-icon" id="xl-redo-btn">↷</button>
          <button class="xl-btn xl-btn-sm" id="xl-theme-btn">◐</button>
          <button class="xl-btn xl-btn-sm" id="xl-lang-btn">RU</button>
        </div>
      </header>

      <main class="xl-workspace">
        <section class="xl-viewport-pane" id="xl-vp-pane"></section>
        <div class="xl-splitter" id="xl-splitter">
          <span class="xl-splitter-pill">⇕ <span id="xl-panel-size-lbl">50 / 50</span></span>
        </div>
        <section class="xl-editor-pane" id="xl-editor-pane"></section>
      </main>

      <nav class="xl-bottom-nav" id="xl-bottom-nav"></nav>

      <div class="xl-modal-backdrop" id="xl-modal" hidden>
        <div class="xl-modal-sheet" id="xl-modal-body"></div>
      </div>
    </div>
  `;

  const appRoot = root.querySelector('#xl-app-root') as HTMLElement;
  const vpPane = root.querySelector('#xl-vp-pane') as HTMLElement;
  const edPane = root.querySelector('#xl-editor-pane') as HTMLElement;
  const navEl = root.querySelector('#xl-bottom-nav') as HTMLElement;
  const splitter = root.querySelector('#xl-splitter') as HTMLElement;
  const sizeLbl = root.querySelector('#xl-panel-size-lbl') as HTMLElement;
  const modalBackdrop = root.querySelector('#xl-modal') as HTMLElement;
  const modalBody = root.querySelector('#xl-modal-body') as HTMLElement;

  const tabs: Array<{ id: WorkspaceTab; icon: string; label: () => string }> = [
    { id: 'tools', icon: '🛠', label: () => store.t().tabs.tools },
    { id: 'outliner', icon: '🌳', label: () => store.t().tabs.outliner },
    { id: 'properties', icon: '⚙', label: () => store.t().tabs.properties },
    { id: 'nodes', icon: '☍', label: () => store.t().tabs.nodes },
    { id: 'animation', icon: '▶', label: () => store.t().tabs.animation },
    { id: 'scripting', icon: '</>', label: () => store.t().tabs.scripting },
    { id: 'editors', icon: '▦', label: () => store.t().tabs.editors },
  ];

  function renderNavAndTheme(): void {
    appRoot.setAttribute('data-theme', store.theme);
    appRoot.setAttribute('data-panel', store.panelHeightMode);
    sizeLbl.textContent =
      store.panelHeightMode === 'compact'
        ? 'Большой 3D вид'
        : store.panelHeightMode === 'tall'
        ? 'Развёрнутая панель'
        : '50 / 50';

    navEl.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;
    navEl.innerHTML = tabs
      .map(
        (tb) => `
          <button class="xl-nav-item ${store.activeTab === tb.id ? 'active' : ''}" data-tab="${tb.id}">
            <span class="xl-nav-icon">${tb.icon}</span>
            <span class="xl-nav-label">${tb.label()}</span>
          </button>
        `
      )
      .join('');
    const langBtn = root.querySelector('#xl-lang-btn');
    if (langBtn) langBtn.textContent = store.locale.toUpperCase();
  }

  function closeModal(): void {
    modalBackdrop.hidden = true;
    modalBody.innerHTML = '';
  }

  function openAddModal(): void {
    const meshes: Array<[MeshPrimitiveKind, string]> = [
      ['cube', 'Cube'], ['sphere', 'UV Sphere'], ['icosphere', 'Icosphere'],
      ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['torus', 'Torus'],
      ['plane', 'Plane'], ['monkey', 'Suzanne Monkey'],
    ];
    const specials: Array<[Exclude<ObjectType, 'mesh'>, string]> = [
      ['curve', 'Curve (Bezier)'], ['surface', 'NURBS Surface'], ['metaball', 'Metaball'],
      ['text', '3D Text'], ['lattice', 'Lattice'], ['empty', 'Empty'],
      ['armature', 'Armature Rig'], ['volume', 'Volume (VDB)'], ['pointcloud', 'Point Cloud / SPZ'],
      ['greasepencil', 'Grease Pencil 2D'], ['light', 'Light (Sun/Point)'], ['camera', 'Camera'],
    ];
    modalBody.innerHTML = `
      <div class="xl-modal-header">
        <strong>${store.t().addObject} (Blender 5.3)</strong>
        <button class="xl-btn" id="xl-modal-close">✕</button>
      </div>
      <div class="xl-card-subtitle">Mesh Primitives</div>
      <div class="xl-grid-3">
        ${meshes.map(([id, lbl]) => `<button class="xl-btn" data-add-prim="${id}">${lbl}</button>`).join('')}
      </div>
      <div class="xl-card-subtitle" style="margin-top:12px;">Curves, Rigging, Volumetrics, Splats & Helpers</div>
      <div class="xl-grid-3">
        ${specials.map(([id, lbl]) => `<button class="xl-btn" data-add-spec="${id}">${lbl}</button>`).join('')}
      </div>
    `;
    modalBackdrop.hidden = false;
    modalBody.querySelector('#xl-modal-close')?.addEventListener('click', closeModal);
    modalBody.querySelectorAll('[data-add-prim]').forEach((b) =>
      b.addEventListener('click', () => {
        store.addObject('mesh', (b as HTMLElement).dataset.addPrim as MeshPrimitiveKind);
        closeModal();
      })
    );
    modalBody.querySelectorAll('[data-add-spec]').forEach((b) =>
      b.addEventListener('click', () => {
        store.addObject((b as HTMLElement).dataset.addSpec as Exclude<ObjectType, 'mesh'>);
        closeModal();
      })
    );
  }

  function openRenderModal(): void {
    modalBody.innerHTML = `
      <div class="xl-modal-header">
        <strong>Render · ${store.scene.render.engine.toUpperCase()} (${store.scene.render.colorTransform.toUpperCase()})</strong>
        <button class="xl-btn" id="xl-modal-close">✕</button>
      </div>
      <canvas id="xl-render-canvas" width="768" height="480" style="width:100%;border-radius:12px;background:#111;"></canvas>
      <div class="xl-chip-row" style="margin-top:12px;">
        <button class="xl-btn xl-btn-primary" id="xl-save-render">${store.t().exportFramePng}</button>
      </div>
    `;
    modalBackdrop.hidden = false;
    const rc = modalBody.querySelector('#xl-render-canvas') as HTMLCanvasElement;
    const rctx = rc.getContext('2d')!;
    renderViewport3D(rctx, rc.width, rc.height, store.scene, store.camera, 'object', store.paint, false, true);
    modalBody.querySelector('#xl-modal-close')?.addEventListener('click', closeModal);
    modalBody.querySelector('#xl-save-render')?.addEventListener('click', () => {
      saveDataUrlToDevice(`xl3d-render-f${store.scene.currentFrame}.png`, rc.toDataURL('image/png'), 'image/png');
    });
  }

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  splitter.addEventListener('click', () => store.cyclePanelHeight());

  navEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
    if (btn) store.setActiveTab(btn.dataset.tab as WorkspaceTab);
  });

  root.querySelector('#xl-undo-btn')?.addEventListener('click', () => store.undo());
  root.querySelector('#xl-redo-btn')?.addEventListener('click', () => store.redo());
  root.querySelector('#xl-theme-btn')?.addEventListener('click', () =>
    store.setLocaleAndTheme(undefined, store.theme === 'dark' ? 'light' : 'dark')
  );
  root.querySelector('#xl-lang-btn')?.addEventListener('click', () =>
    store.setLocaleAndTheme(store.locale === 'ru' ? 'en' : 'ru')
  );

  mountViewport(vpPane, openAddModal, openRenderModal);
  mountEditorPanel(edPane);
  renderNavAndTheme();
  store.subscribe(renderNavAndTheme);
}
