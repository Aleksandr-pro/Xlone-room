import { createComposition, createEffect, createLayer, kf, prop, uid } from './factories';
import type { StudioProject } from './types';

export function createNeonIntroProject(): StudioProject {
  const comp = createComposition('Neon Intro (9:16)', 1080, 1920, 30, 5);

  const bg = createLayer('solid', comp, 'Deep Space Solid');
  bg.solidData = {
    width: 1080,
    height: 1920,
    color: '#070812',
    gradientColor: '#1d1246',
    useGradient: true,
    gradientAngle: 145,
  };

  const nullRig = createLayer('null', comp, 'Master Rig [Null]');
  nullRig.transform.x = prop(540);
  nullRig.transform.y = prop(960);
  nullRig.transform.scaleX = prop(100, [kf(0, 88, 'easyEase'), kf(1.2, 104, 'easyEase'), kf(4.5, 100, 'easyEase')]);
  nullRig.transform.scaleY = prop(100, [kf(0, 88, 'easyEase'), kf(1.2, 104, 'easyEase'), kf(4.5, 100, 'easyEase')]);

  const outerRing = createLayer('shape', comp, 'Neon Ring');
  outerRing.parentId = nullRig.id;
  outerRing.transform.x = prop(0);
  outerRing.transform.y = prop(-40);
  outerRing.transform.scaleX = prop(100, [kf(0, 10, 'easyEase'), kf(0.85, 105, 'easyEase'), kf(1.25, 100, 'easyEase')]);
  outerRing.transform.scaleY = prop(100, [kf(0, 10, 'easyEase'), kf(0.85, 105, 'easyEase'), kf(1.25, 100, 'easyEase')]);
  outerRing.transform.rotation = prop(0, [], 'time * 36');
  outerRing.shapeData = {
    kind: 'ellipse',
    width: 560,
    height: 560,
    cornerRadius: 0,
    points: 5,
    fillColor: '#4c8bf5',
    fillOpacity: 12,
    strokeColor: '#38bdf8',
    strokeWidth: 14,
  };
  const ringGlow = createEffect('glow');
  ringGlow.params.radius = prop(26);
  ringGlow.params.intensity = prop(115);
  outerRing.effects.push(ringGlow);

  const starAccent = createLayer('shape', comp, 'Orbit Star');
  starAccent.parentId = nullRig.id;
  starAccent.transform.x = prop(250, [], 'Math.cos(time * 2.2) * 320');
  starAccent.transform.y = prop(-40, [], 'Math.sin(time * 2.2) * 320 - 40');
  starAccent.transform.rotation = prop(0, [], 'time * 120');
  starAccent.shapeData = {
    kind: 'star',
    width: 96,
    height: 96,
    cornerRadius: 0,
    points: 4,
    fillColor: '#f472b6',
    fillOpacity: 100,
    strokeColor: '#ffffff',
    strokeWidth: 4,
  };
  const starGlow = createEffect('glow');
  starGlow.params.radius = prop(18);
  starGlow.params.intensity = prop(130);
  starAccent.effects.push(starGlow);

  const title = createLayer('text', comp, 'StudioEffect(SU) Title');
  title.parentId = nullRig.id;
  title.transform.x = prop(0);
  title.transform.y = prop(-40, [kf(0.1, 140, 'easyEase'), kf(0.95, -40, 'easyEase')]);
  title.transform.scaleX = prop(100, [kf(0.1, 45, 'easyEase'), kf(0.85, 108, 'easyEase'), kf(1.15, 100, 'easyEase')]);
  title.transform.scaleY = prop(100, [kf(0.1, 45, 'easyEase'), kf(0.85, 108, 'easyEase'), kf(1.15, 100, 'easyEase')]);
  title.transform.opacity = prop(100, [kf(0.1, 0, 'easeOut'), kf(0.55, 100, 'linear')]);
  title.textData = {
    text: 'StudioEffect\n(SU)',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 106,
    fontWeight: '900',
    color: '#ffffff',
    strokeColor: '#60a5fa',
    strokeWidth: 4,
    align: 'center',
    letterSpacing: 3,
    lineHeight: 1.08,
    revealProgress: 100,
  };
  const titleGlow = createEffect('glow');
  titleGlow.params.radius = prop(20);
  titleGlow.params.intensity = prop(95);
  title.effects.push(titleGlow);

  const subtitle = createLayer('text', comp, 'Xlone-room Badge');
  subtitle.parentId = nullRig.id;
  subtitle.inPoint = 0.45;
  subtitle.transform.x = prop(0);
  subtitle.transform.y = prop(175, [kf(0.45, 240, 'easyEase'), kf(1.1, 175, 'easyEase')]);
  subtitle.transform.opacity = prop(100, [kf(0.45, 0, 'easeOut'), kf(0.9, 100, 'linear')]);
  subtitle.textData = {
    text: 'MOBILE MOTION ENGINE • XLONE-ROOM',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 30,
    fontWeight: '700',
    color: '#93c5fd',
    strokeColor: '#000000',
    strokeWidth: 0,
    align: 'center',
    letterSpacing: 5,
    lineHeight: 1.2,
    revealProgress: 100,
  };

  const adj = createLayer('adjustment', comp, 'Adjustment FX (RGB + Vignette)');
  const rgb = createEffect('rgbSplit');
  rgb.params.amount = prop(4, [kf(0, 18, 'easyEase'), kf(0.75, 4, 'easyEase'), kf(2.4, 3, 'linear'), kf(2.6, 16, 'easyEase'), kf(3.0, 4, 'easyEase')]);
  rgb.params.angle = prop(18);
  const vig = createEffect('vignette');
  vig.params.amount = prop(45);
  vig.params.softness = prop(60);
  adj.effects.push(rgb, vig);

  // Top layer first (AE stack order!)
  comp.layers = [adj, subtitle, title, starAccent, outerRing, nullRig, bg];

  return {
    version: '1.0.0',
    app: 'StudioEffect(SU)',
    name: 'Neon Intro Demo',
    activeCompId: comp.id,
    compositions: [comp],
  };
}

