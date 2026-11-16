import { analyzeAudioBuffer, createBuiltInSynthBeat } from '../core/audio';
import { createComposition } from '../core/factories';
import { DEMO_PRESETS } from '../core/presets';
import type { StudioProject } from '../core/types';
import {
  exportCompositionVideo,
  exportFramePng,
  exportProjectFile,
} from '../engine/exporter';
import { store } from '../state/store';

export class ModalManager {
  private backdrop: HTMLElement;

  constructor(root: HTMLElement) {
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'modal-backdrop hidden';
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    root.appendChild(this.backdrop);
  }

  close(): void {
    this.backdrop.classList.add('hidden');
    this.backdrop.innerHTML = '';
  }

  private open(title: string, bodyHtml: string, onMount?: (el: HTMLElement) => void): void {
    this.backdrop.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${title}</h3>
          <button class="icon-btn" data-modal-close>✕</button>
        </div>
        <div class="modal-body" data-modal-body>${bodyHtml}</div>
      </div>
    `;
    this.backdrop.classList.remove('hidden');
    this.backdrop.querySelector('[data-modal-close]')?.addEventListener('click', () => this.close());
    const body = this.backdrop.querySelector<HTMLElement>('[data-modal-body]')!;
    onMount?.(body);
  }

  openAddLayer(): void {
    this.open(
      'New Layer',
      `
      <div class="layer-picker-grid">
        <button class="picker-tile" data-add-type="text">
          <span class="picker-badge" style="background:#ef4444">T</span>
          <strong>Text Layer</strong>
          <small>Анимированный текст и пресеты</small>
        </button>
        <button class="picker-tile" data-add-type="shape">
          <span class="picker-badge" style="background:#22c55e">★</span>
          <strong>Shape Layer</strong>
          <small>Круги, рамки, звёзды, фигуры</small>
        </button>
        <button class="picker-tile" data-add-type="solid">
          <span class="picker-badge" style="background:#d946ef">■</span>
          <strong>Solid / BG</strong>
          <small>Сплошной фон или градиент</small>
        </button>
        <button class="picker-tile" data-add-type="adjustment">
          <span class="picker-badge" style="background:#a855f7">ADJ</span>
          <strong>Adjustment Layer</strong>
          <small>Эффекты ко всем слоям ниже</small>
        </button>
        <button class="picker-tile" data-add-type="null">
          <span class="picker-badge" style="background:#f59e0b">NUL</span>
          <strong>Null Object</strong>
          <small>Контроллер привязки (Parenting)</small>
        </button>
        <label class="picker-tile file-tile">
          <span class="picker-badge" style="background:#38bdf8">IMG</span>
          <strong>Photo / Video</strong>
          <small>Импорт из галереи телефона</small>
          <input type="file" accept="image/*,video/*" data-media-input hidden />
        </label>
        <label class="picker-tile file-tile">
          <span class="picker-badge" style="background:#10b981">♪</span>
          <strong>Audio Track</strong>
          <small>Музыка MP3 / WAV с волной</small>
          <input type="file" accept="audio/*" data-audio-input hidden />
        </label>
        <button class="picker-tile" data-add-synth-beat>
          <span class="picker-badge" style="background:#10b981">BPM</span>
          <strong>Synth Beat 128 BPM</strong>
          <small>Встроенный бит для beat-анимации</small>
        </button>
      </div>
      `,
      (body) => {
        body.querySelectorAll<HTMLElement>('[data-add-type]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const type = btn.dataset.addType as 'text' | 'shape' | 'solid' | 'adjustment' | 'null';
            store.addLayer(type);
            this.close();
          });
        });

        body.querySelector('[data-add-synth-beat]')?.addEventListener('click', () => {
          const comp = store.getActiveComp();
          const audioData = createBuiltInSynthBeat(comp.duration, 128);
          store.addLayer('audio', audioData.fileName, (l) => {
            l.audioData = audioData;
            l.outPoint = Math.min(comp.duration, audioData.duration);
          });
          this.close();
        });

        const audioInput = body.querySelector<HTMLInputElement>('[data-audio-input]');
        audioInput?.addEventListener('change', () => {
          const file = audioInput.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = String(reader.result ?? '');
            if (!dataUrl) return;
            const buf = await file.arrayBuffer();
            const audioData = await analyzeAudioBuffer(buf, dataUrl, file.name);
            const comp = store.getActiveComp();
            store.addLayer('audio', file.name, (l) => {
              l.audioData = audioData;
              l.outPoint = Math.min(comp.duration, audioData.duration || comp.duration);
            });
            this.close();
          };
          reader.readAsDataURL(file);
        });

        const fileInput = body.querySelector<HTMLInputElement>('[data-media-input]');
        fileInput?.addEventListener('change', () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          const isVideo = file.type.startsWith('video/');
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result ?? '');
            if (!dataUrl) return;
            if (isVideo) {
              const vid = document.createElement('video');
              vid.onloadedmetadata = () => {
                store.addLayer('media', file.name, (l) => {
                  l.mediaData = {
                    mediaType: 'video',
                    src: dataUrl,
                    fileName: file.name,
                    naturalWidth: vid.videoWidth || 720,
                    naturalHeight: vid.videoHeight || 1280,
                  };
                });
                this.close();
              };
              vid.src = dataUrl;
            } else {
              const img = new Image();
              img.onload = () => {
                const comp = store.getActiveComp();
                const fitScale = Math.min(
                  100,
                  Math.round(
                    (Math.min(comp.width, comp.height) * 0.75 * 100) /
                      Math.max(img.naturalWidth, img.naturalHeight, 1)
                  )
                );
                store.addLayer('media', file.name, (l) => {
                  l.transform.scaleX.value = fitScale;
                  l.transform.scaleY.value = fitScale;
                  l.mediaData = {
                    mediaType: 'image',
                    src: dataUrl,
                    fileName: file.name,
                    naturalWidth: img.naturalWidth || 800,
                    naturalHeight: img.naturalHeight || 800,
                  };
                });
                this.close();
              };
              img.src = dataUrl;
            }
          };
          reader.readAsDataURL(file);
        });
      }
    );
  }

  openCompSettings(): void {
    const comp = store.getActiveComp();
    this.open(
      'Composition Settings',
      `
      <div class="chip-row mb-10">
        <button class="chip-btn" data-preset-dim="1080x1920">9:16 Reels (1080×1920)</button>
        <button class="chip-btn" data-preset-dim="1920x1080">16:9 HD (1920×1080)</button>
        <button class="chip-btn" data-preset-dim="1080x1080">1:1 Square (1080×1080)</button>
      </div>
      <div class="grid-2">
        <div>
          <label class="field-label">Name</label>
          <input type="text" class="ae-input" data-cs="name" value="${comp.name}" />
        </div>
        <div>
          <label class="field-label">FPS</label>
          <select class="ae-select" data-cs="fps">
            ${[24, 30, 60].map((f) => `<option value="${f}" ${comp.fps === f ? 'selected' : ''}>${f} fps</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label">Width (px)</label>
          <input type="number" class="ae-input" data-cs="width" value="${comp.width}" min="240" max="3840" />
        </div>
        <div>
          <label class="field-label">Height (px)</label>
          <input type="number" class="ae-input" data-cs="height" value="${comp.height}" min="240" max="3840" />
        </div>
        <div>
          <label class="field-label">Duration (sec)</label>
          <input type="number" class="ae-input" data-cs="duration" value="${comp.duration}" min="1" max="120" step="0.5" />
        </div>
        <div>
          <label class="field-label">BG Color</label>
          <input type="color" class="ae-color" data-cs="backgroundColor" value="${comp.backgroundColor}" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-cs-save>Apply Settings</button>
      </div>
      `,
      (body) => {
        const wEl = body.querySelector<HTMLInputElement>('[data-cs="width"]')!;
        const hEl = body.querySelector<HTMLInputElement>('[data-cs="height"]')!;
        body.querySelectorAll<HTMLElement>('[data-preset-dim]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [w, h] = btn.dataset.presetDim!.split('x');
            wEl.value = w;
            hEl.value = h;
          });
        });

        body.querySelector('[data-cs-save]')?.addEventListener('click', () => {
          const name = body.querySelector<HTMLInputElement>('[data-cs="name"]')!.value.trim() || comp.name;
          const fps = Number(body.querySelector<HTMLSelectElement>('[data-cs="fps"]')!.value);
          const width = Math.max(240, Number(wEl.value));
          const height = Math.max(240, Number(hEl.value));
          const duration = Math.max(1, Number(body.querySelector<HTMLInputElement>('[data-cs="duration"]')!.value));
          const backgroundColor = body.querySelector<HTMLInputElement>('[data-cs="backgroundColor"]')!.value;
          store.updateComposition({ name, fps, width, height, duration, backgroundColor });
          this.close();
        });
      }
    );
  }

  openProjectsAndPresets(): void {
    const state = store.getState();
    const compsHtml = state.project.compositions
      .map(
        (c) => `
      <button class="chip-btn ${c.id === state.project.activeCompId ? 'active' : ''}" data-switch-comp="${c.id}">
        ${c.name} (${c.layers.length})
      </button>
    `
      )
      .join('');

    const presetsHtml = DEMO_PRESETS.map(
      (p) => `
      <button class="preset-card" data-load-preset="${p.id}">
        <strong>${p.title}</strong>
        <small>${p.subtitle}</small>
      </button>
    `
    ).join('');

    this.open(
      'Compositions, Projects & Presets',
      `
      <div class="insp-card-title">Compositions in Project</div>
      <div class="chip-row mb-10">
        ${compsHtml}
        <button class="chip-btn" data-add-comp>+ New Comp</button>
      </div>
      <div class="modal-divider"></div>
      <div class="insp-card-title">Demo Templates</div>
      <div class="preset-list">
        ${presetsHtml}
      </div>
      <div class="modal-divider"></div>
      <div class="btn-row">
        <button class="btn-ghost" data-new-blank>New Empty Project</button>
        <label class="btn-ghost file-btn">
          Import .suep
          <input type="file" accept=".suep,.json,application/json" data-import-suep hidden />
        </label>
        <button class="btn-primary" data-export-suep>Save .suep</button>
      </div>
      `,
      (body) => {
        body.querySelectorAll<HTMLElement>('[data-switch-comp]').forEach((btn) => {
          btn.addEventListener('click', () => {
            store.switchComposition(btn.dataset.switchComp!);
            this.close();
          });
        });

        body.querySelector('[data-add-comp]')?.addEventListener('click', () => {
          const cur = store.getActiveComp();
          store.addComposition(
            `Comp ${state.project.compositions.length + 1}`,
            cur.width,
            cur.height,
            cur.fps,
            cur.duration
          );
          this.close();
        });

        body.querySelectorAll<HTMLElement>('[data-load-preset]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const found = DEMO_PRESETS.find((p) => p.id === btn.dataset.loadPreset);
            if (found) {
              store.loadProject(found.create());
              this.close();
            }
          });
        });

        body.querySelector('[data-new-blank]')?.addEventListener('click', () => {
          const comp = createComposition('Blank Comp (9:16)', 1080, 1920, 30, 5);
          store.loadProject({
            version: '1.1.0',
            app: 'StudioEffect(SU)',
            name: 'Untitled Project',
            activeCompId: comp.id,
            compositions: [comp],
          });
          this.close();
        });

        body.querySelector('[data-export-suep]')?.addEventListener('click', () => {
          void exportProjectFile(store.getState().project);
        });

        const imp = body.querySelector<HTMLInputElement>('[data-import-suep]');
        imp?.addEventListener('change', () => {
          const f = imp.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const parsed = JSON.parse(String(reader.result)) as StudioProject;
              if (parsed?.app === 'StudioEffect(SU)' && parsed.compositions?.length) {
                store.loadProject(parsed);
                this.close();
              }
            } catch {
              alert('Некорректный файл проекта .suep');
            }
          };
          reader.readAsText(f);
        });
      }
    );
  }

  openExport(): void {
    const comp = store.getActiveComp();
    const allComps = store.getState().project.compositions;
    let abortCtrl: AbortController | null = null;

    this.open(
      'Render & Export',
      `
      <div class="export-info">
        <div><b>${comp.name}</b></div>
        <small>${comp.width}×${comp.height} • ${comp.fps} fps • ${comp.duration}s</small>
      </div>
      <div class="grid-2 mt-10">
        <div>
          <label class="field-label">Resolution</label>
          <select class="ae-select" data-exp-scale>
            <option value="0.5">Half (Fast Mobile)</option>
            <option value="1" selected>Full (100%)</option>
          </select>
        </div>
        <div>
          <label class="field-label">Bitrate</label>
          <select class="ae-select" data-exp-bitrate>
            <option value="4">4 Mbps (Light)</option>
            <option value="8" selected>8 Mbps (High)</option>
            <option value="14">14 Mbps (Master)</option>
          </select>
        </div>
      </div>
      <div class="export-progress hidden" data-exp-prog-box>
        <div class="prog-bar"><div class="prog-fill" data-exp-fill style="width:0%"></div></div>
        <div class="prog-label" data-exp-status>Preparing render...</div>
      </div>
      <div class="btn-row mt-12">
        <button class="btn-primary" data-exp-video>Render Video</button>
        <button class="btn-ghost" data-exp-png>Save PNG Frame</button>
        <button class="btn-ghost" data-exp-proj>Save .suep</button>
      </div>
      <div class="export-note">
        В Android APK готовые файлы сохраняются прямо в <b>Downloads/StudioEffectSU</b>.
      </div>
      `,
      (body) => {
        const progBox = body.querySelector<HTMLElement>('[data-exp-prog-box]')!;
        const fillEl = body.querySelector<HTMLElement>('[data-exp-fill]')!;
        const statusEl = body.querySelector<HTMLElement>('[data-exp-status]')!;
        const renderBtn = body.querySelector<HTMLButtonElement>('[data-exp-video]')!;

        renderBtn.addEventListener('click', async () => {
          if (abortCtrl) {
            abortCtrl.abort();
            return;
          }
          store.stopPlay();
          abortCtrl = new AbortController();
          renderBtn.textContent = 'Cancel Render';
          progBox.classList.remove('hidden');

          const scale = Number(body.querySelector<HTMLSelectElement>('[data-exp-scale]')!.value);
          const bitrate = Number(body.querySelector<HTMLSelectElement>('[data-exp-bitrate]')!.value);

          try {
            const res = await exportCompositionVideo(comp, {
              resolutionScale: scale,
              bitrateMbps: bitrate,
              allCompositions: allComps,
              signal: abortCtrl.signal,
              onProgress: (p, frame, total) => {
                fillEl.style.width = `${Math.round(p * 100)}%`;
                statusEl.textContent = `Rendering frame ${frame} / ${total} (${Math.round(p * 100)}%)`;
              },
            });
            statusEl.textContent = `Готово: ${res.fileName} (${(res.sizeBytes / 1024).toFixed(0)} KB)`;
          } catch (err) {
            statusEl.textContent = err instanceof Error ? err.message : 'Ошибка рендера';
          } finally {
            abortCtrl = null;
            renderBtn.textContent = 'Render Video';
          }
        });

        body.querySelector('[data-exp-png]')?.addEventListener('click', () => {
          void exportFramePng(comp, store.getState().currentTime, 1, allComps);
        });
        body.querySelector('[data-exp-proj]')?.addEventListener('click', () => {
          void exportProjectFile(store.getState().project);
        });
      }
    );
  }
}
