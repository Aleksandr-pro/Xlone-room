import type { EffectType, ShapeKind } from './types';

export type Locale = 'ru' | 'en';

const LOCALE_STORAGE_KEY = 'studioeffect_su_locale';

export function detectInitialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  }
  return 'ru';
}

export function saveLocale(locale: Locale): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore storage quota errors
    }
  }
}

export interface TranslationDict {
  // Topbar & Tabs
  hubTooltip: string;
  undo: string;
  redo: string;
  presetsTooltip: string;
  compSettingsTooltip: string;
  exportBtn: string;
  langTooltip: string;
  tabTimeline: string;
  tabInspector: string;
  tabEffects: string;
  tabGraph: string;

  // Viewport & Transport
  vpZoomTitle: string;
  toStart: string;
  prevFrame: string;
  playPause: string;
  nextFrame: string;
  loop: string;
  previewRes: string;
  qualityFull: string;
  safeMargins: string;
  transformGizmo: string;
  transparencyGrid: string;

  // Timeline
  addLayerBtn: string;
  splitBtn: string;
  splitTitle: string;
  addMarkerBtn: string;
  addMarkerTitle: string;
  zoomLabel: string;
  prevKfTitle: string;
  nextKfTitle: string;
  layersHeader: (count: number) => string;
  noLayersHint: string;
  expandTransform: string;
  maskActiveTitle: string;
  matteActiveTitle: string;
  activeFxTitle: string;
  layer3dTitle: string;
  visibilityTitle: string;
  soloTitle: string;
  lockTitle: string;
  toggleKfTitle: string;
  addRemoveKfTitle: string;
  markerTooltip: (label: string, time: number) => string;

  // Transform properties
  propNames: Record<
    'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity' | 'anchorX' | 'anchorY' | 'z' | 'rotateX' | 'rotateY',
    string
  >;

  // Inspector
  selectLayerHint: string;
  moveLayerUp: string;
  moveLayerDown: string;
  duplicate: string;
  delete: string;
  blendMode: string;
  parentLink: string;
  none: string;
  trackMatte: string;
  noLayerAbove: string;
  alphaMatte: string;
  alphaInverted: string;
  layerActions: string;
  splitShort: string;
  centerAnchor: string;
  preComp: string;
  timeSpeed: string;
  transformTitle: string;
  expressionsTitle: string;
  exprInactive: string;
  exprPlaceholder: string;
  exprClear: string;

  // Text section
  textPropsTitle: string;
  presetTypewriter: string;
  presetPopIn: string;
  presetSlideUp: string;
  presetNeonPulse: string;
  sizePx: string;
  weight: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: string;
  revealPct: string;

  // Shape section
  shapePropsTitle: string;
  shapeLabel: string;
  shapeKinds: Record<ShapeKind, string>;
  pointsSides: string;
  width: string;
  height: string;
  fillOpacityPct: string;

  // Solid section
  solidTitle: string;
  color1: string;
  color2: string;
  gradient: string;
  angleDeg: string;
  on: string;
  off: string;

  // Audio section
  audioTitle: string;
  fileLabel: string;
  volumeLabel: string;
  convertAudioTitle: string;
  targetLayer: string;
  propertyLabel: string;
  beatScaleX: string;
  beatScaleY: string;
  beatRotation: string;
  beatOpacity: string;
  generateBeatKfs: string;
  audioExprTip: string;

  // Precomp section
  precompTitle: string;
  sourceLabel: string;
  unknown: string;
  openPrecompBtn: string;

  // Mask section
  layerMaskTitle: string;
  maskOn: string;
  maskAddEnable: string;
  maskRect: string;
  maskEllipse: string;
  invertedLabel: string;
  invertedYes: string;
  invertedNo: string;
  widthPx: string;
  heightPx: string;
  featherPx: string;
  opacityPct: string;

  // Effects panel
  selectLayerFxHint: string;
  moveFxUp: string;
  moveFxDown: string;
  removeFx: string;
  noEffectsHint: (layerName: string) => string;
  activeEffectsStack: (layerName: string) => string;
  effectsLibrary: (count: number) => string;
  keyframeTooltip: string;

  // Graph editor
  graphEmptySelect: string;
  graphNoKfs: (propKey: string) => string;
  easingLinear: string;
  easingEasyEase: string;
  easingEaseIn: string;
  easingEaseOut: string;
  easingHold: string;
  deleteKf: string;
  easingLabel: string;