export function createAmvPulseProject(): StudioProject {
  const comp = createComposition('AMV Edit Pulse (9:16)', 1080, 1920, 30, 4);

  const bg = createLayer('solid', comp, 'Crimson Dark BG');
  bg.solidData = {
    width: 1080,
    height: 1920,
    color: '#09040a',
    gradientColor: '#450a2c',
    useGradient: true,
    gradientAngle: 160,
  };

  const diamond = createLayer('shape', comp, 'Pulse Frame');
  diamond.transform.rotation = prop(45, [kf(0, 0, 'easyEase'), kf(0.6, 45, 'easyEase'), kf(2.0, 225, 'easyEase'), kf(4.0, 405, 'easyEase')]);
  diamond.transform.scaleX = prop(100, [kf(0, 170, 'easyEase'), kf(0.45, 95, 'easyEase'), kf(1.5, 130, 'easyEase'), kf(2.0, 95, 'easyEase')]);
  diamond.transform.scaleY = prop(100, [kf(0, 170, 'easyEase'), kf(0.45, 95, 'easyEase'), kf(1.5, 130, 'easyEase'), kf(2.0, 95, 'easyEase')]);
  diamond.shapeData = {
    kind: 'rect',
    width: 620,
    height: 620,
    cornerRadius: 0,
    points: 4,
    fillColor: '#ec4899',
    fillOpacity: 18,
    strokeColor: '#f43f5e',
    strokeWidth: 16,
  };
  const mt = createEffect('motionTile');
  mt.params.tileWidth = prop(140);
  mt.params.tileHeight = prop(140);
  diamond.effects.push(mt, createEffect('glow'));

  const headline = createLayer('text', comp, 'IMPACT TEXT');
  headline.transform.scaleX = prop(100, [kf(0, 220, 'easyEase'), kf(0.35, 100, 'easyEase'), kf(2.0, 100, 'easyEase'), kf(2.2, 135, 'easyEase'), kf(2.5, 100, 'easyEase')]);
  headline.transform.scaleY = prop(100, [kf(0, 220, 'easyEase'), kf(0.35, 100, 'easyEase'), kf(2.0, 100, 'easyEase'), kf(2.2, 135, 'easyEase'), kf(2.5, 100, 'easyEase')]);
  headline.transform.rotation = prop(0, [], 'wiggle(1.5, 3)');
  headline.textData = {
    text: 'VELOCITY\nEDIT',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 132,
    fontWeight: '900',
    color: '#ffffff',
    strokeColor: '#f43f5e',
    strokeWidth: 8,
    align: 'center',
    letterSpacing: 4,
    lineHeight: 1.0,
    revealProgress: 100,
  };

  const adj = createLayer('adjustment', comp, 'Glitch & Camera Shake');
  const shake = createEffect('shake');
  shake.params.frequency = prop(8);
  shake.params.amplitude = prop(14, [kf(0, 42, 'easeOut'), kf(0.5, 6, 'linear'), kf(2.0, 32, 'easeOut'), kf(2.6, 6, 'linear')]);
  const glitch = createEffect('glitch');
  glitch.params.intensity = prop(18, [kf(0, 75, 'easeOut'), kf(0.4, 8, 'linear'), kf(2.0, 65, 'easeOut'), kf(2.4, 8, 'linear')]);
  adj.effects.push(shake, glitch, createEffect('rgbSplit'));

  comp.layers = [adj, headline, diamond, bg];

  return {
    version: '1.0.0',
    app: 'StudioEffect(SU)',
    name: 'AMV Edit Pulse',
    activeCompId: comp.id,
    compositions: [comp],
  };
}

