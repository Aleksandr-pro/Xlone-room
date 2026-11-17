import { describe, expect, it } from 'vitest';
import { getLayerWorldMatrix } from '../core/interpolation';
import { create3DBeatCardProject } from '../core/presets';
import { EFFECT_CATALOG } from '../engine/effectCatalog';
import { store } from '../state/store';

describe('Stage 3 (v1.2.0): 3D Transforms, Layer Split, Markers, 20 VFX', () => {
  it('registers 20 VFX effects in catalog', () => {
    expect(EFFECT_CATALOG.length).toBe(20);
    const types = EFFECT_CATALOG.map((e) => e.type);
    expect(types).toContain('chromaKey');
    expect(types).toContain('mirror');
    expect(types).toContain('posterize');
    expect(types).toContain('halftone');
  });

  it('computes 3D perspective & rotateX/rotateY projection', () => {
    store.loadProject(create3DBeatCardProject());
    const comp = store.getActiveComp();
    const card = comp.layers.find((l) => l.name === '3D Flip Card')!;
    expect(card.is3D).toBe(true);

    // At t = 0, card has z = 260 -> perspective scale < 1
    const m0 = getLayerWorldMatrix(card, comp, 0);
    expect(m0.a).toBeGreaterThan(0);
    expect(m0.a).toBeLessThan(1);

    // At t = 0.8s, rotateY ~ 180deg -> flipped X scale negative
    card.transform.rotateY!.keyframes = [];
    card.transform.rotateY!.value = 180;
    const mFlip = getLayerWorldMatrix(card, comp, 1.0);
    expect(mFlip.a).toBeLessThan(0);
  });

  it('splits layer at CTI and manages timeline markers', () => {
    store.loadProject(create3DBeatCardProject());
    const comp = store.getActiveComp();
    const initialCount = comp.layers.length;
    const target = comp.layers[0];

    store.setTime(1.5);
    store.splitLayerAtCurrentTime(target.id);
    expect(comp.layers.length).toBe(initialCount + 1);
    expect(target.outPoint).toBe(1.5);
    const tail = comp.layers[0];
    expect(tail.inPoint).toBe(1.5);

    store.addMarkerAtCurrentTime('Beat Drop');
    expect(comp.markers?.length).toBe(1);
    expect(comp.markers?.[0].time).toBe(1.5);
    store.deleteMarker(comp.markers![0].id);
    expect(comp.markers?.length).toBe(0);
  });
});
