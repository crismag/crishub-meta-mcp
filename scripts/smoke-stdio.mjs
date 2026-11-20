// Offline smoke test: spawns the built stdio server in mock mode, lists tools
// and calls a few of them through a real MCP client. No network access.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../packages/mcp-server/dist/bin.js', import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [bin],
  env: { PATH: process.env.PATH ?? '', META_MODE: 'mock', META_LOG_LEVEL: 'warn' },
  stderr: 'inherit',
});
const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools: ${tools.map((t) => t.name).join(', ')}`);
const fail = (msg) => {
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
};
if (tools.length < 8) fail('expected at least 8 tools');
if (tools.some((t) => t.annotations?.readOnlyHint !== true)) fail('all tools must be read-only');

for (const [name, args] of [
  ['meta_connection_status', {}],
  ['meta_token_permissions', {}],
  ['meta_pages_list', {}],
  [
    'meta_insights_query',
    { ad_account_id: 'act_900000000000301', date_preset: 'last_7d', time_increment: '1' },
  ],
]) {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) fail(`${name} returned error: ${JSON.stringify(res.content)}`);
  const text = JSON.stringify(res);
  if (/EAAMOCK|DONOTUSE/.test(text)) fail(`${name} leaked a token`);
  console.log(`ok ${name}`);
}

const bad = await client.callTool({
  name: 'meta_pages_get',
  arguments: { page_id: '../me?fields=access_token' },
});
if (!bad.isError) fail('malicious page_id should be rejected');
console.log('ok malicious input rejected');

await client.close();
console.log('SMOKE PASS');