export function createKineticWideProject(): StudioProject {
  const comp = createComposition('Kinetic Title (16:9)', 1920, 1080, 30, 4);

  const bg = createLayer('solid', comp, 'Studio Dark BG');
  bg.solidData = {
    width: 1920,
    height: 1080,
    color: '#090d16',
    gradientColor: '#0f2942',
    useGradient: true,
    gradientAngle: 120,
  };

  const bar = createLayer('shape', comp, 'Accent Bar');
  bar.transform.x = prop(960);
  bar.transform.y = prop(640);
  bar.transform.scaleX = prop(100, [kf(0, 0, 'easyEase'), kf(0.8, 100, 'easyEase')]);
  bar.shapeData = {
    kind: 'roundedRect',
    width: 820,
    height: 12,
    cornerRadius: 6,
    points: 4,
    fillColor: '#38bdf8',
    fillOpacity: 100,
    strokeColor: '#ffffff',
    strokeWidth: 0,
  };

  const title = createLayer('text', comp, 'Main Headline');
  title.transform.y = prop(500, [kf(0.1, 590, 'easyEase'), kf(0.9, 500, 'easyEase')]);
  title.transform.opacity = prop(100, [kf(0.1, 0, 'easeOut'), kf(0.6, 100, 'linear')]);
  title.textData = {
    text: 'XLONE-ROOM STUDIO',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 112,
    fontWeight: '900',
    color: '#f8fafc',
    strokeColor: '#38bdf8',
    strokeWidth: 0,
    align: 'center',
    letterSpacing: 6,
    lineHeight: 1.1,
    revealProgress: 100,
  };
  title.effects.push(createEffect('dropShadow'));

  comp.layers = [title, bar, bg];

  return {
    version: '1.0.0',
    app: 'StudioEffect(SU)',
    name: 'Kinetic Title 16:9',
    activeCompId: comp.id,
    compositions: [comp],
  };
}

export const DEMO_PRESETS: Array<{ id: string; title: string; subtitle: string; create: () => StudioProject }> = [
  {
    id: 'neon-intro',
    title: 'Neon Intro (9:16)',
    subtitle: 'Parenting Rig • Expressions • Deep Glow • Adjustment RGB',
    create: createNeonIntroProject,
  },
  {
    id: 'amv-pulse',
    title: 'AMV Edit Pulse (9:16)',
    subtitle: 'Motion Tile • Camera Shake • Glitch • Bounce Easy Ease',
    create: createAmvPulseProject,
  },
  {
    id: 'kinetic-wide',
    title: 'Kinetic Title (16:9)',
    subtitle: 'Widescreen YouTube Intro • Drop Shadow • Clean Slide',
    create: createKineticWideProject,
  },
];

export { uid };
