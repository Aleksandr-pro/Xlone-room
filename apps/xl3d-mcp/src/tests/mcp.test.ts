import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { AccountStore, type SqlExecutor } from '../accountStore';
import { signOAuthState, verifyOAuthState } from '../authCrypto';
import { handleMcpJsonRpc, XL3D_BPY_REFERENCE_MD, XL3D_MCP_TOOLS } from '../mcpProtocol';
import { buildOpenApiSpec } from '../openapi';
import { createInitialHeadlessScene, executeHeadlessTool } from '../sceneToolExecutor';
import worker, { type Env } from '../worker';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

function createNodeSqlAdapter(): SqlExecutor {
  const db = new DatabaseSync(':memory:');
  return {
    exec: <T extends Record<string, unknown>>(query: string, ...params: unknown[]): T[] => {
      const stmt = db.prepare(query);
      const trimmed = query.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
        return stmt.all(...(params as any[])) as unknown as T[];
      }
      stmt.run(...(params as any[]));
      return [];
    },
  };
}

function createInMemoryWorkerEnv(): Env {
  const accountStore = new AccountStore(createNodeSqlAdapter());
  const oauthSecret = 'test_secret_xl3d_2026';

  const roomStates = new Map<
    string,
    { scene: ReturnType<typeof createInitialHeadlessScene>; undo: string[]; revision: number; updatedAt: number; logs: any[] }
  >();

  const getRoom = (id: string) => {
    let r = roomStates.get(id);
    if (!r) {
      r = { scene: createInitialHeadlessScene(), undo: [], revision: 1, updatedAt: Date.now(), logs: [] };
      roomStates.set(id, r);
    }
    return r;
  };

  const accountHubStub: DurableObjectStub = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = new URL(req.url);
      const path = url.pathname;
      try {
        if (path === '/internal/oauth-secret') {
          return new Response(JSON.stringify({ secret: oauthSecret }), { status: 200 });
        }
        if (path === '/internal/register') {
          const b = (await req.json()) as any;
          return new Response(JSON.stringify(await accountStore.registerEmail(b.email, b.password, b.name)), { status: 201 });
        }
        if (path === '/internal/login') {
          const b = (await req.json()) as any;
          return new Response(JSON.stringify(await accountStore.loginEmail(b.email, b.password)), { status: 200 });
        }
        if (path === '/internal/google-upsert') {
          const b = (await req.json()) as any;
          return new Response(JSON.stringify(await accountStore.upsertGoogleUser(b)), { status: 200 });
        }
        if (path === '/internal/resolve-auth') {
          const b = (await req.json()) as any;
          const resolved = await accountStore.resolveAuthToken(b.token ?? '');
          return new Response(JSON.stringify(resolved ?? { error: 'Unauthorized' }), { status: resolved ? 200 : 401 });
        }
        if (path === '/internal/logout') {
          const b = (await req.json()) as any;
          if (b.token) await accountStore.logoutSession(b.token);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === '/internal/regenerate-mcp-token') {
          const b = (await req.json()) as any;
          return new Response(JSON.stringify(await accountStore.regenerateMcpToken(b.userId)), { status: 200 });
        }
        if (path === '/internal/workspaces') {
          const userId = url.searchParams.get('userId') || '';
          return new Response(JSON.stringify({ workspaces: accountStore.listWorkspaces(userId) }), { status: 200 });
        }
        if (path === '/internal/workspaces/create') {
          const b = (await req.json()) as any;
          return new Response(
            JSON.stringify({ workspace: accountStore.createWorkspace(b.userId, b.name, b.description, b.objectCount, b.setActive) }),
            { status: 201 }
          );
        }
        if (path === '/internal/workspaces/update') {
          const b = (await req.json()) as any;
          const ws = accountStore.updateWorkspace(b.userId, b.workspaceId, b);
          return new Response(JSON.stringify(ws ? { workspace: ws } : { error: 'Not found' }), { status: ws ? 200 : 404 });
        }
        if (path === '/internal/workspaces/delete') {
          const b = (await req.json()) as any;
          return new Response(JSON.stringify(accountStore.deleteWorkspace(b.userId, b.workspaceId)), { status: 200 });
        }
        if (path === '/internal/workspaces/record-event') {
          const b = (await req.json()) as any;
          accountStore.recordWorkspaceEvent(b);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (path === '/internal/workspaces/logs') {
          const userId = url.searchParams.get('userId') || '';
          const wsId = url.searchParams.get('workspaceId') || '';
          return new Response(JSON.stringify({ logs: accountStore.getWorkspaceLogs(userId, wsId) }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      } catch (err) {
        return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 400 });
      }
    },
  } as unknown as DurableObjectStub;

  const makeRoomStub = (roomId: string): DurableObjectStub =>
    ({
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const url = new URL(req.url);
        const room = getRoom(roomId);
        const userId = req.headers.get('X-XL3D-Internal-UserId') || '';
        const wsId = req.headers.get('X-XL3D-Internal-WorkspaceId') || roomId;
        const source = req.headers.get('X-XL3D-Internal-Source') || 'mcp';

        if (url.pathname === '/internal/state') {
          if (req.method === 'GET') {
            return new Response(
              JSON.stringify({ workspaceId: wsId, revision: room.revision, updatedAt: room.updatedAt, clientConnected: false, scene: room.scene, recentLogs: room.logs }),
              { status: 200 }
            );
          }
          if (req.method === 'PUT') {
            const b = (await req.json()) as any;
            room.scene = b.scene;
            room.revision += 1;
            room.updatedAt = Date.now();
            accountStore.recordWorkspaceEvent({
              userId,
              workspaceId: wsId,
              objectCount: room.scene.objects.length,
              revision: room.revision,
              source: 'app',
              toolName: 'save_workspace',
              summary: b.summary || 'Saved from app',
              status: 'ok',
            });
            return new Response(JSON.stringify({ ok: true, workspaceId: wsId, revision: room.revision }), { status: 200 });
          }
        }

        const runTool = (toolName: string, args: Record<string, unknown>) => {
          const res = executeHeadlessTool(room.scene, room.undo, toolName, args, false, false);
          if (!res.isError && toolName !== 'get_scene_info' && toolName !== 'export_scene') {
            room.revision += 1;
            room.updatedAt = Date.now();
            const txt = res.content[0]?.type === 'text' ? res.content[0].text : toolName;
            accountStore.recordWorkspaceEvent({
              userId,
              workspaceId: wsId,
              objectCount: room.scene.objects.length,
              revision: room.revision,
              source,
              toolName,
              summary: txt.slice(0, 140),
              status: 'ok',
            });
          }
          return res;
        };

        if (url.pathname === '/mcp' && req.method === 'POST') {
          const rpc = (await req.json()) as any;
          const out = await handleMcpJsonRpc(
            rpc,
            async (n, a) => runTool(n, a),
            async (uri) => ({ contents: [{ uri, mimeType: 'text/markdown', text: XL3D_BPY_REFERENCE_MD }] })
          );
          return new Response(JSON.stringify(out), { status: 200 });
        }

        if (url.pathname.startsWith('/api/')) {
          const toolName = url.pathname.slice('/api/'.length);
          const args = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, unknown>) : {};
          const res = runTool(toolName, args);
          return new Response(JSON.stringify({ ok: !res.isError, result: res.structured ?? res.content }), { status: res.isError ? 400 : 200 });
        }

        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      },
    }) as unknown as DurableObjectStub;

  return {
    ACCOUNT_HUB: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: () => accountHubStub,
    } as unknown as DurableObjectNamespace,
    ROOM_HUB: {
      idFromName: (n: string) => n as unknown as DurableObjectId,
      get: (id: DurableObjectId) => makeRoomStub(String(id)),
    } as unknown as DurableObjectNamespace,
  };
}

