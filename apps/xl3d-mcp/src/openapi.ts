import { XL3D_MCP_TOOLS } from './mcpProtocol';

export function buildOpenApiSpec(baseUrl: string, roomId: string): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const tool of XL3D_MCP_TOOLS) {
    if (tool.name === 'get_scene_info') {
      paths['/api/get_scene_info'] = {
        get: {
          operationId: 'get_scene_info',
          summary: tool.description,
          parameters: [
            { name: 'room', in: 'query', required: false, schema: { type: 'string', default: roomId } },
          ],
          responses: {
            '200': {
              description: 'Scene summary JSON',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          },
        },
      };
    } else {
      paths[`/api/${tool.name}`] = {
        post: {
          operationId: tool.name,
          summary: tool.description,
          parameters: [
            { name: 'room', in: 'query', required: false, schema: { type: 'string', default: roomId } },
          ],
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
          },
        },
      };
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'XL3D AI Modeling API (Blender 5.x Mobile)',
      version: '1.0.0',
      description:
        'Control XL3D 3D scene via ChatGPT Actions, Grok, or HTTP agents. Supports bpy/bmesh scripts, procedural mesh creation, Edit Mode ops, modifiers, materials, and exports.',
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
