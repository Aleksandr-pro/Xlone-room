# Архитектурный план Xlone-room и StudioEffect(SU)

## 1. Философия Xlone-room
Тяжёлые программы для Windows (Adobe After Effects, Photoshop, Premiere, FL Studio и др.) занимают гигабайты из-за легаси-кода и десктопной инфраструктуры.
Для мобильных клонов Xlone-room мы используем единые принципы:
1. **Готовый нативный `.apk` без тяжёлых фреймворков**: чистый Android Kotlin-хост (`android.app.Activity` + аппаратный `WebView` + `AndroidBridge` для MediaStore/Downloads и выбора файлов) без многомегабайтных обёрток (даже без Capacitor/React Native). Итоговый подписанный `.apk` весит **менее 500 KB** (в тысячи раз легче оригинала!).
2. **Нулевой рантайм-балласт в движке**: чистый TypeScript + нативные графические API (`Canvas 2D`, пиксельные фильтры `ImageData`, `MediaRecorder`, `IndexedDB`).
3. **Mobile-first UX**: управление пальцем (gizmo на холсте, скраббинг таймлайна, нижние вкладки инспектора), сохраняя профессиональную логику AE.
4. **Автоматическая сборка APK и прямые ссылки**: каждое обновление автоматически собирает `.apk` через GitHub Actions и публикует прямую ссылку на скачивание в GitHub Releases.

---

## 2. Архитектура StudioEffect(SU)

### Слой 1: Ядро данных и анимации (`apps/studio-effect-su/src/core/`)
- `types.ts` — строгая модель композиции, слоёв, свойств, ключевых кадров, кривых Безье, эффектов и выражений.
- `easing.ts` — решатель кубических кривых Безье (`Easy Ease`, `Ease In`, `Ease Out`, пользовательские ручки граф-редактора).
- `expressions.ts` — безопасный парсер/интерпретатор выражений в стиле AE (`time`, `index`, `value`, `wiggle(freq, amp)`, `loopOut()`, `Math.*`).
- `interpolation.ts` — вычисление значений свойств на любой кадр, разрешение цепочек `parentId` (матрицы трансформации: `Anchor -> Scale -> Rotation -> Position`).
- `history.ts` — стек `Undo / Redo` со снимками состояния.
- `presets.ts` — готовые демонстрационные композиции для мгновенного старта.

### Слой 2: Движок рендеринга и эффектов (`apps/studio-effect-su/src/engine/`)
- `renderer.ts` — многослойный композитор на базе Canvas:
  - Режимы наложения (`globalCompositeOperation`).
  - Поддержка `Adjustment Layer` (захват композита нижних слоёв и применение эффектов поверх).
  - Слой интерактивного `Gizmo` (перемещение, масштабирование, поворот, точка опоры, безопасные рамки).
- `effects.ts` — конвейер эффектов (`Deep Glow`, `Gaussian Blur`, `RGB Split`, `Glitch`, `Motion Tile`, `Drop Shadow`, `Hue/Sat`, `Contrast`, `Vignette`, `Pixelate`, `Shake`).
- `exporter.ts` — покадровый рендер видео (`WebM`/`MP4`) + экспорт кадра (`PNG`) и проекта (`.suep`) с передачей в нативный Android `AndroidBridge` (для сохранения прямо в `Downloads/StudioEffectSU`).

### Слой 3: Состояние и хранение (`apps/studio-effect-su/src/state/`)
- `store.ts` — реактивный store с автосохранением в `localStorage`, управлением выделением слоёв, воспроизведением с точным таймингом FPS.

### Слой 4: Мобильный интерфейс AE (`apps/studio-effect-su/src/ui/`)
- `appShell.ts` — адаптивная оболочка (портрет на телефоне: вьюпорт сверху + вкладки снизу; ландшафт/планшет: многопанельный интерфейс AE).
- `viewport.ts` — экран предпросмотра, зум/панорамирование, транспорт (`Play/Pause`, `Step`, `Timecode`).
- `timeline.ts` — список слоёв, цвета как в AE, иконки Eye/Solo/Lock, перетаскиваемые полосы слоёв, линейка кадров, ромбы ключевых кадров (`◆`).
- `inspector.ts` — параметры трансформации с секундомерами (`Stopwatch`), настройки текста/фигур/солида, привязка к родителю (`Parent`), редактор выражений (`Expressions`).
- `effectsPanel.ts` — библиотека эффектов + управление активным стеком эффектов слоя.
- `graphEditor.ts` — визуальный редактор кривых Безье для ключевых кадров.
- `modals.ts` — создание композиции, добавление слоёв и медиа из памяти телефона, экспорт видео, демо-пресеты.

### Слой 5: Нативная Android-оболочка (`apps/studio-effect-su/android/`)
- `MainActivity.kt` — нативное окно с аппаратным ускорением, перехватчиком локальных ассетов (`https://studioeffect.local/`), нативным выбором файлов (`onShowFileChooser`), обработкой системной кнопки «Назад» и JS-мостом `AndroidBridge` для сохранения видео/картинок/проектов в `Downloads/StudioEffectSU` (Android MediaStore / File API).
- `build.gradle.kts` + Gradle Wrapper — сборка подписанного release `.apk` весом < 500 KB.
