import type { XL3DScene } from '../../xl3d/src/core/types';
import { AccountStore, type ResolvedAuth, type SqlExecutor } from './accountStore';
import { randomToken, signOAuthState, verifyOAuthState } from './authCrypto';
import {
  handleMcpJsonRpc,
  XL3D_BPY_REFERENCE_MD,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './mcpProtocol';
import { buildOpenApiSpec } from './openapi';
import {
  createInitialHeadlessScene,
  executeHeadlessTool,
  summarizeScene,
  type ToolResult,
} from './sceneToolExecutor';

export interface Env {
  ROOM_HUB: DurableObjectNamespace;
  ACCOUNT_HUB: DurableObjectNamespace;
  MCP_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_SECRET?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-XL3D-Token, X-XL3D-Workspace, Mcp-Session-Id',
};

const MUTATING_TOOLS = new Set([
  'run_blender_script',
  'create_object',
  'create_mesh_from_pydata',
  'transform_object',
  'apply_edit_op',
  'add_modifier',
  'object_action',
  'set_material',
  'undo',
]);

function jsonResp(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function getTokenFromRequest(request: Request, url: URL): string {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const h = request.headers.get('X-XL3D-Token');
  if (h) return h.trim();
  return (url.searchParams.get('token') || '').trim();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =====================================================================
// AccountHub Durable Object (SQLite: Users, Sessions, Workspaces, Logs)
// =====================================================================
export class AccountHub implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private store: AccountStore;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    const sqlAdapter: SqlExecutor = {
      exec: <T extends Record<string, unknown>>(query: string, ...params: unknown[]): T[] => {
        return this.ctx.storage.sql.exec(query, ...params).toArray() as unknown as T[];
      },
    };
    this.store = new AccountStore(sqlAdapter);
  }

  private async getOAuthSecret(): Promise<string> {
    if (this.env.AUTH_SECRET && this.env.AUTH_SECRET.trim()) {
      return this.env.AUTH_SECRET.trim();
    }
    let secret = await this.ctx.storage.get<string>('oauth_secret');
    if (!secret) {
      secret = randomToken('sec_', 32);
      await this.ctx.storage.put('oauth_secret', secret);
    }
    return secret;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/internal/oauth-secret') {
        return jsonResp({ secret: await this.getOAuthSecret() });
      }

      if (path === '/internal/register' && request.method === 'POST') {
        const body = (await request.json()) as { email?: string; password?: string; name?: string; deviceLabel?: string };
        const bundle = await this.store.registerEmail(
          body.email ?? '',
          body.password ?? '',
          body.name,
          body.deviceLabel
        );
        return jsonResp(bundle, 201);
      }

      if (path === '/internal/login' && request.method === 'POST') {
        const body = (await request.json()) as { email?: string; password?: string; deviceLabel?: string };
        const bundle = await this.store.loginEmail(body.email ?? '', body.password ?? '', body.deviceLabel);
        return jsonResp(bundle);
      }

      if (path === '/internal/google-upsert' && request.method === 'POST') {
        const body = (await request.json()) as {
          email: string;
          name: string;
          avatarUrl?: string | null;
          googleSub: string;
          deviceLabel?: string;
        };
        const bundle = await this.store.upsertGoogleUser(body);
        return jsonResp(bundle);
      }

      if (path === '/internal/resolve-auth' && request.method === 'POST') {
        const body = (await request.json()) as { token?: string };
        const resolved = await this.store.resolveAuthToken(body.token ?? '');
        if (!resolved) return jsonResp({ error: 'Unauthorized' }, 401);
        return jsonResp(resolved);
      }

      if (path === '/internal/logout' && request.method === 'POST') {
        const body = (await request.json()) as { token?: string };
        if (body.token) await this.store.logoutSession(body.token);
        return jsonResp({ ok: true });
      }

      if (path === '/internal/regenerate-mcp-token' && request.method === 'POST') {
        const body = (await request.json()) as { userId: string };
        const res = await this.store.regenerateMcpToken(body.userId);
        return jsonResp(res);
      }

      if (path === '/internal/workspaces' && request.method === 'GET') {
        const userId = url.searchParams.get('userId') || '';
        return jsonResp({ workspaces: this.store.listWorkspaces(userId) });
      }

      if (path === '/internal/workspaces/create' && request.method === 'POST') {
        const body = (await request.json()) as {
          userId: string;
          name: string;
          description?: string;
          objectCount?: number;
          setActive?: boolean;
        };
        const ws = this.store.createWorkspace(
          body.userId,
          body.name,
          body.description ?? '',
          body.objectCount ?? 3,
          body.setActive !== false
        );
        return jsonResp({ workspace: ws }, 201);
      }

      if (path === '/internal/workspaces/update' && request.method === 'POST') {
        const body = (await request.json()) as {
          userId: string;
          workspaceId: string;
          name?: string;
          description?: string;
          setActive?: boolean;
        };
        const ws = this.store.updateWorkspace(body.userId, body.workspaceId, {
          name: body.name,
          description: body.description,
          setActive: body.setActive,
        });
        if (!ws) return jsonResp({ error: 'Workspace not found' }, 404);
        return jsonResp({ workspace: ws });
      }

      if (path === '/internal/workspaces/delete' && request.method === 'POST') {
        const body = (await request.json()) as { userId: string; workspaceId: string };
        const res = this.store.deleteWorkspace(body.userId, body.workspaceId);
        return jsonResp(res);
      }

      if (path === '/internal/workspaces/record-event' && request.method === 'POST') {
        const body = (await request.json()) as {
          userId: string;
          workspaceId: string;
          objectCount: number;
          revision: number;
          source: string;
          toolName: string;
          summary: string;
          status: 'ok' | 'error';
        };
        this.store.recordWorkspaceEvent(body);
        return jsonResp({ ok: true });
      }

      if (path === '/internal/workspaces/logs' && request.method === 'GET') {
        const userId = url.searchParams.get('userId') || '';
        const workspaceId = url.searchParams.get('workspaceId') || '';
        const limit = Number(url.searchParams.get('limit') || 30);
        return jsonResp({ logs: this.store.getWorkspaceLogs(userId, workspaceId, limit) });
      }

      return jsonResp({ error: 'Not found' }, 404);
    } catch (err) {
      return jsonResp(
        { error: err instanceof Error ? err.message : String(err) },
        400
      );
    }
  }
}

