# XL3D Cloud, Auth & MCP Server — Всё на Cloudflare Workers через GitHub

Модуль `apps/xl3d-mcp` работает полностью на бесплатном тарифе **Cloudflare Workers + Durable Objects (SQLite)** и деплоится автоматически через **GitHub**:
- **База данных (SQLite прямо внутри Durable Objects)**: пользователи, долгоживущие сессии, личные MCP-токены, библиотека рабочих пространств (`workspaces`), сцены и журнал действий ИИ-агента (`agent_logs`) создаются и мигрируются автоматически при первом запуске — создавать отдельную внешнюю БД не нужно!
- **Регистрация и Google Auth**: Email + пароль (PBKDF2-SHA256) работают сразу из коробки, а для входа через Google достаточно добавить `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`.
- **Постоянный токен**: сессия сохраняется и в `localStorage`, и в Android `SharedPreferences`, с автопродлением при каждом обращении — при закрытии приложения вход не слетает, а при открытии XL3D сразу подтягивает последние результаты работы агента.
- **Авторизованный MCP + OpenAPI 3.1 сервер**: доступ к `/mcp`, `/api/*` и `/ws` разрешён только по личному постоянному `MCP Token` (`xl3d_mcp_...`) или токену сессии (`xl3d_sess_...`).

---

## Шаг 1. Деплой через GitHub в Cloudflare Workers (бесплатно)

### Вариант А — Cloudflare Workers Builds (самый простой, через GitHub)
1. Зайдите в **Cloudflare Dashboard → Workers & Pages → Create → Import a repository**.
2. Выберите репозиторий `Aleksandr-pro/Xlone-room`.
3. Благодаря корневому `wrangler.toml` стандартные настройки работают автоматически:
   - **Root directory**: `/`
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. После каждого `git push` в `main` Cloudflare сам обновит Worker и применит SQLite-миграции Durable Objects (`RoomHub` и `AccountHub`).
5. Ваш сервер будет доступен по адресу вида `https://xlone-room.<ваш-subdomain>.workers.dev`.

### Вариант Б — Через GitHub Actions
1. В **GitHub → Settings → Secrets and variables → Actions** добавьте:
   - `CLOUDFLARE_API_TOKEN` (шаблон «Edit Cloudflare Workers»)
   - `CLOUDFLARE_ACCOUNT_ID`
2. Workflow `.github/workflows/xl3d-mcp-cloudflare.yml` автоматически соберёт, протестирует и задеплоит `apps/xl3d-mcp`.

---

## Шаг 2. Настройка Google Auth (по желанию, 2 минуты)

Вход и регистрация по **Email + Пароль** работают сразу без дополнительных ключей. Чтобы включить кнопку **«Войти через Google»**:

1. Откройте [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Создайте **OAuth 2.0 Client ID** (тип: **Web application**).
3. В **Authorized redirect URIs** добавьте callback вашего Worker-а:
   ```text
   https://<ваш-worker>.workers.dev/auth/google/callback
   ```
4. Скопируйте **Client ID** и **Client Secret** и добавьте их в **одно из мест**:
   - **Cloudflare Dashboard → ваш Worker → Settings → Variables and Secrets**:
     - `GOOGLE_CLIENT_ID`
     - `GOOGLE_CLIENT_SECRET` (тип Secret)
   - *Или* в **GitHub → Settings → Secrets → Actions** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — GitHub Actions автоматически зальёт их в Worker при деплое!

*(На Android авторизация открывается в системном браузере и автоматически возвращает вас обратно в XL3D по deep-link `xl3d://auth/callback`.)*

---

## Шаг 3. Работа с библиотекой пространств и результатами агента в XL3D

1. Откройте **XL3D** и нажмите **`👤 Войти`** в верхнем баре.
2. Вставьте URL вашего Worker-а (`https://xlone-room.<ваш-subdomain>.workers.dev`), зарегистрируйтесь или войдите (по Email или через Google).
3. Во вкладке **`🗂 Пространства`** создавайте, переименовывайте и переключайте свои 3D-пространства.
4. Закройте приложение и дайте задачу ИИ-агенту — агент продолжит моделировать в облачном пространстве.
5. Когда вы снова откроете XL3D, приложение автоматически восстановит токен, загрузит обновлённую агентом 3D-сцену и покажет историю всех действий во вкладке **`🤖 Агент`**.

---

## Шаг 4. Подключение ИИ-агентов (с авторизацией)

Во вкладке **`🔌 AI / MCP`** или **`👤 Аккаунт`** скопируйте готовый **MCP URL** или **Personal MCP Token** (`xl3d_mcp_...`).

### Claude (Веб / Custom Connector) и Cursor
```text
https://<ваш-worker>.workers.dev/mcp?token=xl3d_mcp_ВАШ_ТОКЕН
```
*(Можно добавить `&room=ws_...` для привязки к конкретному пространству, либо не указывать `room` — тогда агент будет работать в вашем активном пространстве и сможет переключаться через инструменты `list_workspaces` / `select_workspace` / `create_workspace`.)*

### Claude Code (CLI)
```bash
claude mcp add --transport http xl3d "https://<ваш-worker>.workers.dev/mcp?token=xl3d_mcp_ВАШ_ТОКЕН"
```

### Claude Desktop (`stdio.js`)
```json
{
  "mcpServers": {
    "xl3d": {
      "command": "node",
      "args": ["/ПОЛНЫЙ_ПУТЬ/Xlone-room/apps/xl3d-mcp/dist/stdio.js"],
      "env": {
        "XL3D_MCP_URL": "https://<ваш-worker>.workers.dev",
        "XL3D_API_TOKEN": "xl3d_mcp_ВАШ_ТОКЕН"
      }
    }
  }
}
```

### ChatGPT (Custom GPT Actions)
1. **Import from URL**: `https://<ваш-worker>.workers.dev/openapi.json`
2. **Authentication → API Key → Auth Type: Bearer**: вставьте `xl3d_mcp_ВАШ_ТОКЕН`.
