import { uid } from '../core/math3d';
import type {
  Edge,
  Face,
  ModifierType,
  ObjectType,
  ProcTextureType,
  ScriptLanguage,
  Vec3,
  Vertex,
  XL3DScene,
} from '../core/types';
import * as editOps from '../engine/editOps';
import { exportSceneToOBJ, exportSceneToPLY, exportSceneToSTL } from '../engine/ioFormats';
import { createDefaultModifier } from '../engine/modifiers';
import {
  buildEdgesFromFaces,
  createDefaultXL3DScene,
  createSceneObject,
  defaultPhysics,
  recomputeNormals,
  type MeshPrimitiveKind,
} from '../engine/primitives';
import { executeBlenderScript } from '../engine/scriptingEngine';
import { store } from './xl3dStore';

export type BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface CloudUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: 'email' | 'google';
  activeWorkspaceId: string | null;
  mcpTokenPreview: string;
  createdAt: number;
}

export interface CloudWorkspace {
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

export interface CloudAgentLog {
  id: string;
  workspaceId?: string;
  source: string;
  toolName?: string;
  tool?: string;
  summary: string;
  status: 'ok' | 'error';
  revision: number;
  createdAt: number;
}

export interface McpBridgeConfig {
  serverUrl: string;
  roomId: string;
  token: string;
  sessionToken: string;
  mcpToken: string;
  activeWorkspaceId: string;
  autoConnect: boolean;
  user: CloudUser | null;
  workspaces: CloudWorkspace[];
  syncedRevisions: Record<string, number>;
}

const STORAGE_KEY = 'xl3d_mcp_bridge_v2';
const LEGACY_STORAGE_KEY = 'xl3d_mcp_bridge_v1';

interface AndroidBridgeAuthApi {
  openExternalUrl?: (url: string) => void;
  savePersistentAuth?: (json: string) => void;
  loadPersistentAuth?: () => string;
  clearPersistentAuth?: () => void;
}

function getAndroidBridge(): AndroidBridgeAuthApi | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { AndroidBridge?: AndroidBridgeAuthApi }).AndroidBridge ?? null;
}

function randomCode(len: number): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function toVec3(v: unknown, fallback: Vec3): Vec3 {
  if (Array.isArray(v)) {
    return {
      x: Number(v[0] ?? fallback.x),
      y: Number(v[1] ?? fallback.y),
      z: Number(v[2] ?? fallback.z),
    };
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return {
      x: Number(o.x ?? fallback.x),
      y: Number(o.y ?? fallback.y),
      z: Number(o.z ?? fallback.z),
    };
  }
  return { ...fallback };
}

class XL3DMcpBridge {
  config: McpBridgeConfig;
  status: BridgeStatus = 'disconnected';
  lastError = '';
  authBusy = false;
  authError = '';
  googleAuthEnabled = false;
  agentLogs: CloudAgentLog[] = [];
  cloudRevision = 1;
  hasUnreadAgentUpdates = false;
  logs: string[] = ['XL3D Cloud & AI Bridge готов'];

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;
  private listeners = new Set<() => void>();
  private bootstrapped = false;

  constructor() {
    this.config = this.loadConfig();
    this.registerGlobalCallback();
  }