describe('XL3D MCP Protocol & Headless Engine', () => {
  it('supports initialize, tools/list, resources/list, prompts/list', async () => {
    const scene = createInitialHeadlessScene();
    const undo: string[] = [];

    const init = await handleMcpJsonRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      async (n, a) => executeHeadlessTool(scene, undo, n, a, true, false),
      async (uri) => ({ contents: [{ uri, mimeType: 'text/markdown', text: XL3D_BPY_REFERENCE_MD }] })
    );
    expect((init?.result as any).serverInfo.name).toBe('xl3d-mcp');

    const list = await handleMcpJsonRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      async (n, a) => executeHeadlessTool(scene, undo, n, a, true, false),
      async (uri) => ({ contents: [{ uri, mimeType: 'text/markdown', text: '' }] })
    );
    expect((list?.result as any).tools.length).toBe(XL3D_MCP_TOOLS.length);
  });

  it('creates custom meshes from pydata, edits, modifies, exports OBJ, and supports undo', () => {
    const scene = createInitialHeadlessScene();
    const undo: string[] = [];
    const baseCount = scene.objects.length;

    const pydataRes = executeHeadlessTool(
      scene,
      undo,
      'create_mesh_from_pydata',
      {
        name: 'Pyramid',
        vertices: [
          [-1, -1, 0],
          [1, -1, 0],
          [1, 1, 0],
          [-1, 1, 0],
          [0, 0, 2],
        ],
        faces: [
          [0, 1, 2, 3],
          [0, 1, 4],
          [1, 2, 4],
          [2, 3, 4],
          [3, 0, 4],
        ],
        color: '#f38020',
      },
      false,
      false
    );
    expect(pydataRes.isError).toBeFalsy();
    expect(scene.objects.length).toBe(baseCount + 1);

    const modRes = executeHeadlessTool(scene, undo, 'add_modifier', { type: 'subsurf', params: { levels: 2 } }, false, false);
    expect(modRes.isError).toBeFalsy();

    const objExport = executeHeadlessTool(scene, undo, 'export_scene', { format: 'obj' }, false, false);
    expect(objExport.content[0].type).toBe('text');
    expect((objExport.content[0] as { type: 'text'; text: string }).text).toContain('o Pyramid');

    const undoRes = executeHeadlessTool(scene, undo, 'undo', {}, false, false);
    expect(undoRes.isError).toBeFalsy();
  });

  it('runs basic bpy commands without eval (Cloudflare Worker safe) and full scripts in Node stdio mode', () => {
    const scene = createInitialHeadlessScene();
    const undo: string[] = [];
    const initialCount = scene.objects.length;

    const workerSafe = executeHeadlessTool(
      scene,
      undo,
      'run_blender_script',
      {
        code: `
import bpy
bpy.ops.mesh.primitive_monkey_add(location=(2, 0, 1), name="CloudSuzanne")
`,
      },
      false,
      false
    );
    expect(workerSafe.isError).toBeFalsy();
    expect(scene.objects.length).toBe(initialCount + 1);

    const nodeFull = executeHeadlessTool(
      scene,
      undo,
      'run_blender_script',
      {
        language: 'python',
        code: `
import bpy
for i in range(2):
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(i * 2, 0, 0))
`,
      },
      true,
      false
    );
    expect(nodeFull.isError).toBeFalsy();
    expect(scene.objects.length).toBe(initialCount + 3);
  });

  it('supports persistent auth, Google OAuth state, workspaces library, and authenticated MCP results', async () => {
    const env = createInMemoryWorkerEnv();

    // 1. Public endpoints work; protected endpoints reject unauthenticated requests
    const healthResp = await worker.fetch(new Request('https://xl3d.example.workers.dev/health'), env);
    expect(healthResp.status).toBe(200);

    const unauthMcp = await worker.fetch(
      new Request('https://xl3d.example.workers.dev/mcp', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
      env
    );
    expect(unauthMcp.status).toBe(401);

    // 2. Register user & obtain persistent sessionToken + personal mcpToken
    const regResp = await worker.fetch(
      new Request('https://xl3d.example.workers.dev/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'alex@xl3d.dev', password: 'password123', name: 'Alex' }),
      }),
      env
    );
    expect(regResp.status).toBe(201);
    const regData = (await regResp.json()) as any;
    expect(regData.sessionToken).toMatch(/^xl3d_sess_/);
    expect(regData.mcpToken).toMatch(/^xl3d_mcp_/);
    expect(regData.workspaces.length).toBe(1);

    // 3. Create a second workspace in the user's library
    const createWsResp = await worker.fetch(
      new Request('https://xl3d.example.workers.dev/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${regData.sessionToken}`,
        },
        body: JSON.stringify({ name: 'Cyber Mech', description: 'AI Agent Workspace' }),
      }),
      env
    );
    expect(createWsResp.status).toBe(201);
    const createdWs = ((await createWsResp.json()) as any).workspace;
    expect(createdWs.name).toBe('Cyber Mech');

    // 4. AI Agent calls MCP using personal MCP token while XL3D app is closed!
    const mcpCallResp = await worker.fetch(
      new Request(`https://xl3d.example.workers.dev/mcp?token=${encodeURIComponent(regData.mcpToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: {
            name: 'create_object',
            arguments: { kind: 'monkey', name: 'AgentSuzanne', location: [0, 0, 2] },
          },
        }),
      }),
      env
    );
    expect(mcpCallResp.status).toBe(200);
    const mcpCallJson = (await mcpCallResp.json()) as any;
    expect(mcpCallJson.result.isError).toBe(false);

    // 5. User reopens app later with saved sessionToken -> sees agent's 3D scene & log immediately
    const stateResp = await worker.fetch(
      new Request(`https://xl3d.example.workers.dev/workspaces/${createdWs.id}/state`, {
        headers: { Authorization: `Bearer ${regData.sessionToken}` },
      }),
      env
    );
    expect(stateResp.status).toBe(200);
    const stateJson = (await stateResp.json()) as any;
    expect(stateJson.revision).toBeGreaterThan(1);
    expect(stateJson.scene.objects.some((o: any) => o.name === 'AgentSuzanne')).toBe(true);
    expect(stateJson.logs.some((l: any) => l.toolName === 'create_object')).toBe(true);

    // 6. Regenerating MCP token invalidates old token immediately
    const regenResp = await worker.fetch(
      new Request('https://xl3d.example.workers.dev/auth/regenerate-mcp-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${regData.sessionToken}` },
      }),
      env
    );
    const regenData = (await regenResp.json()) as any;
    expect(regenData.mcpToken).not.toBe(regData.mcpToken);

    const oldTokMcp = await worker.fetch(
      new Request(`https://xl3d.example.workers.dev/api/get_scene_info?token=${encodeURIComponent(regData.mcpToken)}`),
      env
    );
    expect(oldTokMcp.status).toBe(401);

    const newTokMcp = await worker.fetch(
      new Request(`https://xl3d.example.workers.dev/api/get_scene_info`, {
        headers: { Authorization: `Bearer ${regenData.mcpToken}` },
      }),
      env
    );
    expect(newTokMcp.status).toBe(200);

    // 7. Cross-user workspace isolation check
    const user2Resp = await worker.fetch(
      new Request('https://xl3d.example.workers.dev/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'other@xl3d.dev', password: 'password123', name: 'Other' }),
      }),
      env
    );
    const user2 = (await user2Resp.json()) as any;
    const hijackResp = await worker.fetch(
      new Request(`https://xl3d.example.workers.dev/workspaces/${createdWs.id}/state`, {
        headers: { Authorization: `Bearer ${user2.sessionToken}` },
      }),
      env
    );
    expect(hijackResp.status).toBe(404);
  });

  it('verifies Google OAuth HMAC state & OpenAPI BearerAuth spec', async () => {
    const state = await signOAuthState({ redirectUri: 'xl3d://auth/callback' }, 'sec123');
    const verified = await verifyOAuthState(state, 'sec123');
    expect(verified?.redirectUri).toBe('xl3d://auth/callback');
    expect(await verifyOAuthState(state, 'wrong_secret')).toBeNull();

    const spec = buildOpenApiSpec('https://xl3d-mcp.example.workers.dev', 'ws_demo');
    expect(spec.openapi).toBe('3.1.0');
    expect((spec.components as any).securitySchemes.BearerAuth.scheme).toBe('bearer');
    expect((spec.paths as Record<string, unknown>)['/api/list_workspaces']).toBeTruthy();
  });

  it('supports Google upsert linking and persistent SQLite AccountStore', async () => {
    const store = new AccountStore(createNodeSqlAdapter());
    const g1 = await store.upsertGoogleUser({
      email: 'guser@gmail.com',
      name: 'Google Artist',
      googleSub: 'sub_123',
    });
    expect(g1.user.provider).toBe('google');
    const resolved = await store.resolveAuthToken(g1.sessionToken);
    expect(resolved?.user.email).toBe('guser@gmail.com');
    expect(resolved?.workspaces.length).toBe(1);
  });
});
