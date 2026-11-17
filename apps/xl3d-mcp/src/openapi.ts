import { XL3D_MCP_TOOLS } from './mcpProtocol';

export function buildOpenApiSpec(baseUrl: string, roomId = ''): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const tool of XL3D_MCP_TOOLS) {
    const roomParam = {
      name: 'room',
      in: 'query',
      required: false,
      description: 'Optional workspace ID (ws_...). Defaults to your active workspace.',
      schema: roomId ? { type: 'string', default: roomId } : { type: 'string' },
    };

    if (tool.name === 'get_scene_info' || tool.name === 'list_workspaces') {
      paths[`/api/${tool.name}`] = {
        get: {
          operationId: tool.name,
          summary: tool.description,
          parameters: [roomParam],
          responses: {
            '200': {
              description: 'Result JSON',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            '401': { description: 'Unauthorized — invalid or missing Bearer token' },
          },
        },
      };
    } else {
      paths[`/api/${tool.name}`] = {
        post: {
          operationId: tool.name,
          summary: tool.description,
          parameters: [roomParam],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: tool.inputSchema,
              },
            },
          },
          responses: {
            '200': {
              description: 'Tool execution result',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            '401': { description: 'Unauthorized — invalid or missing Bearer token' },
          },
        },
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'XL3D AI Modeling API (Authenticated Cloud Workspaces)',
      version: '2.0.0',
      description:
        'Authenticated API to manage XL3D 3D workspaces and run bpy/bmesh modeling tools from ChatGPT Actions, Grok, Claude, or HTTP agents.',
    },
    servers: [{ url: baseUrl.replace(/\/$/, '') }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: [{ BearerAuth: [] }],
    paths,
  };
}
