import { stopAllAudio, syncAudioPlayback } from '../core/audio';
import { createComposition, createEffect, createLayer, kf, prop, uid } from '../core/factories';
import { HistoryStack } from '../core/history';
import { detectInitialLocale, getDict, type Locale, saveLocale, type TranslationDict } from '../core/i18n';
import { evaluateKeyframes, evaluateProp } from '../core/interpolation';
import { createNeonIntroProject } from '../core/presets';
import type {
  ActiveTab,
  AnimatableProp,
  BezierHandles,
  Composition,
  EasingType,
  EffectType,
  Keyframe,
  Layer,
  LayerMask,
  LayerType,
  StudioProject,
  TransformPropKey,
} from '../core/types';

const STORAGE_KEY = 'studioeffect_su_project_v1';

export interface SelectedKeyframeRef {
  layerId: string;
  propKey: TransformPropKey;
  kfId: string;
}

export type TextAnimPreset = 'typewriter' | 'popIn' | 'slideUp' | 'neonPulse';

export interface StoreState {
  project: StudioProject;
  selectedLayerId: string | null;
  selectedPropKey: TransformPropKey;
  selectedKeyframe: SelectedKeyframeRef | null;
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
  previewQuality: 0.5 | 0.75 | 1;
  showSafeMargins: boolean;
  showGizmo: boolean;
  transparentGrid: boolean;
  activeTab: ActiveTab;
  timelineZoom: number; // px per second
  viewportZoom: number;
  viewportPanX: number;
  viewportPanY: number;
  locale: Locale;
}

type Listener = () => void;

class StudioStore {
  private state: StoreState;
  private history = new HistoryStack<StudioProject>(40);
  private listeners = new Set<Listener>();
  private timeListeners = new Set<Listener>();
  private rafId: number | null = null;
  private lastTick = 0;

  constructor() {
    const project = this.loadFromStorage() ?? createNeonIntroProject();
    const activeComp =
      project.compositions.find((c) => c.id === project.activeCompId) ?? project.compositions[0];
    this.state = {
      project,
      selectedLayerId: activeComp?.layers[1]?.id ?? activeComp?.layers[0]?.id ?? null,
      selectedPropKey: 'x',
      selectedKeyframe: null,
      currentTime: 0.65,
      isPlaying: false,
      loop: true,
      previewQuality: 0.5,
      showSafeMargins: false,
      showGizmo: true,
      transparentGrid: false,
      activeTab: 'timeline',
      timelineZoom: 90,
      viewportZoom: 1,
      viewportPanX: 0,
      viewportPanY: 0,
      locale: detectInitialLocale(),
    };
    if (typeof document !== 'undefined') {
      document.documentElement.lang = this.state.locale;
    }
  }

