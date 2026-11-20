import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  ErrorCode,
  ToolRegistry,
  createMockHarness,
  defineTool,
  type MetaAdapter,
} from '@crishub-meta-mcp/core';

const echo = defineTool({
  name: 'meta_test_echo',
  title: 'Echo',
  description: 'test',
  inputSchema: z.object({ n: z.number().int().max(5) }),
  outputSchema: z.object({ n: z.number(), note: z.string().optional() }),
  riskLevel: 'read',
  dataClassification: 'public',
  capabilityIds: [],
  async handler(input) {
    if (input.n === 3) return { n: 'three' } as unknown as { n: number };
    if (input.n === 4) throw new Error('kaboom with Bearer abcdefghijklmnop');
    if (input.n === 5) return { n: 5, note: 'token EAAB1234567890abcdefghijkl' };
    return { n: input.n };
  },
});
const adapter: MetaAdapter = {
  id: 't',
  version: '0',
  apiVersions: ['v25.0', 'v26.0'],
  capabilities: [],
  endpoints: [],
  tools: [echo],
};

describe('ToolRegistry', () => {
  it('refuses write tools in phase 1 and malformed names', () => {
    const r = new ToolRegistry();
    expect(() => r.register({ ...echo, riskLevel: 'write' })).toThrow(/risk level/);
    expect(() => r.register({ ...echo, name: 'meta.pages.list' })).toThrow(/Invalid tool name/);
    expect(() => r.register({ ...echo, name: 'pages_list' })).toThrow(/Invalid tool name/);
  });

  it('validates input strictly (unknown keys rejected)', async () => {
    const h = createMockHarness([adapter]);
    expect(await h.invoke('meta_test_echo', { n: 1 })).toEqual({ ok: true, data: { n: 1 } });
    const extra = await h.invoke('meta_test_echo', { n: 1, access_token: 'x' });
    expect(extra).toMatchObject({ ok: false, error: { code: ErrorCode.INVALID_INPUT } });
    expect(await h.invoke('meta_test_echo', { n: 99 })).toMatchObject({
      ok: false,
      error: { code: ErrorCode.INVALID_INPUT },
    });
  });

  it('fails closed on invalid output', async () => {
    const h = createMockHarness([adapter]);
    expect(await h.invoke('meta_test_echo', { n: 3 })).toMatchObject({
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR },
    });
  });

  it('hides unexpected error details', async () => {
    const res = await createMockHarness([adapter]).invoke('meta_test_echo', { n: 4 });
    expect(res).toMatchObject({ ok: false, error: { code: ErrorCode.INTERNAL_ERROR } });
    expect(JSON.stringify(res)).not.toContain('kaboom');
  });

  it('redacts token-like strings in output', async () => {
    const res = await createMockHarness([adapter]).invoke('meta_test_echo', { n: 5 });
    expect(JSON.stringify(res)).not.toContain('EAAB1234567890');
  });

  it('rejects unknown tools', async () => {
    expect(await createMockHarness([]).invoke('meta_graph_raw', {})).toMatchObject({
      ok: false,
      error: { code: ErrorCode.ENDPOINT_NOT_ALLOWED },
    });
  });
});
