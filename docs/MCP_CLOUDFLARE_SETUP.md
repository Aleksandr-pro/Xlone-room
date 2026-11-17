# XL3D MCP Server — Бесплатный хостинг на Cloudflare Workers через GitHub

Этот модуль (`apps/xl3d-mcp`) превращает **XL3D** в полноценный 3D-инструмент для ИИ-агентов:
- **Claude** (веб-версия `claude.ai`, Claude Desktop, Claude Code, Cursor) — через протокол **MCP (Streamable HTTP + `stdio`)**
- **ChatGPT** (Custom GPT Actions) — через **OpenAPI 3.1** (`/openapi.json`)
- **Grok / HTTP-агенты** — через REST API (`/api/*`)
- **Телефон / Android APK XL3D** — через **WebSocket Relay** на Durable Objects (`RoomHub`) с живым обновлением 3D-вьюпорта и передачей скриншотов вьюпорта ИИ-агенту!

---

## Шаг 1. Бесплатный деплой в Cloudflare Workers через GitHub

1. Зарегистрируйтесь / войдите в бесплатный аккаунт **Cloudflare** (`dash.cloudflare.com`).
2. Скопируйте **Account ID** (в правой колонке на главной странице Workers & Pages).
3. Создайте API Token: **My Profile → API Tokens → Create Token → шаблон "Edit Cloudflare Workers"** → скопируйте токен.
4. Откройте свой репозиторий на **GitHub → Settings → Secrets and variables → Actions → New repository secret** и добавьте два секрета:
   - `CLOUDFLARE_API_TOKEN` — ваш токен из шага 3
   - `CLOUDFLARE_ACCOUNT_ID` — ваш Account ID из шага 2
5. Запустите workflow **GitHub → Actions → `Build & Deploy XL3D MCP (Cloudflare Worker)` → Run workflow** (или он запустится автоматически при следующем push).
6. Через ~30 секунд ваш сервер будет доступен по адресу вида:
   ```
   https://xl3d-mcp.<ваш-subdomain>.workers.dev
   ```
   *(Вариант через Cloudflare Dashboard без GitHub Secrets: **Workers & Pages → Create → Import a repository** → выберите `Xlone-room`. Благодаря корневому `wrangler.toml` стандартные настройки Cloudflare работают «из коробки»: **Root directory**: `/`, **Build command**: `npm run build`, **Deploy command**: `npx wrangler deploy`. Тогда адрес будет вида `https://xlone-room.<ваш-subdomain>.workers.dev`.)*

---

## Шаг 2. Подключение телефона / XL3D.apk

1. Откройте приложение **XL3D** на телефоне (v1.3.0+) или в браузере.
2. Нажмите кнопку **`AI`** в правом верхнем углу.
3. Вставьте URL вашего воркера: `https://xl3d-mcp.<ваш-subdomain>.workers.dev`
4. Нажмите **`Подключиться к Worker`** (Room ID и Token сгенерируются автоматически; зелёный индикатор рядом с `AI` подтвердит соединение).
5. Нажмите кнопку **`📋 MCP URL`** или **`📋 OpenAPI`** чтобы скопировать готовую ссылку.

---

## Шаг 3. Подключение ИИ-агентов

### A. Claude (Веб / iOS / Android — Custom Connector)
1. В настройках Claude → **Connectors → Add custom connector** вставьте скопированный **MCP URL**:
   ```
   https://xl3d-mcp.<ваш-subdomain>.workers.dev/mcp?room=xl3d-xxxx&token=YOUR_TOKEN
   ```

### B. Claude Code (CLI)
```bash
claude mcp add --transport http xl3d "https://xl3d-mcp.<ваш-subdomain>.workers.dev/mcp?room=xl3d-xxxx&token=YOUR_TOKEN"
```

### C. Claude Desktop (`claude_desktop_config.json`, локально через `stdio`)
Можно подключиться к вашему облачному воркеру (чтобы управлять телефоном с ПК) или работать полностью локально:
```json
{
  "mcpServers": {
    "xl3d": {
      "command": "node",
      "args": ["/ПОЛНЫЙ_ПУТЬ/Xlone-room/apps/xl3d-mcp/dist/stdio.js"],
      "env": {
        "XL3D_MCP_URL": "https://xl3d-mcp.<ваш-subdomain>.workers.dev",
        "XL3D_ROOM": "xl3d-xxxx",
        "XL3D_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```
*(Если удалить блок `env`, сервер запустится полностью локально без интернета с полным Python `bpy`/`bmesh` движком.)*

### D. ChatGPT (Custom GPT Actions)
1. Создайте Custom GPT → **Configure → Actions → Create new action**.
2. Нажмите **Import from URL** и вставьте:
   ```
   https://xl3d-mcp.<ваш-subdomain>.workers.dev/openapi.json?room=xl3d-xxxx
   ```
3. В разделе **Authentication** выберите **API Key → Auth Type: Bearer** и вставьте ваш `YOUR_TOKEN`.

---

## Доступные инструменты ИИ-агента (11 Tools)
- `get_scene_info` — структура сцены, объекты, вершины/грани, материалы и модификаторы
- `run_blender_script` — запуск кода на Python (`bpy`, `bmesh`, `from_pydata`, `math`) или JavaScript
- `create_object` — создание примитивов (`cube`, `sphere`, `cone`, `torus`, `monkey`, `light`, `camera`...)
- `create_mesh_from_pydata` — создание произвольных мешей из массивов координат вершин и граней
- `transform_object` — перемещение, поворот, масштабирование
- `apply_edit_op` — `subdivide`, `extrude`, `inset`, `bevel`, `poke`, `looptools_circle`, `uv_unwrap`, `shade_smooth`
- `add_modifier` — `subsurf`, `mirror`, `solidify`, `bevel`, `array`, `boolean`, `decimate`, `wireframe`
- `set_material` — настройка PBR-материала (цвет, металличность, шероховатость, стекло/дисперсия, процедурные текстуры)
- `get_viewport_screenshot` — живой PNG-скриншот 3D-вьюпорта с подключённого устройства
- `undo` — отмена последнего действия
- `export_scene` — экспорт сцены в `.obj`, `.stl`, `.ply` или `.xl3d`