  private loadFromStorage(): StudioProject | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StudioProject;
      if (
        parsed?.app === 'StudioEffect(SU)' &&
        Array.isArray(parsed.compositions) &&
        parsed.compositions.length > 0
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.project));
    } catch {
      // Ignore quota exceeded
    }
  }

  getState(): StoreState {
    return this.state;
  }

  getLocale(): Locale {
    return this.state.locale;
  }

  t(): TranslationDict {
    return getDict(this.state.locale);
  }

  setLocale(locale: Locale): void {
    this.state.locale = locale;
    saveLocale(locale);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    this.emit();
  }

  toggleLocale(): void {
    this.setLocale(this.state.locale === 'ru' ? 'en' : 'ru');
  }

  getActiveComp(): Composition {
    const { project } = this.state;
    return (
      project.compositions.find((c) => c.id === project.activeCompId) ?? project.compositions[0]
    );
  }

  getSelectedLayer(): Layer | null {
    const comp = this.getActiveComp();
    if (!this.state.selectedLayerId) return null;
    return comp.layers.find((l) => l.id === this.state.selectedLayerId) ?? null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeTime(fn: Listener): () => void {
    this.timeListeners.add(fn);
    return () => this.timeListeners.delete(fn);
  }

  private emit(): void {
    this.saveToStorage();
    for (const fn of this.listeners) fn();
  }

  private emitTime(): void {
    for (const fn of this.timeListeners) fn();
  }

  snapshotForUndo(): void {
    this.history.push(this.state.project);
  }

  canUndo(): boolean {
    return this.history.canUndo();
  }

  canRedo(): boolean {
    return this.history.canRedo();
  }

  undo(): void {
    const prev = this.history.undo(this.state.project);
    if (!prev) return;
    this.state.project = prev;
    const comp = this.getActiveComp();
    if (!comp.layers.some((l) => l.id === this.state.selectedLayerId)) {
      this.state.selectedLayerId = comp.layers[0]?.id ?? null;
    }
    this.state.selectedKeyframe = null;
    this.emit();
  }

  redo(): void {
    const next = this.history.redo(this.state.project);
    if (!next) return;
    this.state.project = next;
    const comp = this.getActiveComp();
    if (!comp.layers.some((l) => l.id === this.state.selectedLayerId)) {
      this.state.selectedLayerId = comp.layers[0]?.id ?? null;
    }
    this.state.selectedKeyframe = null;
    this.emit();
  }

  setActiveTab(tab: ActiveTab): void {
    this.state.activeTab = tab;
    this.emit();
  }

  setPreviewQuality(q: 0.5 | 0.75 | 1): void {
    this.state.previewQuality = q;
    this.emit();
  }

  toggleSafeMargins(): void {
    this.state.showSafeMargins = !this.state.showSafeMargins;
    this.emit();
  }

  toggleGizmo(): void {
    this.state.showGizmo = !this.state.showGizmo;
    this.emit();
  }

  toggleTransparentGrid(): void {
    this.state.transparentGrid = !this.state.transparentGrid;
    this.emit();
  }

  setTimelineZoom(pxPerSec: number): void {
    this.state.timelineZoom = Math.min(260, Math.max(40, pxPerSec));
    this.emit();
  }

  setViewportTransform(zoom: number, panX = this.state.viewportPanX, panY = this.state.viewportPanY): void {
    this.state.viewportZoom = Math.min(3, Math.max(0.4, zoom));
    this.state.viewportPanX = panX;
    this.state.viewportPanY = panY;
    this.emit();
  }

  resetViewport(): void {
    this.state.viewportZoom = 1;
    this.state.viewportPanX = 0;
    this.state.viewportPanY = 0;
    this.emit();
  }

  selectLayer(layerId: string | null): void {
    this.state.selectedLayerId = layerId;
    this.state.selectedKeyframe = null;
    this.emit();
  }

  selectProp(propKey: TransformPropKey): void {
    this.state.selectedPropKey = propKey;
    this.emit();
  }

  selectKeyframe(ref: SelectedKeyframeRef | null): void {
    this.state.selectedKeyframe = ref;
    if (ref) {
      this.state.selectedLayerId = ref.layerId;
      this.state.selectedPropKey = ref.propKey;
    }
    this.emit();
  }

  setTime(seconds: number): void {
    const comp = this.getActiveComp();
    const clamped = Math.max(0, Math.min(comp.duration, seconds));
    this.state.currentTime = clamped;
    syncAudioPlayback(comp, clamped, this.state.isPlaying);
    this.emitTime();
  }

  stepFrame(deltaFrames: number): void {
    const comp = this.getActiveComp();
    const step = 1 / comp.fps;
    this.setTime(this.state.currentTime + deltaFrames * step);
  }

  togglePlay(): void {
    if (this.state.isPlaying) {
      this.stopPlay();
    } else {
      this.startPlay();
    }
  }

  startPlay(): void {
    if (this.state.isPlaying) return;
    const comp = this.getActiveComp();
    if (this.state.currentTime >= comp.duration - 0.001) {
      this.state.currentTime = 0;
    }
    this.state.isPlaying = true;
    this.lastTick = performance.now();
    syncAudioPlayback(comp, this.state.currentTime, true);
    this.emit();

    const loop = (now: number) => {
      if (!this.state.isPlaying) return;
      const dt = Math.min(0.1, (now - this.lastTick) / 1000);
      this.lastTick = now;
      const c = this.getActiveComp();
      let next = this.state.currentTime + dt;
      if (next >= c.duration) {
        if (this.state.loop) {
          next = 0;
        } else {
          this.state.currentTime = c.duration;
          this.state.isPlaying = false;
          stopAllAudio();
          this.emitTime();
          this.emit();
          return;
        }
      }
      this.state.currentTime = next;
      syncAudioPlayback(c, next, true);
      this.emitTime();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stopPlay(): void {
    if (!this.state.isPlaying) return;
    this.state.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    stopAllAudio();
    this.emit();
  }

  loadProject(project: StudioProject): void {
    this.stopPlay();
    this.snapshotForUndo();
    this.state.project = structuredClone(project);
    const comp = this.getActiveComp();
    this.state.selectedLayerId = comp.layers[0]?.id ?? null;
    this.state.selectedKeyframe = null;
    this.state.currentTime = 0;
    this.emit();
  }

  switchComposition(compId: string): void {
    if (!this.state.project.compositions.some((c) => c.id === compId)) return;
    this.stopPlay();
    this.state.project.activeCompId = compId;
    const comp = this.getActiveComp();
    this.state.selectedLayerId = comp.layers[0]?.id ?? null;
    this.state.selectedKeyframe = null;
    this.state.currentTime = 0;
    this.emit();
  }

  addComposition(name: string, width = 1080, height = 1920, fps = 30, duration = 5): Composition {
    this.stopPlay();
    this.snapshotForUndo();
    const comp = createComposition(name, width, height, fps, duration);
    this.state.project.compositions.push(comp);
    this.state.project.activeCompId = comp.id;
    this.state.selectedLayerId = null;
    this.state.selectedKeyframe = null;
    this.state.currentTime = 0;
    this.emit();
    return comp;
  }

  precomposeLayer(layerId: string): void {
    const comp = this.getActiveComp();
    const idx = comp.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    const src = comp.layers[idx];
    if (src.type === 'audio' || src.type === 'adjustment') return;

    this.snapshotForUndo();
    const subComp = createComposition(
      `${src.name} Comp`,
      comp.width,
      comp.height,
      comp.fps,
      comp.duration
    );
    const innerLayer = structuredClone(src);
    innerLayer.parentId = null;
    subComp.layers = [innerLayer];
    this.state.project.compositions.push(subComp);

    const precompLayer = createLayer('precomp', comp, `[Pre] ${src.name}`);
    precompLayer.precompData = { compId: subComp.id };
    precompLayer.inPoint = src.inPoint;
    precompLayer.outPoint = src.outPoint;
    precompLayer.parentId = src.parentId;
    comp.layers.splice(idx, 1, precompLayer);
    this.state.selectedLayerId = precompLayer.id;
    this.emit();
  }

  updateComposition(
    patch: Partial<Pick<Composition, 'name' | 'width' | 'height' | 'fps' | 'duration' | 'backgroundColor'>>
  ): void {
    this.snapshotForUndo();
    const comp = this.getActiveComp();
    Object.assign(comp, patch);
    if (this.state.currentTime > comp.duration) {
      this.state.currentTime = comp.duration;
    }
    this.emit();
  }

  addLayer(type: LayerType, customName?: string, initializer?: (layer: Layer) => void): Layer {
    this.snapshotForUndo();
    const comp = this.getActiveComp();
    const layer = createLayer(type, comp, customName);
    if (initializer) initializer(layer);
    comp.layers.unshift(layer);
    this.state.selectedLayerId = layer.id;
    this.emit();
    return layer;
  }

  deleteLayer(layerId: string): void {
    const comp = this.getActiveComp();
    const idx = comp.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    this.snapshotForUndo();
    comp.layers.splice(idx, 1);
    for (const l of comp.layers) {
      if (l.parentId === layerId) l.parentId = null;
    }
    if (this.state.selectedLayerId === layerId) {
      this.state.selectedLayerId = comp.layers[Math.min(idx, comp.layers.length - 1)]?.id ?? null;
    }
    this.emit();
  }

  duplicateLayer(layerId: string): void {
    const comp = this.getActiveComp();
    const srcIdx = comp.layers.findIndex((l) => l.id === layerId);
    if (srcIdx < 0) return;
    this.snapshotForUndo();
    const copy = structuredClone(comp.layers[srcIdx]);
    copy.id = uid('layer');
    copy.name = `${copy.name} Copy`;
    for (const key of Object.keys(copy.transform) as TransformPropKey[]) {
      const p = copy.transform[key];
      if (!p) continue;
      p.keyframes = p.keyframes.map((k) => ({
        ...k,
        id: uid('kf'),
      }));
    }
    for (const fx of copy.effects) {
      fx.id = uid('fx');
    }
    comp.layers.splice(srcIdx, 0, copy);
    this.state.selectedLayerId = copy.id;
    this.emit();
  }

  moveLayerOrder(layerId: string, delta: -1 | 1): void {
    const comp = this.getActiveComp();
    const idx = comp.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= comp.layers.length) return;
    this.snapshotForUndo();
    const [removed] = comp.layers.splice(idx, 1);
    comp.layers.splice(target, 0, removed);
    this.emit();
  }

  updateLayer(layerId: string, updater: (layer: Layer) => void, skipUndo = false): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    if (!skipUndo) this.snapshotForUndo();
    updater(layer);
    this.emit();
  }

  toggle3D(layerId: string): void {
    this.updateLayer(layerId, (l) => {
      l.is3D = !l.is3D;
      if (!l.transform.z) l.transform.z = prop(0);
      if (!l.transform.rotateX) l.transform.rotateX = prop(0);
      if (!l.transform.rotateY) l.transform.rotateY = prop(0);
    });
  }

  splitLayerAtCurrentTime(layerId: string): void {
    const comp = this.getActiveComp();
    const idx = comp.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;
    const src = comp.layers[idx];
    const t = Number(this.state.currentTime.toFixed(2));
    if (t <= src.inPoint + 0.05 || t >= src.outPoint - 0.05) return;

    this.snapshotForUndo();
    const tail = structuredClone(src);
    tail.id = uid('layer');
    tail.name = `${src.name} [2]`;
    tail.inPoint = t;
    tail.startTime = src.startTime + (t - src.inPoint) * (src.speed ?? 1);
    for (const key of Object.keys(tail.transform) as TransformPropKey[]) {
      const p = tail.transform[key];
      if (!p) continue;
      p.keyframes = p.keyframes.map((k) => ({ ...k, id: uid('kf') }));
    }
    for (const fx of tail.effects) {
      fx.id = uid('fx');
    }

    src.outPoint = t;
    comp.layers.splice(idx, 0, tail);
    this.state.selectedLayerId = tail.id;
    this.emit();
  }

  addMarkerAtCurrentTime(label?: string): void {
    const comp = this.getActiveComp();
    this.snapshotForUndo();
    if (!comp.markers) comp.markers = [];
    const t = Number(this.state.currentTime.toFixed(2));
    const idx = comp.markers.length + 1;
    comp.markers.push({
      id: uid('mk'),
      time: t,
      label: label?.trim() || `M${idx}`,
      color: '#22d3ee',
    });
    comp.markers.sort((a, b) => a.time - b.time);
    this.emit();
  }

  deleteMarker(markerId: string): void {
    const comp = this.getActiveComp();
    if (!comp.markers) return;
    this.snapshotForUndo();
    comp.markers = comp.markers.filter((m) => m.id !== markerId);
    this.emit();
  }

  centerAnchorPoint(layerId: string): void {
    this.updateLayer(layerId, (l) => {
      l.transform.anchorX.keyframes = [];
      l.transform.anchorY.keyframes = [];
      l.transform.anchorX.value = 0;
      l.transform.anchorY.value = 0;
    });
  }

  toggleMask(layerId: string): void {
    const comp = this.getActiveComp();
    this.updateLayer(layerId, (l) => {
      if (!l.mask) {
        l.mask = {
          enabled: true,
          shape: 'rect',
          x: 0,
          y: 0,
          width: Math.round(comp.width * 0.45),
          height: Math.round(comp.height * 0.3),
          feather: 12,
          inverted: false,
          opacity: 100,
        };
      } else {
        l.mask.enabled = !l.mask.enabled;
      }
    });
  }

  updateMask(layerId: string, patch: Partial<LayerMask>, skipUndo = false): void {
    this.updateLayer(
      layerId,
      (l) => {
        if (!l.mask) return;
        Object.assign(l.mask, patch);
      },
      skipUndo
    );
  }

  applyTextPreset(layerId: string, preset: TextAnimPreset): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer || layer.type !== 'text') return;
    this.snapshotForUndo();
    const t0 = Number(this.state.currentTime.toFixed(2));
    const baseY = this.getEvaluatedProp(layer, 'y');

    if (preset === 'typewriter') {
      layer.textReveal = prop(100, [kf(t0, 0, 'linear'), kf(Math.min(comp.duration, t0 + 1.1), 100, 'linear')]);
    } else if (preset === 'popIn') {
      layer.transform.scaleX = prop(100, [
        kf(t0, 15, 'easyEase'),
        kf(Math.min(comp.duration, t0 + 0.35), 115, 'easyEase'),
        kf(Math.min(comp.duration, t0 + 0.55), 100, 'easyEase'),
      ]);
      layer.transform.scaleY = prop(100, [
        kf(t0, 15, 'easyEase'),
        kf(Math.min(comp.duration, t0 + 0.35), 115, 'easyEase'),
        kf(Math.min(comp.duration, t0 + 0.55), 100, 'easyEase'),
      ]);
      layer.transform.opacity = prop(100, [kf(t0, 0, 'easeOut'), kf(Math.min(comp.duration, t0 + 0.25), 100, 'linear')]);
    } else if (preset === 'slideUp') {
      layer.transform.y = prop(baseY, [kf(t0, baseY + 140, 'easyEase'), kf(Math.min(comp.duration, t0 + 0.7), baseY, 'easyEase')]);
      layer.transform.opacity = prop(100, [kf(t0, 0, 'easeOut'), kf(Math.min(comp.duration, t0 + 0.45), 100, 'linear')]);
    } else if (preset === 'neonPulse') {
      if (!layer.effects.some((e) => e.type === 'glow')) {
        layer.effects.push(createEffect('glow'));
      }
      layer.transform.scaleX = prop(100, [], '100 + Math.sin(time * 5) * 6');
      layer.transform.scaleY = prop(100, [], '100 + Math.sin(time * 5) * 6');
    }
    this.emit();
  }

  generateAudioKeyframes(
    audioLayerId: string,
    targetLayerId: string,
    propKey: TransformPropKey,
    baseValue: number,
    multiplier: number
  ): number {
    const comp = this.getActiveComp();
    const audioLayer = comp.layers.find((l) => l.id === audioLayerId && l.type === 'audio');
    const targetLayer = comp.layers.find((l) => l.id === targetLayerId);
    if (!audioLayer?.audioData || !targetLayer) return 0;

    this.snapshotForUndo();
    const env = audioLayer.audioData.envelope;
    const stepIdx = Math.max(1, Math.round(30 / Math.min(15, comp.fps)));
    const newKfs: Keyframe[] = [];
    for (let i = 0; i < env.length; i += stepIdx) {
      const t = audioLayer.inPoint + i / 30;
      if (t > audioLayer.outPoint || t > comp.duration) break;
      const val = Number((baseValue + (env[i] / 100) * multiplier).toFixed(1));
      newKfs.push(kf(Number(t.toFixed(3)), val, 'linear'));
    }
    this.ensureTransformProp(targetLayer, propKey).keyframes = newKfs;
    targetLayer.expanded = true;
    this.state.selectedLayerId = targetLayer.id;
    this.state.selectedPropKey = propKey;
    this.emit();
    return newKfs.length;
  }

  private ensureTransformProp(layer: Layer, propKey: TransformPropKey): AnimatableProp {
    if (!layer.transform[propKey]) {
      layer.transform[propKey] = prop(0);
    }
    return layer.transform[propKey]!;
  }

  getEvaluatedProp(layer: Layer, propKey: TransformPropKey): number {
    const comp = this.getActiveComp();
    const idx = comp.layers.findIndex((l) => l.id === layer.id);
    const p = layer.transform[propKey] ?? prop(0);
    return evaluateProp(
      p,
      this.state.currentTime,
      Math.max(0, idx),
      comp,
      `${layer.id}:${propKey}`
    );
  }

  setTransformValue(
    layerId: string,
    propKey: TransformPropKey,
    value: number,
    options: { skipUndo?: boolean } = {}
  ): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) return;
    if (!options.skipUndo) this.snapshotForUndo();

    const p = this.ensureTransformProp(layer, propKey);
    const t = this.state.currentTime;
    const snapTol = 0.5 / comp.fps;

    if (p.keyframes.length > 0) {
      const existing = p.keyframes.find((k) => Math.abs(k.time - t) <= snapTol);
      if (existing) {
        existing.value = value;
      } else {
        const newKf = kf(Number(t.toFixed(3)), value, 'easyEase');
        p.keyframes.push(newKf);
        p.keyframes.sort((a, b) => a.time - b.time);
        this.state.selectedKeyframe = { layerId, propKey, kfId: newKf.id };
      }
    } else {
      p.value = value;
    }

    this.emit();
  }

  toggleStopwatch(layerId: string, propKey: TransformPropKey): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.snapshotForUndo();

    const p = this.ensureTransformProp(layer, propKey);
    if (p.keyframes.length > 0) {
      p.value = evaluateKeyframes(p, this.state.currentTime);
      p.keyframes = [];
      if (
        this.state.selectedKeyframe?.layerId === layerId &&
        this.state.selectedKeyframe?.propKey === propKey
      ) {
        this.state.selectedKeyframe = null;
      }
    } else {
      const val = evaluateKeyframes(p, this.state.currentTime);
      const created = kf(Number(this.state.currentTime.toFixed(3)), val, 'easyEase');
      p.keyframes = [created];
      this.state.selectedKeyframe = { layerId, propKey, kfId: created.id };
    }
    this.state.selectedPropKey = propKey;
    this.emit();
  }

  toggleKeyframeAtCurrentTime(layerId: string, propKey: TransformPropKey): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.snapshotForUndo();

    const p = this.ensureTransformProp(layer, propKey);
    const t = this.state.currentTime;
    const snapTol = 0.5 / comp.fps;
    const idx = p.keyframes.findIndex((k) => Math.abs(k.time - t) <= snapTol);

    if (idx >= 0) {
      const removed = p.keyframes.splice(idx, 1)[0];
      if (this.state.selectedKeyframe?.kfId === removed.id) {
        this.state.selectedKeyframe = null;
      }
    } else {
      const val = evaluateKeyframes(p, t);
      const created = kf(Number(t.toFixed(3)), val, 'easyEase');
      p.keyframes.push(created);
      p.keyframes.sort((a, b) => a.time - b.time);
      this.state.selectedKeyframe = { layerId, propKey, kfId: created.id };
    }
    this.state.selectedPropKey = propKey;
    this.emit();
  }

  deleteKeyframe(layerId: string, propKey: TransformPropKey, kfId: string): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.snapshotForUndo();
    const p = this.ensureTransformProp(layer, propKey);
    p.keyframes = p.keyframes.filter((k) => k.id !== kfId);
    if (this.state.selectedKeyframe?.kfId === kfId) {
      this.state.selectedKeyframe = null;
    }
    this.emit();
  }

  updateKeyframeEasing(
    layerId: string,
    propKey: TransformPropKey,
    kfId: string,
    easing: EasingType,
    bezier?: BezierHandles,
    skipUndo = false
  ): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const keyframe = this.ensureTransformProp(layer, propKey).keyframes.find((k) => k.id === kfId);
    if (!keyframe) return;
    if (!skipUndo) this.snapshotForUndo();
    keyframe.easing = easing;
    if (bezier) keyframe.bezier = bezier;
    this.emit();
  }

  setExpression(layerId: string, propKey: TransformPropKey, expression: string): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.snapshotForUndo();
    this.ensureTransformProp(layer, propKey).expression = expression.trim() || undefined;
    this.emit();
  }

  addEffectToLayer(layerId: string, type: EffectType): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.snapshotForUndo();
    layer.effects.push(createEffect(type));
    this.emit();
  }

  removeEffectFromLayer(layerId: string, fxId: string): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    this.snapshotForUndo();
    layer.effects = layer.effects.filter((fx) => fx.id !== fxId);
    this.emit();
  }

  moveEffect(layerId: string, fxId: string, delta: -1 | 1): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const idx = layer.effects.findIndex((fx) => fx.id === fxId);
    if (idx < 0) return;
    const target = idx + delta;
    if (target < 0 || target >= layer.effects.length) return;
    this.snapshotForUndo();
    const [removed] = layer.effects.splice(idx, 1);
    layer.effects.splice(target, 0, removed);
    this.emit();
  }

  toggleEffectEnabled(layerId: string, fxId: string): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    const fx = layer?.effects.find((e) => e.id === fxId);
    if (!fx) return;
    this.snapshotForUndo();
    fx.enabled = !fx.enabled;
    this.emit();
  }

  setEffectParam(
    layerId: string,
    fxId: string,
    paramKey: string,
    value: number,
    skipUndo = false
  ): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    const fx = layer?.effects.find((e) => e.id === fxId);
    if (!fx || !fx.params[paramKey]) return;
    if (!skipUndo) this.snapshotForUndo();

    const p: AnimatableProp = fx.params[paramKey];
    const t = this.state.currentTime;
    const snapTol = 0.5 / comp.fps;

    if (p.keyframes.length > 0) {
      const existing = p.keyframes.find((k) => Math.abs(k.time - t) <= snapTol);
      if (existing) existing.value = value;
      else {
        p.keyframes.push(kf(Number(t.toFixed(3)), value, 'easyEase'));
        p.keyframes.sort((a, b) => a.time - b.time);
      }
    } else {
      p.value = value;
    }

    this.emit();
  }

  toggleEffectParamStopwatch(layerId: string, fxId: string, paramKey: string): void {
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === layerId);
    const fx = layer?.effects.find((e) => e.id === fxId);
    const p = fx?.params[paramKey];
    if (!p) return;
    this.snapshotForUndo();
    if (p.keyframes.length > 0) {
      p.value = evaluateKeyframes(p, this.state.currentTime);
      p.keyframes = [];
    } else {
      p.keyframes = [
        kf(Number(this.state.currentTime.toFixed(3)), evaluateKeyframes(p, this.state.currentTime), 'easyEase'),
      ];
    }
    this.emit();
  }

  getSelectedKeyframeObj(): Keyframe | null {
    const ref = this.state.selectedKeyframe;
    if (!ref) return null;
    const comp = this.getActiveComp();
    const layer = comp.layers.find((l) => l.id === ref.layerId);
    if (!layer) return null;
    return layer.transform[ref.propKey]?.keyframes.find((k) => k.id === ref.kfId) ?? null;
  }
}

export const store = new StudioStore();
