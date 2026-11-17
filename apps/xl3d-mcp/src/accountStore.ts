import { hashPassword, randomToken, sha256Hex, verifyPassword } from './authCrypto';

export interface SqlExecutor {
  exec<T extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    ...params: unknown[]
  ): T[];
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: 'email' | 'google';
  activeWorkspaceId: string | null;
  mcpTokenPreview: string;
  createdAt: number;
}

export interface WorkspaceSummary {
  id: string;
  userId: string;
  name: string;
  description: string;
  objectCount: number;
  revision: number;
  lastAgentTool: string | null;
  lastAgentSummary: string | null;
  lastAgentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AgentLogEntry {
  id: string;
  workspaceId: string;
  userId: string;
  source: string;
  toolName: string;
  summary: string;
  status: 'ok' | 'error';
  revision: number;
  createdAt: number;
}

export interface AuthSessionBundle {
  user: PublicUser;
  sessionToken: string;
  mcpToken: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
}

export interface ResolvedAuth {
  kind: 'session' | 'mcp';
  user: PublicUser;
  mcpToken: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
}

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year sliding window

export class AccountStore {
  private sql: SqlExecutor;
  private initialized = false;

  constructor(sql: SqlExecutor) {
    this.sql = sql;
  }

  ensureSchema(): void {
    if (this.initialized) return;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        provider TEXT NOT NULL DEFAULT 'email',
        google_sub TEXT,
        password_hash TEXT,
        password_salt TEXT,
        mcp_token_hash TEXT NOT NULL,
        mcp_token_plain TEXT NOT NULL,
        mcp_token_preview TEXT NOT NULL,
        active_workspace_id TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_label TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        object_count INTEGER NOT NULL DEFAULT 3,
        revision INTEGER NOT NULL DEFAULT 1,
        last_agent_tool TEXT,
        last_agent_summary TEXT,
        last_agent_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS agent_logs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_users_mcp_hash ON users(mcp_token_hash)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_ws_user ON workspaces(user_id, updated_at DESC)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_logs_ws ON agent_logs(workspace_id, created_at DESC)`);
    this.initialized = true;
  }

  private mapUser(row: Record<string, unknown>): PublicUser {
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      provider: row.provider === 'google' ? 'google' : 'email',
      activeWorkspaceId: row.active_workspace_id ? String(row.active_workspace_id) : null,
      mcpTokenPreview: String(row.mcp_token_preview),
      createdAt: Number(row.created_at),
    };
  }

  private mapWorkspace(row: Record<string, unknown>): WorkspaceSummary {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      name: String(row.name),
      description: String(row.description ?? ''),
      objectCount: Number(row.object_count ?? 0),
      revision: Number(row.revision ?? 1),
      lastAgentTool: row.last_agent_tool ? String(row.last_agent_tool) : null,
      lastAgentSummary: row.last_agent_summary ? String(row.last_agent_summary) : null,
      lastAgentAt: row.last_agent_at ? Number(row.last_agent_at) : null,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  private mapLog(row: Record<string, unknown>): AgentLogEntry {
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      userId: String(row.user_id),
      source: String(row.source),
      toolName: String(row.tool_name),
      summary: String(row.summary),
      status: row.status === 'error' ? 'error' : 'ok',
      revision: Number(row.revision ?? 1),
      createdAt: Number(row.created_at),
    };
  }

  private formatTokenPreview(tok: string): string {
    if (tok.length <= 16) return tok;
    return `${tok.slice(0, 12)}...${tok.slice(-4)}`;
  }

  private async issueSession(userId: string, deviceLabel = 'XL3D App'): Promise<string> {
    const raw = randomToken('xl3d_sess_', 24);
    const hash = await sha256Hex(raw);
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO sessions (token_hash, user_id, device_label, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      hash,
      userId,
      deviceLabel,
      now,
      now,
      now + SESSION_TTL_MS
    );
    return raw;
  }

  private ensureDefaultWorkspace(userId: string, preferredId?: string | null): { workspaces: WorkspaceSummary[]; activeId: string } {
    let rows = this.sql.exec(
      `SELECT * FROM workspaces WHERE user_id = ? ORDER BY updated_at DESC`,
      userId
    );
    if (rows.length === 0) {
      const wsId = `ws_${randomToken('', 8)}`;
      const now = Date.now();
      this.sql.exec(
        `INSERT INTO workspaces (id, user_id, name, description, object_count, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        wsId,
        userId,
        'Main Studio',
        'Основное 3D пространство',
        3,
        1,
        now,
        now
      );
      this.sql.exec(`UPDATE users SET active_workspace_id = ? WHERE id = ?`, wsId, userId);
      rows = this.sql.exec(`SELECT * FROM workspaces WHERE user_id = ? ORDER BY updated_at DESC`, userId);
    }
    const workspaces = rows.map((r) => this.mapWorkspace(r));
    const activeId =
      preferredId && workspaces.some((w) => w.id === preferredId)
        ? preferredId
        : workspaces[0].id;
    if (preferredId !== activeId) {
      this.sql.exec(`UPDATE users SET active_workspace_id = ? WHERE id = ?`, activeId, userId);
    }
    return { workspaces, activeId };
  }

