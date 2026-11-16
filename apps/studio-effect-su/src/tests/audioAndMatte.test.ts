import { describe, expect, it } from 'vitest';
import { createBuiltInSynthBeat, getAudioAmplitudeAtTime } from '../core/audio';
import { evaluateExpression } from '../core/expressions';
import { createNeonIntroProject } from '../core/presets';
import { store } from '../state/store';

describe('Stage 2 (v1.1.0): Audio, Pre-Compose, Masks, Text Presets, FX Order', () => {
  it('synthesizes built-in 128 BPM beat with WAV URI & envelope', () => {
    const beat = createBuiltInSynthBeat(2, 128);
    expect(beat.src.startsWith('data:audio/wav;base64,')).toBe(true);
    expect(beat.waveform.length).toBe(80);
    expect(beat.envelope.length).toBe(60);
    expect(Math.max(...beat.envelope)).toBeGreaterThan(20);
  });

  it('computes audioAmp and evaluates beat-reactive expressions', () => {
    store.loadProject(createNeonIntroProject());
    const beat = createBuiltInSynthBeat(3, 128);
    const audioLayer = store.addLayer('audio', 'Beat', (l) => {
      l.audioData = beat;
    });

    const comp = store.getActiveComp();
    const amp = getAudioAmplitudeAtTime(comp, 0.02);
    expect(amp).toBeGreaterThan(0);

    const expr = evaluateExpression('100 + audioAmp * 0.5', {
      time: 0.02,
      index: 1,
      value: 100,
      fps: 30,
      duration: 5,
      seed: 1,
      audioAmp: amp,
    });
    expect(expr.value).toBeGreaterThan(100);

    // Muting layer zeroes amplitude
    store.updateLayer(audioLayer.id, (l) => {
      l.visible = false;
    });
    expect(getAudioAmplitudeAtTime(comp, 0.02)).toBe(0);
  });

  it('supports pre-compose, masks, text presets, audio-to-keyframes, and effect reordering', () => {
    store.loadProject(createNeonIntroProject());
    const beat = createBuiltInSynthBeat(2, 128);
    const audioLayer = store.addLayer('audio', 'Beat', (l) => {
      l.audioData = beat;
    });

    const txt = store.addLayer('text', 'Headline');
    store.toggleMask(txt.id);
    expect(txt.mask?.enabled).toBe(true);

    store.applyTextPreset(txt.id, 'typewriter');
    expect(txt.textReveal?.keyframes.length).toBe(2);

    const kfCount = store.generateAudioKeyframes(audioLayer.id, txt.id, 'scaleX', 100, 40);
    expect(kfCount).toBeGreaterThan(5);
    expect(txt.transform.scaleX.keyframes.length).toBe(kfCount);

    store.addEffectToLayer(txt.id, 'glow');
    store.addEffectToLayer(txt.id, 'radialBlur');
    expect(txt.effects.map((e) => e.type)).toEqual(['glow', 'radialBlur']);
    store.moveEffect(txt.id, txt.effects[1].id, -1);
    expect(txt.effects.map((e) => e.type)).toEqual(['radialBlur', 'glow']);

    const compCountBefore = store.getState().project.compositions.length;
    store.precomposeLayer(txt.id);
    expect(store.getState().project.compositions.length).toBe(compCountBefore + 1);
    expect(store.getSelectedLayer()?.type).toBe('precomp');
  });
});
