import { saveDataUrlToDevice } from '../core/fileBridge';
import type { ObjectType, WorkspaceTab } from '../core/types';
import { type MeshPrimitiveKind } from '../engine/primitives';
import { renderViewport3D } from '../engine/renderer3d';
import { DEFAULT_CLOUD_SERVER_URL, mcpBridge } from '../state/mcpBridge';
import { store } from '../state/xl3dStore';
import { mountEditorPanel } from './editors';
import { mountViewport } from './viewport';

type CloudModalTab = 'workspaces' | 'results' | 'mcp' | 'account';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAgo(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}с назад`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}ч назад`;
  return new Date(ts).toLocaleDateString();
}

export function mountXL3DApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="xl-app" id="xl-app-root" data-panel="half">
      <header class="xl-header">
        <div class="xl-brand">
          <span class="xl-logo-dot"></span>
          <strong>XL3D</strong>
          <span class="xl-ver-badge" id="xl-ws-badge">Blender 5.3</span>
        </div>
        <div class="xl-header-actions">
          <button class="xl-btn xl-btn-sm xl-cloud-btn" id="xl-cloud-btn" title="Аккаунт и библиотека пространств">
            <span id="xl-cloud-lbl">Войти</span>
            <span class="xl-unread-dot" id="xl-unread-dot" hidden></span>
          </button>
          <button class="xl-btn xl-btn-sm xl-ai-btn" id="xl-ai-btn" title="AI / MCP Bridge (Cloudflare Worker)">
            <span class="xl-ai-dot" id="xl-ai-dot" data-status="disconnected"></span>
            <span>AI</span>
          </button>
          <button class="xl-btn xl-btn-icon" id="xl-undo-btn">↶</button>
          <button class="xl-btn xl-btn-icon" id="xl-redo-btn">↷</button>
          <button class="xl-btn xl-btn-sm" id="xl-theme-btn">◐</button>
          <button class="xl-btn xl-btn-sm" id="xl-lang-btn">RU</button>
        </div>
      </header>

      <main class="xl-workspace">
        <section class="xl-viewport-pane" id="xl-vp-pane"></section>
        <div class="xl-splitter" id="xl-splitter">
          <span class="xl-splitter-pill">⇕ <span id="xl-panel-size-lbl">50 / 50</span></span>
        </div>
        <section class="xl-editor-pane" id="xl-editor-pane"></section>
      </main>

      <nav class="xl-bottom-nav" id="xl-bottom-nav"></nav>

      <div class="xl-modal-backdrop" id="xl-modal" hidden>
        <div class="xl-modal-sheet" id="xl-modal-body"></div>
      </div>
    </div>
  `;

  const appRoot = root.querySelector('#xl-app-root') as HTMLElement;
  const vpPane = root.querySelector('#xl-vp-pane') as HTMLElement;
  const edPane = root.querySelector('#xl-editor-pane') as HTMLElement;
  const navEl = root.querySelector('#xl-bottom-nav') as HTMLElement;
  const splitter = root.querySelector('#xl-splitter') as HTMLElement;
  const sizeLbl = root.querySelector('#xl-panel-size-lbl') as HTMLElement;
  const modalBackdrop = root.querySelector('#xl-modal') as HTMLElement;
  const modalBody = root.querySelector('#xl-modal-body') as HTMLElement;

  const tabs: Array<{ id: WorkspaceTab; icon: string; label: () => string }> = [
    { id: 'tools', icon: '🛠', label: () => store.t().tabs.tools },
    { id: 'outliner', icon: '🌳', label: () => store.t().tabs.outliner },
    { id: 'properties', icon: '⚙', label: () => store.t().tabs.properties },
    { id: 'nodes', icon: '☍', label: () => store.t().tabs.nodes },
    { id: 'animation', icon: '▶', label: () => store.t().tabs.animation },
    { id: 'scripting', icon: '</>', label: () => store.t().tabs.scripting },
    { id: 'editors', icon: '▦', label: () => store.t().tabs.editors },
  ];

  function renderNavAndTheme(): void {
    appRoot.setAttribute('data-theme', store.theme);
    appRoot.setAttribute('data-panel', store.panelHeightMode);
    sizeLbl.textContent =
      store.panelHeightMode === 'compact'
        ? 'Большой 3D вид'
        : store.panelHeightMode === 'tall'
        ? 'Развёрнутая панель'
        : '50 / 50';

    navEl.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;
    navEl.innerHTML = tabs
      .map(
        (tb) => `
          <button class="xl-nav-item ${store.activeTab === tb.id ? 'active' : ''}" data-tab="${tb.id}">
            <span class="xl-nav-icon">${tb.icon}</span>
            <span class="xl-nav-label">${tb.label()}</span>
          </button>
        `
      )
      .join('');
    const langBtn = root.querySelector('#xl-lang-btn');
    if (langBtn) langBtn.textContent = store.locale.toUpperCase();
    const aiDot = root.querySelector('#xl-ai-dot');
    if (aiDot) aiDot.setAttribute('data-status', mcpBridge.status);

    const cloudLbl = root.querySelector('#xl-cloud-lbl');
    const wsBadge = root.querySelector('#xl-ws-badge');
    const unreadDot = root.querySelector('#xl-unread-dot') as HTMLElement | null;
    if (mcpBridge.isAuthenticated() && mcpBridge.config.user) {
      const ws = mcpBridge.getActiveWorkspace();
      const firstWord = mcpBridge.config.user.name.split(/\s+/)[0] || 'Профиль';
      if (cloudLbl) cloudLbl.textContent = `👤 ${firstWord.slice(0, 10)}`;
      if (wsBadge) wsBadge.textContent = ws ? ws.name.slice(0, 14) : 'Cloud';
    } else {
      if (cloudLbl) cloudLbl.textContent = '👤 Войти';
      if (wsBadge) wsBadge.textContent = 'Blender 5.3';
    }
    if (unreadDot) {
      unreadDot.hidden = !mcpBridge.hasUnreadAgentUpdates;
    }
  }

  let cloudModalOpen = false;
  let cloudTab: CloudModalTab = 'account';
  let authMode: 'login' | 'register' = 'login';
  let showFullMcpToken = false;
  let cloudActionStatus = '';

  function closeModal(): void {
    cloudModalOpen = false;
    modalBackdrop.hidden = true;
    modalBody.innerHTML = '';
  }

  function renderCloudModalBody(): void {
    if (!cloudModalOpen) return;
    const isAuthed = mcpBridge.isAuthenticated();
    if (!isAuthed && (cloudTab === 'workspaces' || cloudTab === 'results')) {
      cloudTab = 'account';
    }

    const activeWs = mcpBridge.getActiveWorkspace();
    const mcpUrl = mcpBridge.getMcpHttpUrl();
    const openApiUrl = mcpBridge.getOpenApiUrl();
    const isConnected = mcpBridge.status === 'connected';
    const mcpToken = mcpBridge.getEffectiveMcpToken();

    const modalTabsHtml = `
      <div class="xl-cloud-tabs">
        <button class="xl-chip ${cloudTab === 'workspaces' ? 'active' : ''}" data-ctab="workspaces" ${!isAuthed ? 'disabled' : ''}>🗂 Пространства</button>
        <button class="xl-chip ${cloudTab === 'results' ? 'active' : ''}" data-ctab="results" ${!isAuthed ? 'disabled' : ''}>🤖 Агент${mcpBridge.hasUnreadAgentUpdates ? ' •' : ''}</button>
        <button class="xl-chip ${cloudTab === 'mcp' ? 'active' : ''}" data-ctab="mcp">🔌 AI / MCP</button>
        <button class="xl-chip ${cloudTab === 'account' ? 'active' : ''}" data-ctab="account">👤 ${isAuthed ? 'Аккаунт' : 'Вход'}</button>
      </div>
    `;

    let bodyHtml = '';

    if (cloudTab === 'account') {
      if (!isAuthed) {
        bodyHtml = `
          <div class="xl-field-group">
            <label>Cloudflare Worker URL (единый сервер БД, Auth и MCP)</label>
            <input type="text" class="xl-input" id="xl-ai-url" value="${esc(mcpBridge.config.serverUrl || DEFAULT_CLOUD_SERVER_URL)}" placeholder="${esc(DEFAULT_CLOUD_SERVER_URL)}" />
          </div>
          <div class="xl-chip-row" style="margin-bottom:10px;">
            <button class="xl-chip ${authMode === 'login' ? 'active' : ''}" id="xl-auth-mode-login">Вход</button>
            <button class="xl-chip ${authMode === 'register' ? 'active' : ''}" id="xl-auth-mode-reg">Регистрация</button>
          </div>
          ${authMode === 'register' ? `
            <div class="xl-field-group">
              <label>Имя</label>
              <input type="text" class="xl-input" id="xl-auth-name" placeholder="Aleksandr" />
            </div>
          ` : ''}
          <div class="xl-field-group">
            <label>Email</label>
            <input type="email" class="xl-input" id="xl-auth-email" placeholder="you@example.com" />
          </div>
          <div class="xl-field-group">
            <label>Пароль (мин. 6 символов)</label>
            <input type="password" class="xl-input" id="xl-auth-pass" placeholder="••••••" />
          </div>
          ${mcpBridge.authError ? `<div class="xl-err-banner">${esc(mcpBridge.authError)}</div>` : ''}
          <div class="xl-chip-row" style="margin-top:8px;">
            <button class="xl-btn xl-btn-primary" id="xl-auth-submit" ${mcpBridge.authBusy ? 'disabled' : ''}>
              ${mcpBridge.authBusy ? 'Подождите...' : authMode === 'register' ? 'Зарегистрироваться' : 'Войти'}
            </button>
            <button class="xl-btn xl-google-btn" id="xl-auth-google" ${mcpBridge.authBusy ? 'disabled' : ''}>
              <span class="xl-google-g">G</span> Войти через Google
            </button>
          </div>
          <div class="xl-hint-text">
            Токен сессии сохраняется постоянно на устройстве — после закрытия приложения вход не сбрасывается.
          </div>
        `;
      } else {
        const u = mcpBridge.config.user!;
        bodyHtml = `
          <div class="xl-section-card" style="padding:10px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
              <div>
                <div style="font-weight:700;font-size:14px;">${esc(u.name)}</div>
                <div style="font-size:12px;color:var(--xl-muted);">${esc(u.email)}</div>
                <div style="margin-top:4px;">
                  <span class="xl-badge-mini">${u.provider === 'google' ? 'Google Auth' : 'Email'}</span>
                  <span class="xl-badge-mini" style="background:rgba(34,197,94,0.18);color:#86efac;">🔒 Токен сохранён</span>
                </div>
              </div>
              <button class="xl-btn xl-btn-danger xl-btn-sm" id="xl-auth-logout">Выйти</button>
            </div>
          </div>
          <div class="xl-field-group">
            <label>Cloudflare Worker URL</label>
            <input type="text" class="xl-input" id="xl-ai-url" value="${esc(mcpBridge.config.serverUrl || DEFAULT_CLOUD_SERVER_URL)}" />
          </div>
          <div class="xl-section-card" style="padding:10px;">
            <div class="xl-card-subtitle" style="margin-top:0;">Личный постоянный MCP API Token</div>
            <div style="font-family:monospace;font-size:12px;word-break:break-all;margin-bottom:8px;">
              ${esc(showFullMcpToken ? mcpToken : u.mcpTokenPreview)}
            </div>
            <div class="xl-chip-row">
              <button class="xl-btn xl-btn-sm" id="xl-tok-toggle">${showFullMcpToken ? 'Скрыть' : 'Показать'}</button>
              <button class="xl-btn xl-btn-sm" id="xl-tok-copy">📋 Копировать токен</button>
              <button class="xl-btn xl-btn-sm" id="xl-tok-regen">↻ Перевыпустить</button>
            </div>
          </div>
        `;
      }
    } else if (cloudTab === 'workspaces') {
      const list = mcpBridge.config.workspaces;
      bodyHtml = `
        <div class="xl-chip-row" style="margin-bottom:10px;">
          <button class="xl-btn xl-btn-primary xl-btn-sm" id="xl-ws-save-cloud">☁ Сохранить сцену в активное</button>
          <button class="xl-btn xl-btn-sm" id="xl-ws-pull">↻ Обновить список</button>
        </div>
        <div class="xl-section-card" style="padding:10px;margin-bottom:10px;">
          <div class="xl-card-subtitle" style="margin-top:0;">Создать рабочее пространство</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <input type="text" class="xl-input" id="xl-ws-new-name" placeholder="Например: Sci-Fi Helmet" style="flex:1;min-width:140px;" />
            <button class="xl-btn xl-btn-sm" id="xl-ws-create-empty">+ Пустое</button>
            <button class="xl-btn xl-btn-sm xl-btn-primary" id="xl-ws-create-copy">+ Из сцены</button>
          </div>
        </div>
        <div class="xl-ws-list">
          ${list.map((w) => {
            const isAct = activeWs?.id === w.id;
            return `
              <div class="xl-ws-card ${isAct ? 'active' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                  <div>
                    <div style="font-weight:700;font-size:13px;">
                      ${isAct ? '🟢 ' : ''}${esc(w.name)}
                    </div>
                    <div style="font-size:11px;color:var(--xl-muted);">
                      Объектов: ${w.objectCount} · Rev #${w.revision} · ${formatAgo(w.updatedAt)}
                    </div>
                    ${w.lastAgentTool ? `
                      <div style="font-size:11px;color:#ffb169;margin-top:3px;">
                        🤖 ${esc(w.lastAgentTool)} (${formatAgo(w.lastAgentAt)})
                      </div>
                    ` : ''}
                  </div>
                  <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button class="xl-btn xl-btn-sm ${isAct ? 'xl-btn-primary' : ''}" data-ws-open="${esc(w.id)}">
                      ${isAct ? 'Загрузить' : 'Открыть'}
                    </button>
                    <button class="xl-btn xl-btn-sm" data-ws-rename="${esc(w.id)}" title="Переименовать">✎</button>
                    ${list.length > 1 ? `<button class="xl-btn xl-btn-sm xl-btn-danger" data-ws-del="${esc(w.id)}" title="Удалить">🗑</button>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else if (cloudTab === 'results') {
      const logs = mcpBridge.agentLogs;
      bodyHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px;flex-wrap:wrap;">
          <div style="font-size:12px;color:var(--xl-muted);">
            Пространство: <strong>${esc(activeWs?.name ?? '—')}</strong> (Rev #${mcpBridge.cloudRevision})
          </div>
          <button class="xl-btn xl-btn-primary xl-btn-sm" id="xl-res-refresh">↻ Загрузить результаты агента</button>
        </div>
        ${logs.length === 0 ? `
          <div class="xl-section-card" style="padding:14px;text-align:center;color:var(--xl-muted);font-size:12px;">
            Пока нет запусков агента в этом пространстве. Подключите Claude / ChatGPT / Cursor во вкладке AI / MCP.
          </div>
        ` : `
          <div class="xl-ws-list">
            ${logs.map((l) => `
              <div class="xl-ws-card">
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px;">
                  <span>
                    <span class="xl-badge-mini">${esc(l.source)}</span>
                    <strong>${esc(l.toolName || l.tool || 'tool')}</strong>
                    ${l.status === 'error' ? '❌' : '✅'}
                  </span>
                  <span style="color:var(--xl-muted);">Rev #${l.revision} · ${formatAgo(l.createdAt)}</span>
                </div>
                <div style="font-size:11.5px;color:var(--xl-text);word-break:break-word;">${esc(l.summary)}</div>
              </div>
            `).join('')}
          </div>
        `}
      `;
    } else {
      bodyHtml = `
        <div class="xl-field-group">
          <label>Cloudflare Worker URL (https://xlone-room...workers.dev)</label>
          <input type="text" class="xl-input" id="xl-ai-url" value="${esc(mcpBridge.config.serverUrl || DEFAULT_CLOUD_SERVER_URL)}" placeholder="${esc(DEFAULT_CLOUD_SERVER_URL)}" />
        </div>
        <div class="xl-grid-2" style="gap:8px;">
          <div class="xl-field-group">
            <label>Workspace / Room ID</label>
            <input type="text" class="xl-input" id="xl-ai-room" value="${esc(mcpBridge.getEffectiveRoomId())}" ${isAuthed ? 'readonly' : ''} />
          </div>
          <div class="xl-field-group">
            <label>MCP Access Token</label>
            <input type="text" class="xl-input" id="xl-ai-token" value="${esc(mcpToken)}" ${isAuthed ? 'readonly' : ''} />
          </div>
        </div>
        <div class="xl-chip-row" style="margin-bottom:10px;">
          <button class="xl-btn ${isConnected ? 'xl-btn-danger' : 'xl-btn-primary'}" id="xl-ai-toggle">
            ${isConnected ? 'Отключиться' : mcpBridge.status === 'connecting' ? 'Подключение...' : 'Подключиться (Live WS)'}
          </button>
          <button class="xl-btn" id="xl-ai-regen">↻ Новый MCP Token</button>
        </div>
        ${mcpBridge.lastError ? `<div class="xl-err-banner">${esc(mcpBridge.lastError)}</div>` : ''}
        ${mcpUrl ? `
          <div class="xl-section-card" style="padding:10px;margin-bottom:10px;">
            <div class="xl-card-subtitle" style="margin-top:0;">Авторизованные ссылки для ИИ-агентов</div>
            <div class="xl-chip-row">
              <button class="xl-btn xl-btn-sm" id="xl-copy-mcp">📋 MCP URL (Claude / Cursor)</button>
              <button class="xl-btn xl-btn-sm" id="xl-copy-openapi">📋 OpenAPI (ChatGPT)</button>
              <button class="xl-btn xl-btn-sm" id="xl-copy-bearer">📋 Bearer Token</button>
              <button class="xl-btn xl-btn-sm" id="xl-copy-cli">📋 Claude Code CLI</button>
            </div>
          </div>
        ` : ''}
        <div class="xl-console-box">
          ${mcpBridge.logs.map((l) => `<div>${esc(l)}</div>`).join('')}
        </div>
      `;
    }

    modalBody.innerHTML = `
      <div class="xl-modal-header">
        <strong>☁ XL3D Cloud · Workspaces & MCP</strong>
        <button class="xl-btn" id="xl-modal-close">✕</button>
      </div>
      ${modalTabsHtml}
      ${cloudActionStatus ? `<div class="xl-ok-banner">${esc(cloudActionStatus)}</div>` : ''}
      ${bodyHtml}
    `;

    modalBody.querySelector('#xl-modal-close')?.addEventListener('click', closeModal);
    modalBody.querySelectorAll('[data-ctab]').forEach((b) =>
      b.addEventListener('click', () => {
        const next = (b as HTMLElement).dataset.ctab as CloudModalTab;
        if (next === 'results') mcpBridge.markAgentUpdatesRead();
        cloudTab = next;
        cloudActionStatus = '';
        renderCloudModalBody();
      })
    );

    const urlInp = modalBody.querySelector('#xl-ai-url') as HTMLInputElement | null;
    const roomInp = modalBody.querySelector('#xl-ai-room') as HTMLInputElement | null;
    const tokInp = modalBody.querySelector('#xl-ai-token') as HTMLInputElement | null;
    const syncFields = () => {
      if (!urlInp) return;
      const patch: Record<string, string> = { serverUrl: urlInp.value.trim() || DEFAULT_CLOUD_SERVER_URL };
      if (!isAuthed && roomInp && tokInp) {
        patch.roomId = roomInp.value.trim() || 'default';
        patch.token = tokInp.value.trim();
      }
      mcpBridge.updateConfig(patch);
    };
    urlInp?.addEventListener('change', syncFields);
    roomInp?.addEventListener('change', syncFields);
    tokInp?.addEventListener('change', syncFields);

    // Account tab listeners
    modalBody.querySelector('#xl-auth-mode-login')?.addEventListener('click', () => {
      authMode = 'login';
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-auth-mode-reg')?.addEventListener('click', () => {
      authMode = 'register';
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-auth-submit')?.addEventListener('click', async () => {
      syncFields();
      const email = (modalBody.querySelector('#xl-auth-email') as HTMLInputElement)?.value.trim() ?? '';
      const pass = (modalBody.querySelector('#xl-auth-pass') as HTMLInputElement)?.value ?? '';
      const name = (modalBody.querySelector('#xl-auth-name') as HTMLInputElement)?.value.trim() ?? '';
      const ok =
        authMode === 'register'
          ? await mcpBridge.register(email, pass, name)
          : await mcpBridge.login(email, pass);
      if (ok) {
        cloudTab = 'workspaces';
        cloudActionStatus = '✓ Вы успешно вошли! Токен сохранён.';
      }
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-auth-google')?.addEventListener('click', () => {
      syncFields();
      void mcpBridge.startGoogleAuth();
    });
    modalBody.querySelector('#xl-auth-logout')?.addEventListener('click', async () => {
      await mcpBridge.logout();
      cloudActionStatus = '';
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-tok-toggle')?.addEventListener('click', () => {
      showFullMcpToken = !showFullMcpToken;
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-tok-copy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(mcpToken).catch(() => {});
      cloudActionStatus = '✓ MCP Token скопирован';
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-tok-regen')?.addEventListener('click', async () => {
      await mcpBridge.regenerateMcpToken();
      showFullMcpToken = true;
      cloudActionStatus = '✓ Выпущен новый личный MCP Token';
      renderCloudModalBody();
    });

    // Workspaces tab listeners
    modalBody.querySelector('#xl-ws-save-cloud')?.addEventListener('click', async () => {
      try {
        await mcpBridge.saveCurrentSceneToCloud();
        cloudActionStatus = `✓ Сцена сохранена в облаке (Rev #${mcpBridge.cloudRevision})`;
      } catch (e) {
        cloudActionStatus = `✕ ${e instanceof Error ? e.message : String(e)}`;
      }
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-ws-pull')?.addEventListener('click', async () => {
      await mcpBridge.refreshAccountAndWorkspaces();
      cloudActionStatus = '✓ Библиотека пространств обновлена';
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-ws-create-empty')?.addEventListener('click', async () => {
      const name = (modalBody.querySelector('#xl-ws-new-name') as HTMLInputElement)?.value.trim() || 'New Studio';
      await mcpBridge.createWorkspace(name, '', false);
      cloudActionStatus = `✓ Создано пространство "${name}"`;
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-ws-create-copy')?.addEventListener('click', async () => {
      const name = (modalBody.querySelector('#xl-ws-new-name') as HTMLInputElement)?.value.trim() || 'Scene Copy';
      await mcpBridge.createWorkspace(name, 'Копия текущей сцены', true);
      cloudActionStatus = `✓ Сохранено новое пространство "${name}"`;
      renderCloudModalBody();
    });
    modalBody.querySelectorAll('[data-ws-open]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = (b as HTMLElement).dataset.wsOpen!;
        await mcpBridge.switchWorkspace(id);
        cloudActionStatus = '✓ Загружена актуальная сцена из облака';
        renderCloudModalBody();
      })
    );
    modalBody.querySelectorAll('[data-ws-rename]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = (b as HTMLElement).dataset.wsRename!;
        const cur = mcpBridge.config.workspaces.find((w) => w.id === id)?.name ?? '';
        const nextName = window.prompt('Новое название пространства:', cur);
        if (nextName && nextName.trim()) {
          await mcpBridge.renameWorkspace(id, nextName.trim());
          renderCloudModalBody();
        }
      })
    );
    modalBody.querySelectorAll('[data-ws-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = (b as HTMLElement).dataset.wsDel!;
        await mcpBridge.deleteWorkspace(id);
        cloudActionStatus = 'Пространство удалено';
        renderCloudModalBody();
      })
    );

    // Results tab listeners
    modalBody.querySelector('#xl-res-refresh')?.addEventListener('click', async () => {
      await mcpBridge.pullLatestWorkspaceState(true, true);
      mcpBridge.markAgentUpdatesRead();
      cloudActionStatus = `✓ Загружена сцена (Rev #${mcpBridge.cloudRevision})`;
      renderCloudModalBody();
    });

    // MCP tab listeners
    modalBody.querySelector('#xl-ai-toggle')?.addEventListener('click', () => {
      syncFields();
      if (mcpBridge.status === 'connected' || mcpBridge.status === 'connecting') mcpBridge.disconnect();
      else mcpBridge.connect();
      renderCloudModalBody();
    });
    modalBody.querySelector('#xl-ai-regen')?.addEventListener('click', () => {
      mcpBridge.regenerateToken();
      renderCloudModalBody();
    });
    const copyText = (txt: string, label: string) => {
      navigator.clipboard?.writeText(txt).catch(() => {});
      mcpBridge.logs.push(`✓ Скопировано: ${label}`);
      cloudActionStatus = `✓ Скопировано: ${label}`;
      renderCloudModalBody();
    };
    modalBody.querySelector('#xl-copy-mcp')?.addEventListener('click', () => copyText(mcpUrl, 'MCP URL'));
    modalBody.querySelector('#xl-copy-openapi')?.addEventListener('click', () => copyText(openApiUrl, 'OpenAPI URL'));
    modalBody.querySelector('#xl-copy-bearer')?.addEventListener('click', () => copyText(mcpToken, 'Bearer Token'));
    modalBody.querySelector('#xl-copy-cli')?.addEventListener('click', () =>
      copyText(`claude mcp add --transport http xl3d "${mcpUrl}"`, 'Claude Code CLI')
    );
  }

  function openCloudModal(initialTab: CloudModalTab): void {
    cloudTab = initialTab;
    cloudActionStatus = '';
    if (initialTab === 'results') mcpBridge.markAgentUpdatesRead();
    cloudModalOpen = true;
    modalBackdrop.hidden = false;
    renderCloudModalBody();
  }

  function openAddModal(): void {
    const meshes: Array<[MeshPrimitiveKind, string]> = [
      ['cube', 'Cube'], ['sphere', 'UV Sphere'], ['icosphere', 'Icosphere'],
      ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['torus', 'Torus'],
      ['plane', 'Plane'], ['monkey', 'Suzanne Monkey'],
    ];
    const specials: Array<[Exclude<ObjectType, 'mesh'>, string]> = [
      ['curve', 'Curve (Bezier)'], ['surface', 'NURBS Surface'], ['metaball', 'Metaball'],
      ['text', '3D Text'], ['lattice', 'Lattice'], ['empty', 'Empty'],
      ['armature', 'Armature Rig'], ['volume', 'Volume (VDB)'], ['pointcloud', 'Point Cloud / SPZ'],
      ['greasepencil', 'Grease Pencil 2D'], ['light', 'Light (Sun/Point)'], ['camera', 'Camera'],
    ];
    modalBody.innerHTML = `
      <div class="xl-modal-header">
        <strong>${store.t().addObject} (Blender 5.3)</strong>
        <button class="xl-btn" id="xl-modal-close">✕</button>
      </div>
      <div class="xl-card-subtitle">Mesh Primitives</div>
      <div class="xl-grid-3">
        ${meshes.map(([id, lbl]) => `<button class="xl-btn" data-add-prim="${id}">${lbl}</button>`).join('')}
      </div>
      <div class="xl-card-subtitle" style="margin-top:12px;">Curves, Rigging, Volumetrics, Splats & Helpers</div>
      <div class="xl-grid-3">
        ${specials.map(([id, lbl]) => `<button class="xl-btn" data-add-spec="${id}">${lbl}</button>`).join('')}
      </div>
    `;
    modalBackdrop.hidden = false;
    modalBody.querySelector('#xl-modal-close')?.addEventListener('click', closeModal);
    modalBody.querySelectorAll('[data-add-prim]').forEach((b) =>
      b.addEventListener('click', () => {
        store.addObject('mesh', (b as HTMLElement).dataset.addPrim as MeshPrimitiveKind);
        closeModal();
      })
    );
    modalBody.querySelectorAll('[data-add-spec]').forEach((b) =>
      b.addEventListener('click', () => {
        store.addObject((b as HTMLElement).dataset.addSpec as Exclude<ObjectType, 'mesh'>);
        closeModal();
      })
    );
  }

  function openRenderModal(): void {
    modalBody.innerHTML = `
      <div class="xl-modal-header">
        <strong>Render · ${store.scene.render.engine.toUpperCase()} (${store.scene.render.colorTransform.toUpperCase()})</strong>
        <button class="xl-btn" id="xl-modal-close">✕</button>
      </div>
      <canvas id="xl-render-canvas" width="768" height="480" style="width:100%;border-radius:12px;background:#111;"></canvas>
      <div class="xl-chip-row" style="margin-top:12px;">
        <button class="xl-btn xl-btn-primary" id="xl-save-render">${store.t().exportFramePng}</button>
      </div>
    `;
    modalBackdrop.hidden = false;
    const rc = modalBody.querySelector('#xl-render-canvas') as HTMLCanvasElement;
    const rctx = rc.getContext('2d')!;
    renderViewport3D(rctx, rc.width, rc.height, store.scene, store.camera, 'object', store.paint, false, true);
    modalBody.querySelector('#xl-modal-close')?.addEventListener('click', closeModal);
    modalBody.querySelector('#xl-save-render')?.addEventListener('click', () => {
      saveDataUrlToDevice(`xl3d-render-f${store.scene.currentFrame}.png`, rc.toDataURL('image/png'), 'image/png');
    });
  }

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  splitter.addEventListener('click', () => store.cyclePanelHeight());

  navEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
    if (btn) store.setActiveTab(btn.dataset.tab as WorkspaceTab);
  });

  root.querySelector('#xl-cloud-btn')?.addEventListener('click', () => {
    if (mcpBridge.hasUnreadAgentUpdates) openCloudModal('results');
    else if (mcpBridge.isAuthenticated()) openCloudModal('workspaces');
    else openCloudModal('account');
  });
  root.querySelector('#xl-ai-btn')?.addEventListener('click', () => {
    openCloudModal(mcpBridge.isAuthenticated() ? 'mcp' : 'account');
  });
  root.querySelector('#xl-undo-btn')?.addEventListener('click', () => store.undo());
  root.querySelector('#xl-redo-btn')?.addEventListener('click', () => store.redo());
  root.querySelector('#xl-theme-btn')?.addEventListener('click', () =>
    store.setLocaleAndTheme(undefined, store.theme === 'dark' ? 'light' : 'dark')
  );
  root.querySelector('#xl-lang-btn')?.addEventListener('click', () =>
    store.setLocaleAndTheme(store.locale === 'ru' ? 'en' : 'ru')
  );

  mountViewport(vpPane, openAddModal, openRenderModal);
  mountEditorPanel(edPane);
  renderNavAndTheme();
  store.subscribe(renderNavAndTheme);
  mcpBridge.subscribe(() => {
    renderNavAndTheme();
    renderCloudModalBody();
  });
  void mcpBridge.bootstrap();
}