  async registerEmail(
    emailRaw: string,
    password: string,
    nameRaw?: string,
    deviceLabel?: string
  ): Promise<AuthSessionBundle> {
    this.ensureSchema();
    const email = emailRaw.trim().toLowerCase();
    if (!email || !email.includes('@') || email.length < 5) {
      throw new Error('Введите корректный email');
    }
    if (!password || password.length < 6) {
      throw new Error('Пароль должен быть не короче 6 символов');
    }
    const existing = this.sql.exec(`SELECT id FROM users WHERE email = ?`, email);
    if (existing.length > 0) {
      throw new Error('Пользователь с таким email уже зарегистрирован');
    }

    const name = (nameRaw || email.split('@')[0] || 'Artist').trim().slice(0, 60);
    const userId = `usr_${randomToken('', 8)}`;
    const { hash, salt } = await hashPassword(password);
    const mcpToken = randomToken('xl3d_mcp_', 20);
    const mcpHash = await sha256Hex(mcpToken);
    const now = Date.now();

    this.sql.exec(
      `INSERT INTO users (id, email, name, avatar_url, provider, google_sub, password_hash, password_salt, mcp_token_hash, mcp_token_plain, mcp_token_preview, active_workspace_id, created_at)
       VALUES (?, ?, ?, NULL, 'email', NULL, ?, ?, ?, ?, ?, NULL, ?)`,
      userId,
      email,
      name,
      hash,
      salt,
      mcpHash,
      mcpToken,
      this.formatTokenPreview(mcpToken),
      now
    );

    const { workspaces, activeId } = this.ensureDefaultWorkspace(userId, null);
    const sessionToken = await this.issueSession(userId, deviceLabel);
    const userRow = this.sql.exec(`SELECT * FROM users WHERE id = ?`, userId)[0];

    return {
      user: this.mapUser(userRow),
      sessionToken,
      mcpToken,
      workspaces,
      activeWorkspaceId: activeId,
    };
  }

  async loginEmail(
    emailRaw: string,
    password: string,
    deviceLabel?: string
  ): Promise<AuthSessionBundle> {
    this.ensureSchema();
    const email = emailRaw.trim().toLowerCase();
    const rows = this.sql.exec(`SELECT * FROM users WHERE email = ?`, email);
    if (rows.length === 0) {
      throw new Error('Неверный email или пароль');
    }
    const row = rows[0];
    if (!row.password_hash || !row.password_salt) {
      throw new Error('Этот аккаунт создан через Google. Нажмите «Войти через Google».');
    }
    const ok = await verifyPassword(
      password,
      String(row.password_salt),
      String(row.password_hash)
    );
    if (!ok) {
      throw new Error('Неверный email или пароль');
    }

    const userId = String(row.id);
    const { workspaces, activeId } = this.ensureDefaultWorkspace(
      userId,
      row.active_workspace_id ? String(row.active_workspace_id) : null
    );
    const sessionToken = await this.issueSession(userId, deviceLabel);
    const freshRow = this.sql.exec(`SELECT * FROM users WHERE id = ?`, userId)[0];

    return {
      user: this.mapUser(freshRow),
      sessionToken,
      mcpToken: String(freshRow.mcp_token_plain),
      workspaces,
      activeWorkspaceId: activeId,
    };
  }

