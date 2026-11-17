import { describe, expect, it } from 'vitest';
import { EFFECT_I18N_RU, getDict, PRESET_I18N_RU } from '../core/i18n';
import { DEMO_PRESETS } from '../core/presets';
import { EFFECT_CATALOG } from '../engine/effectCatalog';
import { store } from '../state/store';

describe('i18n Russian & English localization', () => {
  it('provides Russian translations for all 20 effects and all demo presets', () => {
    for (const fx of EFFECT_CATALOG) {
      const ru = EFFECT_I18N_RU[fx.type];
      expect(ru).toBeDefined();
      expect(ru.name.length).toBeGreaterThan(0);
      expect(ru.description.length).toBeGreaterThan(0);
      for (const p of fx.params) {
        expect(ru.params[p.key]).toBeTruthy();
      }
    }

    for (const preset of DEMO_PRESETS) {
      const ru = PRESET_I18N_RU[preset.id];
      expect(ru).toBeDefined();
      expect(ru.title.length).toBeGreaterThan(0);
    }
  });

  it('switches locale reactively between ru and en in store', () => {
    store.setLocale('ru');
    expect(store.getLocale()).toBe('ru');
    expect(store.t().exportBtn).toBe('Экспорт');
    expect(store.t().tabTimeline).toBe('Таймлайн');

    store.toggleLocale();
    expect(store.getLocale()).toBe('en');
    expect(store.t().exportBtn).toBe('Export');
    expect(store.t().tabTimeline).toBe('Timeline');

    // Restore default Russian locale
    store.setLocale('ru');
    expect(getDict('ru').propNames.z).toContain('Глубина Z');
  });
});
