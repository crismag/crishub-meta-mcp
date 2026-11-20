import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Runtime } from './runtime.js';

export const SERVER_NAME = 'crishub-meta-mcp';
export const SERVER_VERSION = '0.1.0-dev';

/** Register every enabled tool from the runtime on a new MCP server. */
export function createMcpServer(runtime: Runtime): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Read-only Meta (Facebook/Instagram/Ads) diagnostics. Not affiliated with Meta. Tools never return access tokens; ' +
        'never ask the user to paste tokens into chat. Call meta_connection_status first, and meta_capabilities_list to see which ' +
        'endpoints are documentation-verified.',
    },
  );

  for (const tool of runtime.tools.list()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        // Strict: unknown arguments are rejected (additionalProperties: false), not silently stripped.
        inputSchema: tool.inputSchema.strict(),
        outputSchema: tool.outputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.riskLevel === 'read',
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: runtime.config.mode === 'live',
        },
        _meta: {
          'crishub/riskLevel': tool.riskLevel,
          'crishub/dataClassification': tool.dataClassification,
          'crishub/capabilities': [...tool.capabilityIds],
          'crishub/experimental': tool.experimental === true,
        },
      },
      async (args: unknown): Promise<CallToolResult> => {
        const result = await runtime.invoke(tool.name, args);
        if (result.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify(result.data) }],
            structuredContent: result.data as Record<string, unknown>,
          };
        }
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: result.error }) }],
        };
      },
    );
  }
  return server;
}
