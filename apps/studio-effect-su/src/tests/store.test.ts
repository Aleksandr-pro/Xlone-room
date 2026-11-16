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
});
