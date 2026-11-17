import type { ToolResult } from './sceneToolExecutor';

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const XL3D_MCP_TOOLS: McpToolDef[] = [
  {
    name: 'list_workspaces',
    description:
      'List all 3D workspaces in the authenticated user library (id, name, objectCount, revision, lastAgentTool, updatedAt, activeWorkspaceId).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'select_workspace',
    description:
      'Switch the authenticated user active workspace by workspace id or name. Subsequent calls without explicit ?room= target this workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Workspace ID (ws_...) or exact name' },
      },
      required: ['workspace'],
    },
  },
  {
    name: 'create_workspace',
    description:
      'Create a new empty/starter 3D workspace in the authenticated user library and set it active.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workspace name (e.g. Sci-Fi Helmet)' },
        description: { type: 'string', description: 'Optional description' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_agent_history',
    description:
      'Get recent AI agent tool execution logs for the current workspace so you or the user can review past actions and revisions.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Max log entries (default 20)' },
      },
    },
  },
  {
    name: 'get_scene_info',
    description:
      'Get current XL3D scene summary: all 3D objects, active object, vertex/face counts, modifiers, materials, and whether a live XL3D mobile/browser viewport is connected.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'run_blender_script',
    description:
      'Execute Blender-compatible Python (bpy, bmesh, mathutils, math) or JavaScript code in XL3D to procedurally create or edit 3D models. Supports bpy.ops.mesh.*, bpy.data.meshes.from_pydata, bmesh.new()/from_mesh/to_mesh, modifiers, and transforms.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python (bpy/bmesh) or JavaScript code to run' },
        language: { type: 'string', enum: ['python', 'javascript'], description: 'Script language (default: python)' },
        saveAs: { type: 'string', description: 'Optional script filename to store in XL3D Scripting tab (e.g. tower.py)' },
      },
      required: ['code'],
    },
  },
  {
    name: 'create_object',
    description:
      'Create a 3D primitive or helper object in XL3D (cube, sphere, icosphere, cylinder, cone, torus, plane, monkey, light, camera, empty, curve, armature).',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['cube', 'sphere', 'icosphere', 'cylinder', 'cone', 'torus', 'plane', 'monkey', 'light', 'camera', 'empty', 'curve', 'armature'],
        },
        name: { type: 'string', description: 'Object name' },
        location: { type: 'array', items: { type: 'number' }, description: '[x, y, z] world position' },
        rotation: { type: 'array', items: { type: 'number' }, description: '[x, y, z] rotation in degrees' },
        scale: { type: 'array', items: { type: 'number' }, description: '[x, y, z] scale' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'create_mesh_from_pydata',
    description:
      'Create any custom procedural 3D mesh directly from vertex coordinates and face vertex-index lists (like Blender from_pydata). Works in both cloud headless mode and live device mode.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Mesh object name' },
        vertices: {
          type: 'array',
          items: { type: 'array', items: { type: 'number' } },
          description: 'List of [x, y, z] vertex coordinates',
        },
        faces: {
          type: 'array',
          items: { type: 'array', items: { type: 'integer' } },
          description: 'List of face vertex index tuples e.g. [[0,1,2,3], ...]',
        },
        location: { type: 'array', items: { type: 'number' }, description: 'Optional [x, y, z] location' },
        color: { type: 'string', description: 'Optional hex color e.g. #f38020' },
        smooth: { type: 'boolean', description: 'Smooth shading flag' },
      },
      required: ['name', 'vertices', 'faces'],
    },
  },
  {
    name: 'transform_object',
    description: 'Move, rotate (degrees), scale, rename, or toggle visibility of an object by name/id (defaults to active object).',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Object name or id (optional, defaults to active object)' },
        name: { type: 'string' },
        location: { type: 'array', items: { type: 'number' } },
        rotation: { type: 'array', items: { type: 'number' } },
        scale: { type: 'array', items: { type: 'number' } },
        visible: { type: 'boolean' },
      },
    },
  },
  {
    name: 'apply_edit_op',
    description: 'Apply an Edit Mode modeling operation on a mesh object (subdivide, extrude, inset, bevel, poke, flip_normals, triangulate, tris_to_quads, merge, looptools_circle, uv_unwrap, shade_smooth).',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Object name or id (defaults to active object)' },
        op: {
          type: 'string',
          enum: ['subdivide', 'extrude', 'inset', 'bevel', 'poke', 'flip_normals', 'triangulate', 'tris_to_quads', 'merge', 'bridge_fill', 'dissolve', 'shrink_fatten', 'spin', 'duplicate_faces', 'looptools_circle', 'uv_unwrap', 'shade_smooth'],
        },
        amount: { type: 'number', description: 'Distance/thickness/offset for extrude, inset, bevel' },
      },
      required: ['op'],
    },
  },
  {
    name: 'add_modifier',
    description: 'Add a non-destructive Blender 5.x modifier (subsurf, mirror, solidify, bevel, array, boolean, decimate, wireframe, displace, cast) to an object.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Object name or id (defaults to active object)' },
        type: {
          type: 'string',
          enum: ['subsurf', 'mirror', 'solidify', 'bevel', 'array', 'boolean', 'decimate', 'wireframe', 'displace', 'cast', 'screw', 'weld'],
        },
        params: { type: 'object', description: 'Optional modifier parameters e.g. { levels: 2 }' },
      },
      required: ['type'],
    },
  },
  {
    name: 'object_action',
    description: 'Run Blender Object-level action: duplicate, apply_transforms (Ctrl+A), origin_to_geometry, join (Ctrl+J), convert_to_mesh (Curve/Text->Mesh), or apply_modifiers.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Object name or id (defaults to active object)' },
        action: {
          type: 'string',
          enum: ['duplicate', 'apply_transforms', 'origin_to_geometry', 'join', 'convert_to_mesh', 'apply_modifiers'],
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'set_material',
    description: 'Update Principled BSDF material color, metallic, roughness, glass transmission/dispersion, emission, or procedural texture.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Object name or id (defaults to active object)' },
        baseColor: { type: 'string', description: 'Hex color e.g. #e07a38' },
        metallic: { type: 'number' },
        roughness: { type: 'number' },
        transmission: { type: 'number' },
        dispersion: { type: 'number' },
        emissionStrength: { type: 'number' },
        procTexture: { type: 'string', enum: ['none', 'noise', 'voronoi', 'wave', 'musgrave', 'checker', 'brick', 'magic'] },
      },
    },
  },
  {
    name: 'get_viewport_screenshot',
    description: 'Capture a live PNG screenshot of the XL3D 3D viewport from the connected Android/browser device to visually inspect your 3D model.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'undo',
    description: 'Undo the last modeling or script action in XL3D.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'export_scene',
    description: 'Export the current 3D scene as .obj, .stl, .ply, or .xl3d project JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['obj', 'stl', 'ply', 'xl3d'], description: 'Export format' },
      },
      required: ['format'],
    },
  },
];

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export type ToolCallHandler = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
export type ResourceReadHandler = (uri: string) => Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;