  // Modals
  modalNewLayer: string;
  layerTextName: string;
  layerTextDesc: string;
  layerShapeName: string;
  layerShapeDesc: string;
  layerSolidName: string;
  layerSolidDesc: string;
  layerAdjName: string;
  layerAdjDesc: string;
  layerNullName: string;
  layerNullDesc: string;
  layerMediaName: string;
  layerMediaDesc: string;
  layerAudioName: string;
  layerAudioDesc: string;
  layerSynthName: string;
  layerSynthDesc: string;

  modalCompSettings: string;
  dimReels: string;
  dimHD: string;
  dimSquare: string;
  compName: string;
  fpsLabel: string;
  durationSec: string;
  bgColor: string;
  applySettings: string;

  modalProjectsTitle: string;
  compsInProject: string;
  newCompBtn: string;
  demoTemplates: string;
  newBlankProject: string;
  importSuep: string;
  saveSuep: string;
  invalidSuepAlert: string;
  blankCompName: string;
  untitledProject: string;

  modalHubTitle: string;
  hubTagline: string;
  hubCardTitle: string;
  hubCardSize: string;
  hubCardFeatures: string;
  hubTipsTitle: string;
  hubTip3d: string;
  hubTipSplit: string;
  hubTipMarker: string;
  hubDownloadApk: string;
  hubGithub: string;

  modalExportTitle: string;
  exportResolution: string;
  exportHalf: string;
  exportFull: string;
  exportBitrate: string;
  exportBitrateLight: string;
  exportBitrateHigh: string;
  exportBitrateMaster: string;
  exportPreparing: string;
  exportRenderVideo: string;
  exportCancelRender: string;
  exportSavePng: string;
  exportSaveProj: string;
  exportAndroidNote: string;
  exportRenderingFrame: (frame: number, total: number, pct: number) => string;
  exportDone: (fileName: string, kb: string) => string;
  exportError: string;

  // CapCut-style Mobile Dock & View Menu
  dockAdd: string;
  dockEdit: string;
  dockFx: string;
  dockGraph: string;
  dockSplit: string;
  dockKeyframe: string;
  dock3D: string;
  dockMask: string;
  dockExpr: string;
  dockMarker: string;
  dockDup: string;
  dockDel: string;
  backToTimeline: string;
  viewOptionsBtn: string;
  toggleAePanelTitle: string;
  keyframeBtnLabel: string;
  doneBtn: string;
}

