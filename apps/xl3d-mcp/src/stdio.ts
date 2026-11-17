import * as readline from 'node:readline';
import { handleMcpJsonRpc, XL3D_BPY_REFERENCE_MD, type JsonRpcRequest } from './mcpProtocol';
import { createInitialHeadlessScene, executeHeadlessTool, type ToolResult } from './sceneToolExecutor';

const remoteUrl = (process.env.XL3D_MCP_URL || '').trim().replace(/\/$/, '');
const room = (process.env.XL3D_WORKSPACE || process.env.XL3D_ROOM || '').trim();
const token = (process.env.XL3D_API_TOKEN || process.env.XL3D_TOKEN || '').trim();

const localScene = createInitialHeadlessScene();
const localUndo: string[] = [];

async function callRemoteMcp(req: JsonRpcRequest): Promise<unknown> {
  const sep = remoteUrl.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  if (room) params.set('room', room);
  if (token) params.set('token', token);
  const qs = params.toString();
  const target = `${remoteUrl}/mcp${qs ? sep + qs : ''}`;
  const resp = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });
  if (resp.status === 202) return null;
  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText);
    return {
      jsonrpc: '2.0',
      id: req.id ?? null,
      error: {
        code: resp.status === 401 || resp.status === 403 ? -32001 : -32603,
        message: `HTTP ${resp.status}: ${errText}`,
      },
    };
  }
  return resp.json();
}

async function onLocalToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return executeHeadlessTool(localScene, localUndo, name, args, true, false);
}

async function onLocalReadResource(uri: string) {
  if (uri === 'xl3d://api/bpy-reference') {
    return { contents: [{ uri, mimeType: 'text/markdown', text: XL3D_BPY_REFERENCE_MD }] };
  }
  const info = executeHeadlessTool(localScene, localUndo, 'get_scene_info', {}, true, false);
  return {
    contents: [
      {
        uri: 'xl3d://scene/summary',
        mimeType: 'application/json',
        text: info.content[0]?.type === 'text' ? info.content[0].text : '{}',
      },
    ],
  };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(trimmed) as JsonRpcRequest;
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }

  try {
    const res = remoteUrl
      ? await callRemoteMcp(req)
      : await handleMcpJsonRpc(req, onLocalToolCall, onLocalReadResource);
    if (res !== null && res !== undefined) {
      process.stdout.write(JSON.stringify(res) + '\n');
    }
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: req.id ?? null,
        error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
      }) + '\n'
    );
  }
});
