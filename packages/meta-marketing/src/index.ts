import { z } from 'zod';
import {
  ErrorCode,
  MetaToolError,
  SUPPORTED_GRAPH_VERSIONS,
  assertAssetAllowed,
  defineTool,
  filterAllowedAssets,
  isDate,
  oneOf,
  pagingInput,
  pagingOutput,
  type Capability,
  type EndpointRule,
  type MetaAdapter,
} from '@crishub-meta-mcp/core';

const VERIFIED_AT = '2026-11-20';

export const MARKETING_CAPABILITIES: Capability[] = [
  {
    id: 'marketing.ad_accounts.list',
    adapter: 'marketing',
    title: 'List ad accounts for the token user',
    operation: 'GET /{user-id}/adaccounts',
    requiredPermissions: ['ads_read'],
    tokenTypes: ['user', 'system_user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'UNVERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/graph-api/reference/user/adaccounts',
    notes:
      'Reference page could not be loaded on 2026-11-20; tool is experimental and disabled by default.',
  },
  {
    id: 'marketing.ad_accounts.get',
    adapter: 'marketing',
    title: 'Read ad account metadata',
    operation: 'GET /act_{ad-account-id}',
    requiredPermissions: ['ads_read'],
    tokenTypes: ['user', 'system_user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/reference/ad-account',
    verifiedAt: VERIFIED_AT,
    notes:
      'Fields verified. Permission per the permissions reference (ads_read or ads_management). amount_spent is returned raw with currency.',
  },
  {
    id: 'marketing.campaigns.list',
    adapter: 'marketing',
    title: 'List campaigns in an ad account',
    operation: 'GET /act_{ad-account-id}/campaigns',
    requiredPermissions: ['ads_read'],
    tokenTypes: ['user', 'system_user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/',
    verifiedAt: VERIFIED_AT,
    notes:
      'Without effective_status, archived and deleted campaigns are excluded. Budgets returned raw.',
  },
  {
    id: 'marketing.insights.query',
    adapter: 'marketing',
    title: 'Bounded synchronous ad account insights',
    operation: 'GET /act_{ad-account-id}/insights',
    requiredPermissions: ['ads_read'],
    tokenTypes: ['user', 'system_user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights',
    verifiedAt: VERIFIED_AT,
    notes:
      'Synchronous only; async report runs are out of scope. Max 37 months history (error 3018); toolkit caps ranges to 93 days.',
  },
  {
    id: 'marketing.lead_forms.list',
    adapter: 'marketing',
    title: 'List lead forms on a Page',
    operation: 'GET /{page-id}/leadgen_forms',
    requiredPermissions: [
      'ads_management',
      'pages_manage_ads',
      'pages_read_engagement',
      'pages_show_list',
    ],
    tokenTypes: ['page'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'UNVERIFIED',
    docsUrl:
      'https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/create',
    verifiedAt: VERIFIED_AT,
    notes:
      'Guide shows GET with a Page token and fields=name,id. Other fields (status, locale, created_time) are unverified. Experimental; disabled by default.',
  },
];

const paging = z
  .object({
    next: z.string().optional(),
    cursors: z.object({ after: z.string().optional() }).optional(),
  })
  .optional();
const listOf = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item), paging });

const adAccountSchema = z.object({
  id: z.string(),
  account_id: z.string().optional(),
  name: z.string().optional(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
  timezone_name: z.string().optional(),
  amount_spent: z.string().optional(),
});
const AD_ACCOUNT_FIELDS = [
  'id',
  'account_id',
  'name',
  'account_status',
  'currency',
  'timezone_name',
  'amount_spent',
] as const;

const campaignSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  effective_status: z.string().optional(),
  objective: z.string().optional(),
  created_time: z.string().optional(),
  start_time: z.string().optional(),
  stop_time: z.string().optional(),
  daily_budget: z.string().optional(),
  lifetime_budget: z.string().optional(),
});
const CAMPAIGN_FIELDS = Object.keys(campaignSchema.shape) as (keyof typeof campaignSchema.shape)[];
const EFFECTIVE_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
  'IN_PROCESS',
  'WITH_ISSUES',
  'DELETED',
] as const;

const leadFormSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  status: z.string().optional(),
  locale: z.string().optional(),
  created_time: z.string().optional(),
});