const RU: TranslationDict = {
  hubTooltip: 'Xlone-room • О приложении и APK',
  undo: 'Отменить',
  redo: 'Повторить',
  presetsTooltip: 'Проекты и шаблоны',
  compSettingsTooltip: 'Настройки композиции',
  exportBtn: 'Экспорт',
  langTooltip: 'Переключить язык (RU / EN)',
  tabTimeline: 'Таймлайн',
  tabInspector: 'Инспектор',
  tabEffects: 'Эффекты',
  tabGraph: 'График',

  vpZoomTitle: 'Масштаб вьюпорта',
  toStart: 'В начало',
  prevFrame: 'Пред. кадр',
  playPause: 'Пуск / Пауза',
  nextFrame: 'След. кадр',
  loop: 'Зациклить',
  previewRes: 'Качество предпросмотра',
  qualityFull: 'Полн.',
  safeMargins: 'Безопасные поля',
  transformGizmo: 'Гизмо трансформации',
  transparencyGrid: 'Сетка прозрачности',

  addLayerBtn: '+ Слой',
  splitBtn: 'Разрез',
  splitTitle: 'Разрезать выбранный слой по бегунку',
  addMarkerBtn: '+ Метка',
  addMarkerTitle: 'Добавить маркер на таймлайн',
  zoomLabel: 'Зум',
  prevKfTitle: 'Пред. ключевой кадр',
  nextKfTitle: 'След. ключевой кадр',
  layersHeader: (count) => `Слои (${count})`,
  noLayersHint: 'Нет слоёв. Нажмите + Слой',
  expandTransform: 'Раскрыть параметры',
  maskActiveTitle: 'Маска активна',
  matteActiveTitle: 'Track Matte активен',
  activeFxTitle: 'Активные эффекты',
  layer3dTitle: '3D-слой (X/Y/Z)',
  visibilityTitle: 'Видимость',
  soloTitle: 'Соло',
  lockTitle: 'Блокировка',
  toggleKfTitle: 'Вкл/выкл анимацию ключами',
  addRemoveKfTitle: 'Добавить / удалить ключ',
  markerTooltip: (label, time) => `${label} (${time}с) — двойной тап для удаления`,

  propNames: {
    x: 'Позиция X',
    y: 'Позиция Y',
    scaleX: 'Масштаб X',
    scaleY: 'Масштаб Y',
    rotation: 'Поворот',
    opacity: 'Непрозрачность',
    anchorX: 'Опорная X',
    anchorY: 'Опорная Y',
    z: 'Глубина Z (3D)',
    rotateX: 'Поворот X (3D)',
    rotateY: 'Поворот Y (3D)',
  },

  selectLayerHint: 'Выберите слой в таймлайне или нажмите на него на холсте.',
  moveLayerUp: 'Поднять слой выше',
  moveLayerDown: 'Опустить слой ниже',
  duplicate: 'Дублировать',
  delete: 'Удалить',
  blendMode: 'Режим наложения',
  parentLink: 'Привязка (Parent)',
  none: 'Нет',
  trackMatte: 'Подложка (Matte)',
  noLayerAbove: 'Нет слоя выше',
  alphaMatte: 'Alpha Matte',
  alphaInverted: 'Alpha Inverted',
  layerActions: 'Действия со слоем',
  splitShort: 'Разрезать',
  centerAnchor: 'Центр опоры',
  preComp: 'Pre-Comp',
  timeSpeed: 'Скорость (0.25x - 4x)',
  transformTitle: 'Трансформация',
  expressionsTitle: 'Выражения (AE Expressions)',
  exprInactive: 'Не активно',
  exprPlaceholder: 'Напр: wiggle(4, 25) или 100 + audioAmp * 0.5',
  exprClear: 'Очистить',

  textPropsTitle: 'Свойства текста и пресеты',
  presetTypewriter: 'Печат. машинка',
  presetPopIn: 'Появление',
  presetSlideUp: 'Выезд снизу',
  presetNeonPulse: 'Неон-пульс',
  sizePx: 'Размер (px)',
  weight: 'Начертание',
  fillColor: 'Цвет заливки',
  strokeColor: 'Цвет обводки',
  strokeWidth: 'Толщина обводки',
  revealPct: 'Проявление (%)',

  shapePropsTitle: 'Свойства фигуры',
  shapeLabel: 'Фигура',
  shapeKinds: {
    rect: 'Прямоугольник',
    roundedRect: 'Скругл. прямоуг.',
    ellipse: 'Эллипс / Круг',
    star: 'Звезда',
    polygon: 'Многоугольник',
  },
  pointsSides: 'Углы / Лучи',
  width: 'Ширина',
  height: 'Высота',
  fillOpacityPct: 'Прозр. заливки (%)',

  solidTitle: 'Сплошной цвет / Градиент',
  color1: 'Цвет 1',
  color2: 'Цвет 2',
  gradient: 'Градиент',
  angleDeg: 'Угол (°)',
  on: 'ВКЛ',
  off: 'ВЫКЛ',

  audioTitle: 'Аудио и реакция на бит',
  fileLabel: 'Файл',
  volumeLabel: 'Громкость',
  convertAudioTitle: 'Конвертировать аудио в ключи',
  targetLayer: 'Целевой слой',
  propertyLabel: 'Свойство',
  beatScaleX: 'Масштаб X (100 + бит)',
  beatScaleY: 'Масштаб Y (100 + бит)',
  beatRotation: 'Поворот (0 + бит)',
  beatOpacity: 'Непрозрачность (40 + бит)',
  generateBeatKfs: 'Создать ключи по биту',
  audioExprTip: 'Совет: в Expressions доступна переменная <code>audioAmp</code> (напр.: <code>100 + audioAmp * 0.5</code>).',

  precompTitle: 'Вложенная композиция (Pre-Comp)',
  sourceLabel: 'Источник',
  unknown: 'Неизвестно',
  openPrecompBtn: 'Открыть таймлайн Pre-Comp',

  layerMaskTitle: 'Маска слоя',
  maskOn: 'Маска ВКЛ',
  maskAddEnable: '+ Добавить / Вкл маску',
  maskRect: 'Прямоугольник',
  maskEllipse: 'Эллипс',
  invertedLabel: 'Инверсия',
  invertedYes: 'Инвертирована',
  invertedNo: 'Обычная',
  widthPx: 'Ширина (px)',
  heightPx: 'Высота (px)',
  featherPx: 'Растушёвка (px)',
  opacityPct: 'Прозрачность (%)',

  selectLayerFxHint: 'Выберите слой, чтобы добавить или настроить эффекты (FX).',
  moveFxUp: 'Поднять эффект',
  moveFxDown: 'Опустить эффект',
  removeFx: 'Удалить эффект',
  noEffectsHint: (name) => `У слоя «${name}» пока нет эффектов. Выберите ниже!`,
  activeEffectsStack: (name) => `Стек эффектов — ${name}`,
  effectsLibrary: (count) => `Библиотека эффектов (${count})`,
  keyframeTooltip: 'Ключевой кадр',

  graphEmptySelect: 'Выберите слой и ключевой кадр (◆), чтобы редактировать кривую Безье.',
  graphNoKfs: (propKey) =>
    `У свойства <b>${propKey}</b> нет ключевых кадров.<br/>Включите секундомер (⏱) в Таймлайне или Инспекторе, чтобы открыть кривые анимации.`,
  easingLinear: 'Линейный',
  easingEasyEase: 'Плавный (F9)',
  easingEaseIn: 'Ускорение',
  easingEaseOut: 'Замедление',
  easingHold: 'Фиксация (Hold)',
  deleteKf: 'Удалить ключ',
  easingLabel: 'Сглаживание',

  modalNewLayer: 'Новый слой',
  layerTextName: 'Текстовый слой',
  layerTextDesc: 'Анимированный текст и пресеты',
  layerShapeName: 'Фигура (Shape)',
  layerShapeDesc: 'Круги, рамки, звёзды, фигуры',
  layerSolidName: 'Сплошной фон',
  layerSolidDesc: 'Сплошной цвет или градиент',
  layerAdjName: 'Корректирующий слой',
  layerAdjDesc: 'Эффекты ко всем слоям ниже',
  layerNullName: 'Нулевой объект (Null)',
  layerNullDesc: 'Контроллер привязки (Parent)',
  layerMediaName: 'Фото / Видео',
  layerMediaDesc: 'Импорт из галереи телефона',
  layerAudioName: 'Аудиодорожка',
  layerAudioDesc: 'Музыка MP3 / WAV с волной',
  layerSynthName: 'Synth Beat 128 BPM',
  layerSynthDesc: 'Встроенный бит для beat-анимации',

  modalCompSettings: 'Настройки композиции',
  dimReels: '9:16 Reels (1080×1920)',
  dimHD: '16:9 HD (1920×1080)',
  dimSquare: '1:1 Квадрат (1080×1080)',
  compName: 'Название',
  fpsLabel: 'Кадров/сек (FPS)',
  durationSec: 'Длительность (сек)',
  bgColor: 'Цвет фона',
  applySettings: 'Применить настройки',

  modalProjectsTitle: 'Композиции, проекты и шаблоны',
  compsInProject: 'Композиции в проекте',
  newCompBtn: '+ Новая комп.',
  demoTemplates: 'Демо-шаблоны',
  newBlankProject: 'Новый пустой проект',
  importSuep: 'Импорт .suep',
  saveSuep: 'Сохранить .suep',
  invalidSuepAlert: 'Некорректный файл проекта .suep',
  blankCompName: 'Пустая комп. (9:16)',
  untitledProject: 'Новый проект',

  modalHubTitle: 'Xlone-room • StudioEffect(SU) v1.2',
  hubTagline: 'Сверхлёгкие нативные Android-клоны (APK) тяжёлых программ для Windows.',
  hubCardTitle: 'StudioEffect(SU) v1.2 — Клон Adobe After Effects',
  hubCardSize: 'Вес APK: ~75 KB (против ~4.5 GB оригинала — в 60,000+ раз легче!)',
  hubCardFeatures: '3D-слои (X/Y/Z) • Audio/Beat Sync • Маски и Track Matte • Pre-Compose • 20 VFX • Выражения',
  hubTipsTitle: 'Быстрые приёмы на телефоне',
  hubTip3d: '• Тап по <b>3D</b> на слое — включает Поворот X / Поворот Y / Глубину Z',
  hubTipSplit: '• <b>Разрез</b> на таймлайне — разрезает слой по текущему бегунку',
  hubTipMarker: '• <b>+ Метка</b> — добавляет маркер бита (двойной тап удаляет)',
  hubDownloadApk: 'Скачать свежий APK',
  hubGithub: 'GitHub Xlone-room',

  modalExportTitle: 'Рендер и экспорт',
  exportResolution: 'Разрешение',
  exportHalf: 'Половина (Быстро)',
  exportFull: 'Полное (100%)',
  exportBitrate: 'Битрейт',
  exportBitrateLight: '4 Мбит/с (Лёгкий)',
  exportBitrateHigh: '8 Мбит/с (Высокий)',
  exportBitrateMaster: '14 Мбит/с (Мастер)',
  exportPreparing: 'Подготовка рендера...',
  exportRenderVideo: 'Рендер видео',
  exportCancelRender: 'Отменить рендер',
  exportSavePng: 'Сохранить PNG кадр',
  exportSaveProj: 'Сохранить .suep',
  exportAndroidNote: 'В Android APK готовые файлы сохраняются прямо в <b>Downloads/StudioEffectSU</b>.',
  exportRenderingFrame: (frame, total, pct) => `Рендер кадра ${frame} / ${total} (${pct}%)`,
  exportDone: (fileName, kb) => `Готово: ${fileName} (${kb} KB)`,
  exportError: 'Ошибка рендера',

  dockAdd: 'Добавить',
  dockEdit: 'Свойства',
  dockFx: 'Эффекты',
  dockGraph: 'Кривые',
  dockSplit: 'Разрезать',
  dockKeyframe: 'Ключ ◆',
  dock3D: '3D слой',
  dockMask: 'Маска',
  dockExpr: 'Формулы',
  dockMarker: 'Метка',
  dockDup: 'Копия',
  dockDel: 'Удалить',
  backToTimeline: 'Таймлайн',
  viewOptionsBtn: 'Вид',
  toggleAePanelTitle: 'Показать/скрыть панель слоёв AE',
  keyframeBtnLabel: 'Ключ ◆',
  doneBtn: 'Готово',
};