export async function handleMcpJsonRpc(
  req: JsonRpcRequest,
  onToolCall: ToolCallHandler,
  onReadResource: ResourceReadHandler
): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;

  // Notifications without id do not expect a response body
  if (req.method.startsWith('notifications/') && req.id === undefined) {
    return null;
  }

  try {
    switch (req.method) {
      case 'initialize': {
        const clientProto = String(req.params?.protocolVersion ?? '2025-03-26');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: clientProto,
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false },
            },
            serverInfo: {
              name: 'xl3d-mcp',
              version: '1.0.0',
            },
            instructions:
              'You are connected to XL3D (a mobile Blender 5.x 3D modeling suite). Use get_scene_info first, then create or edit models via run_blender_script (bpy/bmesh), create_mesh_from_pydata, or create_object, and call get_viewport_screenshot when a live device is connected to inspect your work visually.',
          },
        };
      }

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      case 'tools/list':
        return { jsonrpc: '2.0', id, result: { tools: XL3D_MCP_TOOLS } };

      case 'tools/call': {
        const name = String(req.params?.name ?? '');
        const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
        if (!name) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing tool name' } };
        }
        const toolRes = await onToolCall(name, args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: toolRes.content,
            isError: Boolean(toolRes.isError),
          },
        };
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resources: [
              {
                uri: 'xl3d://scene/summary',
                name: 'XL3D Scene Summary',
                description: 'Objects, transforms, vertices/faces and materials in the active scene',
                mimeType: 'application/json',
              },
              {
                uri: 'xl3d://api/bpy-reference',
                name: 'XL3D bpy & bmesh Reference',
                description: 'Supported Blender Python APIs in XL3D Scripting engine',
                mimeType: 'text/markdown',
              },
            ],
          },
        };

      case 'resources/read': {
        const uri = String(req.params?.uri ?? '');
        const res = await onReadResource(uri);
        return { jsonrpc: '2.0', id, result: res };
      }

      case 'prompts/list':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            prompts: [
              {
                name: 'model_with_xl3d',
                description: 'Guide the AI agent to build and visually verify a 3D model in XL3D',
                arguments: [{ name: 'goal', description: 'What 3D model to create', required: true }],
              },
            ],
          },
        };

      case 'prompts/get': {
        const goal = String((req.params?.arguments as Record<string, unknown> | undefined)?.goal ?? 'a procedural 3D sculpture');
        return {
          jsonrpc: '2.0',
          id,
          result: {
            description: 'XL3D 3D Modeling Workflow',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Build "${goal}" inside XL3D. First call get_scene_info. Prefer run_blender_script (bpy/bmesh) when a live XL3D device is connected, or create_mesh_from_pydata / create_object in cloud-only mode. Then inspect with get_viewport_screenshot if connected and refine materials/modifiers.`,
                },
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        };
    }
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export const XL3D_BPY_REFERENCE_MD = `# XL3D Scripting API Reference
- \`bpy.ops.mesh.primitive_cube_add(size=1, location=(x,y,z), rotation=(rx,ry,rz))\`
- \`primitive_uv_sphere_add\`, \`primitive_ico_sphere_add\`, \`primitive_cylinder_add\`, \`primitive_cone_add\`, \`primitive_torus_add\`, \`primitive_plane_add\`, \`primitive_monkey_add\`
- \`bpy.data.meshes.new(name)\` + \`mesh.from_pydata(verts, edges, faces)\`
- \`bpy.data.objects.new(name, mesh)\` + \`bpy.context.collection.objects.link(obj)\`
- \`bmesh.new()\`, \`bm.from_mesh(mesh)\`, \`bm.verts.new((x,y,z))\`, \`bm.faces.new((v1,v2,v3,v4))\`, \`bmesh.ops.extrude_face_region\`, \`bmesh.ops.translate\`, \`bm.to_mesh(mesh)\`
- Modifiers: \`obj.modifiers.new("Name", "SUBSURF" | "MIRROR" | "SOLIDIFY" | "BEVEL" | "ARRAY" | "BOOLEAN" | "DECIMATE" | "WIREFRAME")\`
`;
