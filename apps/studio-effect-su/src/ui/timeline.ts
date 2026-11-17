import { evaluateProp } from '../core/interpolation';
import type { Layer, TransformPropKey } from '../core/types';
import { store } from '../state/store';
import { ICONS } from './icons';

const BASE_PROP_ROWS: Array<{ key: TransformPropKey; label: string; unit: string }> = [
  { key: 'x', label: 'Position X', unit: 'px' },
  { key: 'y', label: 'Position Y', unit: 'px' },
  { key: 'scaleX', label: 'Scale X', unit: '%' },
  { key: 'scaleY', label: 'Scale Y', unit: '%' },
  { key: 'rotation', label: 'Rotation', unit: '°' },
  { key: 'opacity', label: 'Opacity', unit: '%' },
  { key: 'anchorX', label: 'Anchor X', unit: 'px' },
  { key: 'anchorY', label: 'Anchor Y', unit: 'px' },
];

const EXTRA_3D_ROWS: Array<{ key: TransformPropKey; label: string; unit: string }> = [
  { key: 'z', label: 'Z Depth', unit: 'px' },
  { key: 'rotateX', label: 'Rotate X', unit: '°' },
  { key: 'rotateY', label: 'Rotate Y', unit: '°' },
];

function typeTag(layer: Layer): string {
  switch (layer.type) {
    case 'text':
      return 'T';
    case 'shape':
      return '★';
    case 'solid':
      return '■';
    case 'media':
      return 'IMG';
    case 'audio':
      return '♪';
    case 'precomp':
      return 'CMP';
    case 'adjustment':
      return 'ADJ';
    case 'null':
      return 'NUL';
  }
}

