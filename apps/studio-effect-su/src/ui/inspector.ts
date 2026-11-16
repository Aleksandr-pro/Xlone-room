import { evaluateExpression } from '../core/expressions';
import { evaluateProp } from '../core/interpolation';
import type { BlendMode, ShapeKind, TransformPropKey } from '../core/types';
import { store } from '../state/store';
import { ICONS } from './icons';

const BLEND_MODES: BlendMode[] = [
  'normal',
  'add',
  'screen',
  'multiply',
  'overlay',
  'difference',
  'lighten',
  'darken',
];

const TRANSFORM_FIELDS: Array<{
  key: TransformPropKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}> = [
  { key: 'x', label: 'Position X', min: -1000, max: 3000, step: 1, unit: 'px' },
  { key: 'y', label: 'Position Y', min: -1000, max: 3000, step: 1, unit: 'px' },
  { key: 'scaleX', label: 'Scale X', min: 1, max: 500, step: 1, unit: '%' },
  { key: 'scaleY', label: 'Scale Y', min: 1, max: 500, step: 1, unit: '%' },
  { key: 'rotation', label: 'Rotation', min: -720, max: 720, step: 1, unit: '°' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'anchorX', label: 'Anchor X', min: -1000, max: 1000, step: 1, unit: 'px' },
  { key: 'anchorY', label: 'Anchor Y', min: -1000, max: 1000, step: 1, unit: 'px' },
];

