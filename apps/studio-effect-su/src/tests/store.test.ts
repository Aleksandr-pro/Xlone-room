import { describe, expect, it } from 'vitest';
import { createNeonIntroProject } from '../core/presets';
import { store } from '../state/store';

describe('StudioStore operations & undo/redo', () => {
  it('supports adding, updating, undoing, and redoing layers', () => {
    store.loadProject(createNeonIntroProject());
    const initialCount = store.getActiveComp().layers.length;

    const added = store.addLayer('text', 'UnitTestText');
    expect(store.getActiveComp().layers.length).toBe(initialCount + 1);
    expect(store.getSelectedLayer()?.id).toBe(added.id);

    store.toggleStopwatch(added.id, 'opacity');
    expect(added.transform.opacity.keyframes.length).toBe(1);

    store.undo();
    expect(store.getActiveComp().layers.find((l) => l.id === added.id)?.transform.opacity.keyframes.length).toBe(0);

    store.undo();
    expect(store.getActiveComp().layers.length).toBe(initialCount);

    store.redo();
    expect(store.getActiveComp().layers.length).toBe(initialCount + 1);
  });

  it('supports CapCut-style dock actions & expandable AE timeline panel', () => {
    store.loadProject(createNeonIntroProject());
    expect(store.getState().timelineLayersExpanded).toBe(false);
    store.toggleTimelineLayersExpanded();
    expect(store.getState().timelineLayersExpanded).toBe(true);

    store.openInspectorSection('mask');
    expect(store.getState().activeTab).toBe('inspector');
    expect(store.getState().inspectorFocusSection).toBe('mask');

    const sel = store.getSelectedLayer()!;
    store.selectProp('x');
    store.setTime(1.1);
    store.toggleSelectedPropKeyframe();
    expect(sel.transform.x.keyframes.some((k) => Math.abs(k.time - 1.1) < 0.01)).toBe(true);
  });
});
