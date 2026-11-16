import { evaluateProp } from '../core/interpolation';
import type { EffectType } from '../core/types';
import { EFFECT_CATALOG, getEffectDef } from '../engine/effectCatalog';
import { store } from '../state/store';
import { ICONS } from './icons';

export function mountEffectsPanel(container: HTMLElement): void {
  function render(): void {
    const state = store.getState();
    const comp = store.getActiveComp();
    const layer = store.getSelectedLayer();

    if (!layer) {
      container.innerHTML = `<div class="panel-empty">Выберите слой, чтобы добавить или настроить эффекты (FX).</div>`;
      return;
    }

    const layerIndex = comp.layers.findIndex((l) => l.id === layer.id);

    const activeEffectsHtml = layer.effects.length
      ? layer.effects
          .map((fx) => {
            const def = getEffectDef(fx.type);
            const paramsHtml = def.params
              .map((meta) => {
                const prop = fx.params[meta.key];
                const val = prop
                  ? Math.round(
                      evaluateProp(prop, state.currentTime, layerIndex, comp, `${fx.id}:${meta.key}`) * 10
                    ) / 10
                  : meta.defaultValue;
                const hasKfs = (prop?.keyframes.length ?? 0) > 0;

                return `
                  <div class="fx-param">
                    <div class="fx-param-head">
                      <button class="tl-sw-btn ${hasKfs ? 'on' : ''}" data-fx-sw="${fx.id}:${meta.key}" title="Keyframe">${ICONS.stopwatch}</button>
                      <span>${meta.label}</span>
                      <span class="fx-val">${val}${meta.unit ?? ''}</span>
                    </div>
                    <input type="range" class="ae-slider" data-fx-range="${fx.id}:${meta.key}" min="${meta.min}" max="${meta.max}" step="${meta.step}" value="${val}" />
                  </div>
                `;
              })
              .join('');

            return `
              <div class="fx-card ${fx.enabled ? '' : 'disabled'}">
                <div class="fx-card-head">
                  <button class="fx-toggle ${fx.enabled ? 'on' : ''}" data-fx-toggle="${fx.id}">fx</button>
                  <span class="fx-name">${fx.name}</span>
                  <span class="fx-cat">${def.category}</span>
                  <button class="icon-btn" data-fx-up="${fx.id}" title="Move Effect Up">${ICONS.up}</button>
                  <button class="icon-btn" data-fx-down="${fx.id}" title="Move Effect Down">${ICONS.down}</button>
                  <button class="icon-btn danger" data-fx-del="${fx.id}" title="Remove Effect">${ICONS.trash}</button>
                </div>
                <div class="fx-params-body">${paramsHtml}</div>
              </div>
            `;
          })
          .join('')
      : `<div class="empty-hint">У слоя «${escapeHtml(layer.name)}» пока нет эффектов. Выберите ниже!</div>`;

    const catalogHtml = EFFECT_CATALOG.map(
      (def) => `
        <button class="fx-add-tile" data-fx-add="${def.type}">
          <div class="fx-tile-top">
            <span class="fx-tile-name">${def.name}</span>
            <span class="fx-tile-cat">${def.category}</span>
          </div>
          <div class="fx-tile-desc">${def.description}</div>
        </button>
      `
    ).join('');

    container.innerHTML = `
      <div class="fx-wrap">
        <div class="insp-card">
          <div class="insp-card-title">Active Effects Stack — ${escapeHtml(layer.name)}</div>
          ${activeEffectsHtml}
        </div>
        <div class="insp-card">
          <div class="insp-card-title">Effects & Presets Library (${EFFECT_CATALOG.length})</div>
          <div class="fx-catalog-grid">
            ${catalogHtml}
          </div>
        </div>
      </div>
    `;

    bindEvents(layer.id);
  }

  function bindEvents(layerId: string): void {
    container.querySelectorAll<HTMLElement>('[data-fx-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.addEffectToLayer(layerId, btn.dataset.fxAdd as EffectType);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-fx-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => store.toggleEffectEnabled(layerId, btn.dataset.fxToggle!));
    });

    container.querySelectorAll<HTMLElement>('[data-fx-up]').forEach((btn) => {
      btn.addEventListener('click', () => store.moveEffect(layerId, btn.dataset.fxUp!, -1));
    });

    container.querySelectorAll<HTMLElement>('[data-fx-down]').forEach((btn) => {
      btn.addEventListener('click', () => store.moveEffect(layerId, btn.dataset.fxDown!, 1));
    });

    container.querySelectorAll<HTMLElement>('[data-fx-del]').forEach((btn) => {
      btn.addEventListener('click', () => store.removeEffectFromLayer(layerId, btn.dataset.fxDel!));
    });

    container.querySelectorAll<HTMLElement>('[data-fx-sw]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [fxId, paramKey] = btn.dataset.fxSw!.split(':');
        store.toggleEffectParamStopwatch(layerId, fxId, paramKey);
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-fx-range]').forEach((rng) => {
      const [fxId, paramKey] = rng.dataset.fxRange!.split(':');
      let snapped = false;
      rng.addEventListener('pointerdown', () => {
        snapped = false;
      });
      rng.addEventListener('input', () => {
        if (!snapped) {
          store.snapshotForUndo();
          snapped = true;
        }
        store.setEffectParam(layerId, fxId, paramKey, Number(rng.value), true);
      });
    });
  }

  store.subscribe(render);
  render();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  );
}
