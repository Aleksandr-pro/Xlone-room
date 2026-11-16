# Xlone-room

**Xlone-room** — репозиторий сверхлёгких нативных Android-клонов (`.apk`) тяжёлых программ для Windows.

> Наша цель: сохранить ключевые профессиональные инструменты и рабочие процессы оригинальных десктопных программ, упаковав их в нативный Android `.apk`, который весит в **сотни и тысячи раз меньше** оригинала.

---

## Каталог программ (APK)

| Приложение | Клон чего | Размер оригинала (Windows) | Размер клона (Android APK) | Статус | Скачать APK |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **StudioEffect(SU)** | Adobe After Effects | ~4.5 GB | **< 500 KB** | Готов (v1.0) | [Скачать StudioEffect-SU.apk](https://github.com/Aleksandr-pro/Xlone-room/releases/latest/download/StudioEffect-SU.apk) |

---

## StudioEffect(SU) — Карманный After Effects для Android

**StudioEffect(SU)** — нативное Android-приложение (`.apk`) для моушн-дизайна, кейфрейм-анимации, композитинга и визуальных эффектов в стиле Adobe After Effects.

### Ключевые возможности (v1.0):
- **Нативная интеграция с Android**:
  - Выбор фото, видео и `.suep`-проектов прямо из галереи и проводника телефона.
  - Прямое сохранение отрендеренных видео (`WebM/MP4`), кадров (`PNG`) и проектов (`SUEP`) в папку **Загрузки (`Downloads/StudioEffectSU`)** с нативными уведомлениями.
  - Аппаратное ускорение рендеринга и тёмный системный интерфейс.
- **Композиции и пресеты форматов**: `9:16` (Reels/Shorts/TikTok `1080×1920`), `16:9` (`1920×1080`), `1:1` (`1080×1080`), настройка FPS (`24 / 30 / 60`) и длительности.
- **Типы слоёв как в AE**:
  - `Text` (текст, шрифт, обводка, тень, анимация текста)
  - `Shape` (прямоугольник, эллипс, звезда, многоугольник, заливка и обводка)
  - `Solid` (сплошной цвет / градиент)
  - `Media` (импорт фото и видео с телефона)
  - `Adjustment Layer` (корректирующий слой — применяет эффекты ко всем слоям ниже)
  - `Null Object` (невидимый контроллер для привязки слоёв)
- **Иерархия и Parenting (Pick-Whip)**: привязка трансформаций одного слоя к другому.
- **Таймлайн и Keyframes**:
  - `Anchor Point`, `Position`, `Scale`, `Rotation`, `Opacity` с секундомерами (`Stopwatch`).
  - Интерполяция: `Linear`, `Easy Ease`, `Ease In`, `Ease Out`, `Hold` + визуальный **Graph Editor**.
  - Перетаскивание и обрезка слоёв во времени (`In / Out`).
- **Режимы наложения (Blending Modes)**: `Normal`, `Add`, `Screen`, `Multiply`, `Overlay`, `Difference`, `Lighten`, `Darken`.
- **Стек эффектов (Effects)**:
  - `Deep Glow`, `Gaussian Blur`, `RGB Split`, `Glitch / Scanlines`, `Motion Tile`, `Drop Shadow`, `Hue / Saturation`, `Brightness / Contrast`, `Vignette`, `Pixelate`, `Wiggle Shake`.
- **AE Expressions (выражения)**: поддержка `time`, `index`, `wiggle(freq, amp)`, `loopOut()`, `Math.sin/cos`.
- **Рендер и экспорт**: покадровый рендер видео, экспорт кадра `PNG` и обмен проектами `.suep`.

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
