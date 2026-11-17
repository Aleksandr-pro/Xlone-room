import type { XL3DScene } from '../../xl3d/src/core/types';
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
  MCP_TOKEN?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-XL3D-Token, Mcp-Session-Id',
};

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

function getTokenFromRequest(request: Request, url: URL): string {
  const auth = request.headers.get('Authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const h = request.headers.get('X-XL3D-Token');
  if (h) return h.trim();
  return (url.searchParams.get('token') || '').trim();
}

export class RoomHub implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private scene: XL3DScene | null = null;
  private undoStack: string[] = [];
  private roomToken: string | null = null;
  private pending = new Map<string, { resolve: (r: ToolResult) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async ensureLoaded(): Promise<XL3DScene> {
    if (!this.scene) {
      const saved = await this.ctx.storage.get<XL3DScene>('scene');
      this.scene = saved ?? createInitialHeadlessScene();
    }
    if (this.roomToken === null) {
      const savedTok = await this.ctx.storage.get<string>('roomToken');
      if (savedTok) this.roomToken = savedTok;
    }
    return this.scene;
  }

  private async persistScene(): Promise<void> {
    if (this.scene) {
      await this.ctx.storage.put('scene', this.scene);
    }
  }

  private getActiveClientSocket(): WebSocket | null {
    const sockets = this.ctx.getWebSockets('xl3d-client');
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) return ws;
    }
    return null;
  }

  private async checkAuth(reqToken: string): Promise<boolean> {
    if (this.env.MCP_TOKEN && this.env.MCP_TOKEN.trim().length > 0) {
      return reqToken === this.env.MCP_TOKEN.trim();
    }
    await this.ensureLoaded();
    if (!this.roomToken && reqToken) {
      this.roomToken = reqToken;
      await this.ctx.storage.put('roomToken', reqToken);
      return true;
    }
    if (!this.roomToken) return true;
    return reqToken === this.roomToken;
  }

  private callLiveClient(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    const ws = this.getActiveClientSocket();
    if (!ws) {
      return Promise.reject(new Error('No live XL3D device connected'));
    }
    const callId = `rpc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<ToolResult>((resolve, reject) => {
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

  private async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const scene = await this.ensureLoaded();
    const liveWs = this.getActiveClientSocket();
    if (liveWs) {
      try {
        const res = await this.callLiveClient(name, args);
        return res;
      } catch {
        // Fallback to cloud headless state if device disconnected mid-request
      }
    }
    const res = executeHeadlessTool(scene, this.undoStack, name, args, false, false);
    await this.persistScene();
    return res;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const reqToken = getTokenFromRequest(request, url);

    // WebSocket upgrade from XL3D Android/Browser app
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket Upgrade', { status: 426, headers: CORS_HEADERS });
      }
      if (!(await this.checkAuth(reqToken))) {
        return jsonResp({ error: 'Invalid token for this room' }, 401);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, ['xl3d-client']);
      const scene = await this.ensureLoaded();
      server.send(
        JSON.stringify({
          type: 'welcome',
          room: url.searchParams.get('room') || 'default',
          cloudObjects: scene.objects.length,
        })
      );
      return new Response(null, { status: 101, webSocket: client });
    }

    if (!(await this.checkAuth(reqToken))) {
      return jsonResp({ error: 'Unauthorized: invalid or missing token' }, 401);
    }

    // MCP Streamable HTTP endpoint
    if (url.pathname === '/mcp') {
      if (request.method === 'GET') {
        const scene = await this.ensureLoaded();
        return jsonResp({
          transport: 'streamable-http',
          server: 'xl3d-mcp',
          protocolVersion: '2025-03-26',
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
          const info = await this.executeTool('get_scene_info', {});
          return {
            contents: [{ uri: 'xl3d://scene/summary', mimeType: 'application/json', text: info.content[0]?.type === 'text' ? info.content[0].text : '{}' }],
          };
        };

        if (Array.isArray(body)) {
          const results: JsonRpcResponse[] = [];
          for (const item of body) {
            const r = await handleMcpJsonRpc(item as JsonRpcRequest, (n, a) => this.executeTool(n, a), readRes);
            if (r) results.push(r);
          }
          return jsonResp(results);
        }

        const r = await handleMcpJsonRpc(body as JsonRpcRequest, (n, a) => this.executeTool(n, a), readRes);
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
      const res = await this.executeTool(toolName, args);
      return jsonResp(
        {
          ok: !res.isError,
          result: res.structured ?? (res.content[0]?.type === 'text' ? res.content[0].text : res.content),
          content: res.content,
        },
        res.isError ? 400 : 200
      );
    }

    // Status for room
    if (url.pathname === '/room-status') {
      const scene = await this.ensureLoaded();
      return jsonResp(summarizeScene(scene, Boolean(this.getActiveClientSocket())));
    }

    return jsonResp({ error: 'Not found' }, 404);
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(message) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      _ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      return;
    }

    if (msg.type === 'scene_sync' && msg.scene && typeof msg.scene === 'object') {
      this.scene = msg.scene as XL3DScene;
      await this.persistScene();
      return;
    }

    if (msg.type === 'rpc_result' && typeof msg.callId === 'string') {
      const entry = this.pending.get(msg.callId);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(msg.callId);
        entry.resolve(msg.result as ToolResult);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const room = (url.searchParams.get('room') || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default';

    if (url.pathname === '/health') {
      return jsonResp({ ok: true, service: 'xl3d-mcp', version: '1.0.0', runtime: 'cloudflare-workers' });
    }

    if (url.pathname === '/openapi.json') {
      return jsonResp(buildOpenApiSpec(url.origin, room));
    }

    if (url.pathname === '/') {
      const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>XL3D MCP Server — Cloudflare Worker</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background: #14161c; color: #f1f5f9; max-width: 720px; margin: 32px auto; padding: 0 16px; line-height: 1.55; }
  code, pre { background: #1e222d; padding: 2px 6px; border-radius: 6px; color: #ffb169; font-size: 13px; }
  pre { padding: 12px; overflow-x: auto; border: 1px solid #2e3444; }
  .card { background: #1c1f28; border: 1px solid #2e3444; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  h1 { color: #f38020; margin-bottom: 6px; }
</style>
</head>
<body>
  <h1>XL3D MCP Server</h1>
  <p>Бесплатный облачный MCP + OpenAPI сервер на Cloudflare Workers (Durable Objects WebSocket Relay) для управления 3D-сценами XL3D из Claude, ChatGPT, Grok и десктопных агентов.</p>
  <div class="card">
    <strong>Эндпоинты:</strong>
    <ul>
      <li>MCP (Claude Web / Claude Code / Cursor): <code>${url.origin}/mcp?room=myroom&token=YOUR_TOKEN</code></li>
      <li>OpenAPI 3.1 (ChatGPT Custom GPT Actions): <code>${url.origin}/openapi.json</code></li>
      <li>WebSocket (приложение XL3D): <code>${url.origin.replace(/^http/, 'ws')}/ws?room=myroom&token=YOUR_TOKEN</code></li>
    </ul>
  </div>
  <div class="card">
    <strong>Подключение в Claude Code:</strong>
    <pre>claude mcp add --transport http xl3d "${url.origin}/mcp?room=myroom&token=YOUR_TOKEN"</pre>
  </div>
</body>
</html>`;
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
      });
    }

    if (
      url.pathname === '/mcp' ||
      url.pathname === '/ws' ||
      url.pathname === '/room-status' ||
      url.pathname.startsWith('/api/')
    ) {
      const id = env.ROOM_HUB.idFromName(room);
      const stub = env.ROOM_HUB.get(id);
      return stub.fetch(request);
    }

    return jsonResp({ error: 'Not found' }, 404);
  },
};