// =====================================================================
// RoomHub Durable Object (3D Scene State + Revision + WebSocket Relay)
// =====================================================================
export class RoomHub implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private scene: XL3DScene | null = null;
  private revision = 1;
  private updatedAt = Date.now();
  private undoStack: string[] = [];
  private recentLogs: Array<{
    id: string;
    tool: string;
    summary: string;
    status: 'ok' | 'error';
    source: string;
    createdAt: number;
    revision: number;
  }> = [];
  private pending = new Map<
    string,
    { resolve: (r: ToolResult & { scene?: XL3DScene }) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async ensureLoaded(): Promise<XL3DScene> {
    if (!this.scene) {
      const saved = await this.ctx.storage.get<XL3DScene>('scene');
      const rev = await this.ctx.storage.get<number>('revision');
      const upd = await this.ctx.storage.get<number>('updatedAt');
      const logs = await this.ctx.storage.get<typeof this.recentLogs>('recentLogs');
      this.scene = saved ?? createInitialHeadlessScene();
      this.revision = typeof rev === 'number' ? rev : 1;
      this.updatedAt = typeof upd === 'number' ? upd : Date.now();
      this.recentLogs = Array.isArray(logs) ? logs : [];
    }
    return this.scene;
  }

  private async persistScene(): Promise<void> {
    if (this.scene) {
      await this.ctx.storage.put('scene', this.scene);
      await this.ctx.storage.put('revision', this.revision);
      await this.ctx.storage.put('updatedAt', this.updatedAt);
      await this.ctx.storage.put('recentLogs', this.recentLogs.slice(0, 40));
    }
  }

  private getActiveClientSocket(): WebSocket | null {
    const sockets = this.ctx.getWebSockets('xl3d-client');
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) return ws;
    }
    return null;
  }

  private broadcastToClients(payload: Record<string, unknown>, except?: WebSocket): void {
    const raw = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets('xl3d-client')) {
      if (ws !== except && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(raw);
        } catch {
          // ignore
        }
      }
    }
  }

  private callLiveClient(
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolResult & { scene?: XL3DScene }> {
    const ws = this.getActiveClientSocket();
    if (!ws) {
      return Promise.reject(new Error('No live XL3D device connected'));
    }
    const callId = `rpc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<ToolResult & { scene?: XL3DScene }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(new Error('XL3D device RPC timeout'));
      }, 12000);
      this.pending.set(callId, { resolve, timer });
      try {
        ws.send(JSON.stringify({ type: 'rpc', callId, tool, args }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(callId);
        reject(err);
      }
    });
  }

  private async recordToAccountHub(params: {
    userId: string;
    workspaceId: string;
    source: string;
    toolName: string;
    summary: string;
    status: 'ok' | 'error';
  }): Promise<void> {
    if (!params.userId || !params.workspaceId || !this.env.ACCOUNT_HUB) return;
    try {
      const hub = this.env.ACCOUNT_HUB.get(this.env.ACCOUNT_HUB.idFromName('global'));
      await hub.fetch('https://account.internal/internal/workspaces/record-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          objectCount: this.scene?.objects.length ?? 0,
          revision: this.revision,
        }),
      });
    } catch {
      // non-fatal
    }
  }

  private summarizeToolResult(tool: string, res: ToolResult): string {
    const txt = res.content[0]?.type === 'text' ? res.content[0].text : tool;
    if (res.isError) return `Ошибка ${tool}: ${txt.slice(0, 140)}`;
    if (txt.length <= 160) return txt.replace(/\s+/g, ' ');
    return `${tool}: ${txt.slice(0, 140).replace(/\s+/g, ' ')}...`;
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctxMeta: { userId: string; workspaceId: string; source: string }
  ): Promise<ToolResult> {
    const scene = await this.ensureLoaded();
    const liveWs = this.getActiveClientSocket();
    let res: ToolResult & { scene?: XL3DScene };
    let executedOnLive = false;

    if (liveWs) {
      try {
        res = await this.callLiveClient(name, args);
        executedOnLive = true;
        if (res.scene && typeof res.scene === 'object' && Array.isArray(res.scene.objects)) {
          this.scene = res.scene;
        }
      } catch {
        res = executeHeadlessTool(scene, this.undoStack, name, args, false, false);
      }
    } else {
      res = executeHeadlessTool(scene, this.undoStack, name, args, false, false);
    }

    const isMut = MUTATING_TOOLS.has(name);
    if (!res.isError && isMut) {
      this.revision += 1;
      this.updatedAt = Date.now();
    }

    const summary = this.summarizeToolResult(name, res);
    if (isMut || res.isError) {
      const logEntry = {
        id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        tool: name,
        summary,
        status: (res.isError ? 'error' : 'ok') as 'ok' | 'error',
        source: ctxMeta.source,
        createdAt: Date.now(),
        revision: this.revision,
      };
      this.recentLogs.unshift(logEntry);
      if (this.recentLogs.length > 40) this.recentLogs = this.recentLogs.slice(0, 40);

      await this.persistScene();
      await this.recordToAccountHub({
        userId: ctxMeta.userId,
        workspaceId: ctxMeta.workspaceId,
        source: ctxMeta.source,
        toolName: name,
        summary,
        status: logEntry.status,
      });

      // Notify connected clients if scene changed via headless or another session
      if (!executedOnLive && !res.isError) {
        this.broadcastToClients({
          type: 'agent_event',
          log: logEntry,
          revision: this.revision,
          updatedAt: this.updatedAt,
          scene: this.scene,
        });
      }
    } else {
      await this.persistScene();
    }

    // Strip internal `scene` before returning MCP ToolResult
    return {
      content: res.content,
      isError: res.isError,
      structured: res.structured,
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const userId = request.headers.get('X-XL3D-Internal-UserId') || '';
    const workspaceId = request.headers.get('X-XL3D-Internal-WorkspaceId') || url.searchParams.get('room') || 'default';
    const source = request.headers.get('X-XL3D-Internal-Source') || 'mcp';

    // Internal state GET/PUT for Workspace Library & immediate agent result viewing
    if (url.pathname === '/internal/state') {
      const scene = await this.ensureLoaded();
      if (request.method === 'GET') {
        return jsonResp({
          workspaceId,
          revision: this.revision,
          updatedAt: this.updatedAt,
          clientConnected: Boolean(this.getActiveClientSocket()),
          scene,
          recentLogs: this.recentLogs,
        });
      }
      if (request.method === 'PUT') {
        const body = (await request.json()) as { scene?: XL3DScene; summary?: string };
        if (!body.scene || !Array.isArray(body.scene.objects)) {
          return jsonResp({ error: 'Invalid scene payload' }, 400);
        }
        this.scene = body.scene;
        this.revision += 1;
        this.updatedAt = Date.now();
        await this.persistScene();
        await this.recordToAccountHub({
          userId,
          workspaceId,
          source: 'app',
          toolName: 'save_workspace',
          summary: body.summary || `Сохранено из приложения (${this.scene.objects.length} объектов)`,
          status: 'ok',
        });
        this.broadcastToClients({
          type: 'scene_updated',
          revision: this.revision,
          updatedAt: this.updatedAt,
          scene: this.scene,
        });
        return jsonResp({
          ok: true,
          workspaceId,
          revision: this.revision,
          updatedAt: this.updatedAt,
        });
      }
    }

    // WebSocket upgrade from XL3D Android/Browser app
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket Upgrade', { status: 426, headers: CORS_HEADERS });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.serializeAttachment({ userId, workspaceId });
      this.ctx.acceptWebSocket(server, ['xl3d-client']);
      const scene = await this.ensureLoaded();
      server.send(
        JSON.stringify({
          type: 'welcome',
          room: workspaceId,
          workspaceId,
          revision: this.revision,
          updatedAt: this.updatedAt,
          cloudObjects: scene.objects.length,
          scene,
          recentLogs: this.recentLogs,
        })
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === '/mcp') {
      if (request.method === 'GET') {
        const scene = await this.ensureLoaded();
        return jsonResp({
          transport: 'streamable-http',
          server: 'xl3d-mcp',
          protocolVersion: '2025-03-26',
          workspaceId,
          revision: this.revision,
          clientConnected: Boolean(this.getActiveClientSocket()),
          objects: scene.objects.length,
        });
      }
      if (request.method === 'POST') {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonResp({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
        }

        const readRes = async (uri: string) => {
          if (uri === 'xl3d://api/bpy-reference') {
            return { contents: [{ uri, mimeType: 'text/markdown', text: XL3D_BPY_REFERENCE_MD }] };
          }
          const info = await this.executeTool('get_scene_info', {}, { userId, workspaceId, source });
          return {
            contents: [
              {
                uri: 'xl3d://scene/summary',
                mimeType: 'application/json',
                text: info.content[0]?.type === 'text' ? info.content[0].text : '{}',
              },
            ],
          };
        };

        if (Array.isArray(body)) {
          const results: JsonRpcResponse[] = [];
          for (const item of body) {
            const r = await handleMcpJsonRpc(
              item as JsonRpcRequest,
              (n, a) => this.executeTool(n, a, { userId, workspaceId, source }),
              readRes
            );
            if (r) results.push(r);
          }
          return jsonResp(results);
        }

        const r = await handleMcpJsonRpc(
          body as JsonRpcRequest,
          (n, a) => this.executeTool(n, a, { userId, workspaceId, source }),
          readRes
        );
        if (!r) return new Response(null, { status: 202, headers: CORS_HEADERS });
        return jsonResp(r);
      }
    }

    // OpenAPI REST endpoints for ChatGPT Custom GPT Actions / Grok / curl
    if (url.pathname.startsWith('/api/')) {
      const toolName = url.pathname.slice('/api/'.length).trim();
      let args: Record<string, unknown> = {};
      if (request.method === 'POST') {
        try {
          const parsed = await request.json();
          if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
        } catch {
          args = {};
        }
      }
      const res = await this.executeTool(toolName, args, { userId, workspaceId, source: 'openapi' });
      return jsonResp(
        {
          ok: !res.isError,
          workspaceId,
          revision: this.revision,
          result: res.structured ?? (res.content[0]?.type === 'text' ? res.content[0].text : res.content),
          content: res.content,
        },
        res.isError ? 400 : 200
      );
    }

    if (url.pathname === '/room-status') {
      const scene = await this.ensureLoaded();
      return jsonResp({
        ...summarizeScene(scene, Boolean(this.getActiveClientSocket())),
        workspaceId,
        revision: this.revision,
        updatedAt: this.updatedAt,
        recentLogs: this.recentLogs.slice(0, 10),
      });
    }

    return jsonResp({ error: 'Not found' }, 404);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(message) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now(), revision: this.revision }));
      return;
    }

    if (msg.type === 'pull_scene') {
      const scene = await this.ensureLoaded();
      ws.send(
        JSON.stringify({
          type: 'scene_updated',
          revision: this.revision,
          updatedAt: this.updatedAt,
          scene,
          recentLogs: this.recentLogs,
        })
      );
      return;
    }

    if (msg.type === 'scene_sync' && msg.scene && typeof msg.scene === 'object') {
      const clientRev = typeof msg.clientRev === 'number' ? msg.clientRev : 0;
      const force = Boolean(msg.force);
      await this.ensureLoaded();
      if (!force && clientRev < this.revision) {
        // Cloud has newer agent edits! Tell client instead of overwriting agent work
        ws.send(
          JSON.stringify({
            type: 'scene_updated',
            revision: this.revision,
            updatedAt: this.updatedAt,
            scene: this.scene,
            recentLogs: this.recentLogs,
          })
        );
        return;
      }
      this.scene = msg.scene as XL3DScene;
      this.revision += 1;
      this.updatedAt = Date.now();
      await this.persistScene();
      const att = (ws.deserializeAttachment() as { userId?: string; workspaceId?: string } | null) ?? {};
      if (att.userId && att.workspaceId) {
        await this.recordToAccountHub({
          userId: att.userId,
          workspaceId: att.workspaceId,
          source: 'app',
          toolName: 'app_sync',
          summary: `Синхронизация из XL3D (${this.scene.objects.length} объектов)`,
          status: 'ok',
        });
      }
      ws.send(JSON.stringify({ type: 'sync_ack', revision: this.revision, updatedAt: this.updatedAt }));
      this.broadcastToClients(
        { type: 'scene_updated', revision: this.revision, updatedAt: this.updatedAt, scene: this.scene },
        ws
      );
      return;
    }

    if (msg.type === 'rpc_result' && typeof msg.callId === 'string') {
      const entry = this.pending.get(msg.callId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(msg.callId);
        const res = (msg.result ?? { isError: true, content: [{ type: 'text', text: 'Empty RPC result' }] }) as ToolResult & {
          scene?: XL3DScene;
        };
        if (msg.scene && typeof msg.scene === 'object') {
          res.scene = msg.scene as XL3DScene;
        }
        entry.resolve(res);
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
}

// =====================================================================
// Worker Entrypoint Helpers
// =====================================================================
function getAccountHub(env: Env): DurableObjectStub {
  return env.ACCOUNT_HUB.get(env.ACCOUNT_HUB.idFromName('global'));
}

async function resolveAuth(request: Request, url: URL, env: Env): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
  legacyAdmin?: boolean;
  auth?: ResolvedAuth;
}> {
  const token = getTokenFromRequest(request, url);
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: missing Bearer or ?token= access token' };
  }

  // Optional legacy global MCP_TOKEN support if explicitly configured by deployer
  if (env.MCP_TOKEN && env.MCP_TOKEN.trim().length > 0 && token === env.MCP_TOKEN.trim()) {
    return { ok: true, legacyAdmin: true };
  }

  const hub = getAccountHub(env);
  const resp = await hub.fetch('https://account.internal/internal/resolve-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!resp.ok) {
    return { ok: false, status: 401, error: 'Unauthorized: invalid or expired token' };
  }
  const auth = (await resp.json()) as ResolvedAuth;
  return { ok: true, auth };
}

function forwardToRoom(
  env: Env,
  workspaceId: string,
  request: Request,
  meta: { userId: string; workspaceId: string; source: string }
): Promise<Response> {
  const id = env.ROOM_HUB.idFromName(workspaceId);
  const stub = env.ROOM_HUB.get(id);
  const headers = new Headers(request.headers);
  headers.delete('X-XL3D-Internal-UserId');
  headers.delete('X-XL3D-Internal-WorkspaceId');
  headers.delete('X-XL3D-Internal-Source');
  headers.set('X-XL3D-Internal-UserId', meta.userId);
  headers.set('X-XL3D-Internal-WorkspaceId', meta.workspaceId);
  headers.set('X-XL3D-Internal-Source', meta.source);
  return stub.fetch(new Request(request, { headers }));
}

async function handleWorkspaceMetaTool(
  toolName: string,
  args: Record<string, unknown>,
  auth: ResolvedAuth,
  activeWorkspaceId: string,
  env: Env
): Promise<ToolResult | null> {
  const hub = getAccountHub(env);

  if (toolName === 'list_workspaces') {
    const resp = await hub.fetch(
      `https://account.internal/internal/workspaces?userId=${encodeURIComponent(auth.user.id)}`
    );
    const data = (await resp.json()) as { workspaces: Array<Record<string, unknown>> };
    const out = {
      activeWorkspaceId: auth.activeWorkspaceId,
      workspaces: data.workspaces,
    };
    return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structured: out };
  }

  if (toolName === 'create_workspace') {
    const name = String(args.name ?? 'New Workspace').trim();
    const description = String(args.description ?? '');
    const resp = await hub.fetch('https://account.internal/internal/workspaces/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: auth.user.id, name, description, setActive: true }),
    });
    const data = (await resp.json()) as { workspace?: Record<string, unknown>; error?: string };
    if (!resp.ok || !data.workspace) {
      return { isError: true, content: [{ type: 'text', text: data.error || 'Failed to create workspace' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data.workspace, null, 2) }], structured: data.workspace };
  }

  if (toolName === 'select_workspace') {
    const query = String(args.workspace ?? '').trim();
    const match = auth.workspaces.find((w) => w.id === query || w.name.toLowerCase() === query.toLowerCase());
    if (!match) {
      return { isError: true, content: [{ type: 'text', text: `Workspace "${query}" не найден` }] };
    }
    const resp = await hub.fetch('https://account.internal/internal/workspaces/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: auth.user.id, workspaceId: match.id, setActive: true }),
    });
    const data = (await resp.json()) as { workspace?: Record<string, unknown> };
    return {
      content: [{ type: 'text', text: JSON.stringify({ activeWorkspace: data.workspace ?? match }, null, 2) }],
      structured: { activeWorkspace: data.workspace ?? match },
    };
  }

  if (toolName === 'get_agent_history') {
    const limit = Math.max(1, Math.min(80, Number(args.limit ?? 20)));
    const resp = await hub.fetch(
      `https://account.internal/internal/workspaces/logs?userId=${encodeURIComponent(auth.user.id)}&workspaceId=${encodeURIComponent(activeWorkspaceId)}&limit=${limit}`
    );
    const data = (await resp.json()) as { logs: unknown[] };
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structured: data };
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/health') {
      return jsonResp({
        ok: true,
        service: 'xl3d-mcp',
        version: '2.0.0',
        runtime: 'cloudflare-workers',
        authEnabled: true,
        googleAuthEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      });
    }

    if (path === '/openapi.json') {
      const requestedRoom = (url.searchParams.get('room') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      return jsonResp(buildOpenApiSpec(url.origin, requestedRoom));
    }

    if (path === '/') {
      const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XL3D Cloud & MCP Server — Cloudflare Workers</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background: #14161c; color: #f1f5f9; max-width: 760px; margin: 32px auto; padding: 0 16px; line-height: 1.55; }
  code, pre { background: #1e222d; padding: 2px 6px; border-radius: 6px; color: #ffb169; font-size: 13px; }
  pre { padding: 12px; overflow-x: auto; border: 1px solid #2e3444; }
  .card { background: #1c1f28; border: 1px solid #2e3444; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  h1 { color: #f38020; margin-bottom: 6px; }
</style>
</head>
<body>
  <h1>XL3D Cloud & MCP Server (v2.0)</h1>
  <p>Облачная платформа XL3D на базе <strong>Cloudflare Workers + SQLite Durable Objects</strong>: регистрация, Google Auth, долгоживущие токены, библиотека 3D-пространств и авторизованный MCP/OpenAPI сервер для Claude, ChatGPT, Grok и Cursor.</p>
  <div class="card">
    <strong>Авторизованные эндпоинты:</strong>
    <ul>
      <li>Auth: <code>POST /auth/register</code>, <code>POST /auth/login</code>, <code>GET /auth/google/start</code>, <code>GET /auth/me</code></li>
      <li>Workspaces Library: <code>GET /workspaces</code>, <code>POST /workspaces</code>, <code>GET /workspaces/:id/state</code>, <code>GET /workspaces/:id/logs</code></li>
      <li>MCP (Claude / Cursor / CLI): <code>${url.origin}/mcp?token=YOUR_MCP_TOKEN</code> (опционально <code>&amp;room=ws_...</code>)</li>
      <li>OpenAPI 3.1 (ChatGPT Actions): <code>${url.origin}/openapi.json</code> (Auth: Bearer <code>YOUR_MCP_TOKEN</code>)</li>
      <li>WebSocket (XL3D App): <code>${url.origin.replace(/^http/, 'ws')}/ws?room=ws_...&amp;token=YOUR_TOKEN</code></li>
    </ul>
  </div>
  <div class="card">
    <strong>Подключение в Claude Code:</strong>
    <pre>claude mcp add --transport http xl3d "${url.origin}/mcp?token=YOUR_MCP_TOKEN"</pre>
  </div>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
      });
    }

    // ---------- Public Auth Routes ----------
    if (path === '/auth/register' && request.method === 'POST') {
      const hub = getAccountHub(env);
      const body = await request.text();
      const resp = await hub.fetch('https://account.internal/internal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await resp.json();
      return jsonResp(data, resp.status);
    }

    if (path === '/auth/login' && request.method === 'POST') {
      const hub = getAccountHub(env);
      const body = await request.text();
      const resp = await hub.fetch('https://account.internal/internal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await resp.json();
      return jsonResp(data, resp.status);
    }

    if (path === '/auth/google/start' && request.method === 'GET') {
      const redirectUri = url.searchParams.get('redirect_uri') || `${url.origin}/`;
      const callbackUrl = `${url.origin}/auth/google/callback`;
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        const backHref = redirectUri.startsWith('xl3d://')
          ? 'xl3d://auth/callback?error=google_not_configured'
          : redirectUri;
        const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Настройка Google Auth — XL3D</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background: #14161c; color: #f1f5f9; max-width: 600px; margin: 28px auto; padding: 0 16px; line-height: 1.55; }
  .card { background: #1c1f28; border: 1px solid #2e3444; border-radius: 12px; padding: 16px; margin: 14px 0; }
  code { background: #11131a; color: #ffb169; padding: 4px 8px; border-radius: 6px; word-break: break-all; display: inline-block; margin-top: 4px; }
  .btn { display: inline-block; margin-top: 10px; padding: 10px 16px; border-radius: 10px; background: #f38020; color: #111; font-weight: 700; text-decoration: none; }
</style>
</head><body>
  <h2>🔑 Осталось подключить Google OAuth (2 минуты)</h2>
  <p>Чтобы заработала кнопка <b>«Войти через Google»</b>, добавьте ваши ключи Google OAuth в Cloudflare Worker:</p>
  <div class="card">
    <ol style="padding-left:18px;margin:0;">
      <li>Откройте <b>Google Cloud Console → APIs &amp; Services → Credentials</b> и создайте <b>OAuth 2.0 Client ID (Web application)</b>.</li>
      <li>В <b>Authorized redirect URIs</b> вставьте:<br><code>${escapeHtml(callbackUrl)}</code></li>
      <li>Откройте <b>Cloudflare Dashboard → Workers &amp; Pages → ваш Worker → Settings → Variables and Secrets</b> и добавьте:<br>
        <code>GOOGLE_CLIENT_ID</code> и <code>GOOGLE_CLIENT_SECRET</code>.
      </li>
    </ol>
  </div>
  <p style="color:#9aa2b3;font-size:13px;">Регистрация и вход по Email + Пароль в XL3D работают уже сейчас без настройки Google ключей.</p>
  <a class="btn" href="${escapeHtml(backHref)}">← Вернуться в XL3D</a>
</body></html>`;
        return new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
        });
      }
      const hub = getAccountHub(env);
      const secResp = await hub.fetch('https://account.internal/internal/oauth-secret');
      const { secret } = (await secResp.json()) as { secret: string };
      const state = await signOAuthState({ redirectUri }, secret);
      const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      googleUrl.searchParams.set('redirect_uri', callbackUrl);
      googleUrl.searchParams.set('response_type', 'code');
      googleUrl.searchParams.set('scope', 'openid email profile');
      googleUrl.searchParams.set('access_type', 'offline');
      googleUrl.searchParams.set('prompt', 'select_account');
      googleUrl.searchParams.set('state', state);
      return Response.redirect(googleUrl.toString(), 302);
    }

    if (path === '/auth/google/callback' && request.method === 'GET') {
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      const errParam = url.searchParams.get('error');
      if (errParam) {
        return new Response(`Google OAuth error: ${escapeHtml(errParam)}`, { status: 400 });
      }
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        return new Response('Google OAuth not configured', { status: 501 });
      }

      const hub = getAccountHub(env);
      const secResp = await hub.fetch('https://account.internal/internal/oauth-secret');
      const { secret } = (await secResp.json()) as { secret: string };
      const parsedState = await verifyOAuthState(state, secret);
      if (!parsedState || !code) {
        return new Response('Invalid or expired OAuth state', { status: 400 });
      }
      const clientRedirect = String(parsedState.redirectUri || `${url.origin}/`);
      const callbackUrl = `${url.origin}/auth/google/callback`;

      const tokResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: callbackUrl,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokResp.ok) {
        return new Response('Failed to exchange Google code', { status: 502 });
      }
      const tokJson = (await tokResp.json()) as { access_token?: string };
      if (!tokJson.access_token) {
        return new Response('Missing Google access_token', { status: 502 });
      }

      const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokJson.access_token}` },
      });
      if (!profileResp.ok) {
        return new Response('Failed to fetch Google user profile', { status: 502 });
      }
      const profile = (await profileResp.json()) as {
        id: string;
        email: string;
        name?: string;
        picture?: string;
      };

      const upsertResp = await hub.fetch('https://account.internal/internal/google-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: profile.email,
          name: profile.name || profile.email.split('@')[0],
          avatarUrl: profile.picture ?? null,
          googleSub: profile.id,
          deviceLabel: clientRedirect.startsWith('xl3d://') ? 'XL3D Android' : 'XL3D Web',
        }),
      });
      if (!upsertResp.ok) {
        return new Response('Failed to save Google user', { status: 500 });
      }
      const bundle = (await upsertResp.json()) as { sessionToken: string };

      const target = new URL(clientRedirect);
      target.searchParams.set('xl3d_token', bundle.sessionToken);
      const finalRedirect = target.toString();

      if (finalRedirect.startsWith('xl3d://')) {
        const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Вход выполнен — XL3D</title>
<style>body{font-family:system-ui,sans-serif;background:#14161c;color:#f1f5f9;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;}a{display:inline-block;margin-top:16px;padding:12px 24px;border-radius:10px;background:#f38020;color:#111;font-weight:700;text-decoration:none;}</style>
</head><body>
<h2>✓ Вход через Google выполнен</h2>
<p>Возвращаемся в приложение XL3D...</p>
<a href="${escapeHtml(finalRedirect)}">Открыть XL3D</a>
<script>window.location.href = ${JSON.stringify(finalRedirect)};</script>
</body></html>`;
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return Response.redirect(finalRedirect, 302);
    }

    // ---------- Authenticated Endpoints ----------
    const authRes = await resolveAuth(request, url, env);
    if (!authRes.ok) {
      return jsonResp({ error: authRes.error || 'Unauthorized' }, authRes.status || 401);
    }

    // Legacy admin token shortcut (only if deployer explicitly set env.MCP_TOKEN)
    if (authRes.legacyAdmin) {
      const legacyRoom = (url.searchParams.get('room') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
      if (path === '/mcp' || path === '/ws' || path === '/room-status' || path.startsWith('/api/')) {
        return forwardToRoom(env, legacyRoom, request, {
          userId: 'legacy_admin',
          workspaceId: legacyRoom,
          source: path.startsWith('/api/') ? 'openapi' : 'mcp',
        });
      }
      return jsonResp({ error: 'User session required for account/workspace endpoints' }, 403);
    }

    const auth = authRes.auth!;
    const hub = getAccountHub(env);

    if (path === '/auth/me' && request.method === 'GET') {
      return jsonResp({
        user: auth.user,
        mcpToken: auth.mcpToken,
        workspaces: auth.workspaces,
        activeWorkspaceId: auth.activeWorkspaceId,
        googleAuthEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      });
    }

    if (path === '/auth/logout' && request.method === 'POST') {
      const token = getTokenFromRequest(request, url);
      await hub.fetch('https://account.internal/internal/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      return jsonResp({ ok: true });
    }

    if (path === '/auth/regenerate-mcp-token' && request.method === 'POST') {
      const resp = await hub.fetch('https://account.internal/internal/regenerate-mcp-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.user.id }),
      });
      return jsonResp(await resp.json(), resp.status);
    }

    // ---------- Workspaces Library REST API ----------
    if (path === '/workspaces' && request.method === 'GET') {
      return jsonResp({
        workspaces: auth.workspaces,
        activeWorkspaceId: auth.activeWorkspaceId,
      });
    }

    if (path === '/workspaces' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        description?: string;
        scene?: XL3DScene;
        setActive?: boolean;
      };
      const objectCount = Array.isArray(body.scene?.objects) ? body.scene!.objects.length : 3;
      const createResp = await hub.fetch('https://account.internal/internal/workspaces/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: auth.user.id,
          name: body.name || `Workspace ${auth.workspaces.length + 1}`,
          description: body.description || '',
          objectCount,
          setActive: body.setActive !== false,
        }),
      });
      const created = (await createResp.json()) as { workspace?: { id: string }; error?: string };
      if (!createResp.ok || !created.workspace) {
        return jsonResp(created, createResp.status);
      }
      if (body.scene && Array.isArray(body.scene.objects)) {
        const roomStub = env.ROOM_HUB.get(env.ROOM_HUB.idFromName(created.workspace.id));
        await roomStub.fetch('https://room.internal/internal/state', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-XL3D-Internal-UserId': auth.user.id,
            'X-XL3D-Internal-WorkspaceId': created.workspace.id,
          },
          body: JSON.stringify({ scene: body.scene, summary: 'Создано пространство из текущей сцены' }),
        });
      }
      return jsonResp(created, 201);
    }

    const wsMatch = path.match(/^\/workspaces\/([a-zA-Z0-9_-]+)(\/state|\/logs)?$/);
    if (wsMatch) {
      const wsId = wsMatch[1];
      const sub = wsMatch[2] || '';
      const owned = auth.workspaces.find((w) => w.id === wsId);
      if (!owned) {
        return jsonResp({ error: 'Workspace not found or access denied' }, 404);
      }

      if (sub === '' && request.method === 'PATCH') {
        const body = (await request.json().catch(() => ({}))) as {
          name?: string;
          description?: string;
          setActive?: boolean;
        };
        const resp = await hub.fetch('https://account.internal/internal/workspaces/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: auth.user.id, workspaceId: wsId, ...body }),
        });
        return jsonResp(await resp.json(), resp.status);
      }

      if (sub === '' && request.method === 'DELETE') {
        const resp = await hub.fetch('https://account.internal/internal/workspaces/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: auth.user.id, workspaceId: wsId }),
        });
        return jsonResp(await resp.json(), resp.status);
      }

      if (sub === '/state') {
        const roomStub = env.ROOM_HUB.get(env.ROOM_HUB.idFromName(wsId));
        if (request.method === 'GET') {
          const [roomResp, logsResp] = await Promise.all([
            roomStub.fetch('https://room.internal/internal/state', {
              headers: {
                'X-XL3D-Internal-UserId': auth.user.id,
                'X-XL3D-Internal-WorkspaceId': wsId,
              },
            }),
            hub.fetch(
              `https://account.internal/internal/workspaces/logs?userId=${encodeURIComponent(auth.user.id)}&workspaceId=${encodeURIComponent(wsId)}&limit=30`
            ),
          ]);
          const roomData = (await roomResp.json()) as Record<string, unknown>;
          const logsData = (await logsResp.json()) as { logs: unknown[] };
          return jsonResp({
            workspace: owned,
            ...roomData,
            logs: logsData.logs,
          });
        }
        if (request.method === 'PUT') {
          const body = await request.text();
          const resp = await roomStub.fetch('https://room.internal/internal/state', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'X-XL3D-Internal-UserId': auth.user.id,
              'X-XL3D-Internal-WorkspaceId': wsId,
            },
            body,
          });
          return jsonResp(await resp.json(), resp.status);
        }
      }

      if (sub === '/logs' && request.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') || 30);
        const resp = await hub.fetch(
          `https://account.internal/internal/workspaces/logs?userId=${encodeURIComponent(auth.user.id)}&workspaceId=${encodeURIComponent(wsId)}&limit=${limit}`
        );
        return jsonResp(await resp.json(), resp.status);
      }
    }

    // ---------- Authenticated MCP, OpenAPI REST, WebSocket ----------
    if (path === '/mcp' || path === '/ws' || path === '/room-status' || path.startsWith('/api/')) {
      const requestedRoom = (
        url.searchParams.get('room') ||
        request.headers.get('X-XL3D-Workspace') ||
        ''
      )
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);

      const targetWorkspaceId = requestedRoom || auth.activeWorkspaceId;
      const owned = auth.workspaces.find((w) => w.id === targetWorkspaceId);
      if (!owned) {
        return jsonResp(
          { error: `Forbidden: workspace "${targetWorkspaceId}" does not belong to this account` },
          403
        );
      }

      // Handle workspace-library tools directly against AccountHub before RoomHub
      if (path.startsWith('/api/')) {
        const toolName = path.slice('/api/'.length).trim();
        if (
          toolName === 'list_workspaces' ||
          toolName === 'select_workspace' ||
          toolName === 'create_workspace' ||
          toolName === 'get_agent_history'
        ) {
          let args: Record<string, unknown> = {};
          if (request.method === 'POST') {
            try {
              const p = await request.json();
              if (p && typeof p === 'object') args = p as Record<string, unknown>;
            } catch {
              args = {};
            }
          }
          const res = await handleWorkspaceMetaTool(toolName, args, auth, targetWorkspaceId, env);
          if (res) {
            return jsonResp(
              {
                ok: !res.isError,
                result: res.structured ?? (res.content[0]?.type === 'text' ? res.content[0].text : res.content),
                content: res.content,
              },
              res.isError ? 400 : 200
            );
          }
        }
      }

      if (path === '/mcp' && request.method === 'POST') {
        const cloned = request.clone();
        let body: unknown = null;
        try {
          body = await cloned.json();
        } catch {
          body = null;
        }
        const isMetaCall = (reqItem: unknown) => {
          if (!reqItem || typeof reqItem !== 'object') return false;
          const r = reqItem as JsonRpcRequest;
          const tName = String(r.params?.name ?? '');
          return (
            r.method === 'tools/call' &&
            (tName === 'list_workspaces' ||
              tName === 'select_workspace' ||
              tName === 'create_workspace' ||
              tName === 'get_agent_history')
          );
        };
        if (body && !Array.isArray(body) && isMetaCall(body)) {
          const reqObj = body as JsonRpcRequest;
          const r = await handleMcpJsonRpc(
            reqObj,
            async (n, a) => (await handleWorkspaceMetaTool(n, a, auth, targetWorkspaceId, env))!,
            async (uri) => ({ contents: [{ uri, mimeType: 'text/markdown', text: XL3D_BPY_REFERENCE_MD }] })
          );
          if (!r) return new Response(null, { status: 202, headers: CORS_HEADERS });
          return jsonResp(r);
        }
      }

      return forwardToRoom(env, targetWorkspaceId, request, {
        userId: auth.user.id,
        workspaceId: targetWorkspaceId,
        source: path.startsWith('/api/') ? 'openapi' : 'mcp',
      });
    }

    return jsonResp({ error: 'Not found' }, 404);
  },
};