export const INSIGHT_FIELDS = [
  'impressions',
  'reach',
  'clicks',
  'spend',
  'cpc',
  'cpm',
  'ctr',
  'frequency',
  'actions',
  'campaign_id',
  'campaign_name',
] as const;
const DATE_PRESETS = [
  'today',
  'yesterday',
  'last_7d',
  'last_14d',
  'last_28d',
  'last_30d',
  'last_90d',
  'this_month',
  'last_month',
] as const;
// adset/ad levels are withheld until adset_id/ad_id insight fields are documentation-verified;
// without them rows from different ad sets or ads could not be told apart.
const LEVELS = ['account', 'campaign'] as const;
const TIME_INCREMENTS = ['1', '7', 'monthly', 'all_days'] as const;
export const MAX_INSIGHTS_RANGE_DAYS = 93;
export const MAX_INSIGHTS_ROWS = 500;

const insightRowSchema = z.object({
  date_start: z.string(),
  date_stop: z.string(),
  impressions: z.string().optional(),
  reach: z.string().optional(),
  clicks: z.string().optional(),
  spend: z.string().optional(),
  cpc: z.string().optional(),
  cpm: z.string().optional(),
  ctr: z.string().optional(),
  frequency: z.string().optional(),
  actions: z.array(z.object({ action_type: z.string(), value: z.string() })).optional(),
  campaign_id: z.string().optional(),
  campaign_name: z.string().optional(),
});

const isEffectiveStatusList = (v: string): boolean => {
  try {
    const arr = JSON.parse(v) as unknown;
    return (
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every((s) => (EFFECTIVE_STATUSES as readonly string[]).includes(s as string))
    );
  } catch {
    return false;
  }
};
const isTimeRange = (v: string): boolean => {
  try {
    const tr = JSON.parse(v) as { since?: unknown; until?: unknown };
    return (
      Object.keys(tr).length === 2 &&
      typeof tr.since === 'string' &&
      typeof tr.until === 'string' &&
      isDate(tr.since) &&
      isDate(tr.until)
    );
  } catch {
    return false;
  }
};

export const MARKETING_ENDPOINTS: EndpointRule[] = [
  {
    id: 'marketing.ad_accounts.list',
    method: 'GET',
    template: '/{user}/adaccounts',
    pathParams: { user: 'self' },
    allowedFields: AD_ACCOUNT_FIELDS,
    defaultFields: ['id', 'account_id', 'name', 'account_status', 'currency', 'timezone_name'],
    paginated: true,
    maxLimit: 100,
    tokenType: 'primary',
    responseSchema: listOf(adAccountSchema),
  },
  {
    id: 'marketing.ad_accounts.get',
    method: 'GET',
    template: '/{ad_account_id}',
    pathParams: { ad_account_id: 'ad_account_id' },
    allowedFields: AD_ACCOUNT_FIELDS,
    defaultFields: AD_ACCOUNT_FIELDS,
    paginated: false,
    tokenType: 'primary',
    responseSchema: adAccountSchema,
  },
  {
    id: 'marketing.campaigns.list',
    method: 'GET',
    template: '/{ad_account_id}/campaigns',
    pathParams: { ad_account_id: 'ad_account_id' },
    allowedFields: CAMPAIGN_FIELDS,
    defaultFields: ['id', 'name', 'status', 'effective_status', 'objective', 'created_time'],
    allowedQuery: { effective_status: isEffectiveStatusList },
    paginated: true,
    maxLimit: 100,
    tokenType: 'primary',
    responseSchema: listOf(campaignSchema),
  },
  {
    id: 'marketing.insights.query',
    method: 'GET',
    template: '/{ad_account_id}/insights',
    pathParams: { ad_account_id: 'ad_account_id' },
    allowedFields: [...INSIGHT_FIELDS, 'date_start', 'date_stop'],
    defaultFields: ['impressions', 'spend'],
    allowedQuery: {
      level: oneOf(...LEVELS),
      date_preset: oneOf(...DATE_PRESETS),
      time_range: isTimeRange,
      time_increment: oneOf(...TIME_INCREMENTS),
    },
    paginated: true,
    maxLimit: 100,
    tokenType: 'primary',
    responseSchema: listOf(insightRowSchema),
  },
  {
    id: 'marketing.lead_forms.list',
    method: 'GET',
    template: '/{page_id}/leadgen_forms',
    pathParams: { page_id: 'numeric_id' },
    allowedFields: ['id', 'name', 'status', 'locale', 'created_time'],
    defaultFields: ['id', 'name'],
    paginated: true,
    maxLimit: 100,
    tokenType: 'page',
    responseSchema: listOf(leadFormSchema),
  },
];

const adAccountId = z
  .string()
  .regex(/^(?:act_)?\d{1,20}$/, 'must be act_<digits> or digits')
  .describe('Ad account id, e.g. act_1234567890.');