  async upsertGoogleUser(params: {
    email: string;
    name: string;
    avatarUrl?: string | null;
    googleSub: string;
    deviceLabel?: string;
  }): Promise<AuthSessionBundle> {
    this.ensureSchema();
    const email = params.email.trim().toLowerCase();
    if (!email) throw new Error('Google не вернул email');

    let rows = this.sql.exec(
      `SELECT * FROM users WHERE google_sub = ? OR email = ? LIMIT 1`,
      params.googleSub,
      email
    );
    let userId: string;
    const now = Date.now();

    if (rows.length > 0) {
      const existing = rows[0];
      userId = String(existing.id);
      this.sql.exec(
        `UPDATE users SET google_sub = ?, avatar_url = COALESCE(?, avatar_url), name = COALESCE(NULLIF(name, ''), ?) WHERE id = ?`,
        params.googleSub,
        params.avatarUrl ?? null,
        params.name || email.split('@')[0],
        userId
      );
    } else {
      userId = `usr_${randomToken('', 8)}`;
      const mcpToken = randomToken('xl3d_mcp_', 20);
      const mcpHash = await sha256Hex(mcpToken);
      this.sql.exec(
        `INSERT INTO users (id, email, name, avatar_url, provider, google_sub, password_hash, password_salt, mcp_token_hash, mcp_token_plain, mcp_token_preview, active_workspace_id, created_at)
         VALUES (?, ?, ?, ?, 'google', ?, NULL, NULL, ?, ?, ?, NULL, ?)`,
        userId,
        email,
        (params.name || email.split('@')[0]).slice(0, 60),
        params.avatarUrl ?? null,
        params.googleSub,
        mcpHash,
        mcpToken,
        this.formatTokenPreview(mcpToken),
        now
      );
    }

    const row = this.sql.exec(`SELECT * FROM users WHERE id = ?`, userId)[0];
    const { workspaces, activeId } = this.ensureDefaultWorkspace(
      userId,
      row.active_workspace_id ? String(row.active_workspace_id) : null
    );
    const sessionToken = await this.issueSession(userId, params.deviceLabel || 'Google OAuth');
    const freshRow = this.sql.exec(`SELECT * FROM users WHERE id = ?`, userId)[0];

    return {
      user: this.mapUser(freshRow),
      sessionToken,
      mcpToken: String(freshRow.mcp_token_plain),
      workspaces,
      activeWorkspaceId: activeId,
    };
  }

  async resolveAuthToken(token: string): Promise<ResolvedAuth | null> {
    this.ensureSchema();
    const clean = token.trim();
    if (!clean) return null;
    const hash = await sha256Hex(clean);
    const now = Date.now();

    // 1. Check long-lived user session token
    const sessRows = this.sql.exec(
      `SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?`,
      hash,
      now
    );
    if (sessRows.length > 0) {
      const userId = String(sessRows[0].user_id);
      // Sliding refresh so active users never get logged out
      this.sql.exec(
        `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`,
        now,
        now + SESSION_TTL_MS,
        hash
      );
      const userRows = this.sql.exec(`SELECT * FROM users WHERE id = ?`, userId);
      if (userRows.length === 0) return null;
      const u = userRows[0];
      const { workspaces, activeId } = this.ensureDefaultWorkspace(
        userId,
        u.active_workspace_id ? String(u.active_workspace_id) : null
      );
      return {
        kind: 'session',
        user: this.mapUser(u),
        mcpToken: String(u.mcp_token_plain),
        workspaces,
        activeWorkspaceId: activeId,
      };
    }

    // 2. Check persistent personal MCP API token
    const mcpRows = this.sql.exec(`SELECT * FROM users WHERE mcp_token_hash = ?`, hash);
    if (mcpRows.length > 0) {
      const u = mcpRows[0];
      const userId = String(u.id);
      const { workspaces, activeId } = this.ensureDefaultWorkspace(
        userId,
        u.active_workspace_id ? String(u.active_workspace_id) : null
      );
      return {
        kind: 'mcp',
        user: this.mapUser(u),
        mcpToken: String(u.mcp_token_plain),
        workspaces,
        activeWorkspaceId: activeId,
      };
    }

    return null;
  }

  async logoutSession(sessionToken: string): Promise<void> {
    this.ensureSchema();
    const hash = await sha256Hex(sessionToken.trim());
    this.sql.exec(`DELETE FROM sessions WHERE token_hash = ?`, hash);
  }

  async regenerateMcpToken(userId: string): Promise<{ mcpToken: string; mcpTokenPreview: string }> {
    this.ensureSchema();
    const mcpToken = randomToken('xl3d_mcp_', 20);
    const mcpHash = await sha256Hex(mcpToken);
    const preview = this.formatTokenPreview(mcpToken);
    this.sql.exec(
      `UPDATE users SET mcp_token_hash = ?, mcp_token_plain = ?, mcp_token_preview = ? WHERE id = ?`,
      mcpHash,
      mcpToken,
      preview,
      userId
    );
    return { mcpToken, mcpTokenPreview: preview };
  }

  listWorkspaces(userId: string): WorkspaceSummary[] {
    this.ensureSchema();
    return this.ensureDefaultWorkspace(userId).workspaces;
  }

  getWorkspaceForUser(userId: string, workspaceId: string): WorkspaceSummary | null {
    this.ensureSchema();
    const rows = this.sql.exec(
      `SELECT * FROM workspaces WHERE id = ? AND user_id = ?`,
      workspaceId,
      userId
    );
    return rows.length > 0 ? this.mapWorkspace(rows[0]) : null;
  }

