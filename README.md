# Xlone-room

**Xlone-room** — репозиторий сверхлёгких нативных Android-клонов (`.apk`) тяжёлых программ для Windows.

> Наша цель: сохранить ключевые профессиональные инструменты и рабочие процессы оригинальных десктопных программ, упаковав их в нативный Android `.apk`, который весит в **сотни и тысячи раз меньше** оригинала.

---

## Каталог программ (APK)

| Приложение | Клон чего | Размер оригинала (Windows) | Размер клона (Android APK) | Статус | Скачать APK |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **XL3D** | Blender 5.x (5.0–5.3) | ~1.2 GB | **< 120 KB** | Готов (v1.4) | [Скачать XL3D.apk](https://github.com/Aleksandr-pro/Xlone-room/releases/latest/download/XL3D.apk) |
| **StudioEffect(SU)** | Adobe After Effects | ~4.5 GB | **< 100 KB** | Готов (v1.3.1) | [Скачать StudioEffect-SU.apk](https://github.com/Aleksandr-pro/Xlone-room/releases/download/studioeffect-v1.3.11/StudioEffect-SU.apk) |

---

## XL3D — Карманный Blender 5.x для Android

**XL3D** — нативное Android-приложение (`.apk`) для 3D-моделирования, скульптинга, текстурирования, нодовых шейдеров/геометрии, рендеринга, анимации и монтажа, строго следующее функциональной карте Blender 5.0–5.3 с комфортным мобильным тач-интерфейсом.

### Ключевые возможности (v1.0.0):
1. **Моделирование и геометрия**: все 12+ типов объектов (`Mesh`, `Curve`, `NURBS Surface`, `Metaball`, `3D Text`, `Lattice`, `Empty`, `Armature`, `Volume VDB`, `Point Cloud / Gaussian Splats SPZ`, `Grease Pencil 2D`, `Light`, `Camera`), Edit Mode (`Extrude`, `Inset`, `Bevel`, `Loop Cut`, `Knife`, `Bridge/Fill`, `Merge`, `Dissolve`, `Spin`, `Subdivide`, `Triangulate`, `Tris→Quads`, `Shrink/Fatten`, `Smooth`), **LoopTools 5.2** (`Circle`, `Flatten`, `Space`), стек модификаторов (Subsurf, Mirror, Solidify, Bevel, Array, Boolean, Decimate, Remesh, Displace, Cast, Weighted Normal, Geometry Nodes), UV/UDIM и авто-сглаживание нормалей.
2. **Скульптинг и ретопология**: 14 кистей включая **Scene Project (5.2)**, симметрия X/Y/Z + радиальная, маски, Face Sets, Dyntopo, Voxel/Quad Remesh, Multires.
3. **Покраска и запекание (Paint & Bake)**: Texture Paint, Vertex Paint, Weight Paint и запекание карт (`Combined`, `Diffuse`, `Normal`, `AO`, `Roughness`, `Position`, `UV`).
4. **Материалы и Shader Nodes**: Principled BSDF с **Thin Wall (5.2)** и **Glass Dispersion / Anisotropy (5.3)**, процедурные текстуры (`Noise`, `Voronoi`, `Wave`, `Musgrave`, `Checker`, `Brick`, `Magic`), `Shader to RGB`, OSL-флаг.
5. **Рендеринг и Color Management**: `Cycles`, `EEVEE (Next)`, `Workbench`, `Freestyle`, `AgX` / `Filmic` / `ACES` + `Camera Input Space (5.2)`, `Texture Cache (5.2)`, панорамные/360° проекции.
6. **Окружение и физика**: `Sky 5.3` + объемный туман, `Rigid Body`, `Cloth`, `Soft Body`, `Fluid`, `Particles`, `Hair`, `Force Fields`.
7. **Geometry Nodes 5.1–5.3 & Compositor**: `Mesh Bevel (5.2)`, `Raycast`, `Sample Sound`, `XPBD Physics`, `Point Cloud / SPZ`, GPU Compositor & String Nodes.
8. **Анимация, Риггинг и VSE 5.3**: Keyframes, F-Curves + **Gaussian Smooth (5.1)**, Shape Keys, Drivers, **Rigify Humanoid** + 2-bone IK, VSE 5.3 (`Blade 2.0`, `Ripple Delete`, экспорт **OTIO**).
9. **Asset Browser & Форматы**: импорт/экспорт `.OBJ`, `.STL`, `.PLY`, `.GLB`, `.SPZ`, плюс Spreadsheet, Outliner, Preferences (Dark/Light, RU/EN).
10. **Scripting & AI MCP Bridge (v1.2–v1.3)**: встроенный редактор кода (`bpy`/`bmesh` + JS) и WebSocket-мост `🤖 AI` для управления 3D-сценой через ИИ-агентов (Claude, ChatGPT Custom GPT Actions, Grok, Claude Code/Desktop) на базе бесплатного **Cloudflare Worker** (`apps/xl3d-mcp`) — см. [`docs/MCP_CLOUDFLARE_SETUP.md`](./docs/MCP_CLOUDFLARE_SETUP.md).

---

## StudioEffect(SU) — Карманный After Effects для Android

**StudioEffect(SU)** — нативное Android-приложение (`.apk`) для моушн-дизайна, кейфрейм-анимации, композитинга и визуальных эффектов в стиле Adobe After Effects.

---

## Разработка

```bash
npm install
npm run dev        # Предпросмотр XL3D в браузере
npm run dev:su     # Предпросмотр StudioEffect(SU) в браузере
npm test           # Юнит-тесты всех рабочих пространств
npm run build      # Сборка всех приложений для Android APK
```

Нативные Android-проекты находятся в `apps/xl3d/android` и `apps/studio-effect-su/android`.
Подробнее см. [`PLAN.md`](./PLAN.md) и [`TODO.md`](./TODO.md).
