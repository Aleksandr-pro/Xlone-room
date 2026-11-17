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
        <div class="brand" data-top-hub style="cursor:pointer" title="Xlone-room Hub & APK Info">
          <span class="brand-logo">SU</span>
          <div class="brand-text">
            <strong>StudioEffect(SU)</strong>
            <small>Xlone-room • v1.2</small>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="pill-btn" data-top-lang title="Переключить язык / Switch Language">RU</button>
          <button class="icon-btn" data-top-undo title="Undo">${ICONS.undo}</button>
          <button class="icon-btn" data-top-redo title="Redo">${ICONS.redo}</button>
          <button class="icon-btn" data-top-presets title="Demo Presets & Projects">${ICONS.presets}</button>
          <button class="icon-btn" data-top-comp title="Composition Settings">${ICONS.settings}</button>
          <button class="btn-primary btn-sm" data-top-export>${ICONS.download}<span data-top-export-label>Экспорт</span></button>
        </div>
      </header>

      <main class="ae-workspace">
        <section class="pane-viewport" data-pane-viewport></section>

        <section class="pane-bottom">
          <nav class="tab-bar">
            <button class="tab-btn" data-tab="timeline">${ICONS.layers}<span data-tab-label="timeline">Таймлайн</span></button>
            <button class="tab-btn" data-tab="inspector">${ICONS.sliders}<span data-tab-label="inspector">Инспектор</span></button>
            <button class="tab-btn" data-tab="effects">${ICONS.fx}<span data-tab-label="effects">Эффекты</span></button>
            <button class="tab-btn" data-tab="graph">${ICONS.graph}<span data-tab-label="graph">График</span></button>
          </nav>
          <div class="tab-panels">
            <div class="tab-panel" data-panel="timeline"></div>
            <div class="tab-panel" data-panel="inspector"></div>
            <div class="tab-panel" data-panel="effects"></div>
            <div class="tab-panel" data-panel="graph"></div>
          </div>
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
  const undoBtn = root.querySelector<HTMLButtonElement>('[data-top-undo]')!;
  const redoBtn = root.querySelector<HTMLButtonElement>('[data-top-redo]')!;
  const presetsBtn = root.querySelector<HTMLButtonElement>('[data-top-presets]')!;
  const compBtn = root.querySelector<HTMLButtonElement>('[data-top-comp]')!;
  const exportLabel = root.querySelector<HTMLElement>('[data-top-export-label]')!;

  langBtn.addEventListener('click', () => store.toggleLocale());
  undoBtn.addEventListener('click', () => store.undo());
  redoBtn.addEventListener('click', () => store.redo());
  hubBtn.addEventListener('click', () => modals.openXloneHub());
  presetsBtn.addEventListener('click', () => modals.openProjectsAndPresets());
  compBtn.addEventListener('click', () => modals.openCompSettings());
  root.querySelector('[data-top-export]')?.addEventListener('click', () => modals.openExport());

  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      store.setActiveTab(btn.dataset.tab as 'timeline' | 'inspector' | 'effects' | 'graph');
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
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();

    langBtn.textContent = state.locale.toUpperCase();
    langBtn.title = tr.langTooltip;
    hubBtn.title = tr.hubTooltip;
    undoBtn.title = tr.undo;
    redoBtn.title = tr.redo;
    presetsBtn.title = tr.presetsTooltip;
    compBtn.title = tr.compSettingsTooltip;
    exportLabel.textContent = tr.exportBtn;

    const tlLabel = root.querySelector<HTMLElement>('[data-tab-label="timeline"]');
    const inspLabel = root.querySelector<HTMLElement>('[data-tab-label="inspector"]');
    const fxLabel = root.querySelector<HTMLElement>('[data-tab-label="effects"]');
    const grLabel = root.querySelector<HTMLElement>('[data-tab-label="graph"]');
    if (tlLabel) tlLabel.textContent = tr.tabTimeline;
    if (inspLabel) inspLabel.textContent = tr.tabInspector;
    if (fxLabel) fxLabel.textContent = tr.tabEffects;
    if (grLabel) grLabel.textContent = tr.tabGraph;

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
