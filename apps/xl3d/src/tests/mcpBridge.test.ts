import { describe, expect, it, vi } from 'vitest';
import { createDefaultXL3DScene } from '../engine/primitives';
import { DEFAULT_CLOUD_SERVER_URL, mcpBridge } from '../state/mcpBridge';
import { store } from '../state/xl3dStore';

describe('XL3D AI / MCP Bridge Client & Persistent Cloud Auth', () => {
  it('pre-configures the default Cloudflare Worker URL out of the box', () => {
    expect(DEFAULT_CLOUD_SERVER_URL).toBe('https://xlone-room.aleksander200620062006.workers.dev');
    expect(mcpBridge.config.serverUrl).toBe(DEFAULT_CLOUD_SERVER_URL);
    expect(mcpBridge.getOpenApiUrl()).toContain('https://xlone-room.aleksander200620062006.workers.dev/openapi.json?room=');
  });

  it('normalizes worker URLs for MCP HTTP and OpenAPI', () => {
    mcpBridge.updateConfig({
      serverUrl: 'https://xl3d-mcp.demo.workers.dev/',
      activeWorkspaceId: '',
      mcpToken: '',
      roomId: 'room1',
      token: 'tok123',
    });
    expect(mcpBridge.getMcpHttpUrl()).toBe('https://xl3d-mcp.demo.workers.dev/mcp?room=room1&token=tok123');
    expect(mcpBridge.getOpenApiUrl()).toBe('https://xl3d-mcp.demo.workers.dev/openapi.json?room=room1');
  });

  it('uses activeWorkspaceId and personal mcpToken when authenticated', () => {
    mcpBridge.updateConfig({
      serverUrl: 'https://xlone-room.demo.workers.dev',
      sessionToken: 'xl3d_sess_abc',
      mcpToken: 'xl3d_mcp_secret',
      activeWorkspaceId: 'ws_cyber',
      user: {
        id: 'usr_1',
        email: 'art@xl3d.dev',
        name: 'Art',
        avatarUrl: null,
        provider: 'google',
        activeWorkspaceId: 'ws_cyber',
        mcpTokenPreview: 'xl3d_mcp_sec...cret',
        createdAt: 1,
      },
    });
    expect(mcpBridge.isAuthenticated()).toBe(true);
    expect(mcpBridge.getMcpHttpUrl()).toBe(
      'https://xlone-room.demo.workers.dev/mcp?room=ws_cyber&token=xl3d_mcp_secret'
    );
  });

  it('pulls newer AI agent scene results on reopen without overwriting cloud state', async () => {
    store.resetScene();
    const agentScene = createDefaultXL3DScene();
    agentScene.objects[0].name = 'AgentCreatedTower';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          revision: 7,
          scene: agentScene,
          logs: [
            {
              id: 'log_1',
              source: 'mcp',
              toolName: 'create_mesh_from_pydata',
              summary: 'Built AgentCreatedTower',
              status: 'ok',
              revision: 7,
              createdAt: Date.now(),
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    try {
      mcpBridge.updateConfig({
        serverUrl: 'https://xlone-room.demo.workers.dev',
        sessionToken: 'xl3d_sess_keep',
        activeWorkspaceId: 'ws_cyber',
        syncedRevisions: { ws_cyber: 2 },
        user: {
          id: 'usr_1',
          email: 'art@xl3d.dev',
          name: 'Art',
          avatarUrl: null,
          provider: 'email',
          activeWorkspaceId: 'ws_cyber',
          mcpTokenPreview: 'xl3d_mcp_...',
          createdAt: 1,
        },
      });
      await mcpBridge.pullLatestWorkspaceState(true);
      expect(mcpBridge.cloudRevision).toBe(7);
      expect(mcpBridge.hasUnreadAgentUpdates).toBe(true);
      expect(store.scene.objects.some((o) => o.name === 'AgentCreatedTower')).toBe(true);
      expect(mcpBridge.agentLogs.length).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('executes get_scene_info, create_mesh_from_pydata and run_blender_script via RPC', () => {
    store.resetScene();
    const before = store.scene.objects.length;

    const r1 = mcpBridge.executeLocalRpc('create_mesh_from_pydata', {
      name: 'AiPrism',
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0.5, 1, 0],
        [0.5, 0.3, 1.5],
      ],
      faces: [
        [0, 1, 2],
        [0, 1, 3],
        [1, 2, 3],
        [2, 0, 3],
      ],
    });
    expect(r1.isError).toBeFalsy();
    expect(store.scene.objects.length).toBe(before + 1);

    const r2 = mcpBridge.executeLocalRpc('run_blender_script', {
      language: 'python',
      saveAs: 'ai_ring.py',
      code: `
import bpy
bpy.ops.mesh.primitive_torus_add(location=(0, 2, 0), name="AiTorus")
`,
    });
    expect(r2.isError).toBeFalsy();
    expect(store.scene.objects.length).toBe(before + 2);
    expect(store.scene.scripts?.some((s) => s.name === 'ai_ring.py')).toBe(true);

    const info = mcpBridge.executeLocalRpc('get_scene_info', {});
    expect((info.structured as any).objectCount).toBe(before + 2);
  });
});
