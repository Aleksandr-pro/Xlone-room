export type Locale = 'ru' | 'en';

const KEY = 'xl3d_locale';

export function detectLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const v = localStorage.getItem(KEY);
    if (v === 'ru' || v === 'en') return v;
  }
  return 'ru';
}

export function saveLocale(l: Locale): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(KEY, l);
    } catch {
      // ignore
    }
  }
}

export interface XL3DDict {
  modes: Record<'object' | 'edit' | 'sculpt' | 'paint' | 'pose' | 'grease', string>;
  tabs: Record<'outliner' | 'tools' | 'properties' | 'nodes' | 'animation' | 'scripting' | 'editors', string>;
  renderBtn: string;
  assetsBtn: string;
  undo: string;
  redo: string;
  addObject: string;
  deleteObj: string;
  duplicateObj: string;
  shadingLabel: string;
  engines: Record<'workbench' | 'eevee' | 'cycles', string>;
  workbenchModes: Record<'solid' | 'wireframe' | 'matcap' | 'xray' | 'cavity' | 'outline', string>;
  gizmoMove: string;
  gizmoRotate: string;
  gizmoScale: string;
  gizmoSelect: string;
  cursor3D: string;
  selectModes: Record<'vertex' | 'edge' | 'face', string>;
  editOpsTitle: string;
  loopToolsTitle: string;
  selectOpsTitle: string;
  uvOpsTitle: string;
  normalsTitle: string;
  sculptBrushesTitle: string;
  sculptTopoTitle: string;
  paintTitle: string;
  bakeTitle: string;
  modifiersTitle: string;
  materialsTitle: string;
  physicsTitle: string;
  worldLightCamTitle: string;
  renderSettingsTitle: string;
  nodeGraphTitle: string;
  animTitle: string;
  scriptingTitle: string;
  vseTitle: string;
  spreadsheetTitle: string;
  assetBrowserTitle: string;
  prefsTitle: string;
  themeDark: string;
  themeLight: string;
  renderNowBtn: string;
  exportFramePng: string;
  exportSceneBtn: string;
  importModelBtn: string;
  hubTitle: string;
}

const RU: XL3DDict = {
  modes: {
    object: 'Объект',
    edit: 'Правка',
    sculpt: 'Скульптинг',
    paint: 'Покраска',
    pose: 'Поза / Риг',
    grease: 'Grease 2D',
  },
  tabs: {
    outliner: 'Сцена',
    tools: 'Инструменты',
    properties: 'Свойства',
    nodes: 'Ноды',
    animation: 'Анимация',
    scripting: 'Код',
    editors: 'Редакторы',
  },
  renderBtn: 'Рендер',
  assetsBtn: 'Файлы',
  undo: 'Отменить',
  redo: 'Повторить',
  addObject: '+ Добавить объект',
  deleteObj: 'Удалить',
  duplicateObj: 'Дублировать',
  shadingLabel: 'Вид',
  engines: {
    workbench: 'Workbench',
    eevee: 'EEVEE (Next)',
    cycles: 'Cycles (Raytrace)',
  },
  workbenchModes: {
    solid: 'Solid',
    wireframe: 'Сетка',
    matcap: 'Matcap',
    xray: 'X-Ray',
    cavity: 'Cavity',
    outline: 'Контур',
  },
  gizmoMove: 'Двигать',
  gizmoRotate: 'Крутить',
  gizmoScale: 'Масштаб',
  gizmoSelect: 'Выбор',
  cursor3D: '3D Курсор',
  selectModes: {
    vertex: 'Вершины',
    edge: 'Рёбра',
    face: 'Грани',
  },
  editOpsTitle: 'Операторы моделирования (Edit Mode)',
  loopToolsTitle: 'LoopTools (встроено в ядро 5.2+)',
  selectOpsTitle: 'Умное выделение и Пивот / Snap',
  uvOpsTitle: 'UV-развёртка и UDIM',
  normalsTitle: 'Нормали и сглаживание (5.x)',
  sculptBrushesTitle: 'Кисти скульптинга и симметрия',
  sculptTopoTitle: 'Динамическая топология и ретопология',
  paintTitle: 'Текстурирование: Texture / Vertex / Weight Paint',
  bakeTitle: 'Запекание карт (Bake)',
  modifiersTitle: 'Стек модификаторов (Blender 5.x)',
  materialsTitle: 'Материалы и Principled BSDF (5.2 / 5.3)',
  physicsTitle: 'Физика и симуляции',
  worldLightCamTitle: 'Свет, Камера и Окружение (Sky 5.3)',
  renderSettingsTitle: 'Движок рендера и Color Management',
  nodeGraphTitle: 'Редактор нод (Shader / Geometry / Compositor)',
  animTitle: 'Таймлайн, Ключи (F-Curves), Shape Keys & Rig',
  scriptingTitle: 'Scripting / Редактор кода (bpy & bmesh)',
  vseTitle: 'Видеомонтаж (VSE 5.3) и Motion Tracking',
  spreadsheetTitle: 'Spreadsheet — Таблица атрибутов геометрии',
  assetBrowserTitle: 'Библиотека ассетов и форматы (OBJ/STL/GLB/PLY/SPZ)',
  prefsTitle: 'Настройки интерфейса и бэкенд (XL3D)',
  themeDark: 'Тёмная тема',
  themeLight: 'Светлая тема',
  renderNowBtn: 'Запустить Cycles / EEVEE Рендер',
  exportFramePng: 'Сохранить PNG',
  exportSceneBtn: 'Сохранить .xl3d',
  importModelBtn: 'Импорт OBJ/STL/PLY/SPZ',
  hubTitle: 'XL3D — Клон Blender 5.x',
};

