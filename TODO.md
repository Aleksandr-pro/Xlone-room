# TODO List — Xlone-room & StudioEffect(SU)

## Фаза 0: Инфраструктура Xlone-room и сборка APK
- [x] Спроектировать структуру монорепозитория для клонов Windows -> Android (`apps/*`)
- [x] Написать `README.md`, `PLAN.md` и `TODO.md` с фокусом на нативные `.apk`
- [x] Настроить нативный Android-проект (`apps/studio-effect-su/android/`) без лишнего веса (< 500 KB APK)
- [x] Настроить GitHub Actions для автоматической сборки `.apk` и публикации прямой ссылки в GitHub Releases

## Фаза 1: Ядро анимации StudioEffect(SU) (`src/core/`)
- [x] Описать типы данных (`Composition`, `Layer`, `Keyframe`, `EffectInstance`, `Project`)
- [x] Реализовать интерполяцию ключевых кадров (`Linear`, `Easy Ease`, `Ease In`, `Ease Out`, `Hold`, Custom Bezier)
- [x] Реализовать систему иерархии слоёв (`Parenting` / расчёт мировых трансформаций)
- [x] Реализовать мини-движок AE Expressions (`time`, `index`, `wiggle()`, `loopOut()`, `Math.*`)
- [x] Реализовать систему `Undo / Redo`
- [x] Создать стартовые демо-проекты (Neon Intro, AMV Motion Edit, Kinetic Typography)

## Фаза 2: Движок рендеринга и эффектов (`src/engine/`)
- [x] Написать рендерер композиций (`Text`, `Shape`, `Solid`, `Media`, `Null`, `Adjustment Layer`)
- [x] Поддержать все основные Blending Modes (`Normal`, `Add`, `Screen`, `Multiply`, `Overlay`, `Difference`, `Lighten`, `Darken`)
- [x] Реализовать интерактивный Transform Gizmo на канвасе (тач-перетаскивание, масштаб, поворот, Anchor Point)
- [x] Реализовать стек эффектов (`Deep Glow`, `Gaussian Blur`, `RGB Split`, `Glitch`, `Motion Tile`, `Drop Shadow`, `Hue/Sat`, `Brightness/Contrast`, `Vignette`, `Pixelate`, `Wiggle Shake`)
- [x] Реализовать рендер и экспорт видео (`WebM/MP4`), кадра (`PNG`) и проекта (`.suep`) с поддержкой нативного сохранения на Android (`AndroidBridge`)

## Фаза 3: Мобильный интерфейс в стиле After Effects (`src/ui/`)
- [x] Адаптивная тёмная тема AE (смартфон портрет + ландшафт + планшет)
- [x] Viewport с транспортом, таймкодом, сеткой Safe Margins и прозрачностью
- [x] Timeline: слои, полосы In/Out, линейка, скраббинг Playhead (CTI), ромбы ключевых кадров
- [x] Inspector: Transform со секундомерами (`Stopwatch`), настройки текста/фигур, Parenting, Expressions
- [x] Effects Panel: каталог эффектов + настройка параметров
- [x] Graph Editor: интерактивные кривые скорости/значения для выбранного ключевого кадра
- [x] Модальные окна: New Composition, Add Layer / Import Media, Export Render, Demo Presets

## Фаза 4: Тестирование, сборка APK и релиз (v1.0)
- [x] Написать юнит-тесты для интерполяции, кривых, выражений и стора (`vitest`)
- [x] Собрать и проверить реальный `.apk` через GitHub Actions
- [x] Опубликовать релиз и выдать прямую ссылку на скачивание `StudioEffect-SU.apk`

## Фаза 5: Продвинутый композитинг и аудио-реактивность (v1.1)
- [x] Аудио-дорожки (импорт MP3/WAV + встроенный Synth Beat 128 BPM), отрисовка волны на таймлайне
- [x] Реакция на бит: переменная `audioAmp` в Expressions + генератор `Convert Audio to Keyframes`
- [x] Маски слоёв (`Rectangle` / `Ellipse`, `Feather`, `Inverted`) и `Track Mattes` (`Alpha Matte` / `Alpha Inverted`)
- [x] Вложенные композиции (`Pre-Compose` + переключатель композиций проекта)
- [x] Новые 5 эффектов (`Radial Zoom Blur`, `Directional Blur`, `Wave Warp`, `Tint / Colorize`, `Exposure & Gamma`) + сортировка стека эффектов
- [x] Пресеты анимации текста (`Typewriter`, `Pop In`, `Slide Up`, `Neon Pulse`), магнитный Snap к центру и зум вьюпорта

## Фаза 6: 3D-слои, монтаж на таймлайне, хромакей и микс звука в экспорте (v1.2)
- [x] Переключатель `3D Layer` (`Z Depth`, `Rotate X`, `Rotate Y` с перспективной матрицей)
- [x] Разрезание слоёв по CTI (`Split Layer`), маркеры таймлайна (`+ M`) и `Time Speed`
- [x] 4 новых эффекта (всего 20 VFX): `Color Key (Green Screen)`, `Symmetry / Kaleido`, `Posterize`, `Halftone Dots`
- [x] Сведение аудиодорожек при экспорте видео и 4-й демо-пресет `3D Card & Beat (9:16)`
- [x] Окно `Xlone-room Hub` внутри приложения со статистикой и ссылкой на обновления APK
- [x] Полная русская и английская локализация (`RU / EN` переключатель в шапке, перевод UI, 20 эффектов, шаблонов и модальных окон)

## Фаза 7: Мобильный интерфейс уровня CapCut + весь функционал After Effects (v1.3)
- [x] Нижний прокручиваемый док инструментов как в CapCut (`Добавить`, `Свойства`, `Эффекты`, `Кривые`, `Ключ ◆`, `Разрезать`, `3D слой`, `Маска`, `Формулы`, `Метка`, `Копия`, `Удалить`)
- [x] Широкий таймлайн на 85%+ ширины экрана по умолчанию (компактная 56px колонка + кнопка `◧` для раскрытия полной AE-панели слоёв)
- [x] Увеличенные мобильные размеры кнопок, слайдеров (`thumb 18px`), полос клипов (`46px`), ручек обрезки (`12px`) и ромбов ключей
- [x] Чистый транспорт-бар и выпадающее меню вида `⚙ Вид` + верхняя навигация редактирования `← Таймлайн | Свойства | Эффекты | Кривые`