const EN: TranslationDict = {
  hubTooltip: 'Xlone-room Hub & APK Info',
  undo: 'Undo',
  redo: 'Redo',
  presetsTooltip: 'Demo Presets & Projects',
  compSettingsTooltip: 'Composition Settings',
  exportBtn: 'Export',
  langTooltip: 'Switch language (RU / EN)',
  tabTimeline: 'Timeline',
  tabInspector: 'Inspector',
  tabEffects: 'Effects',
  tabGraph: 'Graph',

  vpZoomTitle: 'Viewport Zoom',
  toStart: 'To Start',
  prevFrame: 'Prev Frame',
  playPause: 'Play / Pause',
  nextFrame: 'Next Frame',
  loop: 'Loop',
  previewRes: 'Preview Resolution',
  qualityFull: 'Full',
  safeMargins: 'Safe Margins',
  transformGizmo: 'Transform Gizmo',
  transparencyGrid: 'Transparency Grid',

  addLayerBtn: '+ Layer',
  splitBtn: 'Split',
  splitTitle: 'Split Selected Layer at CTI',
  addMarkerBtn: '+ M',
  addMarkerTitle: 'Add Timeline Marker',
  zoomLabel: 'Zoom',
  prevKfTitle: 'Prev Keyframe',
  nextKfTitle: 'Next Keyframe',
  layersHeader: (count) => `Layers (${count})`,
  noLayersHint: 'No layers. Tap + Layer',
  expandTransform: 'Expand Transform',
  maskActiveTitle: 'Mask Active',
  matteActiveTitle: 'Track Matte Active',
  activeFxTitle: 'Active Effects',
  layer3dTitle: '3D Layer (X/Y/Z)',
  visibilityTitle: 'Visibility',
  soloTitle: 'Solo',
  lockTitle: 'Lock',
  toggleKfTitle: 'Toggle Keyframing',
  addRemoveKfTitle: 'Add/Remove Keyframe',
  markerTooltip: (label, time) => `${label} (${time}s) — dbl-click to remove`,

  propNames: {
    x: 'Position X',
    y: 'Position Y',
    scaleX: 'Scale X',
    scaleY: 'Scale Y',
    rotation: 'Rotation',
    opacity: 'Opacity',
    anchorX: 'Anchor X',
    anchorY: 'Anchor Y',
    z: 'Z Depth (3D)',
    rotateX: 'Rotate X (3D)',
    rotateY: 'Rotate Y (3D)',
  },

  selectLayerHint: 'Select a layer in Timeline or tap it on canvas.',
  moveLayerUp: 'Move Layer Up',
  moveLayerDown: 'Move Layer Down',
  duplicate: 'Duplicate',
  delete: 'Delete',
  blendMode: 'Blend Mode',
  parentLink: 'Parent & Link',
  none: 'None',
  trackMatte: 'Track Matte',
  noLayerAbove: 'No layer above',
  alphaMatte: 'Alpha Matte',
  alphaInverted: 'Alpha Inverted',
  layerActions: 'Layer Actions',
  splitShort: 'Split',
  centerAnchor: 'Center Anchor',
  preComp: 'Pre-Comp',
  timeSpeed: 'Time Speed (0.25x - 4x)',
  transformTitle: 'Transform',
  expressionsTitle: 'AE Expressions',
  exprInactive: 'Inactive',
  exprPlaceholder: 'e.g. wiggle(4, 25) or 100 + audioAmp * 0.5',
  exprClear: 'Clear',

  textPropsTitle: 'Text Properties & Presets',
  presetTypewriter: 'Typewriter',
  presetPopIn: 'Pop In',
  presetSlideUp: 'Slide Up',
  presetNeonPulse: 'Neon Pulse',
  sizePx: 'Size (px)',
  weight: 'Weight',
  fillColor: 'Fill Color',
  strokeColor: 'Stroke Color',
  strokeWidth: 'Stroke Width',
  revealPct: 'Reveal (%)',

  shapePropsTitle: 'Shape Properties',
  shapeLabel: 'Shape',
  shapeKinds: {
    rect: 'Rectangle',
    roundedRect: 'Rounded Rect',
    ellipse: 'Ellipse',
    star: 'Star',
    polygon: 'Polygon',
  },
  pointsSides: 'Points / Sides',
  width: 'Width',
  height: 'Height',
  fillOpacityPct: 'Fill Opacity (%)',

  solidTitle: 'Solid / Gradient',
  color1: 'Color 1',
  color2: 'Color 2',
  gradient: 'Gradient',
  angleDeg: 'Angle (°)',
  on: 'ON',
  off: 'OFF',

  audioTitle: 'Audio & Beat Reactor',
  fileLabel: 'File',
  volumeLabel: 'Volume',
  convertAudioTitle: 'Convert Audio to Keyframes',
  targetLayer: 'Target Layer',
  propertyLabel: 'Property',
  beatScaleX: 'Scale X (100 + beat)',
  beatScaleY: 'Scale Y (100 + beat)',
  beatRotation: 'Rotation (0 + beat)',
  beatOpacity: 'Opacity (40 + beat)',
  generateBeatKfs: 'Generate Beat Keyframes',
  audioExprTip: 'Tip: <code>audioAmp</code> is available in Expressions (e.g. <code>100 + audioAmp * 0.5</code>).',

  precompTitle: 'Nested Pre-Composition',
  sourceLabel: 'Source',
  unknown: 'Unknown',
  openPrecompBtn: 'Open Pre-Comp Timeline',

  layerMaskTitle: 'Layer Mask',
  maskOn: 'Mask ON',
  maskAddEnable: '+ Add / Enable Mask',
  maskRect: 'Rectangle',
  maskEllipse: 'Ellipse',
  invertedLabel: 'Inverted',
  invertedYes: 'Inverted',
  invertedNo: 'Normal',
  widthPx: 'Width (px)',
  heightPx: 'Height (px)',
  featherPx: 'Feather (px)',
  opacityPct: 'Opacity (%)',

  selectLayerFxHint: 'Select a layer to add or adjust Effects (FX).',
  moveFxUp: 'Move Effect Up',
  moveFxDown: 'Move Effect Down',
  removeFx: 'Remove Effect',
  noEffectsHint: (name) => `Layer "${name}" has no effects yet. Pick one below!`,
  activeEffectsStack: (name) => `Active Effects Stack — ${name}`,
  effectsLibrary: (count) => `Effects & Presets Library (${count})`,
  keyframeTooltip: 'Keyframe',

  graphEmptySelect: 'Select a layer and a keyframe (◆) to edit its Bezier curve.',
  graphNoKfs: (propKey) =>
    `Property <b>${propKey}</b> has no keyframes.<br/>Enable the stopwatch (⏱) in Timeline or Inspector to open animation curves.`,
  easingLinear: 'Linear',
  easingEasyEase: 'Easy Ease (F9)',
  easingEaseIn: 'Ease In',
  easingEaseOut: 'Ease Out',
  easingHold: 'Hold',
  deleteKf: 'Delete KF',
  easingLabel: 'Easing',

  modalNewLayer: 'New Layer',
  layerTextName: 'Text Layer',
  layerTextDesc: 'Animated text & presets',
  layerShapeName: 'Shape Layer',
  layerShapeDesc: 'Circles, frames, stars, polygons',
  layerSolidName: 'Solid / BG',
  layerSolidDesc: 'Solid color or gradient',
  layerAdjName: 'Adjustment Layer',
  layerAdjDesc: 'Effects applied to layers below',
  layerNullName: 'Null Object',
  layerNullDesc: 'Parenting controller rig',
  layerMediaName: 'Photo / Video',
  layerMediaDesc: 'Import from device gallery',
  layerAudioName: 'Audio Track',
  layerAudioDesc: 'MP3 / WAV music with waveform',
  layerSynthName: 'Synth Beat 128 BPM',
  layerSynthDesc: 'Built-in beat for audio reactivity',

  modalCompSettings: 'Composition Settings',
  dimReels: '9:16 Reels (1080×1920)',
  dimHD: '16:9 HD (1920×1080)',
  dimSquare: '1:1 Square (1080×1080)',
  compName: 'Name',
  fpsLabel: 'FPS',
  durationSec: 'Duration (sec)',
  bgColor: 'BG Color',
  applySettings: 'Apply Settings',

  modalProjectsTitle: 'Compositions, Projects & Presets',
  compsInProject: 'Compositions in Project',
  newCompBtn: '+ New Comp',
  demoTemplates: 'Demo Templates',
  newBlankProject: 'New Empty Project',
  importSuep: 'Import .suep',
  saveSuep: 'Save .suep',
  invalidSuepAlert: 'Invalid .suep project file',
  blankCompName: 'Blank Comp (9:16)',
  untitledProject: 'Untitled Project',

  modalHubTitle: 'Xlone-room • StudioEffect(SU) v1.2',
  hubTagline: 'Ultra-lightweight native Android APK clones of heavy Windows software.',
  hubCardTitle: 'StudioEffect(SU) v1.2 — Adobe After Effects Clone',
  hubCardSize: 'APK Size: ~75 KB (vs ~4.5 GB original — 60,000x+ lighter!)',
  hubCardFeatures: '3D Layers (X/Y/Z) • Audio/Beat Sync • Masks & Track Matte • Pre-Compose • 20 VFX • Expressions',
  hubTipsTitle: 'Mobile Quick Tips',
  hubTip3d: '• Tap <b>3D</b> on a layer to unlock Rotate X / Rotate Y / Z Depth',
  hubTipSplit: '• <b>Split</b> in Timeline cuts the selected layer at CTI',
  hubTipMarker: '• <b>+ M</b> adds a beat marker (double-tap to delete)',
  hubDownloadApk: 'Download Latest APK',
  hubGithub: 'GitHub Xlone-room',

  modalExportTitle: 'Render & Export',
  exportResolution: 'Resolution',
  exportHalf: 'Half (Fast Mobile)',
  exportFull: 'Full (100%)',
  exportBitrate: 'Bitrate',
  exportBitrateLight: '4 Mbps (Light)',
  exportBitrateHigh: '8 Mbps (High)',
  exportBitrateMaster: '14 Mbps (Master)',
  exportPreparing: 'Preparing render...',
  exportRenderVideo: 'Render Video',
  exportCancelRender: 'Cancel Render',
  exportSavePng: 'Save PNG Frame',
  exportSaveProj: 'Save .suep',
  exportAndroidNote: 'In Android APK, exported files are saved directly to <b>Downloads/StudioEffectSU</b>.',
  exportRenderingFrame: (frame, total, pct) => `Rendering frame ${frame} / ${total} (${pct}%)`,
  exportDone: (fileName, kb) => `Done: ${fileName} (${kb} KB)`,
  exportError: 'Render error',

  dockAdd: 'Add',
  dockEdit: 'Edit',
  dockFx: 'Effects',
  dockGraph: 'Curves',
  dockSplit: 'Split',
  dockKeyframe: 'Key ◆',
  dock3D: '3D',
  dockMask: 'Mask',
  dockExpr: 'Expr',
  dockMarker: 'Marker',
  dockDup: 'Copy',
  dockDel: 'Delete',
  backToTimeline: 'Timeline',
  viewOptionsBtn: 'View',
  toggleAePanelTitle: 'Expand/Collapse AE Layers Panel',
  keyframeBtnLabel: 'Key ◆',
  doneBtn: 'Done',
};

