import { describe, expect, it } from 'vitest';
import { handleMcpJsonRpc, XL3D_BPY_REFERENCE_MD, XL3D_MCP_TOOLS } from '../mcpProtocol';
import { buildOpenApiSpec } from '../openapi';
import { createInitialHeadlessScene, executeHeadlessTool } from '../sceneToolExecutor';
import worker from '../worker';

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

  it('builds valid OpenAPI 3.1 spec and serves /health & /openapi.json in Worker', async () => {
    const spec = buildOpenApiSpec('https://xl3d-mcp.example.workers.dev', 'demo');
    expect(spec.openapi).toBe('3.1.0');
    expect((spec.paths as Record<string, unknown>)['/api/create_mesh_from_pydata']).toBeTruthy();

    const env = { ROOM_HUB: {} as DurableObjectNamespace };
    const healthResp = await worker.fetch(new Request('https://xl3d-mcp.example.workers.dev/health'), env);
    expect(healthResp.status).toBe(200);
    const healthJson = (await healthResp.json()) as { ok: boolean };
    expect(healthJson.ok).toBe(true);

    const oaResp = await worker.fetch(new Request('https://xl3d-mcp.example.workers.dev/openapi.json'), env);
    expect(oaResp.status).toBe(200);
    const oaJson = (await oaResp.json()) as { openapi: string };
    expect(oaJson.openapi).toBe('3.1.0');
  });
});
