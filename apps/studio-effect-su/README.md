# StudioEffect(SU)

**StudioEffect(SU)** — сверхлёгкий клон Adobe After Effects для Android (`.apk`) в рамках проекта **Xlone-room**.

## Сравнение веса
- **Adobe After Effects (Windows)**: ~4.5 GB
- **StudioEffect(SU) (Android APK)**: **< 500 KB**

## Скачать APK
Прямая ссылка на актуальный релиз:
- **[StudioEffect-SU.apk (Latest)](https://github.com/Aleksandr-pro/Xlone-room/releases/latest/download/StudioEffect-SU.apk)**

## Структура
- `src/core/` — типы данных, интерполяция, кривые Безье, выражения AE (`wiggle`, `loopOut`, `time`), иерархия `Parenting`, `Undo/Redo`, демо-пресеты.
- `src/engine/` — многослойный композитор Canvas, 11 визуальных эффектов, экспорт видео (`WebM/MP4`), кадров (`PNG`) и проектов (`.suep`).
- `src/state/` — реактивное состояние и автосохранение.
- `src/ui/` — мобильный интерфейс AE (`Viewport` + `Gizmo`, `Timeline`, `Inspector`, `Effects`, `Graph Editor`).
- `android/` — нативный Kotlin Android-хост (`MainActivity.kt` + `AndroidBridge` для MediaStore/Downloads и системного выбора медиафайлов).
