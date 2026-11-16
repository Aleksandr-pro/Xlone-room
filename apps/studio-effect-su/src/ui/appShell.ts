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
        <div class="brand">
          <span class="brand-logo">SU</span>
          <div class="brand-text">
            <strong>StudioEffect(SU)</strong>
            <small>Xlone-room • AE Mobile</small>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" data-top-undo title="Undo">${ICONS.undo}</button>
          <button class="icon-btn" data-top-redo title="Redo">${ICONS.redo}</button>
          <button class="icon-btn" data-top-presets title="Demo Presets & Projects">${ICONS.presets}</button>
          <button class="icon-btn" data-top-comp title="Composition Settings">${ICONS.settings}</button>
          <button class="btn-primary btn-sm" data-top-export>${ICONS.download}<span>Export</span></button>
        </div>
      </header>

      <main class="ae-workspace">
        <section class="pane-viewport" data-pane-viewport></section>

        <section class="pane-bottom">
          <nav class="tab-bar">
            <button class="tab-btn" data-tab="timeline">${ICONS.layers}<span>Timeline</span></button>
            <button class="tab-btn" data-tab="inspector">${ICONS.sliders}<span>Inspector</span></button>
            <button class="tab-btn" data-tab="effects">${ICONS.fx}<span>Effects</span></button>
            <button class="tab-btn" data-tab="graph">${ICONS.graph}<span>Graph</span></button>
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

  const undoBtn = root.querySelector<HTMLButtonElement>('[data-top-undo]')!;
  const redoBtn = root.querySelector<HTMLButtonElement>('[data-top-redo]')!;

  undoBtn.addEventListener('click', () => store.undo());
  redoBtn.addEventListener('click', () => store.redo());
  root.querySelector('[data-top-presets]')?.addEventListener('click', () => modals.openProjectsAndPresets());
  root.querySelector('[data-top-comp]')?.addEventListener('click', () => modals.openCompSettings());
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
    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();

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
