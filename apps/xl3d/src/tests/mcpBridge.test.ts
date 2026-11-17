import { describe, expect, it } from 'vitest';
import { mcpBridge } from '../state/mcpBridge';
import { store } from '../state/xl3dStore';

describe('XL3D AI / MCP Bridge Client', () => {
  it('normalizes worker URLs for MCP HTTP and OpenAPI', () => {
    mcpBridge.updateConfig({
      serverUrl: 'https://xl3d-mcp.demo.workers.dev/',
      roomId: 'room1',
      token: 'tok123',
    });
    expect(mcpBridge.getMcpHttpUrl()).toBe('https://xl3d-mcp.demo.workers.dev/mcp?room=room1&token=tok123');
    expect(mcpBridge.getOpenApiUrl()).toBe('https://xl3d-mcp.demo.workers.dev/openapi.json?room=room1');
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