export function mountTimeline(
  container: HTMLElement,
  callbacks: { onOpenAddLayer: () => void }
): void {
  function render(): void {
    const state = store.getState();
    const tr = store.t();
    const comp = store.getActiveComp();
    const zoom = state.timelineZoom;
    const trackWidth = Math.max(320, Math.ceil(comp.duration * zoom) + 40);
    const snapTol = 0.5 / comp.fps;

    const tickStep = zoom >= 120 ? 0.5 : 1;
    let ticksHtml = '';
    for (let t = 0; t <= comp.duration + 0.001; t += tickStep) {
      const left = Math.round(t * zoom);
      const isMajor = Math.abs(t - Math.round(t)) < 0.01;
      ticksHtml += `
        <div class="tl-tick ${isMajor ? 'major' : ''}" style="left:${left}px">
          ${isMajor ? `<span>${t.toFixed(0)}s</span>` : ''}
        </div>
      `;
    }

    let leftRowsHtml = '';
    let rightRowsHtml = '';

    comp.layers.forEach((layer, layerIndex) => {
      const isSelected = layer.id === state.selectedLayerId;
      const fxCount = layer.effects.filter((e) => e.enabled).length;
      const hasMask = Boolean(layer.mask?.enabled);
      const hasMatte = Boolean(layer.trackMatte && layer.trackMatte !== 'none');

      leftRowsHtml += `
        <div class="tl-layer-row ${isSelected ? 'selected' : ''}" data-select-layer="${layer.id}">
          <span class="tl-color-bar" style="background:${layer.colorLabel}"></span>
          <button class="tl-mini-btn" data-toggle-expand="${layer.id}" title="${tr.expandTransform}">
            ${layer.expanded ? ICONS.chevronDown : ICONS.chevronRight}
          </button>
          <span class="tl-type-badge" style="border-color:${layer.colorLabel}">${typeTag(layer)}</span>
          <span class="tl-layer-name" title="${escapeHtml(layer.name)}">${escapeHtml(layer.name)}</span>
          <div class="tl-layer-flags">
            ${hasMask ? `<span class="tl-mini-pill mask" title="${tr.maskActiveTitle}">M</span>` : ''}
            ${hasMatte ? `<span class="tl-mini-pill matte" title="${tr.matteActiveTitle}">MAT</span>` : ''}
            ${fxCount > 0 ? `<span class="tl-fx-pill" title="${tr.activeFxTitle}">fx${fxCount}</span>` : ''}
            ${
              layer.type !== 'audio' && layer.type !== 'adjustment'
                ? `<button class="tl-flag-btn d3 ${layer.is3D ? 'on' : ''}" data-toggle-3d="${layer.id}" title="${tr.layer3dTitle}">3D</button>`
                : ''
            }
            <button class="tl-flag-btn ${layer.visible ? 'on' : ''}" data-toggle-vis="${layer.id}" title="${tr.visibilityTitle}">${layer.visible ? ICONS.eye : ICONS.eyeOff}</button>
            <button class="tl-flag-btn solo ${layer.solo ? 'on' : ''}" data-toggle-solo="${layer.id}" title="${tr.soloTitle}">S</button>
            <button class="tl-flag-btn ${layer.locked ? 'on' : ''}" data-toggle-lock="${layer.id}" title="${tr.lockTitle}">${layer.locked ? ICONS.lock : ICONS.unlock}</button>
          </div>
        </div>
      `;

      const barLeft = Math.round(layer.inPoint * zoom);
      const barWidth = Math.max(10, Math.round((layer.outPoint - layer.inPoint) * zoom));
      const waveformHtml =
        layer.type === 'audio' && layer.audioData?.waveform?.length
          ? `<div class="tl-waveform">${layer.audioData.waveform
              .map((v) => `<span style="height:${Math.max(12, Math.round(v * 100))}%"></span>`)
              .join('')}</div>`
          : '';

      rightRowsHtml += `
        <div class="tl-track-row ${isSelected ? 'selected' : ''}" data-select-layer="${layer.id}">
          <div class="tl-layer-bar" data-bar-layer="${layer.id}" style="left:${barLeft}px;width:${barWidth}px;background:${layer.colorLabel}33;border-color:${layer.colorLabel}">
            ${waveformHtml}
            <div class="tl-trim-handle left" data-trim="in" data-layer="${layer.id}"></div>
            <span class="tl-bar-label">${escapeHtml(layer.name)}</span>
            <div class="tl-trim-handle right" data-trim="out" data-layer="${layer.id}"></div>
          </div>
        </div>
      `;

      if (layer.expanded) {
        const rows = layer.is3D ? [...BASE_PROP_ROWS, ...EXTRA_3D_ROWS] : BASE_PROP_ROWS;
        for (const row of rows) {
          const prop = layer.transform[row.key] ?? { value: 0, keyframes: [] };
          const hasKfs = prop.keyframes.length > 0;
          const atKf = prop.keyframes.some((k) => Math.abs(k.time - state.currentTime) <= snapTol);
          const curVal = evaluateProp(prop, state.currentTime, layerIndex, comp, `${layer.id}:${row.key}`);
          const isRowSel = isSelected && state.selectedPropKey === row.key;

          leftRowsHtml += `
            <div class="tl-prop-row ${isRowSel ? 'selected' : ''}" data-select-prop="${layer.id}:${row.key}">
              <button class="tl-sw-btn ${hasKfs ? 'on' : ''}" data-sw="${layer.id}:${row.key}" title="${tr.toggleKfTitle}">${ICONS.stopwatch}</button>
              <span class="tl-prop-name">${tr.propNames[row.key] ?? row.label}</span>
              <span class="tl-prop-val">${Math.round(curVal * 10) / 10}${row.unit}</span>
              <button class="tl-kf-btn ${atKf ? 'on' : ''}" data-kf-toggle="${layer.id}:${row.key}" title="${tr.addRemoveKfTitle}">${ICONS.diamond}</button>
            </div>
          `;

          const kfsHtml = prop.keyframes
            .map((k) => {
              const kLeft = Math.round(k.time * zoom);
              const kSel = state.selectedKeyframe?.kfId === k.id;
              return `<button class="tl-diamond ${kSel ? 'selected' : ''} easing-${k.easing}" style="left:${kLeft}px" data-kf-drag="${layer.id}:${row.key}:${k.id}" title="${k.time.toFixed(2)}s = ${k.value} (${k.easing})"></button>`;
            })
            .join('');

          rightRowsHtml += `
            <div class="tl-prop-track ${isRowSel ? 'selected' : ''}" data-select-prop="${layer.id}:${row.key}">
              ${kfsHtml}
            </div>
          `;
        }
      }
    });

    const ctiLeft = Math.round(state.currentTime * zoom);
    const markersHtml = (comp.markers ?? [])
      .map(
        (m) =>
          `<button class="tl-marker" style="left:${Math.round(m.time * zoom)}px" data-marker-jump="${m.id}:${m.time}" title="${escapeHtml(tr.markerTooltip(m.label, m.time))}">${escapeHtml(m.label)}</button>`
      )
      .join('');

    container.innerHTML = `
      <div class="tl-shell">
        <div class="tl-toolbar">
          <div class="tl-toolbar-group">
            <button class="btn-primary btn-sm" data-tl-add>${tr.addLayerBtn}</button>
            <button class="btn-ghost btn-sm" data-tl-split title="${tr.splitTitle}">${tr.splitBtn}</button>
            <button class="btn-ghost btn-sm" data-tl-marker title="${tr.addMarkerTitle}">${tr.addMarkerBtn}</button>
          </div>
          <div class="tl-toolbar-group">
            <button class="btn-ghost btn-sm" data-tl-zoom="-25">−</button>
            <span class="tl-zoom-label">${tr.zoomLabel}</span>
            <button class="btn-ghost btn-sm" data-tl-zoom="25">+</button>
          </div>
          <div class="tl-toolbar-group">
            <button class="btn-ghost btn-sm" data-tl-kf-nav="-1" title="${tr.prevKfTitle}">◀ ◆</button>
            <button class="btn-ghost btn-sm" data-tl-kf-nav="1" title="${tr.nextKfTitle}">◆ ▶</button>
          </div>
        </div>
        <div class="tl-split">
          <div class="tl-left" data-tl-left>
            <div class="tl-left-header">${tr.layersHeader(comp.layers.length)}</div>
            <div class="tl-left-body" data-tl-left-body>
              ${leftRowsHtml || `<div class="empty-hint">${tr.noLayersHint}</div>`}
            </div>
          </div>
          <div class="tl-right" data-tl-right>
            <div class="tl-ruler" data-tl-ruler style="width:${trackWidth}px">
              ${ticksHtml}
              ${markersHtml}
              <div class="tl-cti-head" style="left:${ctiLeft}px" data-cti-head></div>
            </div>
            <div class="tl-tracks" data-tl-tracks style="width:${trackWidth}px">
              ${rightRowsHtml}
              <div class="tl-cti-line" style="left:${ctiLeft}px" data-cti-line></div>
            </div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents(): void {
    const leftBody = container.querySelector<HTMLElement>('[data-tl-left-body]')!;
    const rightPane = container.querySelector<HTMLElement>('[data-tl-right]')!;
    const ruler = container.querySelector<HTMLElement>('[data-tl-ruler]')!;
    const ctiHead = container.querySelector<HTMLElement>('[data-cti-head]')!;
    const ctiLine = container.querySelector<HTMLElement>('[data-cti-line]')!;

    // Sync vertical scroll
    rightPane.addEventListener('scroll', () => {
      leftBody.scrollTop = rightPane.scrollTop;
    });

    container.querySelector('[data-tl-add]')?.addEventListener('click', () => {
      callbacks.onOpenAddLayer();
    });

    container.querySelector('[data-tl-split]')?.addEventListener('click', () => {
      const sel = store.getSelectedLayer();
      if (sel) store.splitLayerAtCurrentTime(sel.id);
    });

    container.querySelector('[data-tl-marker]')?.addEventListener('click', () => {
      store.addMarkerAtCurrentTime();
    });

    container.querySelectorAll<HTMLElement>('[data-marker-jump]').forEach((mk) => {
      mk.addEventListener('click', (e) => {
        e.stopPropagation();
        const [, tStr] = mk.dataset.markerJump!.split(':');
        store.stopPlay();
        store.setTime(Number(tStr));
      });
      mk.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const [id] = mk.dataset.markerJump!.split(':');
        store.deleteMarker(id);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-toggle-3d]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.toggle3D(btn.dataset.toggle3d!);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-tl-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const delta = Number(btn.dataset.tlZoom);
        store.setTimelineZoom(store.getState().timelineZoom + delta);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-tl-kf-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = Number(btn.dataset.tlKfNav);
        const comp = store.getActiveComp();
        const cur = store.getState().currentTime;
        const layer = store.getSelectedLayer();
        const times = new Set<number>();
        if (layer) {
          for (const k of Object.keys(layer.transform) as TransformPropKey[]) {
            for (const kf of layer.transform[k]?.keyframes ?? []) times.add(kf.time);
          }
        }
        const sorted = Array.from(times).sort((a, b) => a - b);
        if (sorted.length === 0) return;
        const eps = 0.5 / comp.fps;
        if (dir > 0) {
          const next = sorted.find((t) => t > cur + eps);
          if (next !== undefined) store.setTime(next);
        } else {
          const prev = [...sorted].reverse().find((t) => t < cur - eps);
          if (prev !== undefined) store.setTime(prev);
        }
      });
    });

    // Layer buttons
    container.querySelectorAll<HTMLElement>('[data-select-layer]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button, .tl-trim-handle')) return;
        store.selectLayer(el.dataset.selectLayer!);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-toggle-expand]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.toggleExpand!;
        store.updateLayer(id, (l) => {
          l.expanded = !l.expanded;
        }, true);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-toggle-vis]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateLayer(btn.dataset.toggleVis!, (l) => {
          l.visible = !l.visible;
        });
      });
    });

    container.querySelectorAll<HTMLElement>('[data-toggle-solo]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateLayer(btn.dataset.toggleSolo!, (l) => {
          l.solo = !l.solo;
        });
      });
    });

    container.querySelectorAll<HTMLElement>('[data-toggle-lock]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateLayer(btn.dataset.toggleLock!, (l) => {
          l.locked = !l.locked;
        });
      });
    });

    // Property controls
    container.querySelectorAll<HTMLElement>('[data-select-prop]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const [layerId, propKey] = el.dataset.selectProp!.split(':');
        store.selectLayer(layerId);
        store.selectProp(propKey as TransformPropKey);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-sw]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [layerId, propKey] = btn.dataset.sw!.split(':');
        store.toggleStopwatch(layerId, propKey as TransformPropKey);
      });
    });

    container.querySelectorAll<HTMLElement>('[data-kf-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [layerId, propKey] = btn.dataset.kfToggle!.split(':');
        store.toggleKeyframeAtCurrentTime(layerId, propKey as TransformPropKey);
      });
    });

    // Scrubbing CTI on ruler
    const scrubFromEvent = (clientX: number) => {
      const rect = ruler.getBoundingClientRect();
      const x = clientX - rect.left;
      const t = Math.max(0, x / store.getState().timelineZoom);
      store.stopPlay();
      store.setTime(t);
    };

    ruler.addEventListener('pointerdown', (e) => {
      ruler.setPointerCapture(e.pointerId);
      scrubFromEvent(e.clientX);
      const onMove = (me: PointerEvent) => scrubFromEvent(me.clientX);
      const onUp = () => {
        ruler.removeEventListener('pointermove', onMove);
        ruler.removeEventListener('pointerup', onUp);
      };
      ruler.addEventListener('pointermove', onMove);
      ruler.addEventListener('pointerup', onUp);
    });

    // Dragging layer bars & trim handles
    container.querySelectorAll<HTMLElement>('[data-bar-layer]').forEach((bar) => {
      bar.addEventListener('pointerdown', (e) => {
        const target = e.target as HTMLElement;
        const trimMode = target.dataset.trim as 'in' | 'out' | undefined;
        const layerId = bar.dataset.barLayer!;
        const comp = store.getActiveComp();
        const layer = comp.layers.find((l) => l.id === layerId);
        if (!layer || layer.locked) return;

        e.stopPropagation();
        bar.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const origIn = layer.inPoint;
        const origOut = layer.outPoint;
        const zoom = store.getState().timelineZoom;
        let snapped = false;

        const onMove = (me: PointerEvent) => {
          const dt = (me.clientX - startX) / zoom;
          if (Math.abs(dt) < 0.01) return;
          if (!snapped) {
            store.snapshotForUndo();
            snapped = true;
          }
          store.updateLayer(
            layerId,
            (l) => {
              if (trimMode === 'in') {
                l.inPoint = Math.max(0, Math.min(origOut - 0.1, Number((origIn + dt).toFixed(2))));
              } else if (trimMode === 'out') {
                l.outPoint = Math.min(comp.duration, Math.max(origIn + 0.1, Number((origOut + dt).toFixed(2))));
              } else {
                const dur = origOut - origIn;
                const nextIn = Math.max(0, Math.min(comp.duration - dur, Number((origIn + dt).toFixed(2))));
                l.inPoint = nextIn;
                l.outPoint = Number((nextIn + dur).toFixed(2));
              }
            },
            true
          );
        };

        const onUp = () => {
          bar.removeEventListener('pointermove', onMove);
          bar.removeEventListener('pointerup', onUp);
        };
        bar.addEventListener('pointermove', onMove);
        bar.addEventListener('pointerup', onUp);
      });
    });

    // Dragging / selecting keyframe diamonds
    container.querySelectorAll<HTMLElement>('[data-kf-drag]').forEach((dm) => {
      dm.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const [layerId, propKey, kfId] = dm.dataset.kfDrag!.split(':') as [string, TransformPropKey, string];
        const comp = store.getActiveComp();
        const layer = comp.layers.find((l) => l.id === layerId);
        const kfObj = layer?.transform[propKey]?.keyframes.find((k) => k.id === kfId);
        if (!kfObj) return;

        store.selectKeyframe({ layerId, propKey, kfId });
        store.setTime(kfObj.time);

        dm.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const origTime = kfObj.time;
        const zoom = store.getState().timelineZoom;
        let snapped = false;

        const onMove = (me: PointerEvent) => {
          const dt = (me.clientX - startX) / zoom;
          if (Math.abs(dt) < 0.015) return;
          if (!snapped) {
            store.snapshotForUndo();
            snapped = true;
          }
          const nextT = Math.max(0, Math.min(comp.duration, Number((origTime + dt).toFixed(3))));
          kfObj.time = nextT;
          layer!.transform[propKey]?.keyframes.sort((a, b) => a.time - b.time);
          store.setTime(nextT);
          dm.style.left = `${Math.round(nextT * zoom)}px`;
        };

        const onUp = () => {
          dm.removeEventListener('pointermove', onMove);
          dm.removeEventListener('pointerup', onUp);
          if (snapped) render();
        };
        dm.addEventListener('pointermove', onMove);
        dm.addEventListener('pointerup', onUp);
      });
    });

    // Fast time update without re-rendering DOM
    syncCti = () => {
      const left = `${Math.round(store.getState().currentTime * store.getState().timelineZoom)}px`;
      ctiHead.style.left = left;
      ctiLine.style.left = left;
    };
  }

  let syncCti: (() => void) | null = null;
  store.subscribe(render);
  store.subscribeTime(() => syncCti?.());
  render();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)
  );
}
