import type { EffectDefinition, EffectType } from '../core/types';

export const EFFECT_CATALOG: EffectDefinition[] = [
  {
    type: 'glow',
    name: 'Deep Glow',
    category: 'Stylize',
    description: 'Кинематографичное неоновое свечение',
    params: [
      { key: 'radius', label: 'Radius', min: 0, max: 60, step: 1, defaultValue: 18, unit: 'px' },
      { key: 'intensity', label: 'Intensity', min: 0, max: 200, step: 5, defaultValue: 85, unit: '%' },
    ],
  },
  {
    type: 'blur',
    name: 'Gaussian Blur',
    category: 'Blur & Sharpen',
    description: 'Плавное размытие по Гауссу',
    params: [
      { key: 'radius', label: 'Blurriness', min: 0, max: 50, step: 0.5, defaultValue: 8, unit: 'px' },
    ],
  },
  {
    type: 'radialBlur',
    name: 'Radial Zoom Blur',
    category: 'Blur & Sharpen',
    description: 'Эффект скоростного зума от центра',
    params: [
      { key: 'amount', label: 'Amount', min: 0, max: 100, step: 2, defaultValue: 35, unit: '%' },
      { key: 'steps', label: 'Quality Steps', min: 3, max: 12, step: 1, defaultValue: 7, unit: '' },
    ],
  },
  {
    type: 'directionalBlur',
    name: 'Directional Blur',
    category: 'Blur & Sharpen',
    description: 'Направленное размытие движения (Motion)',
    params: [
      { key: 'angle', label: 'Direction', min: -180, max: 180, step: 2, defaultValue: 0, unit: '°' },
      { key: 'length', label: 'Blur Length', min: 0, max: 80, step: 1, defaultValue: 24, unit: 'px' },
    ],
  },
  {
    type: 'waveWarp',
    name: 'Wave Warp',
    category: 'Distort',
    description: 'Синусоидальное искажение волной',
    params: [
      { key: 'height', label: 'Wave Height', min: 0, max: 60, step: 1, defaultValue: 14, unit: 'px' },
      { key: 'width', label: 'Wave Width', min: 15, max: 240, step: 5, defaultValue: 80, unit: 'px' },
      { key: 'speed', label: 'Wave Speed', min: 0, max: 10, step: 0.2, defaultValue: 2.5, unit: 'Hz' },
    ],
  },
  {
    type: 'tint',
    name: 'Tint / Colorize',
    category: 'Color Correction',
    description: 'Тонирование в монохром или дуотон',
    params: [
      { key: 'amount', label: 'Amount to Tint', min: 0, max: 100, step: 2, defaultValue: 100, unit: '%' },
      { key: 'hue', label: 'Tint Hue', min: 0, max: 360, step: 5, defaultValue: 215, unit: '°' },
    ],
  },
  {
    type: 'exposure',
    name: 'Exposure & Gamma',
    category: 'Color Correction',
    description: 'Экспозиция (EV) и гамма-коррекция',
    params: [
      { key: 'exposure', label: 'Exposure', min: -2.5, max: 2.5, step: 0.1, defaultValue: 0.6, unit: 'EV' },
      { key: 'gamma', label: 'Gamma', min: 0.4, max: 2.4, step: 0.05, defaultValue: 1.0, unit: '' },
    ],
  },
  {
    type: 'rgbSplit',
    name: 'RGB Split',
    category: 'Distort',
    description: 'Хроматическая аберрация / сдвиг каналов R/G/B',
    params: [
      { key: 'amount', label: 'Distance', min: 0, max: 40, step: 1, defaultValue: 10, unit: 'px' },
      { key: 'angle', label: 'Angle', min: -180, max: 180, step: 1, defaultValue: 0, unit: '°' },
    ],
  },
  {
    type: 'glitch',
    name: 'Glitch & Scanlines',
    category: 'Stylize',
    description: 'Цифровой глитч-сдвиг и сканлайны',
    params: [
      { key: 'intensity', label: 'Intensity', min: 0, max: 100, step: 1, defaultValue: 40, unit: '%' },
      { key: 'speed', label: 'Jitter Seed', min: 0, max: 100, step: 1, defaultValue: 25, unit: '' },
    ],
  },
  {
    type: 'motionTile',
    name: 'Motion Tile',
    category: 'Stylize',
    description: 'Зеркальное дублирование краёв (для shake/zoom)',
    params: [
      { key: 'tileWidth', label: 'Output Width', min: 50, max: 300, step: 5, defaultValue: 150, unit: '%' },
      { key: 'tileHeight', label: 'Output Height', min: 50, max: 300, step: 5, defaultValue: 150, unit: '%' },
      { key: 'mirror', label: 'Mirror Edges (0/1)', min: 0, max: 1, step: 1, defaultValue: 1, unit: '' },
    ],
  },
  {
    type: 'shake',
    name: 'Camera Shake',
    category: 'Transform',
    description: 'Процедурная тряска камеры (Wiggle)',
    params: [
      { key: 'frequency', label: 'Frequency', min: 0, max: 20, step: 0.5, defaultValue: 6, unit: 'Hz' },
      { key: 'amplitude', label: 'Amplitude', min: 0, max: 100, step: 1, defaultValue: 22, unit: 'px' },
    ],
  },
  {
    type: 'dropShadow',
    name: 'Drop Shadow',
    category: 'Perspective',
    description: 'Объёмная тень под слоем',
    params: [
      { key: 'distance', label: 'Distance', min: 0, max: 80, step: 1, defaultValue: 16, unit: 'px' },
      { key: 'blur', label: 'Softness', min: 0, max: 60, step: 1, defaultValue: 20, unit: 'px' },
      { key: 'opacity', label: 'Opacity', min: 0, max: 100, step: 1, defaultValue: 75, unit: '%' },
    ],
  },
  {
    type: 'hueSat',
    name: 'Hue / Saturation',
    category: 'Color Correction',
    description: 'Сдвиг оттенка и насыщенности',
    params: [
      { key: 'hue', label: 'Master Hue', min: -180, max: 180, step: 1, defaultValue: 0, unit: '°' },
      { key: 'saturation', label: 'Saturation', min: 0, max: 250, step: 5, defaultValue: 120, unit: '%' },
    ],
  },
  {
    type: 'contrast',
    name: 'Brightness & Contrast',
    category: 'Color Correction',
    description: 'Яркость и контраст изображения',
    params: [
      { key: 'brightness', label: 'Brightness', min: 20, max: 200, step: 2, defaultValue: 105, unit: '%' },
      { key: 'contrast', label: 'Contrast', min: 20, max: 250, step: 2, defaultValue: 120, unit: '%' },
    ],
  },
  {
    type: 'vignette',
    name: 'Vignette',
    category: 'Stylize',
    description: 'Кинематографическое затемнение краёв',
    params: [
      { key: 'amount', label: 'Darkness', min: 0, max: 100, step: 2, defaultValue: 55, unit: '%' },
      { key: 'softness', label: 'Feather', min: 10, max: 100, step: 2, defaultValue: 55, unit: '%' },
    ],
  },
  {
    type: 'pixelate',
    name: 'Mosaic / Pixelate',
    category: 'Stylize',
    description: 'Пикселизация / ретро-мозаика',
    params: [
      { key: 'size', label: 'Block Size', min: 2, max: 64, step: 1, defaultValue: 10, unit: 'px' },
    ],
  },
];

export function getEffectDef(type: EffectType): EffectDefinition {
  const found = EFFECT_CATALOG.find((e) => e.type === type);
  if (!found) throw new Error(`Unknown effect type: ${type}`);
  return found;
}
