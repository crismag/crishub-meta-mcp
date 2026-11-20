// Programmatic (non-MCP) use of the toolkit in mock mode. Run after `pnpm build`:
//   pnpm example:sdk
// No credentials or network access are needed.
import { createRuntime, loadConfig } from '../../packages/mcp-server/dist/index.js';

const runtime = createRuntime(loadConfig({ META_MODE: 'mock', META_LOG_LEVEL: 'silent' }));

const status = await runtime.invoke('meta_connection_status', {});
console.log('mode:', status.ok && status.data.mode);

const pages = await runtime.invoke('meta_pages_list', { limit: 10 });
if (!pages.ok) throw new Error(pages.error.code);
for (const p of pages.data.pages)
  console.log(`page ${p.id}  ${p.name}  tasks=${(p.tasks ?? []).join('|')}`);

const insights = await runtime.invoke('meta_insights_query', {
  ad_account_id: 'act_900000000000301',
  fields: ['impressions', 'clicks', 'spend'],
  date_preset: 'last_7d',
});
if (!insights.ok) throw new Error(insights.error.code);
console.log(`insights rows: ${insights.data.row_count}`, insights.data.rows[0]);
