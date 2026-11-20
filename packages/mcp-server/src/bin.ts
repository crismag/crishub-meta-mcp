#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger, toSafeError } from '@crishub-meta-mcp/core';
import { loadConfig } from './config.js';
import { createRuntime } from './runtime.js';
import { SERVER_VERSION, createMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const runtime = createRuntime(config, { logger });
  const server = createMcpServer(runtime);
  await server.connect(new StdioServerTransport());
  logger.info('crishub-meta-mcp started', {
    version: SERVER_VERSION,
    mode: config.mode,
    graphVersion: config.graphVersion,
    tools: runtime.tools.list().length,
    configured: runtime.deps.credentials.isConfigured(),
  });
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  process.stderr.write(
    JSON.stringify({ level: 'error', msg: 'startup failed', error: toSafeError(err) }) + '\n',
  );
  process.exit(1);
});