  createWorkspace(
    userId: string,
    name: string,
    description = '',
    objectCount = 3,
    setActive = true
  ): WorkspaceSummary {
    this.ensureSchema();
    const wsId = `ws_${randomToken('', 8)}`;
    const now = Date.now();
    const cleanName = (name || 'New Workspace').trim().slice(0, 80);
    this.sql.exec(
      `INSERT INTO workspaces (id, user_id, name, description, object_count, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      wsId,
      userId,
      cleanName,
      description.slice(0, 240),
      objectCount,
      now,
      now
    );
    if (setActive) {
      this.sql.exec(`UPDATE users SET active_workspace_id = ? WHERE id = ?`, wsId, userId);
    }
    return this.getWorkspaceForUser(userId, wsId)!;
  }

  updateWorkspace(
    userId: string,
    workspaceId: string,
    patch: { name?: string; description?: string; setActive?: boolean }
  ): WorkspaceSummary | null {
    this.ensureSchema();
    const existing = this.getWorkspaceForUser(userId, workspaceId);
    if (!existing) return null;
    const now = Date.now();
    const name = patch.name !== undefined ? patch.name.trim().slice(0, 80) || existing.name : existing.name;
    const desc =
      patch.description !== undefined ? patch.description.slice(0, 240) : existing.description;
    this.sql.exec(
      `UPDATE workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      name,
      desc,
      now,
      workspaceId,
      userId
    );
    if (patch.setActive) {
      this.sql.exec(`UPDATE users SET active_workspace_id = ? WHERE id = ?`, workspaceId, userId);
    }
    return this.getWorkspaceForUser(userId, workspaceId);
  }

  deleteWorkspace(userId: string, workspaceId: string): { deleted: boolean; activeWorkspaceId: string } {
    this.ensureSchema();
    const all = this.listWorkspaces(userId);
    if (all.length <= 1) {
      throw new Error('Нельзя удалить единственное рабочее пространство');
    }
    const target = all.find((w) => w.id === workspaceId);
    if (!target) {
      throw new Error('Рабочее пространство не найдено');
    }
    this.sql.exec(`DELETE FROM agent_logs WHERE workspace_id = ? AND user_id = ?`, workspaceId, userId);
    this.sql.exec(`DELETE FROM workspaces WHERE id = ? AND user_id = ?`, workspaceId, userId);
    const remaining = this.listWorkspaces(userId);
    const nextActive = remaining[0].id;
    this.sql.exec(`UPDATE users SET active_workspace_id = ? WHERE id = ?`, nextActive, userId);
    return { deleted: true, activeWorkspaceId: nextActive };
  }

  recordWorkspaceEvent(params: {
    userId: string;
    workspaceId: string;
    objectCount: number;
    revision: number;
    source: string;
    toolName: string;
    summary: string;
    status: 'ok' | 'error';
  }): void {
    this.ensureSchema();
    const now = Date.now();
    const isAgent = params.source === 'mcp' || params.source === 'openapi';
    this.sql.exec(
      `UPDATE workspaces
       SET object_count = ?,
           revision = ?,
           updated_at = ?,
           last_agent_tool = CASE WHEN ? THEN ? ELSE last_agent_tool END,
           last_agent_summary = CASE WHEN ? THEN ? ELSE last_agent_summary END,
           last_agent_at = CASE WHEN ? THEN ? ELSE last_agent_at END
       WHERE id = ? AND user_id = ?`,
      params.objectCount,
      params.revision,
      now,
      isAgent ? 1 : 0,
      params.toolName,
      isAgent ? 1 : 0,
      params.summary.slice(0, 240),
      isAgent ? 1 : 0,
      now,
      params.workspaceId,
      params.userId
    );

    const logId = `log_${randomToken('', 8)}`;
    this.sql.exec(
      `INSERT INTO agent_logs (id, workspace_id, user_id, source, tool_name, summary, status, revision, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      logId,
      params.workspaceId,
      params.userId,
      params.source,
      params.toolName,
      params.summary.slice(0, 500),
      params.status,
      params.revision,
      now
    );

    // Trim logs to latest 80 per workspace
    this.sql.exec(
      `DELETE FROM agent_logs
       WHERE workspace_id = ? AND id NOT IN (
         SELECT id FROM agent_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 80
       )`,
      params.workspaceId,
      params.workspaceId
    );
  }

  getWorkspaceLogs(userId: string, workspaceId: string, limit = 30): AgentLogEntry[] {
    this.ensureSchema();
    const rows = this.sql.exec(
      `SELECT * FROM agent_logs WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?`,
      workspaceId,
      userId,
      limit
    );
    return rows.map((r) => this.mapLog(r));
  }
}
