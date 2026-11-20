import {
  CapabilityRegistry,
  EndpointAllowlist,
  EnvCredentialProvider,
  GraphClient,
  MOCK_ACCESS_TOKEN,
  MOCK_APP_ID,
  StaticCredentialProvider,
  ToolRegistry,
  createDiagnosticsAdapter,
  createLogger,
  createMockGraph,
  type ConnectionContext,
  type CredentialProvider,
  type FetchLike,
  type Logger,
  type MetaAdapter,
  type MockGraph,
  type ToolDeps,
  type ToolResult,
} from '@crishub-meta-mcp/core';
import { createFacebookAdapter } from '@crishub-meta-mcp/facebook';
import { createMarketingAdapter } from '@crishub-meta-mcp/marketing';
import type { AdapterId, ServerConfig } from './config.js';

const ADAPTER_FACTORIES: Record<AdapterId, () => MetaAdapter> = {
  facebook: createFacebookAdapter,
  marketing: createMarketingAdapter,
};

export interface RuntimeOptions {
  env?: NodeJS.ProcessEnv;
  /** Override the HTTP transport (tests). In mock mode the mock transport is used. */
  fetch?: FetchLike;
  credentials?: CredentialProvider;
  logger?: Logger;
  /** Extra adapters supplied by a host application. */
  extraAdapters?: MetaAdapter[];
}

export interface Runtime {
  config: ServerConfig;
  tools: ToolRegistry;
  capabilities: CapabilityRegistry;
  deps: ToolDeps;
  mock?: MockGraph;
  adapters: MetaAdapter[];
  invoke(name: string, input: unknown): Promise<ToolResult>;
}

export function createRuntime(config: ServerConfig, options: RuntimeOptions = {}): Runtime {
  const logger = options.logger ?? createLogger(config.logLevel);
  let fetchImpl = options.fetch;
  let mock: MockGraph | undefined;
  let credentials = options.credentials;

  if (config.mode === 'mock') {
    if (!fetchImpl) {
      mock = createMockGraph(config.mockScenario);
      fetchImpl = mock.fetch;
    }
    credentials ??= new StaticCredentialProvider({
      accessToken: MOCK_ACCESS_TOKEN,
      tokenType: 'user',
      appId: MOCK_APP_ID,
    });
  } else {
    credentials ??= new EnvCredentialProvider(options.env ?? process.env);
  }

  const allowlist = new EndpointAllowlist();
  const capabilities = new CapabilityRegistry();
  const tools = new ToolRegistry();
  const adapters: MetaAdapter[] = [
    createDiagnosticsAdapter(),
    ...config.adapters.map((id) => ADAPTER_FACTORIES[id]()),
    ...(options.extraAdapters ?? []),
  ];

  for (const adapter of adapters) {
    if (!adapter.apiVersions.includes(config.graphVersion)) {
      logger.warn('adapter does not support configured Graph version; skipping', {
        adapter: adapter.id,
      });
      continue;
    }
    for (const rule of adapter.endpoints) allowlist.register(rule);
    for (const cap of adapter.capabilities) capabilities.register(cap);
    for (const tool of adapter.tools) {
      if (tool.experimental && !config.enableUnverifiedTools) {
        logger.debug('experimental tool disabled', { tool: tool.name });
        continue;
      }
      tools.register(tool);
    }
  }

  const context: ConnectionContext = {
    connectionId: config.mode === 'mock' ? 'mock' : 'local',
    mode: config.mode,
    graphVersion: config.graphVersion,
    assetPolicy: config.assetPolicy,
  };
  const graph = new GraphClient({
    version: config.graphVersion,
    credentials,
    allowlist,
    logger,
    timeoutMs: config.timeoutMs,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  const deps: ToolDeps = { graph, context, credentials, capabilities, logger };

  return {
    config,
    tools,
    capabilities,
    deps,
    adapters,
    ...(mock ? { mock } : {}),
    invoke: (name, input) => tools.invoke(name, input, deps),
  };
}
