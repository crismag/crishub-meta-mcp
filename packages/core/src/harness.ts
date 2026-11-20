import type { MetaAdapter } from './adapter.js';
import { CapabilityRegistry } from './capabilities.js';
import type { AssetPolicy, ConnectionContext } from './context.js';
import { StaticCredentialProvider, type CredentialProvider } from './credentials.js';
import { createDiagnosticsAdapter } from './diagnostics.js';
import { EndpointAllowlist } from './graph/endpoints.js';
import { GraphClient, type FetchLike } from './graph/client.js';
import { DEFAULT_GRAPH_VERSION, type GraphVersion } from './graph/version.js';
import { silentLogger } from './logger.js';
import { MOCK_ACCESS_TOKEN, MOCK_APP_ID } from './mock/fixtures.js';
import { createMockGraph, type MockGraph, type MockScenario } from './mock/transport.js';
import { ToolRegistry, type ToolDeps, type ToolResult } from './tools.js';

export interface HarnessOptions {
  scenario?: MockScenario;
  assetPolicy?: AssetPolicy;
  enableExperimental?: boolean;
  graphVersion?: GraphVersion;
  credentials?: CredentialProvider;
  fetch?: FetchLike;
  includeDiagnostics?: boolean;
}

export interface Harness {
  tools: ToolRegistry;
  deps: ToolDeps;
  mock: MockGraph;
  invoke(name: string, input?: unknown): Promise<ToolResult>;
}

/**
 * Offline harness wiring adapters to the mock Graph transport. Intended for
 * adapter tests and for host applications that want a deterministic demo.
 */
export function createMockHarness(adapters: MetaAdapter[], options: HarnessOptions = {}): Harness {
  const mock = createMockGraph(options.scenario ?? 'default');
  const allowlist = new EndpointAllowlist();
  const capabilities = new CapabilityRegistry();
  const tools = new ToolRegistry();
  const all =
    options.includeDiagnostics === false ? adapters : [createDiagnosticsAdapter(), ...adapters];
  for (const a of all) {
    a.endpoints.forEach((e) => allowlist.register(e));
    a.capabilities.forEach((c) => capabilities.register(c));
    a.tools
      .filter((t) => !t.experimental || options.enableExperimental)
      .forEach((t) => tools.register(t));
  }
  const credentials =
    options.credentials ??
    new StaticCredentialProvider({
      accessToken: MOCK_ACCESS_TOKEN,
      tokenType: 'user',
      appId: MOCK_APP_ID,
    });
  const graphVersion = options.graphVersion ?? DEFAULT_GRAPH_VERSION;
  const context: ConnectionContext = {
    connectionId: 'mock',
    mode: 'mock',
    graphVersion,
    assetPolicy: options.assetPolicy ?? {},
  };
  const graph = new GraphClient({
    version: graphVersion,
    credentials,
    allowlist,
    fetch: options.fetch ?? mock.fetch,
    sleep: async () => {},
  });
  const deps: ToolDeps = { graph, context, credentials, capabilities, logger: silentLogger };
  return { tools, deps, mock, invoke: (name, input = {}) => tools.invoke(name, input, deps) };
}
