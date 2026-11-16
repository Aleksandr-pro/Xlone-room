# Xlone-room

**Xlone-room** — репозиторий сверхлёгких нативных Android-клонов (`.apk`) тяжёлых программ для Windows.

> Наша цель: сохранить ключевые профессиональные инструменты и рабочие процессы оригинальных десктопных программ, упаковав их в нативный Android `.apk`, который весит в **сотни и тысячи раз меньше** оригинала.

---

## Каталог программ (APK)

| Приложение | Клон чего | Размер оригинала (Windows) | Размер клона (Android APK) | Статус | Скачать APK |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **StudioEffect(SU)** | Adobe After Effects | ~4.5 GB | **< 100 KB** | Готов (v1.1) | [Скачать StudioEffect-SU.apk](https://github.com/Aleksandr-pro/Xlone-room/releases/latest/download/StudioEffect-SU.apk) |

---

## StudioEffect(SU) — Карманный After Effects для Android

**StudioEffect(SU)** — нативное Android-приложение (`.apk`) для моушн-дизайна, кейфрейм-анимации, композитинга и визуальных эффектов в стиле Adobe After Effects.

### Ключевые возможности (v1.1):
- **Нативная интеграция с Android**:
  - Выбор фото, видео, музыки и `.suep`-проектов прямо из галереи и проводника телефона.
  - Прямое сохранение отрендеренных видео (`WebM/MP4`), кадров (`PNG`) и проектов (`SUEP`) в папку **Загрузки (`Downloads/StudioEffectSU`)** с нативными уведомлениями.
  - Аппаратное ускорение рендеринга и защита от засыпания экрана при рендере.
- **Композиции и Pre-Compose**: `9:16` (`1080×1920`), `16:9` (`1920×1080`), `1:1` (`1080×1080`), FPS (`24 / 30 / 60`), вложенные **Pre-Compositions** и менеджер композиций.
- **Типы слоёв как в AE**:
  - `Text` (текст, шрифт, обводка, тень, пресеты анимации: `Typewriter`, `Pop In`, `Slide Up`, `Neon Pulse`)
  - `Shape` (прямоугольник, эллипс, звезда, многоугольник, заливка и обводка)
  - `Solid` (сплошной цвет / градиент)
  - `Media` (импорт фото и видео с телефона)
  - `Audio` (импорт MP3/WAV + встроенный `Synth Beat 128 BPM`, отображение аудиоволны на таймлайне и **Convert Audio to Keyframes**)
  - `Pre-Comp`, `Adjustment Layer` и `Null Object`
- **Маски и Track Mattes**: маски слоёв (`Rectangle` / `Ellipse`, `Feather`, `Inverted`) и `Alpha Matte` / `Alpha Inverted`.
- **Иерархия, Магнитный Snap и Viewport Zoom**: `Parent & Link`, магнитная привязка к центру, зум вьюпорта.
- **Таймлайн и Keyframes**: `Anchor Point`, `Position`, `Scale`, `Rotation`, `Opacity`, `Linear / Easy Ease / Ease In / Ease Out / Hold` + **Graph Editor**.
- **Режимы наложения (Blending Modes)**: `Normal`, `Add`, `Screen`, `Multiply`, `Overlay`, `Difference`, `Lighten`, `Darken`.
- **16 эффектов (VFX)**: `Deep Glow`, `Gaussian Blur`, `Radial Zoom Blur`, `Directional Blur`, `Wave Warp`, `RGB Split`, `Glitch / Scanlines`, `Motion Tile`, `Camera Shake`, `Drop Shadow`, `Hue / Saturation`, `Brightness / Contrast`, `Tint / Colorize`, `Exposure & Gamma`, `Vignette`, `Pixelate` с изменением порядка стека.
- **AE Expressions (выражения)**: поддержка `time`, `index`, `audioAmp`, `wiggle(freq, amp)`, `loopOut()`, `random()`, `Math.*`.

---

## Разработка

```bash
npm install
npm run dev       # Предпросмотр интерфейса и движка в браузере
npm test          # Юнит-тесты ядра анимации и выражений
npm run build     # Сборка движка для упаковки в Android APK
```

Нативный Android-проект находится в [`apps/studio-effect-su/android`](./apps/studio-effect-su/android). Сборка и публикация `.apk` автоматизирована через GitHub Actions.

Подробнее о плане и задачах см. [`PLAN.md`](./PLAN.md) и [`TODO.md`](./TODO.md).