export function mountInspector(container: HTMLElement): void {
  let activeExprProp: TransformPropKey = 'rotation';

  function render(): void {
    const state = store.getState();
    const comp = store.getActiveComp();
    const layer = store.getSelectedLayer();

    if (!layer) {
      container.innerHTML = `<div class="panel-empty">Выберите слой в таймлайне или нажмите на него на холсте.</div>`;
      return;
    }

    const layerIndex = comp.layers.findIndex((l) => l.id === layer.id);
    const snapTol = 0.5 / comp.fps;

    // Parent candidates (exclude self and descendants to prevent cycles)
    const parentOptions = comp.layers
      .filter((l) => l.id !== layer.id && l.parentId !== layer.id)
      .map(
        (l) =>
          `<option value="${l.id}" ${layer.parentId === l.id ? 'selected' : ''}>${escapeHtml(l.name)}</option>`
      )
      .join('');

    const blendOptions = BLEND_MODES.map(
      (m) => `<option value="${m}" ${layer.blendMode === m ? 'selected' : ''}>${m.toUpperCase()}</option>`
    ).join('');

    const transformRows = TRANSFORM_FIELDS.map((f) => {
      const prop = layer.transform[f.key];
      const val = Math.round(
        evaluateProp(prop, state.currentTime, layerIndex, comp, `${layer.id}:${f.key}`) * 10
      ) / 10;
      const hasKfs = prop.keyframes.length > 0;
      const atKf = prop.keyframes.some((k) => Math.abs(k.time - state.currentTime) <= snapTol);
      const hasExpr = Boolean(prop.expression?.trim());

      return `
        <div class="insp-prop-row">
          <div class="insp-prop-head">
            <button class="tl-sw-btn ${hasKfs ? 'on' : ''}" data-insp-sw="${f.key}" title="Stopwatch">${ICONS.stopwatch}</button>
            <span class="insp-prop-label">${f.label}</span>
            ${hasExpr ? `<span class="expr-badge">fx()</span>` : ''}
            <button class="tl-kf-btn ${atKf ? 'on' : ''}" data-insp-kf="${f.key}" title="Keyframe">${ICONS.diamond}</button>
            <input type="number" class="num-input" data-insp-num="${f.key}" value="${val}" step="${f.step}" />
            <span class="unit">${f.unit}</span>
          </div>
          <input type="range" class="ae-slider" data-insp-range="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" />
        </div>
      `;
    }).join('');

    let typeSectionHtml = '';
    if (layer.type === 'text' && layer.textData) {
      const td = layer.textData;
      typeSectionHtml = `
        <div class="insp-card">
          <div class="insp-card-title">Text Properties</div>
          <label class="field-label">Text Content</label>
          <textarea class="ae-textarea" data-text-field="text" rows="2">${escapeHtml(td.text)}</textarea>
          <div class="grid-2">
            <div>
              <label class="field-label">Size (px)</label>
              <input type="number" class="ae-input" data-text-num="fontSize" value="${td.fontSize}" min="10" max="400" />
            </div>
            <div>
              <label class="field-label">Weight</label>
              <select class="ae-select" data-text-select="fontWeight">
                ${(['400', '600', '700', '900'] as const)
                  .map((w) => `<option value="${w}" ${td.fontWeight === w ? 'selected' : ''}>${w}</option>`)
                  .join('')}
              </select>
            </div>
            <div>
              <label class="field-label">Fill Color</label>
              <input type="color" class="ae-color" data-text-field="color" value="${td.color}" />
            </div>
            <div>
              <label class="field-label">Stroke Color</label>
              <input type="color" class="ae-color" data-text-field="strokeColor" value="${td.strokeColor}" />
            </div>
            <div>
              <label class="field-label">Stroke Width</label>
              <input type="number" class="ae-input" data-text-num="strokeWidth" value="${td.strokeWidth}" min="0" max="40" />
            </div>
            <div>
              <label class="field-label">Reveal (%)</label>
              <input type="number" class="ae-input" data-text-num="revealProgress" value="${td.revealProgress ?? 100}" min="0" max="100" />
            </div>
          </div>
        </div>
      `;
    } else if (layer.type === 'shape' && layer.shapeData) {
      const sd = layer.shapeData;
      const kinds: ShapeKind[] = ['rect', 'roundedRect', 'ellipse', 'star', 'polygon'];
      typeSectionHtml = `
        <div class="insp-card">
          <div class="insp-card-title">Shape Properties</div>
          <div class="grid-2">
            <div>
              <label class="field-label">Shape</label>
              <select class="ae-select" data-shape-select="kind">
                ${kinds.map((k) => `<option value="${k}" ${sd.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="field-label">Points / Sides</label>
              <input type="number" class="ae-input" data-shape-num="points" value="${sd.points}" min="3" max="24" />
            </div>
            <div>
              <label class="field-label">Width</label>
              <input type="number" class="ae-input" data-shape-num="width" value="${sd.width}" min="10" max="2500" />
            </div>
            <div>
              <label class="field-label">Height</label>
              <input type="number" class="ae-input" data-shape-num="height" value="${sd.height}" min="10" max="2500" />
            </div>
            <div>
              <label class="field-label">Fill Color</label>
              <input type="color" class="ae-color" data-shape-field="fillColor" value="${sd.fillColor}" />
            </div>
            <div>
              <label class="field-label">Fill Opacity (%)</label>
              <input type="number" class="ae-input" data-shape-num="fillOpacity" value="${sd.fillOpacity}" min="0" max="100" />
            </div>
            <div>
              <label class="field-label">Stroke Color</label>
              <input type="color" class="ae-color" data-shape-field="strokeColor" value="${sd.strokeColor}" />
            </div>
            <div>
              <label class="field-label">Stroke Width</label>
              <input type="number" class="ae-input" data-shape-num="strokeWidth" value="${sd.strokeWidth}" min="0" max="80" />
            </div>
          </div>
        </div>
      `;
    } else if (layer.type === 'solid' && layer.solidData) {
      const sd = layer.solidData;
      typeSectionHtml = `
        <div class="insp-card">
          <div class="insp-card-title">Solid / Gradient</div>
          <div class="grid-2">
            <div>
              <label class="field-label">Color 1</label>
              <input type="color" class="ae-color" data-solid-field="color" value="${sd.color}" />
            </div>
            <div>
              <label class="field-label">Color 2</label>
              <input type="color" class="ae-color" data-solid-field="gradientColor" value="${sd.gradientColor ?? '#312e81'}" />
            </div>
            <div>
              <label class="field-label">Gradient</label>
              <button class="btn-ghost btn-sm" data-solid-grad-toggle>${sd.useGradient ? 'ON' : 'OFF'}</button>
            </div>
            <div>
              <label class="field-label">Angle (°)</label>
              <input type="number" class="ae-input" data-solid-num="gradientAngle" value="${sd.gradientAngle}" min="0" max="360" />
            </div>
          </div>
        </div>
      `;
    }

    const exprCode = layer.transform[activeExprProp].expression ?? '';
    const exprCheck = exprCode.trim()
      ? evaluateExpression(exprCode, {
          time: state.currentTime,
          index: layerIndex + 1,
          value: layer.transform[activeExprProp].value,
          fps: comp.fps,
          duration: comp.duration,
          seed: 1,
        })
      : null;

    container.innerHTML = `
      <div class="insp-wrap">
        <div class="insp-card">
          <div class="insp-header-row">
            <input type="text" class="ae-input layer-title-input" data-layer-name value="${escapeHtml(layer.name)}" />
            <div class="insp-actions">
              <button class="icon-btn" data-layer-up title="Move Layer Up">${ICONS.up}</button>
              <button class="icon-btn" data-layer-down title="Move Layer Down">${ICONS.down}</button>
              <button class="icon-btn" data-layer-dup title="Duplicate">${ICONS.copy}</button>
              <button class="icon-btn danger" data-layer-del title="Delete">${ICONS.trash}</button>
            </div>
          </div>
          <div class="grid-2 mt-8">
            <div>
              <label class="field-label">Blend Mode</label>
              <select class="ae-select" data-blend-select>${blendOptions}</select>
            </div>
            <div>
              <label class="field-label">Parent & Link</label>
              <select class="ae-select" data-parent-select>
                <option value="">None</option>
                ${parentOptions}
              </select>
            </div>
          </div>
        </div>

        ${typeSectionHtml}

        <div class="insp-card">
          <div class="insp-card-title">Transform</div>
          ${transformRows}
        </div>

        <div class="insp-card">
          <div class="insp-card-title">AE Expressions</div>
          <div class="expr-toolbar">
            <select class="ae-select" data-expr-prop>
              ${TRANSFORM_FIELDS.map(
                (f) => `<option value="${f.key}" ${activeExprProp === f.key ? 'selected' : ''}>${f.label}</option>`
              ).join('')}
            </select>
            <span class="expr-status ${exprCheck?.error ? 'err' : 'ok'}">
              ${exprCode.trim() ? (exprCheck?.error ? escapeHtml(exprCheck.error) : `= ${exprCheck?.value.toFixed(1)}`) : 'Inactive'}
            </span>
          </div>
          <input type="text" class="ae-input mono mt-6" data-expr-input placeholder="Напр: wiggle(4, 25) или time * 90" value="${escapeHtml(exprCode)}" />
          <div class="chip-row mt-6">
            <button class="chip-btn" data-expr-preset="wiggle(4, 25)">wiggle(4, 25)</button>
            <button class="chip-btn" data-expr-preset="time * 90">time * 90</button>
            <button class="chip-btn" data-expr-preset="value + Math.sin(time * 4) * 80">sin wave</button>
            <button class="chip-btn" data-expr-preset='loopOut("pingpong")'>loopOut</button>
            <button class="chip-btn danger" data-expr-preset="">Clear</button>
          </div>
        </div>
      </div>
    `;

    bindEvents(layer.id);
  }

  function bindEvents(layerId: string): void {
    container.querySelector<HTMLInputElement>('[data-layer-name]')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).value.trim();
      if (v) store.updateLayer(layerId, (l) => (l.name = v));
    });

    container.querySelector('[data-layer-up]')?.addEventListener('click', () => store.moveLayerOrder(layerId, -1));
    container.querySelector('[data-layer-down]')?.addEventListener('click', () => store.moveLayerOrder(layerId, 1));
    container.querySelector('[data-layer-dup]')?.addEventListener('click', () => store.duplicateLayer(layerId));
    container.querySelector('[data-layer-del]')?.addEventListener('click', () => store.deleteLayer(layerId));

    container.querySelector<HTMLSelectElement>('[data-blend-select]')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as BlendMode;
      store.updateLayer(layerId, (l) => (l.blendMode = mode));
    });

    container.querySelector<HTMLSelectElement>('[data-parent-select]')?.addEventListener('change', (e) => {
      const pid = (e.target as HTMLSelectElement).value || null;
      store.updateLayer(layerId, (l) => (l.parentId = pid));
    });

    // Transform controls
    container.querySelectorAll<HTMLElement>('[data-insp-sw]').forEach((btn) => {
      btn.addEventListener('click', () => store.toggleStopwatch(layerId, btn.dataset.inspSw as TransformPropKey));
    });
    container.querySelectorAll<HTMLElement>('[data-insp-kf]').forEach((btn) => {
      btn.addEventListener('click', () => store.toggleKeyframeAtCurrentTime(layerId, btn.dataset.inspKf as TransformPropKey));
    });

    container.querySelectorAll<HTMLInputElement>('[data-insp-range]').forEach((rng) => {
      const key = rng.dataset.inspRange as TransformPropKey;
      let snapped = false;
      rng.addEventListener('pointerdown', () => {
        snapped = false;
      });
      rng.addEventListener('input', () => {
        if (!snapped) {
          store.snapshotForUndo();
          snapped = true;
        }
        store.setTransformValue(layerId, key, Number(rng.value), { skipUndo: true });
      });
    });

    container.querySelectorAll<HTMLInputElement>('[data-insp-num]').forEach((inp) => {
      const key = inp.dataset.inspNum as TransformPropKey;
      inp.addEventListener('change', () => {
        const val = Number(inp.value);
        if (!Number.isNaN(val)) store.setTransformValue(layerId, key, val);
      });
    });

    // Text fields
    container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-text-field]').forEach((el) => {
      const field = el.dataset.textField! as 'text' | 'color' | 'strokeColor';
      el.addEventListener('change', () => {
        store.updateLayer(layerId, (l) => {
          if (l.textData) l.textData[field] = el.value;
        });
      });
    });
    container.querySelectorAll<HTMLInputElement>('[data-text-num]').forEach((el) => {
      const field = el.dataset.textNum! as 'fontSize' | 'strokeWidth' | 'revealProgress';
      el.addEventListener('change', () => {
        store.updateLayer(layerId, (l) => {
          if (l.textData) l.textData[field] = Number(el.value);
        });
      });
    });
    container.querySelector<HTMLSelectElement>('[data-text-select="fontWeight"]')?.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value as '400' | '600' | '700' | '900';
      store.updateLayer(layerId, (l) => {
        if (l.textData) l.textData.fontWeight = v;
      });
    });

    // Shape fields
    container.querySelector<HTMLSelectElement>('[data-shape-select="kind"]')?.addEventListener('change', (e) => {
      const kind = (e.target as HTMLSelectElement).value as ShapeKind;
      store.updateLayer(layerId, (l) => {
        if (l.shapeData) l.shapeData.kind = kind;
      });
    });
    container.querySelectorAll<HTMLInputElement>('[data-shape-field]').forEach((el) => {
      const field = el.dataset.shapeField! as 'fillColor' | 'strokeColor';
      el.addEventListener('change', () => {
        store.updateLayer(layerId, (l) => {
          if (l.shapeData) l.shapeData[field] = el.value;
        });
      });
    });
    container.querySelectorAll<HTMLInputElement>('[data-shape-num]').forEach((el) => {
      const field = el.dataset.shapeNum! as 'points' | 'width' | 'height' | 'fillOpacity' | 'strokeWidth';
      el.addEventListener('change', () => {
        store.updateLayer(layerId, (l) => {
          if (l.shapeData) l.shapeData[field] = Number(el.value);
        });
      });
    });

    // Solid fields
    container.querySelectorAll<HTMLInputElement>('[data-solid-field]').forEach((el) => {
      const field = el.dataset.solidField! as 'color' | 'gradientColor';
      el.addEventListener('change', () => {
        store.updateLayer(layerId, (l) => {
          if (l.solidData) l.solidData[field] = el.value;
        });
      });
    });
    container.querySelector('[data-solid-grad-toggle]')?.addEventListener('click', () => {
      store.updateLayer(layerId, (l) => {
        if (l.solidData) l.solidData.useGradient = !l.solidData.useGradient;
      });
    });
    container.querySelector<HTMLInputElement>('[data-solid-num="gradientAngle"]')?.addEventListener('change', (e) => {
      store.updateLayer(layerId, (l) => {
        if (l.solidData) l.solidData.gradientAngle = Number((e.target as HTMLInputElement).value);
      });
    });

    // Expressions
    container.querySelector<HTMLSelectElement>('[data-expr-prop]')?.addEventListener('change', (e) => {
      activeExprProp = (e.target as HTMLSelectElement).value as TransformPropKey;
      render();
    });
    container.querySelector<HTMLInputElement>('[data-expr-input]')?.addEventListener('change', (e) => {
      store.setExpression(layerId, activeExprProp, (e.target as HTMLInputElement).value);
    });
    container.querySelectorAll<HTMLElement>('[data-expr-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        store.setExpression(layerId, activeExprProp, btn.dataset.exprPreset ?? '');
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
