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