const pageId = z.string().regex(/^\d{1,20}$/, 'must be a numeric id');
const withCursor = (after: string | undefined) => (after ? { after } : {});
const cursorOut = (c: string | undefined) => (c ? { next_cursor: c } : {});

const adAccountsList = defineTool({
  name: 'meta_ad_accounts_list',
  title: 'List Meta ad accounts (experimental)',
  description:
    'List ad accounts available to the configured user. EXPERIMENTAL: endpoint documentation not yet verified.',
  inputSchema: z.object({ ...pagingInput }),
  outputSchema: z.object({ ad_accounts: z.array(adAccountSchema), ...pagingOutput }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['marketing.ad_accounts.list'],
  experimental: true,
  async handler(input, { graph, context }) {
    const res = await graph.list<z.infer<typeof adAccountSchema>>(
      'marketing.ad_accounts.list',
      { pathParams: { user: 'me' }, ...withCursor(input.after) },
      { maxItems: input.limit ?? 25, maxPages: 3 },
    );
    return {
      ad_accounts: filterAllowedAssets(context, 'ad_account', res.items),
      truncated: res.truncated,
      ...cursorOut(res.nextCursor),
    };
  },
});

const adAccountsGet = defineTool({
  name: 'meta_ad_accounts_get',
  title: 'Get Meta ad account metadata',
  description:
    'Read status, currency, timezone and spend metadata for one ad account. amount_spent is returned as Meta reports it, alongside currency.',
  inputSchema: z.object({ ad_account_id: adAccountId }),
  outputSchema: z.object({ ad_account: adAccountSchema }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['marketing.ad_accounts.get'],
  async handler(input, { graph, context }) {
    assertAssetAllowed(context, 'ad_account', input.ad_account_id);
    const ad_account = await graph.get<z.infer<typeof adAccountSchema>>(
      'marketing.ad_accounts.get',
      {
        pathParams: { ad_account_id: input.ad_account_id },
      },
    );
    return { ad_account };
  },
});

const campaignsList = defineTool({
  name: 'meta_campaigns_list',
  title: 'List campaigns in an ad account',
  description:
    'List campaigns for one ad account, optionally filtered by effective status. Read-only.',
  inputSchema: z.object({
    ad_account_id: adAccountId,
    effective_status: z
      .array(z.enum(EFFECTIVE_STATUSES))
      .min(1)
      .max(EFFECTIVE_STATUSES.length)
      .optional(),
    ...pagingInput,
  }),
  outputSchema: z.object({ campaigns: z.array(campaignSchema), ...pagingOutput }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['marketing.campaigns.list'],
  async handler(input, { graph, context }) {
    assertAssetAllowed(context, 'ad_account', input.ad_account_id);
    const res = await graph.list<z.infer<typeof campaignSchema>>(
      'marketing.campaigns.list',
      {
        pathParams: { ad_account_id: input.ad_account_id },
        query: {
          effective_status: input.effective_status
            ? JSON.stringify(input.effective_status)
            : undefined,
        },
        ...withCursor(input.after),
      },
      { maxItems: input.limit ?? 25, maxPages: 3 },
    );
    return { campaigns: res.items, truncated: res.truncated, ...cursorOut(res.nextCursor) };
  },
});

const DAY_MS = 86_400_000;
const MAX_HISTORY_DAYS = 37 * 30;

function validateRange(since: string, until: string, now: Date): void {
  const s = Date.parse(`${since}T00:00:00Z`);
  const u = Date.parse(`${until}T00:00:00Z`);
  if (u < s)
    throw new MetaToolError(ErrorCode.INVALID_INPUT, 'time_range.until must be on or after since.');
  if ((u - s) / DAY_MS + 1 > MAX_INSIGHTS_RANGE_DAYS) {
    throw new MetaToolError(
      ErrorCode.INVALID_INPUT,
      `time_range may span at most ${MAX_INSIGHTS_RANGE_DAYS} days.`,
    );
  }
  if (u > now.getTime() + DAY_MS)
    throw new MetaToolError(ErrorCode.INVALID_INPUT, 'time_range.until is in the future.');
  if ((now.getTime() - s) / DAY_MS > MAX_HISTORY_DAYS) {
    throw new MetaToolError(
      ErrorCode.INVALID_INPUT,
      'time_range.since is older than Meta’s 37-month insights window.',
    );
  }
}

const insightsQuery = defineTool({
  name: 'meta_insights_query',
  title: 'Query ad account insights (bounded)',
  description: `Synchronous, bounded insights query for one ad account. Fields are allowlisted; use either date_preset or time_range (max ${MAX_INSIGHTS_RANGE_DAYS} days); max_rows caps output (≤ ${MAX_INSIGHTS_ROWS}). reach, frequency and spend are estimates per Meta.`,
  inputSchema: z.object({
    ad_account_id: adAccountId,
    fields: z
      .array(z.enum(INSIGHT_FIELDS))
      .min(1)
      .max(INSIGHT_FIELDS.length)
      .optional()
      .describe('Default: impressions, spend.'),
    level: z.enum(LEVELS).optional().describe('Aggregation level. Default account.'),
    date_preset: z.enum(DATE_PRESETS).optional(),
    time_range: z
      .object({
        since: z.string().refine(isDate, 'YYYY-MM-DD'),
        until: z.string().refine(isDate, 'YYYY-MM-DD'),
      })
      .optional(),
    time_increment: z
      .enum(TIME_INCREMENTS)
      .optional()
      .describe('"1" = daily, "7" = weekly, monthly, or all_days.'),
    max_rows: z.number().int().min(1).max(MAX_INSIGHTS_ROWS).optional().describe('Default 100.'),
  }),
  outputSchema: z.object({
    ad_account_id: z.string(),
    level: z.enum(LEVELS),
    rows: z.array(insightRowSchema),
    row_count: z.number(),
    truncated: z.boolean(),
  }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['marketing.insights.query'],
  async handler(input, { graph, context }) {
    assertAssetAllowed(context, 'ad_account', input.ad_account_id);
    if (input.date_preset && input.time_range) {
      throw new MetaToolError(
        ErrorCode.INVALID_INPUT,
        'Use either date_preset or time_range, not both.',
      );
    }
    if (input.time_range) validateRange(input.time_range.since, input.time_range.until, new Date());
    const level = input.level ?? 'account';
    const requested: string[] = input.fields ? [...input.fields] : ['impressions', 'spend'];
    // Always identify the entity a row belongs to at campaign level.
    if (level === 'campaign') requested.push('campaign_id', 'campaign_name');
    const fields = [...new Set(requested)];
    const maxRows = input.max_rows ?? 100;
    const res = await graph.list<z.infer<typeof insightRowSchema>>(
      'marketing.insights.query',
      {
        pathParams: { ad_account_id: input.ad_account_id },
        fields,
        query: {
          level,
          date_preset: input.time_range ? undefined : (input.date_preset ?? 'last_7d'),
          time_range: input.time_range
            ? JSON.stringify({ since: input.time_range.since, until: input.time_range.until })
            : undefined,
          time_increment: input.time_increment,
        },
      },
      { maxItems: maxRows, maxPages: 5 },
    );
    const id = input.ad_account_id.startsWith('act_')
      ? input.ad_account_id
      : `act_${input.ad_account_id}`;
    return {
      ad_account_id: id,
      level,
      rows: res.items,
      row_count: res.items.length,
      truncated: res.truncated,
    };
  },
});

const leadFormsList = defineTool({
  name: 'meta_lead_forms_list',
  title: 'List Page lead forms (experimental)',
  description:
    'List Lead Ads forms on a Page (id and name by default). Uses a Page token resolved server-side; no lead data or tokens are returned. EXPERIMENTAL: only id/name reads are documented.',
  inputSchema: z.object({
    page_id: pageId.describe('Numeric Facebook Page id.'),
    fields: z
      .array(z.enum(['id', 'name', 'status', 'locale', 'created_time']))
      .min(1)
      .max(5)
      .optional(),
    ...pagingInput,
  }),
  outputSchema: z.object({ lead_forms: z.array(leadFormSchema), ...pagingOutput }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['marketing.lead_forms.list'],
  experimental: true,
  async handler(input, { graph, context }) {
    assertAssetAllowed(context, 'page', input.page_id);
    const res = await graph.list<z.infer<typeof leadFormSchema>>(
      'marketing.lead_forms.list',
      {
        pathParams: { page_id: input.page_id },
        asPage: input.page_id,
        ...(input.fields ? { fields: [...new Set(['id', ...input.fields])] } : {}),
        ...withCursor(input.after),
      },
      { maxItems: input.limit ?? 25, maxPages: 3 },
    );
    return { lead_forms: res.items, truncated: res.truncated, ...cursorOut(res.nextCursor) };
  },
});

export function createMarketingAdapter(): MetaAdapter {
  return {
    id: 'marketing',
    version: '0.1.0-dev',
    apiVersions: SUPPORTED_GRAPH_VERSIONS,
    capabilities: MARKETING_CAPABILITIES,
    endpoints: MARKETING_ENDPOINTS,
    tools: [adAccountsList, adAccountsGet, campaignsList, insightsQuery, leadFormsList],
  };
}