  private registerGlobalCallback(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as { __xl3dHandleAuthCallback?: (url: string) => void }).__xl3dHandleAuthCallback = (
      callbackUrl: string
    ) => {
      void this.handleAuthCallbackUrl(callbackUrl);
    };
  }

  private loadConfig(): McpBridgeConfig {
    let raw = '';
    const bridge = getAndroidBridge();
    try {
      if (bridge?.loadPersistentAuth) {
        raw = bridge.loadPersistentAuth() || '';
      }
    } catch {
      // ignore
    }
    if (!raw && typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || '';
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<McpBridgeConfig>;
        return {
          serverUrl: String(parsed.serverUrl ?? ''),
          roomId: String(parsed.roomId ?? parsed.activeWorkspaceId ?? `xl3d-${randomCode(4)}`),
          token: String(parsed.token ?? parsed.mcpToken ?? randomCode(14)),
          sessionToken: String(parsed.sessionToken ?? ''),
          mcpToken: String(parsed.mcpToken ?? ''),
          activeWorkspaceId: String(parsed.activeWorkspaceId ?? parsed.roomId ?? ''),
          autoConnect: parsed.autoConnect !== false,
          user: parsed.user ?? null,
          workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
          syncedRevisions: parsed.syncedRevisions ?? {},
        };
      } catch {
        // fallback below
      }
    }
    const cfg: McpBridgeConfig = {
      serverUrl: '',
      roomId: `xl3d-${randomCode(4)}`,
      token: randomCode(14),
      sessionToken: '',
      mcpToken: '',
      activeWorkspaceId: '',
      autoConnect: true,
      user: null,
      workspaces: [],
      syncedRevisions: {},
    };
    this.saveConfig(cfg);
    return cfg;
  }

  private saveConfig(cfg: McpBridgeConfig): void {
    const json = JSON.stringify(cfg);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, json);
      } catch {
        // ignore
      }
    }
    try {
      getAndroidBridge()?.savePersistentAuth?.(json);
    } catch {
      // ignore
    }
  }

  isAuthenticated(): boolean {
    return Boolean(this.config.sessionToken && this.config.user);
  }

  getActiveWorkspace(): CloudWorkspace | null {
    const id = this.config.activeWorkspaceId || this.config.roomId;
    return this.config.workspaces.find((w) => w.id === id) ?? this.config.workspaces[0] ?? null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
    store.commitLiveChange();
  }

  private notifyListenersOnly(): void {
    this.listeners.forEach((l) => l());
  }

  private log(line: string): void {
    this.logs.push(line);
    if (this.logs.length > 30) this.logs = this.logs.slice(-30);
  }

  updateConfig(patch: Partial<McpBridgeConfig>): void {
    this.config = { ...this.config, ...patch };
    this.saveConfig(this.config);
    this.notifyListenersOnly();
  }

  regenerateToken(): void {
    if (this.isAuthenticated()) {
      void this.regenerateMcpToken();
      return;
    }
    this.updateConfig({ roomId: `xl3d-${randomCode(4)}`, token: randomCode(14) });
  }

  getEffectiveRoomId(): string {
    return this.config.activeWorkspaceId || this.config.roomId || 'default';
  }

  getEffectiveMcpToken(): string {
    return this.config.mcpToken || this.config.token;
  }

  getMcpHttpUrl(): string {
    const base = this.normalizeHttpBase(this.config.serverUrl);
    if (!base) return '';
    const room = this.getEffectiveRoomId();
    const tok = this.getEffectiveMcpToken();
    return `${base}/mcp?room=${encodeURIComponent(room)}&token=${encodeURIComponent(tok)}`;
  }

  getOpenApiUrl(): string {
    const base = this.normalizeHttpBase(this.config.serverUrl);
    if (!base) return '';
    return `${base}/openapi.json?room=${encodeURIComponent(this.getEffectiveRoomId())}`;
  }

  normalizeHttpBase(raw: string): string {
    const s = raw.trim().replace(/\/+$/, '');
    if (!s) return '';
    if (s.startsWith('ws://')) return 'http://' + s.slice(5);
    if (s.startsWith('wss://')) return 'https://' + s.slice(6);
    if (!s.startsWith('http://') && !s.startsWith('https://')) return 'https://' + s;
    return s;
  }

  private normalizeWsUrl(): string {
    const httpBase = this.normalizeHttpBase(this.config.serverUrl);
    const wsBase = httpBase.replace(/^http/, 'ws');
    const wsToken = this.config.sessionToken || this.config.mcpToken || this.config.token;
    const room = this.getEffectiveRoomId();
    return `${wsBase}/ws?room=${encodeURIComponent(room)}&token=${encodeURIComponent(wsToken)}`;
  }

  private async apiFetch<T>(
    path: string,
    opts: { method?: string; body?: unknown; auth?: boolean } = {}
  ): Promise<T> {
    const base = this.normalizeHttpBase(this.config.serverUrl);
    if (!base) {
      throw new Error('Укажите URL Cloudflare Worker (https://...workers.dev)');
    }
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.auth !== false && this.config.sessionToken) {
      headers['Authorization'] = `Bearer ${this.config.sessionToken}`;
    }
    const resp = await fetch(`${base}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await resp.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { error: text };
    }
    if (!resp.ok) {
      if (resp.status === 401 && opts.auth !== false) {
        this.handleExpiredSession();
      }
      throw new Error(String(data.error || `HTTP ${resp.status}`));
    }
    return data as T;
  }

  private handleExpiredSession(): void {
    this.config.sessionToken = '';
    this.config.user = null;
    this.saveConfig(this.config);
    this.disconnect(false);
    this.notifyListenersOnly();
  }

  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return;
    this.bootstrapped = true;

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const tokenFromQuery = url.searchParams.get('xl3d_token');
      if (tokenFromQuery) {
        url.searchParams.delete('xl3d_token');
        try {
          window.history.replaceState({}, '', url.toString());
        } catch {
          // ignore
        }
        await this.completeTokenLogin(tokenFromQuery);
        return;
      }
    }

    if (this.config.serverUrl && this.config.sessionToken) {
      try {
        await this.refreshAccountAndWorkspaces();
        await this.pullLatestWorkspaceState(true);
        if (this.config.autoConnect) {
          this.connect();
        }
      } catch (err) {
        this.log(`⚠ Восстановление сессии: ${err instanceof Error ? err.message : String(err)}`);
        this.notifyListenersOnly();
      }
    }
  }

  async handleAuthCallbackUrl(callbackUrl: string): Promise<void> {
    try {
      const parsed = new URL(callbackUrl);
      const err = parsed.searchParams.get('error');
      if (err) {
        this.authError =
          err === 'google_not_configured'
            ? `Добавьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в Cloudflare Workers. Redirect URI: ${this.normalizeHttpBase(this.config.serverUrl)}/auth/google/callback`
            : `Ошибка Google Auth: ${err}`;
        this.notifyListenersOnly();
        return;
      }
      const tok = parsed.searchParams.get('xl3d_token') || parsed.searchParams.get('token');
      if (tok) {
        await this.completeTokenLogin(tok);
      }
    } catch {
      // ignore
    }
  }

  private async completeTokenLogin(sessionToken: string): Promise<void> {
    this.authBusy = true;
    this.authError = '';
    this.notifyListenersOnly();
    try {
      this.updateConfig({ sessionToken });
      await this.refreshAccountAndWorkspaces();
      await this.pullLatestWorkspaceState(true);
      if (this.config.autoConnect) this.connect();
      this.log(`✓ Авторизован как ${this.config.user?.email ?? 'User'}`);
    } catch (err) {
      this.authError = err instanceof Error ? err.message : String(err);
    } finally {
      this.authBusy = false;
      this.notifyListenersOnly();
    }
  }

  async register(email: string, password: string, name: string): Promise<boolean> {
    this.authBusy = true;
    this.authError = '';
    this.notifyListenersOnly();
    try {
      const res = await this.apiFetch<{
        user: CloudUser;
        sessionToken: string;
        mcpToken: string;
        workspaces: CloudWorkspace[];
        activeWorkspaceId: string;
      }>('/auth/register', {
        method: 'POST',
        auth: false,
        body: { email, password, name, deviceLabel: getAndroidBridge() ? 'XL3D Android' : 'XL3D Web' },
      });
      this.applyAuthBundle(res);
      await this.saveCurrentSceneToCloud('Начальная сцена после регистрации');
      if (this.config.autoConnect) this.connect();
      return true;
    } catch (err) {
      this.authError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.authBusy = false;
      this.notifyListenersOnly();
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    this.authBusy = true;
    this.authError = '';
    this.notifyListenersOnly();
    try {
      const res = await this.apiFetch<{
        user: CloudUser;
        sessionToken: string;
        mcpToken: string;
        workspaces: CloudWorkspace[];
        activeWorkspaceId: string;
      }>('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password, deviceLabel: getAndroidBridge() ? 'XL3D Android' : 'XL3D Web' },
      });
      this.applyAuthBundle(res);
      await this.pullLatestWorkspaceState(true);
      if (this.config.autoConnect) this.connect();
      return true;
    } catch (err) {
      this.authError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.authBusy = false;
      this.notifyListenersOnly();
    }
  }

  async startGoogleAuth(): Promise<void> {
    const base = this.normalizeHttpBase(this.config.serverUrl);
    if (!base) {
      this.authError = 'Сначала укажите URL Cloudflare Worker';
      this.notifyListenersOnly();
      return;
    }

    this.authBusy = true;
    this.authError = '';
    this.notifyListenersOnly();
    try {
      const resp = await fetch(`${base}/health`);
      if (resp.ok) {
        const h = (await resp.json()) as { googleAuthEnabled?: boolean };
        this.googleAuthEnabled = Boolean(h.googleAuthEnabled);
        if (!this.googleAuthEnabled) {
          this.authError =
            `На сервере не заданы GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET. Добавьте их в Cloudflare → Variables & Secrets (Redirect URI: ${base}/auth/google/callback) или войдите по Email.`;
          this.authBusy = false;
          this.notifyListenersOnly();
          return;
        }
      }
    } catch {
      // If health check fails due to offline/network, still allow fallback or report
    } finally {
      this.authBusy = false;
      this.notifyListenersOnly();
    }

    const bridge = getAndroidBridge();
    const redirectUri = bridge?.openExternalUrl
      ? 'xl3d://auth/callback'
      : typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : `${base}/`;
    const targetUrl = `${base}/auth/google/start?redirect_uri=${encodeURIComponent(redirectUri)}`;
    if (bridge?.openExternalUrl) {
      bridge.openExternalUrl(targetUrl);
    } else if (typeof window !== 'undefined') {
      window.location.href = targetUrl;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.config.serverUrl && this.config.sessionToken) {
        await this.apiFetch('/auth/logout', { method: 'POST', body: {} });
      }
    } catch {
      // ignore
    }
    this.disconnect(false);
    this.updateConfig({
      sessionToken: '',
      mcpToken: '',
      user: null,
      workspaces: [],
      activeWorkspaceId: '',
    });
    try {
      getAndroidBridge()?.clearPersistentAuth?.();
      this.saveConfig(this.config);
    } catch {
      // ignore
    }
    this.agentLogs = [];
    this.hasUnreadAgentUpdates = false;
    this.notifyListenersOnly();
  }

  private applyAuthBundle(bundle: {
    user: CloudUser;
    sessionToken?: string;
    mcpToken: string;
    workspaces: CloudWorkspace[];
    activeWorkspaceId: string;
  }): void {
    this.updateConfig({
      ...(bundle.sessionToken ? { sessionToken: bundle.sessionToken } : {}),
      mcpToken: bundle.mcpToken,
      token: bundle.mcpToken,
      user: bundle.user,
      workspaces: bundle.workspaces,
      activeWorkspaceId: bundle.activeWorkspaceId,
      roomId: bundle.activeWorkspaceId,
    });
  }

  async refreshAccountAndWorkspaces(): Promise<void> {
    const data = await this.apiFetch<{
      user: CloudUser;
      mcpToken: string;
      workspaces: CloudWorkspace[];
      activeWorkspaceId: string;
      googleAuthEnabled?: boolean;
    }>('/auth/me');
    this.googleAuthEnabled = Boolean(data.googleAuthEnabled);
    this.applyAuthBundle(data);
  }

  async regenerateMcpToken(): Promise<void> {
    if (!this.isAuthenticated()) return;
    const res = await this.apiFetch<{ mcpToken: string; mcpTokenPreview: string }>(
      '/auth/regenerate-mcp-token',
      { method: 'POST', body: {} }
    );
    const user = this.config.user ? { ...this.config.user, mcpTokenPreview: res.mcpTokenPreview } : null;
    this.updateConfig({ mcpToken: res.mcpToken, token: res.mcpToken, user });
    this.log('🔑 Выпущен новый личный MCP Token');
    this.notifyListenersOnly();
  }

  async createWorkspace(name: string, description = '', fromCurrentScene = false): Promise<CloudWorkspace | null> {
    if (!this.isAuthenticated()) return null;
    const scenePayload = fromCurrentScene ? store.scene : createDefaultXL3DScene();
    const res = await this.apiFetch<{ workspace: CloudWorkspace }>('/workspaces', {
      method: 'POST',
      body: { name, description, scene: scenePayload, setActive: true },
    });
    await this.refreshAccountAndWorkspaces();
    await this.switchWorkspace(res.workspace.id);
    return res.workspace;
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    if (!this.isAuthenticated()) return;
    await this.apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      body: { setActive: true },
    });
    this.updateConfig({ activeWorkspaceId: workspaceId, roomId: workspaceId });
    await this.refreshAccountAndWorkspaces();
    await this.pullLatestWorkspaceState(true, true);
    if (this.config.autoConnect || this.status === 'connected') {
      this.connect();
    }
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<void> {
    if (!this.isAuthenticated() || !name.trim()) return;
    await this.apiFetch(`/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'PATCH',
      body: { name: name.trim() },
    });
    await this.refreshAccountAndWorkspaces();
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (!this.isAuthenticated()) return;
    const res = await this.apiFetch<{ deleted: boolean; activeWorkspaceId: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'DELETE' }
    );
    this.updateConfig({ activeWorkspaceId: res.activeWorkspaceId, roomId: res.activeWorkspaceId });
    await this.refreshAccountAndWorkspaces();
    await this.pullLatestWorkspaceState(true, true);
    if (this.status === 'connected') this.connect();
  }

  async saveCurrentSceneToCloud(summary?: string): Promise<void> {
    const wsId = this.getEffectiveRoomId();
    if (!this.isAuthenticated() || !wsId) return;
    const res = await this.apiFetch<{ ok: boolean; revision: number }>(
      `/workspaces/${encodeURIComponent(wsId)}/state`,
      {
        method: 'PUT',
        body: { scene: store.scene, summary },
      }
    );
    this.cloudRevision = res.revision;
    this.updateConfig({
      syncedRevisions: { ...this.config.syncedRevisions, [wsId]: res.revision },
    });
    this.log(`☁ Сохранено в облако (rev #${res.revision})`);
    await this.refreshAccountAndWorkspaces();
  }

  async pullLatestWorkspaceState(applyIfNewer = true, forceApply = false): Promise<void> {
    const wsId = this.getEffectiveRoomId();
    if (!this.isAuthenticated() || !wsId) return;
    const data = await this.apiFetch<{
      revision: number;
      scene: XL3DScene;
      logs: CloudAgentLog[];
      recentLogs?: CloudAgentLog[];
    }>(`/workspaces/${encodeURIComponent(wsId)}/state`);

    this.cloudRevision = data.revision ?? 1;
    this.agentLogs = Array.isArray(data.logs) && data.logs.length > 0 ? data.logs : (data.recentLogs ?? []);
    const lastSeen = this.config.syncedRevisions[wsId] ?? 0;

    if (data.scene && Array.isArray(data.scene.objects)) {
      if (forceApply || (applyIfNewer && data.revision > lastSeen)) {
        store.loadCloudScene(data.scene);
        this.updateConfig({
          syncedRevisions: { ...this.config.syncedRevisions, [wsId]: data.revision },
        });
        if (!forceApply && lastSeen > 0 && data.revision > lastSeen) {
          this.hasUnreadAgentUpdates = true;
          this.log(`🤖 Загружены обновления из облака (rev #${data.revision})`);
        }
      }
    }
    this.notifyListenersOnly();
  }

  markAgentUpdatesRead(): void {
    this.hasUnreadAgentUpdates = false;
    this.notifyListenersOnly();
  }

  connect(): void {
    if (typeof WebSocket === 'undefined') return;
    if (!this.config.serverUrl.trim()) {
      this.status = 'error';
      this.lastError = 'Укажите URL Cloudflare Worker (https://...workers.dev)';
      this.log(`✕ ${this.lastError}`);
      this.notify();
      return;
    }

    this.manualDisconnect = false;
    this.disconnect(false);
    this.status = 'connecting';
    this.lastError = '';
    const wsUrl = this.normalizeWsUrl();
    this.log(`Подключение к ${this.normalizeHttpBase(this.config.serverUrl)}...`);
    this.notifyListenersOnly();

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        this.status = 'connected';
        this.lastError = '';
        this.log(`🟢 Онлайн (${this.getActiveWorkspace()?.name ?? this.getEffectiveRoomId()})`);
        this.pingTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25000);
        this.notifyListenersOnly();
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          const msg = JSON.parse(ev.data) as Record<string, unknown>;
          if (msg.type === 'welcome') {
            const wsId = String(msg.workspaceId || this.getEffectiveRoomId());
            const serverRev = Number(msg.revision ?? 1);
            this.cloudRevision = serverRev;
            if (Array.isArray(msg.recentLogs)) {
              this.agentLogs = msg.recentLogs as CloudAgentLog[];
            }
            const syncedRev = this.config.syncedRevisions[wsId] ?? 0;
            if (msg.scene && typeof msg.scene === 'object' && serverRev > syncedRev) {
              store.loadCloudScene(msg.scene as XL3DScene);
              this.updateConfig({
                syncedRevisions: { ...this.config.syncedRevisions, [wsId]: serverRev },
              });
              if (syncedRev > 0) {
                this.hasUnreadAgentUpdates = true;
                this.log(`🤖 Получена новая сцена агента (rev #${serverRev})`);
              }
            }
            this.notifyListenersOnly();
            return;
          }

          if (msg.type === 'agent_event') {
            const rev = Number(msg.revision ?? this.cloudRevision + 1);
            this.cloudRevision = rev;
            const logItem = msg.log as CloudAgentLog | undefined;
            if (logItem) {
              this.agentLogs = [logItem, ...this.agentLogs].slice(0, 40);
              this.log(`🤖 ${logItem.tool ?? logItem.toolName}: ${logItem.summary}`);
            }
            if (msg.scene && typeof msg.scene === 'object') {
              store.loadCloudScene(msg.scene as XL3DScene);
              const wsId = this.getEffectiveRoomId();
              this.updateConfig({
                syncedRevisions: { ...this.config.syncedRevisions, [wsId]: rev },
              });
            }
            this.hasUnreadAgentUpdates = true;
            this.notifyListenersOnly();
            return;
          }

          if (msg.type === 'scene_updated') {
            const rev = Number(msg.revision ?? this.cloudRevision);
            this.cloudRevision = rev;
            if (msg.scene && typeof msg.scene === 'object') {
              store.loadCloudScene(msg.scene as XL3DScene);
              const wsId = this.getEffectiveRoomId();
              this.updateConfig({
                syncedRevisions: { ...this.config.syncedRevisions, [wsId]: rev },
              });
            }
            this.notifyListenersOnly();
            return;
          }

          if (msg.type === 'sync_ack') {
            const rev = Number(msg.revision ?? this.cloudRevision);
            this.cloudRevision = rev;
            const wsId = this.getEffectiveRoomId();
            this.updateConfig({
              syncedRevisions: { ...this.config.syncedRevisions, [wsId]: rev },
            });
            return;
          }

          if (msg.type === 'rpc' && typeof msg.callId === 'string' && typeof msg.tool === 'string') {
            const result = this.handleRpc(msg.tool, (msg.args ?? {}) as Record<string, unknown>);
            ws.send(
              JSON.stringify({
                type: 'rpc_result',
                callId: msg.callId,
                result,
                scene: store.scene,
              })
            );
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        this.status = 'error';
        this.lastError = 'Ошибка WebSocket соединения';
        this.log(`✕ ${this.lastError}`);
        this.notifyListenersOnly();
      };

      ws.onclose = () => {
        if (this.pingTimer) {
          clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (this.status !== 'disconnected') {
          this.status = 'disconnected';
          this.log('Отключено от AI Bridge');
          this.notifyListenersOnly();
        }
        if (!this.manualDisconnect && this.config.autoConnect && this.isAuthenticated()) {
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (!this.manualDisconnect && this.status === 'disconnected') {
              this.connect();
            }
          }, 5000);
        }
      };
    } catch (err) {
      this.status = 'error';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.notifyListenersOnly();
    }
  }

  disconnect(notifyUi = true): void {
    this.manualDisconnect = notifyUi;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.status = 'disconnected';
    if (notifyUi) this.notifyListenersOnly();
  }

  syncSceneToServer(force = false): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const wsId = this.getEffectiveRoomId();
      const clientRev = this.config.syncedRevisions[wsId] ?? this.cloudRevision;
      try {
        this.ws.send(
          JSON.stringify({
            type: 'scene_sync',
            scene: store.scene,
            clientRev,
            force,
          })
        );
      } catch {
        // ignore
      }
    }
  }

  executeLocalRpc(tool: string, args: Record<string, unknown> = {}): Record<string, unknown> {
    return this.handleRpc(tool, args);
  }

  private handleRpc(tool: string, args: Record<string, unknown>): Record<string, unknown> {
    this.log(`🤖 ${tool}`);

    const findObj = (target?: unknown) => {
      if (typeof target === 'string' && target.trim()) {
        return store.scene.objects.find((o) => o.id === target || o.name === target);
      }
      return store.getActiveObject() ?? store.scene.objects.find((o) => o.type === 'mesh');
    };

    if (tool === 'get_scene_info') {
      const active = store.getActiveObject();
      const info = {
        app: 'XL3D',
        version: store.scene.version,
        clientConnected: true,
        workspaceId: this.getEffectiveRoomId(),
        activeObjectId: store.scene.activeObjectId,
        activeObjectName: active?.name ?? null,
        currentFrame: store.scene.currentFrame,
        renderEngine: store.scene.render.engine,
        objectCount: store.scene.objects.length,
        objects: store.scene.objects.map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          visible: o.visible,
          location: o.location,
          rotation: o.rotation,
          scale: o.scale,
          vertices: o.mesh?.vertices.length ?? 0,
          faces: o.mesh?.faces.length ?? 0,
          modifiers: o.modifiers.map((m) => ({ id: m.id, type: m.type, enabled: m.enabled })),
        })),
        materials: store.scene.materials.map((m) => ({
          id: m.id,
          name: m.name,
          baseColor: m.baseColor,
          metallic: m.metallic,
          roughness: m.roughness,
          procTexture: m.procTexture,
        })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }], structured: info };
    }

    if (tool === 'run_blender_script') {
      const code = String(args.code ?? '');
      const language = (args.language === 'javascript' ? 'javascript' : 'python') as ScriptLanguage;
      if (typeof args.saveAs === 'string' && args.saveAs.trim()) {
        store.loadScriptFile(args.saveAs.trim(), code);
      }
      store.pushUndo();
      const res = executeBlenderScript(store.scene, code, language);
      store.commitLiveChange();
      if (!res.ok) {
        return { isError: true, content: [{ type: 'text', text: `Ошибка скрипта: ${res.error}\n${res.logs.join('\n')}` }] };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { ok: true, logs: res.logs, createdObjects: res.createdObjects, modifiedObjects: res.modifiedObjects, durationMs: res.durationMs },
              null,
              2
            ),
          },
        ],
      };
    }

    if (tool === 'create_object') {
      store.pushUndo();
      const kind = String(args.kind ?? 'cube').toLowerCase();
      const name = args.name ? String(args.name) : undefined;
      const meshPrims: MeshPrimitiveKind[] = ['cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'plane', 'monkey'];
      const objType: ObjectType = meshPrims.includes(kind as MeshPrimitiveKind) ? 'mesh' : (kind as ObjectType);
      const prim = meshPrims.includes(kind as MeshPrimitiveKind) ? (kind as MeshPrimitiveKind) : 'cube';
      const obj = createSceneObject(objType, name, prim);
      obj.location = toVec3(args.location, obj.location);
      obj.rotation = toVec3(args.rotation, obj.rotation);
      obj.scale = toVec3(args.scale, obj.scale);
      store.scene.objects.push(obj);
      store.setActiveObject(obj.id);
      const summary = { created: { id: obj.id, name: obj.name, type: obj.type, location: obj.location } };
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }], structured: summary };
    }

    if (tool === 'create_mesh_from_pydata') {
      store.pushUndo();
      const rawVerts = Array.isArray(args.vertices) ? args.vertices : [];
      const rawFaces = Array.isArray(args.faces) ? args.faces : [];
      const verts: Vertex[] = rawVerts.map((rv) => {
        const p = toVec3(rv, { x: 0, y: 0, z: 0 });
        return {
          id: uid('v'),
          pos: p,
          normal: { x: 0, y: 0, z: 1 },
          uv: { x: (p.x + 1) * 0.5, y: (p.y + 1) * 0.5 },
          color: [0.85, 0.85, 0.88],
          mask: 0,
          weights: {},
          selected: false,
        };
      });
      const faces: Face[] = [];
      for (const rf of rawFaces) {
        if (!Array.isArray(rf) || rf.length < 3) continue;
        const idxs = rf.map((n) => Number(n)).filter((n) => n >= 0 && n < verts.length);
        if (idxs.length >= 3) {
          faces.push({
            verts: idxs,
            normal: { x: 0, y: 0, z: 1 },
            smooth: Boolean(args.smooth),
            materialIndex: 0,
            faceSet: 1,
            selected: false,
          });
        }
      }
      const edges: Edge[] = buildEdgesFromFaces(faces);
      const mesh = {
        vertices: verts,
        edges,
        faces,
        autoSmoothAngle: 35,
        customSplitNormals: false,
        udimTile: 1001,
        uvSyncSelection: false,
      };
      recomputeNormals(mesh);

      let materialId = store.scene.activeMaterialId;
      if (typeof args.color === 'string') {
        const mat = {
          ...store.scene.materials[0],
          id: uid('mat'),
          name: `${String(args.name ?? 'CustomMesh')}_Mat`,
          baseColor: args.color,
        };
        store.scene.materials.push(mat);
        materialId = mat.id;
      }

      const obj = {
        id: uid('obj'),
        name: String(args.name ?? 'ProceduralMesh'),
        type: 'mesh' as const,
        collection: 'Collection',
        parentId: null,
        visible: true,
        renderable: true,
        locked: false,
        location: toVec3(args.location, { x: 0, y: 0, z: 0 }),
        rotation: toVec3(args.rotation, { x: 0, y: 0, z: 0 }),
        scale: toVec3(args.scale, { x: 1, y: 1, z: 1 }),
        materialId,
        modifiers: [],
        keyframes: {},
        drivers: {},
        shapeKeys: [],
        physics: defaultPhysics(),
        mesh,
      };
      store.scene.objects.push(obj);
      store.setActiveObject(obj.id);
      const out = { created: obj.name, id: obj.id, vertices: verts.length, faces: faces.length };
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
    }

    if (tool === 'transform_object') {
      const obj = findObj(args.target);
      if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
      store.pushUndo();
      if (args.name) obj.name = String(args.name);
      if (args.location) obj.location = toVec3(args.location, obj.location);
      if (args.rotation) obj.rotation = toVec3(args.rotation, obj.rotation);
      if (args.scale) obj.scale = toVec3(args.scale, obj.scale);
      if (typeof args.visible === 'boolean') obj.visible = args.visible;
      store.setActiveObject(obj.id);
      const out = { updated: obj.name, location: obj.location, rotation: obj.rotation, scale: obj.scale };
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
    }

    if (tool === 'apply_edit_op') {
      const obj = findObj(args.target);
      if (!obj?.mesh) return { isError: true, content: [{ type: 'text', text: 'Mesh не найден' }] };
      store.pushUndo();
      const op = String(args.op ?? 'subdivide');
      const amount = Number(args.amount ?? 0.25);
      const m = obj.mesh;
      if (op === 'subdivide') editOps.subdivideMesh(m, false);
      else if (op === 'extrude') editOps.extrudeFaces(m, amount || 0.4);
      else if (op === 'inset') editOps.insetFaces(m, amount || 0.25);
      else if (op === 'bevel') editOps.bevelSelection(m, amount || 0.15);
      else if (op === 'poke') editOps.pokeFaces(m);
      else if (op === 'flip_normals') editOps.flipNormals(m);
      else if (op === 'triangulate') editOps.triangulateMesh(m);
      else if (op === 'tris_to_quads') editOps.trisToQuads(m);
      else if (op === 'merge') editOps.mergeVerticesToCenter(m, 'vertex');
      else if (op === 'bridge_fill') editOps.bridgeOrFillSelection(m, 'face');
      else if (op === 'dissolve') editOps.dissolveSelection(m, 'face');
      else if (op === 'shrink_fatten') editOps.shrinkFattenSelection(m, 'vertex', amount || 0.15);
      else if (op === 'spin') editOps.spinSelection(m, 'vertex', 90, 4);
      else if (op === 'duplicate_faces') editOps.duplicateSelectedFaces(m);
      else if (op === 'looptools_circle') editOps.loopToolsCircle(m, 'face');
      else if (op === 'uv_unwrap') editOps.uvUnwrap(m, true);
      else if (op === 'shade_smooth') editOps.shadeSmoothByAngle(m, 35);
      store.commitLiveChange();
      return {
        content: [{ type: 'text', text: JSON.stringify({ object: obj.name, op, vertices: m.vertices.length, faces: m.faces.length }, null, 2) }],
      };
    }

    if (tool === 'object_action') {
      const obj = findObj(args.target);
      if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
      store.setActiveObject(obj.id);
      const act = String(args.action ?? 'duplicate');
      if (act === 'duplicate') store.duplicateActiveObject();
      else if (act === 'apply_transforms') store.applyAllTransforms();
      else if (act === 'origin_to_geometry') store.originToGeometry();
      else if (act === 'join') store.joinWithNextMesh();
      else if (act === 'convert_to_mesh') store.convertToMesh();
      else if (act === 'apply_modifiers') {
        const ids = obj.modifiers.map((m) => m.id);
        for (const id of ids) store.applyModifier(id);
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, action: act, objectCount: store.scene.objects.length }, null, 2) }],
      };
    }

    if (tool === 'add_modifier') {
      const obj = findObj(args.target);
      if (!obj) return { isError: true, content: [{ type: 'text', text: 'Объект не найден' }] };
      store.pushUndo();
      const mod = createDefaultModifier(String(args.type ?? 'subsurf') as ModifierType);
      if (args.params && typeof args.params === 'object') Object.assign(mod.params, args.params);
      obj.modifiers.push(mod);
      store.commitLiveChange();
      return { content: [{ type: 'text', text: JSON.stringify({ object: obj.name, modifier: mod }, null, 2) }] };
    }

    if (tool === 'set_material') {
      const obj = findObj(args.target);
      const mat = (obj ? store.scene.materials.find((m) => m.id === obj.materialId) : undefined) ?? store.getActiveMaterial();
      if (!mat) return { isError: true, content: [{ type: 'text', text: 'Материал не найден' }] };
      store.pushUndo();
      if (typeof args.baseColor === 'string') mat.baseColor = args.baseColor;
      if (typeof args.metallic === 'number') mat.metallic = Math.max(0, Math.min(1, args.metallic));
      if (typeof args.roughness === 'number') mat.roughness = Math.max(0, Math.min(1, args.roughness));
      if (typeof args.transmission === 'number') mat.transmission = Math.max(0, Math.min(1, args.transmission));
      if (typeof args.dispersion === 'number') mat.dispersion = Math.max(0, Math.min(1, args.dispersion));
      if (typeof args.emissionStrength === 'number') mat.emissionStrength = Math.max(0, args.emissionStrength);
      if (typeof args.procTexture === 'string') mat.procTexture = args.procTexture as ProcTextureType;
      store.commitLiveChange();
      return { content: [{ type: 'text', text: JSON.stringify({ material: mat.name, baseColor: mat.baseColor }) }] };
    }

    if (tool === 'get_viewport_screenshot') {
      const canvas = typeof document !== 'undefined' ? (document.querySelector('.vp-canvas') as HTMLCanvasElement | null) : null;
      if (!canvas) {
        return { isError: true, content: [{ type: 'text', text: '3D canvas недоступен' }] };
      }
      const maxW = 640;
      const scale = Math.min(1, maxW / Math.max(1, canvas.width));
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(160, Math.round(canvas.width * scale));
      tmp.height = Math.max(120, Math.round(canvas.height * scale));
      const tctx = tmp.getContext('2d');
      tctx?.drawImage(canvas, 0, 0, tmp.width, tmp.height);
      const dataUrl = tmp.toDataURL('image/png');
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      return {
        content: [
          { type: 'image', data: base64, mimeType: 'image/png' },
          { type: 'text', text: `Viewport screenshot (${tmp.width}x${tmp.height}), objects: ${store.scene.objects.length}` },
        ],
      };
    }

    if (tool === 'undo') {
      store.undo();
      return { content: [{ type: 'text', text: JSON.stringify({ undone: true, objectCount: store.scene.objects.length }) }] };
    }

    if (tool === 'export_scene') {
      const fmt = String(args.format ?? 'obj').toLowerCase();
      let data = '';
      if (fmt === 'stl') data = exportSceneToSTL(store.scene);
      else if (fmt === 'ply') data = exportSceneToPLY(store.scene);
      else if (fmt === 'xl3d' || fmt === 'json') data = store.saveProjectJson();
      else data = exportSceneToOBJ(store.scene);
      return { content: [{ type: 'text', text: data }] };
    }

    return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${tool}` }] };
  }
}

export const mcpBridge = new XL3DMcpBridge();