export const EFFECT_I18N_RU: Record<
  EffectType,
  { name: string; category: string; description: string; params: Record<string, string> }
> = {
  glow: {
    name: 'Глубокое свечение',
    category: 'Стилизация',
    description: 'Кинематографичное неоновое свечение',
    params: { radius: 'Радиус', intensity: 'Сила' },
  },
  blur: {
    name: 'Размытие по Гауссу',
    category: 'Размытие',
    description: 'Плавное размытие по Гауссу',
    params: { radius: 'Размытие' },
  },
  radialBlur: {
    name: 'Радиальный зум',
    category: 'Размытие',
    description: 'Эффект скоростного зума от центра',
    params: { amount: 'Сила', steps: 'Качество' },
  },
  directionalBlur: {
    name: 'Направленное размытие',
    category: 'Размытие',
    description: 'Размытие движения (Motion Blur)',
    params: { angle: 'Угол', length: 'Длина' },
  },
  waveWarp: {
    name: 'Волна (Wave Warp)',
    category: 'Искажение',
    description: 'Синусоидальное искажение волной',
    params: { height: 'Высота', width: 'Ширина', speed: 'Скорость' },
  },
  tint: {
    name: 'Оттенок (Tint)',
    category: 'Цветокоррекция',
    description: 'Тонирование в монохром или дуотон',
    params: { amount: 'Смешивание', hue: 'Тон' },
  },
  exposure: {
    name: 'Экспозиция и гамма',
    category: 'Цветокоррекция',
    description: 'Экспозиция (EV) и гамма-коррекция',
    params: { exposure: 'Экспозиция', gamma: 'Гамма' },
  },
  rgbSplit: {
    name: 'RGB Сдвиг',
    category: 'Искажение',
    description: 'Хроматическая аберрация каналов R/G/B',
    params: { amount: 'Сдвиг', angle: 'Угол' },
  },
  glitch: {
    name: 'Глитч и сканлайны',
    category: 'Стилизация',
    description: 'Цифровой глитч-сдвиг и полосы',
    params: { intensity: 'Интенсивность', speed: 'Сдвиг (Seed)' },
  },
  motionTile: {
    name: 'Motion Tile',
    category: 'Стилизация',
    description: 'Зеркальное дублирование краёв (для shake/zoom)',
    params: { tileWidth: 'Ширина', tileHeight: 'Высота', mirror: 'Зеркало (0/1)' },
  },
  shake: {
    name: 'Тряска камеры',
    category: 'Трансформация',
    description: 'Процедурная тряска камеры (Wiggle)',
    params: { frequency: 'Частота', amplitude: 'Амплитуда' },
  },
  dropShadow: {
    name: 'Отбросить тень',
    category: 'Перспектива',
    description: 'Объёмная тень под слоем',
    params: { distance: 'Смещение', blur: 'Мягкость', opacity: 'Прозрачность' },
  },
  hueSat: {
    name: 'Тон / Насыщенность',
    category: 'Цветокоррекция',
    description: 'Сдвиг оттенка и насыщенности',
    params: { hue: 'Сдвиг тона', saturation: 'Насыщенность' },
  },
  contrast: {
    name: 'Яркость и контраст',
    category: 'Цветокоррекция',
    description: 'Яркость и контраст изображения',
    params: { brightness: 'Яркость', contrast: 'Контраст' },
  },
  vignette: {
    name: 'Виньетка',
    category: 'Стилизация',
    description: 'Кинематографическое затемнение краёв',
    params: { amount: 'Затемнение', softness: 'Мягкость' },
  },
  pixelate: {
    name: 'Мозаика / Пиксели',
    category: 'Стилизация',
    description: 'Пикселизация / ретро-мозаика',
    params: { size: 'Размер блока' },
  },
  chromaKey: {
    name: 'Хромакей (Green Screen)',
    category: 'Кеинг',
    description: 'Удаление зелёного/синего фона',
    params: { hue: 'Цвет ключа (120=Зел)', tolerance: 'Допуск', softness: 'Мягкость края' },
  },
  mirror: {
    name: 'Симметрия / Калейдоскоп',
    category: 'Искажение',
    description: 'Зеркальная симметрия (2x / 4x)',
    params: { mode: 'Режим (1=X, 2=Y, 3=4x)' },
  },
  posterize: {
    name: 'Постеризация',
    category: 'Стилизация',
    description: 'Стилизация палитры под постер/аниме',
    params: { levels: 'Уровней цвета' },
  },
  halftone: {
    name: 'Растр (Halftone)',
    category: 'Стилизация',
    description: 'Комикс-растр из точек по яркости',
    params: { dotSize: 'Размер ячейки' },
  },
};

export const PRESET_I18N_RU: Record<string, { title: string; subtitle: string }> = {
  'neon-intro': {
    title: 'Неон-интро (9:16 Reels)',
    subtitle: 'Привязка Rig • Выражения • Глубокое свечение • RGB-сдвиг',
  },
  '3d-beat-card': {
    title: '3D-карточка и бит (9:16)',
    subtitle: '3D-переворот X/Y/Z • Аудио 128 BPM • audioAmp • Калейдоскоп',
  },
  'amv-pulse': {
    title: 'AMV Эдит-пульс (9:16)',
    subtitle: 'Motion Tile • Тряска камеры • Глитч • Плавный отскок (Easy Ease)',
  },
  'kinetic-wide': {
    title: 'Кинетический заголовок (16:9)',
    subtitle: 'Широкоформатное YouTube-интро • Тень • Плавный выезд',
  },
};

export function getDict(locale: Locale): TranslationDict {
  return locale === 'ru' ? RU : EN;
}
