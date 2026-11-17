import { EFFECT_I18N_RU } from '../core/i18n';
import { evaluateProp } from '../core/interpolation';
import type { EffectType } from '../core/types';
import { EFFECT_CATALOG, getEffectDef } from '../engine/effectCatalog';
import { store } from '../state/store';
import { ICONS } from './icons';

export function mountEffectsPanel(container: HTMLElement): void {
  let isDraggingSlider = false;

  function render(): void {
    if (isDraggingSlider) return;
    const state = store.getState();
    const tr = store.t();
    const isRu = state.locale === 'ru';
    const comp = store.getActiveComp();
    const layer = store.getSelectedLayer();

    if (!layer) {
      container.innerHTML = `<div class="panel-empty">${tr.selectLayerFxHint}</div>`;
      return;
    }

    const layerIndex = comp.layers.findIndex((l) => l.id === layer.id);

    const activeEffectsHtml = layer.effects.length
      ? layer.effects
          .map((fx) => {
            const def = getEffectDef(fx.type);
            const ruDef = isRu ? EFFECT_I18N_RU[fx.type] : null;
            const fxTitle = ruDef?.name ?? fx.name;
            const fxCat = ruDef?.category ?? def.category;
            const paramsHtml = def.params
              .map((meta) => {
                const prop = fx.params[meta.key];
                const val = prop
                  ? Math.round(
                      evaluateProp(prop, state.currentTime, layerIndex, comp, `${fx.id}:${meta.key}`) * 10
                    ) / 10
                  : meta.defaultValue;
                const hasKfs = (prop?.keyframes.length ?? 0) > 0;
                const pLabel = ruDef?.params[meta.key] ?? meta.label;

                return `
                  <div class="fx-param">
                    <div class="fx-param-head">
                      <button class="tl-sw-btn ${hasKfs ? 'on' : ''}" data-fx-sw="${fx.id}:${meta.key}" title="${tr.keyframeTooltip}">${ICONS.stopwatch}</button>
                      <span>${pLabel}</span>
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
                  <span class="fx-name">${fxTitle}</span>
                  <span class="fx-cat">${fxCat}</span>
                  <button class="icon-btn" data-fx-up="${fx.id}" title="${tr.moveFxUp}">${ICONS.up}</button>
                  <button class="icon-btn" data-fx-down="${fx.id}" title="${tr.moveFxDown}">${ICONS.down}</button>
                  <button class="icon-btn danger" data-fx-del="${fx.id}" title="${tr.removeFx}">${ICONS.trash}</button>
                </div>
                <div class="fx-params-body">${paramsHtml}</div>
              </div>
            `;
          })
          .join('')
      : `<div class="empty-hint">${tr.noEffectsHint(escapeHtml(layer.name))}</div>`;

    const catalogHtml = EFFECT_CATALOG.map((def) => {
      const ruDef = isRu ? EFFECT_I18N_RU[def.type] : null;
      return `
        <button class="fx-add-tile" data-fx-add="${def.type}">
          <div class="fx-tile-top">
            <span class="fx-tile-name">${ruDef?.name ?? def.name}</span>
            <span class="fx-tile-cat">${ruDef?.category ?? def.category}</span>
          </div>
          <div class="fx-tile-desc">${ruDef?.description ?? def.description}</div>
        </button>
      `;
    }).join('');

    container.innerHTML = `
      <div class="fx-wrap">
        <div class="insp-card">
          <div class="insp-card-title">${tr.activeEffectsStack(escapeHtml(layer.name))}</div>
          ${activeEffectsHtml}
        </div>
        <div class="insp-card">
          <div class="insp-card-title">${tr.effectsLibrary(EFFECT_CATALOG.length)}</div>
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
      const def = getEffectDef(
        store.getSelectedLayer()?.effects.find((fx) => fx.id === fxId)?.type ?? 'glow'
      );
      const unit = def.params.find((p) => p.key === paramKey)?.unit ?? '';
      const valEl = rng.previousElementSibling?.querySelector<HTMLElement>('.fx-val');
      let snapped = false;
      rng.addEventListener('pointerdown', () => {
        isDraggingSlider = true;
        snapped = false;
      });
      rng.addEventListener('input', () => {
        isDraggingSlider = true;
        if (!snapped) {
          store.snapshotForUndo();
          snapped = true;
        }
        const v = Number(rng.value);
        if (valEl) valEl.textContent = `${v}${unit}`;
        store.setEffectParam(layerId, fxId, paramKey, v, true, true);
      });
      const finishDrag = () => {
        if (!isDraggingSlider) return;
        isDraggingSlider = false;
        store.commitLiveChange();
      };
      rng.addEventListener('change', finishDrag);
      rng.addEventListener('pointerup', finishDrag);
      rng.addEventListener('pointercancel', finishDrag);
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
