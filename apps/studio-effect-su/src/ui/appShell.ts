import { store } from '../state/store';
import { mountEffectsPanel } from './effectsPanel';
import { mountGraphEditor } from './graphEditor';
import { ICONS } from './icons';
import { mountInspector } from './inspector';
import { ModalManager } from './modals';
import { mountTimeline } from './timeline';
import { mountViewport } from './viewport';

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="ae-app">
      <header class="ae-topbar">
        <div class="topbar-left">
          <button class="brand-btn" data-top-hub title="Xlone-room">
            <span class="brand-logo">SU</span>
          </button>
          <button class="comp-pill-btn" data-top-presets title="Проекты и шаблоны">
            <span class="comp-pill-name" data-top-comp-name>Neon Intro</span>
            <span class="comp-pill-chev">${ICONS.chevronDown}</span>
          </button>
        </div>
        <div class="topbar-actions">
          <button class="pill-btn" data-top-lang title="RU / EN">RU</button>
          <button class="icon-btn" data-top-comp title="Настройки композиции">${ICONS.settings}</button>
          <button class="btn-primary export-pill" data-top-export>${ICONS.download}<span data-top-export-label>Экспорт</span></button>
        </div>
      </header>

      <main class="ae-workspace">
        <section class="pane-viewport" data-pane-viewport></section>

        <section class="pane-bottom">
          <nav class="subpanel-bar hidden" data-subpanel-bar>
            <button class="back-tl-btn" data-back-timeline>
              ${ICONS.back}
              <span data-back-tl-label>Таймлайн</span>
            </button>
            <div class="subpanel-tabs">
              <button class="subtab-btn" data-tab="inspector">${ICONS.sliders}<span data-tab-label="inspector">Свойства</span></button>
              <button class="subtab-btn" data-tab="effects">${ICONS.fx}<span data-tab-label="effects">Эффекты</span></button>
              <button class="subtab-btn" data-tab="graph">${ICONS.graph}<span data-tab-label="graph">Кривые</span></button>
            </div>
          </nav>

          <div class="tab-panels">
            <div class="tab-panel" data-panel="timeline"></div>
            <div class="tab-panel" data-panel="inspector"></div>
            <div class="tab-panel" data-panel="effects"></div>
            <div class="tab-panel" data-panel="graph"></div>
          </div>

          <nav class="capcut-dock" data-capcut-dock>
            <button class="dock-btn accent" data-dock="add">${ICONS.plus}<span data-dock-label="add">Добавить</span></button>
            <button class="dock-btn" data-dock="edit">${ICONS.sliders}<span data-dock-label="edit">Свойства</span></button>
            <button class="dock-btn" data-dock="fx">${ICONS.fx}<span data-dock-label="fx">Эффекты</span></button>
            <button class="dock-btn" data-dock="graph">${ICONS.graph}<span data-dock-label="graph">Кривые</span></button>
            <button class="dock-btn" data-dock="kf">${ICONS.diamond}<span data-dock-label="kf">Ключ ◆</span></button>
            <button class="dock-btn" data-dock="split">${ICONS.scissors}<span data-dock-label="split">Разрезать</span></button>
            <button class="dock-btn" data-dock="3d">${ICONS.cube3d}<span data-dock-label="3d">3D слой</span></button>
            <button class="dock-btn" data-dock="mask">${ICONS.mask}<span data-dock-label="mask">Маска</span></button>
            <button class="dock-btn" data-dock="expr">${ICONS.code}<span data-dock-label="expr">Формулы</span></button>
            <button class="dock-btn" data-dock="marker">${ICONS.flag}<span data-dock-label="marker">Метка</span></button>
            <button class="dock-btn" data-dock="dup">${ICONS.copy}<span data-dock-label="dup">Копия</span></button>
            <button class="dock-btn danger" data-dock="del">${ICONS.trash}<span data-dock-label="del">Удалить</span></button>
          </nav>
        </section>
      </main>
    </div>
  `;

  const modals = new ModalManager(root);

  const viewportEl = root.querySelector<HTMLElement>('[data-pane-viewport]')!;
  const timelineEl = root.querySelector<HTMLElement>('[data-panel="timeline"]')!;
  const inspectorEl = root.querySelector<HTMLElement>('[data-panel="inspector"]')!;
  const effectsEl = root.querySelector<HTMLElement>('[data-panel="effects"]')!;
  const graphEl = root.querySelector<HTMLElement>('[data-panel="graph"]')!;

  mountViewport(viewportEl);
  mountTimeline(timelineEl, { onOpenAddLayer: () => modals.openAddLayer() });
  mountInspector(inspectorEl);
  mountEffectsPanel(effectsEl);
  mountGraphEditor(graphEl);

  const langBtn = root.querySelector<HTMLButtonElement>('[data-top-lang]')!;
  const hubBtn = root.querySelector<HTMLElement>('[data-top-hub]')!;
  const presetsBtn = root.querySelector<HTMLElement>('[data-top-presets]')!;
  const compNameEl = root.querySelector<HTMLElement>('[data-top-comp-name]')!;
  const compBtn = root.querySelector<HTMLButtonElement>('[data-top-comp]')!;
  const exportLabel = root.querySelector<HTMLElement>('[data-top-export-label]')!;
  const subpanelBar = root.querySelector<HTMLElement>('[data-subpanel-bar]')!;
  const capcutDock = root.querySelector<HTMLElement>('[data-capcut-dock]')!;
  const backTlLabel = root.querySelector<HTMLElement>('[data-back-tl-label]')!;

  langBtn.addEventListener('click', () => store.toggleLocale());
  hubBtn.addEventListener('click', () => modals.openXloneHub());
  presetsBtn.addEventListener('click', () => modals.openProjectsAndPresets());
  compBtn.addEventListener('click', () => modals.openCompSettings());
  root.querySelector('[data-top-export]')?.addEventListener('click', () => modals.openExport());

  root.querySelector('[data-back-timeline]')?.addEventListener('click', () => {
    store.setActiveTab('timeline');
  });

  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setActiveTab(btn.dataset.tab as 'timeline' | 'inspector' | 'effects' | 'graph');
    });
  });

  // CapCut Bottom Action Dock
  capcutDock.querySelectorAll<HTMLButtonElement>('[data-dock]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.dock!;
      const layer = store.getSelectedLayer();
      switch (action) {
        case 'add':
          modals.openAddLayer();
          break;
        case 'edit':
          store.openInspectorSection(null);
          break;
        case 'fx':
          store.setActiveTab('effects');
          break;
        case 'graph':
          store.setActiveTab('graph');
          break;
        case 'kf':
          store.toggleSelectedPropKeyframe();
          break;
        case 'split':
          if (layer) store.splitLayerAtCurrentTime(layer.id);
          break;
        case '3d':
          if (layer && layer.type !== 'audio' && layer.type !== 'adjustment') {
            store.toggle3D(layer.id);
          }
          break;
        case 'mask':
          store.openInspectorSection('mask');
          break;
        case 'expr':
          store.openInspectorSection('expressions');
          break;
        case 'marker':
          store.addMarkerAtCurrentTime();
          break;
        case 'dup':
          if (layer) store.duplicateLayer(layer.id);
          break;
        case 'del':
          if (layer) store.deleteLayer(layer.id);
          break;
      }
    });
  });

  // Keyboard shortcuts for desktop/OTG keyboard testing
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      store.togglePlay();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) store.redo();
      else store.undo();
    } else if (e.key === 'ArrowLeft') {
      store.stopPlay();
      store.stepFrame(-1);
    } else if (e.key === 'ArrowRight') {
      store.stopPlay();
      store.stepFrame(1);
    }
  });

  function syncShell(): void {
    const state = store.getState();
    const tr = store.t();
    const comp = store.getActiveComp();
    const layer = store.getSelectedLayer();

    langBtn.textContent = state.locale.toUpperCase();
    langBtn.title = tr.langTooltip;
    hubBtn.title = tr.hubTooltip;
    presetsBtn.title = tr.presetsTooltip;
    compNameEl.textContent = comp.name;
    compBtn.title = tr.compSettingsTooltip;
    exportLabel.textContent = tr.exportBtn;
    backTlLabel.textContent = tr.backToTimeline;

    const inspLabel = root.querySelector<HTMLElement>('[data-tab-label="inspector"]');
    const fxLabel = root.querySelector<HTMLElement>('[data-tab-label="effects"]');
    const grLabel = root.querySelector<HTMLElement>('[data-tab-label="graph"]');
    if (inspLabel) inspLabel.textContent = tr.dockEdit;
    if (fxLabel) fxLabel.textContent = tr.tabEffects;
    if (grLabel) grLabel.textContent = tr.dockGraph;

    const dockMap: Record<string, string> = {
      add: tr.dockAdd,
      edit: tr.dockEdit,
      fx: tr.dockFx,
      graph: tr.dockGraph,
      kf: tr.dockKeyframe,
      split: tr.dockSplit,
      '3d': tr.dock3D,
      mask: tr.dockMask,
      expr: tr.dockExpr,
      marker: tr.dockMarker,
      dup: tr.dockDup,
      del: tr.dockDel,
    };
    for (const [key, text] of Object.entries(dockMap)) {
      const el = capcutDock.querySelector<HTMLElement>(`[data-dock-label="${key}"]`);
      if (el) el.textContent = text;
    }

    // Highlight active 3D / disabled states in dock
    const btn3d = capcutDock.querySelector<HTMLButtonElement>('[data-dock="3d"]');
    if (btn3d) {
      btn3d.classList.toggle('active-cyan', Boolean(layer?.is3D));
      btn3d.disabled = !layer || layer.type === 'audio' || layer.type === 'adjustment';
    }
    const needsLayerKeys = ['edit', 'fx', 'graph', 'kf', 'split', 'mask', 'expr', 'dup', 'del'];
    for (const k of needsLayerKeys) {
      const b = capcutDock.querySelector<HTMLButtonElement>(`[data-dock="${k}"]`);
      if (b) b.disabled = !layer;
    }

    const isTimeline = state.activeTab === 'timeline';
    subpanelBar.classList.toggle('hidden', isTimeline);
    capcutDock.classList.toggle('hidden', !isTimeline);

    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === state.activeTab);
    });
    root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => {
      p.classList.toggle('active', p.dataset.panel === state.activeTab);
    });
  }

  store.subscribe(syncShell);
  syncShell();
}