const EN: XL3DDict = {
  modes: {
    object: 'Object',
    edit: 'Edit',
    sculpt: 'Sculpt',
    paint: 'Paint',
    pose: 'Pose',
    grease: 'Grease',
  },
  tabs: {
    outliner: 'Outliner',
    tools: 'Tools',
    properties: 'Properties',
    nodes: 'Nodes',
    animation: 'Animation',
    scripting: 'Code',
    editors: 'Editors',
  },
  renderBtn: 'Render',
  assetsBtn: 'Files',
  undo: 'Undo',
  redo: 'Redo',
  addObject: '+ Add Object',
  deleteObj: 'Delete',
  duplicateObj: 'Duplicate',
  shadingLabel: 'Shading',
  engines: {
    workbench: 'Workbench',
    eevee: 'EEVEE',
    cycles: 'Cycles',
  },
  workbenchModes: {
    solid: 'Solid',
    wireframe: 'Wireframe',
    matcap: 'Matcap',
    xray: 'X-Ray',
    cavity: 'Cavity',
    outline: 'Outline',
  },
  gizmoMove: 'Move',
  gizmoRotate: 'Rotate',
  gizmoScale: 'Scale',
  gizmoSelect: 'Select',
  cursor3D: '3D Cursor',
  selectModes: {
    vertex: 'Vertex',
    edge: 'Edge',
    face: 'Face',
  },
  editOpsTitle: 'Edit Mode Modeling Operators',
  loopToolsTitle: 'LoopTools (Core 5.2+)',
  selectOpsTitle: 'Selection, Pivot & Snapping',
  uvOpsTitle: 'UV Unwrap & UDIM',
  normalsTitle: 'Normals & Auto Smooth (5.x)',
  sculptBrushesTitle: 'Sculpt Brushes & Symmetry',
  sculptTopoTitle: 'Dyntopo, Remesh & Retopology',
  paintTitle: 'Texture / Vertex / Weight Paint',
  bakeTitle: 'Bake Maps',
  modifiersTitle: 'Modifiers Stack (Blender 5.x)',
  materialsTitle: 'Materials & Principled BSDF (5.2 / 5.3)',
  physicsTitle: 'Physics & Simulations',
  worldLightCamTitle: 'Lights, Camera & World (Sky 5.3)',
  renderSettingsTitle: 'Render Engine & Color Management',
  nodeGraphTitle: 'Node Editor (Shader / Geometry / Compositor)',
  animTitle: 'Timeline, F-Curves, Shape Keys & Rigging',
  scriptingTitle: 'Scripting / Code Editor (bpy & bmesh)',
  vseTitle: 'Video Sequence Editor (VSE 5.3) & Tracking',
  spreadsheetTitle: 'Geometry Spreadsheet (5.x Attributes)',
  assetBrowserTitle: 'Asset Browser & I/O (OBJ/STL/GLB/PLY/SPZ)',
  prefsTitle: 'Preferences, Themes & Graphics Backend',
  themeDark: 'Dark Theme',
  themeLight: 'Light Theme',
  renderNowBtn: 'Render Cycles / EEVEE Frame',
  exportFramePng: 'Save PNG',
  exportSceneBtn: 'Save .xl3d',
  importModelBtn: 'Import OBJ/STL/PLY/SPZ',
  hubTitle: 'XL3D — Blender 5.x Clone',
};

export function getXL3DDict(locale: Locale): XL3DDict {
  return locale === 'ru' ? RU : EN;
}
