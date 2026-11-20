import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MOCK_ACCESS_TOKEN,
  MOCK_AD_ACCOUNTS,
  MOCK_PAGES,
  MOCK_SCENARIOS,
  StaticCredentialProvider,
  type MockScenario,
} from '@crishub-meta-mcp/core';
import { createMcpServer, createRuntime, loadConfig } from '@crishub-meta-mcp/server';

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

async function connect(
  env: NodeJS.ProcessEnv = {},
  runtimeOpts: Parameters<typeof createRuntime>[1] = {},
) {
  const runtime = createRuntime(loadConfig({ META_LOG_LEVEL: 'silent', ...env }), runtimeOpts);
  const server = createMcpServer(runtime);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  clients.push(client);
  return { client, runtime };
}

/** Valid sample arguments for every tool. */
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  meta_connection_status: {},
  meta_token_permissions: {},
  meta_capabilities_list: {},
  meta_businesses_list: {},
  meta_pages_list: {},
  meta_pages_get: { page_id: MOCK_PAGES[0]!.id },
  meta_ad_accounts_list: {},
  meta_ad_accounts_get: { ad_account_id: MOCK_AD_ACCOUNTS[0]!.id },
  meta_campaigns_list: { ad_account_id: MOCK_AD_ACCOUNTS[0]!.id },
  meta_insights_query: {
    ad_account_id: MOCK_AD_ACCOUNTS[0]!.id,
    level: 'campaign',
    date_preset: 'last_7d',
  },
  meta_lead_forms_list: { page_id: MOCK_PAGES[0]!.id },
};

describe('MCP server (in-memory transport, mock mode)', () => {
  it('advertises only read-only, schema-described tools', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'meta_ad_accounts_get',
      'meta_businesses_list',
      'meta_campaigns_list',
      'meta_capabilities_list',
      'meta_connection_status',
      'meta_insights_query',
      'meta_pages_get',
      'meta_pages_list',
      'meta_token_permissions',
    ]);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema?.type).toBe('object');
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it('registers experimental tools only when enabled', async () => {
    const { client } = await connect({ META_ENABLE_UNVERIFIED_TOOLS: 'true' });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['meta_ad_accounts_list', 'meta_lead_forms_list']),
    );
  });

  it('honours META_ADAPTERS', async () => {
    const { client } = await connect({ META_ADAPTERS: 'facebook' });
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain('meta_insights_query');
    expect(names).toContain('meta_pages_list');
  });

  it('every tool returns schema-valid structured content in mock mode', async () => {
    const { client } = await connect({ META_ENABLE_UNVERIFIED_TOOLS: 'true' });
    const { tools } = await client.listTools();
    for (const t of tools) {
      const args = SAMPLE_ARGS[t.name];
      expect(args, `sample args for ${t.name}`).toBeDefined();
      const res = await client.callTool({ name: t.name, arguments: args });
      expect(res.isError, `${t.name}: ${JSON.stringify(res.content)}`).toBeFalsy();
      expect(res.structuredContent).toBeTypeOf('object');
    }
  });

  it('returns structured errors with isError for invalid input', async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: 'meta_pages_get',
      arguments: { page_id: 'me/accounts?fields=access_token' },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as { text: string }[])[0]!.text;
    // The SDK validates against the advertised schema first; values are not echoed.
    expect(text).toContain('Input validation error');
    expect(text).not.toContain('access_token');

    const extra = await client.callTool({
      name: 'meta_pages_list',
      arguments: { graph_path: '/me/feed' },
    });
    expect(extra.isError).toBe(true);
  });

  it('reports NOT_CONFIGURED in live mode without credentials and makes no request', async () => {
    let calls = 0;
    const { client } = await connect(
      { META_MODE: 'live' },
      {
        env: {},
        fetch: async () => {
          calls++;
          throw new Error('network must not be used');
        },
      },
    );
    const status = await client.callTool({ name: 'meta_connection_status', arguments: {} });
    expect(status.structuredContent).toMatchObject({ mode: 'live', configured: false });
    const res = await client.callTool({ name: 'meta_pages_list', arguments: {} });
    expect(JSON.parse((res.content as { text: string }[])[0]!.text)).toMatchObject({
      error: { code: 'NOT_CONFIGURED' },
    });
    expect(calls).toBe(0);
  });
});

const EXPECTED: Record<MockScenario, string | null> = {
  default: null,
  expired_token: 'TOKEN_EXPIRED',
  rate_limited: 'RATE_LIMITED',
  permission_denied: 'PERMISSION_DENIED',
  review_required: 'REVIEW_REQUIRED',
  upstream_flaky: null, // recovered by retry
  malformed_response: 'UPSTREAM_UNAVAILABLE',
};

describe.each(MOCK_SCENARIOS)('security sweep: scenario %s', (scenario) => {
  it('never leaks credentials and maps errors consistently', async () => {
    const secret = 'EAABSWEEPSECRET0123456789abcdef';
    const { client, runtime } = await connect(
      { META_MOCK_SCENARIO: scenario, META_ENABLE_UNVERIFIED_TOOLS: 'true' },
      scenario === 'default' ? {} : {},
    );
    const networkTools = runtime.tools.list().filter((t) => t.capabilityIds.length > 0);
    for (const t of networkTools) {
      const res = await client.callTool({ name: t.name, arguments: SAMPLE_ARGS[t.name] });
      const text = JSON.stringify(res);
      expect(text).not.toContain(MOCK_ACCESS_TOKEN);
      expect(text).not.toMatch(/EAAMOCK|DONOTUSE|access_token|appsecret_proof/);
      expect(text).not.toContain(secret);
      const expected = EXPECTED[scenario];
      if (expected === null) {
        expect(res.isError, `${t.name}: ${text}`).toBeFalsy();
      } else {
        expect(res.isError, t.name).toBe(true);
        expect(JSON.parse((res.content as { text: string }[])[0]!.text).error.code).toBe(expected);
      }
    }
  });
});

describe('host-supplied credentials', () => {
  it('never echo custom provider tokens', async () => {
    const token = 'EAABHOSTPROVIDED0123456789abcdef';
    const { client } = await connect(
      { META_MODE: 'live' },
      {
        credentials: new StaticCredentialProvider({
          accessToken: token,
          appSecret: 'host-app-secret-xyz',
        }),
        fetch: async () => ({
          status: 400,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({
              error: { code: 100, message: `bad token ${token} host-app-secret-xyz` },
            }),
        }),
      },
    );
    const res = await client.callTool({ name: 'meta_pages_list', arguments: {} });
    const text = JSON.stringify(res);
    expect(text).not.toContain(token);
    expect(text).not.toContain('host-app-secret-xyz');
  });
});
