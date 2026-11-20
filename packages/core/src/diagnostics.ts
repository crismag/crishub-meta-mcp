import { z } from 'zod';
import type { MetaAdapter } from './adapter.js';
import type { Capability } from './capabilities.js';
import type { EndpointRule } from './graph/endpoints.js';
import { SUPPORTED_GRAPH_VERSIONS } from './graph/version.js';
import { defineTool } from './tools.js';

const VERIFIED_AT = '2026-11-20';

export const DIAGNOSTICS_CAPABILITIES: Capability[] = [
  {
    id: 'core.debug_token',
    adapter: 'core',
    title: 'Inspect access token metadata',
    operation: 'GET /debug_token',
    requiredPermissions: [],
    tokenTypes: ['app', 'user'],
    riskLevel: 'read',
    dataClassification: 'confidential',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/graph-api/reference/debug_token',
    verifiedAt: VERIFIED_AT,
    notes:
      'Called with an app token (app_id|app_secret) or an app developer user token of the same app.',
  },
  {
    id: 'core.me.permissions',
    adapter: 'core',
    title: 'List granted/declined permissions for the token user',
    operation: 'GET /me/permissions',
    requiredPermissions: [],
    tokenTypes: ['user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/graph-api/reference/user/permissions',
    verifiedAt: VERIFIED_AT,
  },
];

const debugTokenSchema = z.object({
  data: z.object({
    app_id: z.string().optional(),
    type: z.string().optional(),
    application: z.string().optional(),
    expires_at: z.number().optional(),
    data_access_expires_at: z.number().optional(),
    issued_at: z.number().optional(),
    is_valid: z.boolean(),
    scopes: z.array(z.string()).optional(),
    granular_scopes: z
      .array(z.object({ scope: z.string(), target_ids: z.array(z.string()).optional() }))
      .optional(),
    profile_id: z.string().optional(),
    error: z
      .object({
        code: z.number().optional(),
        subcode: z.number().optional(),
        message: z.string().optional(),
      })
      .optional(),
  }),
});

const permissionsSchema = z.object({
  data: z.array(z.object({ permission: z.string(), status: z.string() })),
  paging: z
    .object({
      next: z.string().optional(),
      cursors: z.object({ after: z.string().optional() }).optional(),
    })
    .optional(),
});

export const DIAGNOSTICS_ENDPOINTS: EndpointRule[] = [
  {
    id: 'core.debug_token',
    method: 'GET',
    template: '/debug_token',
    pathParams: {},
    allowedFields: [],
    defaultFields: [],
    paginated: false,
    tokenType: 'app',
    responseSchema: debugTokenSchema,
  },
  {
    id: 'core.me.permissions',
    method: 'GET',
    template: '/{user}/permissions',
    pathParams: { user: 'self' },
    allowedFields: [],
    defaultFields: [],
    paginated: true,
    maxLimit: 100,
    tokenType: 'primary',
    responseSchema: permissionsSchema,
  },
  {
    // Internal: resolves a Page token for Page-token-only edges. Never exposed to tools.
    id: 'core.internal.page_access_token',
    method: 'GET',
    template: '/{page_id}',
    pathParams: { page_id: 'numeric_id' },
    allowedFields: ['access_token'],
    defaultFields: ['access_token'],
    paginated: false,
    tokenType: 'primary',
    internal: true,
    responseSchema: z.object({ id: z.string(), access_token: z.string().optional() }),
  },
];

const toIso = (epoch: number | undefined): string | null =>
  epoch === undefined || epoch === 0 ? null : new Date(epoch * 1000).toISOString();

const connectionStatus = defineTool({
  name: 'meta_connection_status',
  title: 'Meta connection status',
  description:
    'Summarise how this server is connected to Meta: mode (mock/live), whether credentials are configured, Graph API version, enabled adapters and last observed rate-limit usage. Makes no network calls and never returns credentials.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    mode: z.enum(['mock', 'live']),
    configured: z.boolean(),
    credential_source: z.string(),
    token_type: z.string().nullable(),
    app_id_configured: z.boolean(),
    app_secret_proof: z.boolean(),
    graph_version: z.string(),
    supported_graph_versions: z.array(z.string()),
    asset_allowlists: z.object({
      pages: z.number().nullable(),
      ad_accounts: z.number().nullable(),
      businesses: z.number().nullable(),
    }),
    usage: z.object({
      app_call_count_pct: z.number().nullable(),
      max_business_use_case_pct: z.number().nullable(),
      estimated_minutes_to_regain_access: z.number().nullable(),
    }),
  }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: [],
  async handler(_input, { context, credentials, graph }) {
    const usage = graph.lastUsage;
    const size = (s: ReadonlySet<string> | undefined) => (s ? s.size : null);
    return {
      mode: context.mode,
      configured: credentials.isConfigured(),
      credential_source: credentials.id,
      token_type: credentials.getTokenType() ?? null,
      app_id_configured: credentials.getAppId() !== undefined,
      app_secret_proof: (await credentials.getAppSecret()) !== undefined,
      graph_version: context.graphVersion,
      supported_graph_versions: [...SUPPORTED_GRAPH_VERSIONS],
      asset_allowlists: {
        pages: size(context.assetPolicy.pages),
        ad_accounts: size(context.assetPolicy.adAccounts),
        businesses: size(context.assetPolicy.businesses),
      },
      usage: {
        app_call_count_pct: usage.appUsage?.call_count ?? null,
        max_business_use_case_pct: usage.maxBusinessUseCasePct ?? null,
        estimated_minutes_to_regain_access: usage.estimatedTimeToRegainAccessMinutes ?? null,
      },
    };
  },
});

const tokenPermissions = defineTool({
  name: 'meta_token_permissions',
  title: 'Meta token permissions and expiry',
  description:
    'Inspect the configured access token via debug_token and /me/permissions: validity, type, app, expiry, granted scopes and declined/expired permissions. Returns metadata only; the token value is never returned. Asset ids in granular scopes are summarised as counts.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    is_valid: z.boolean(),
    token_type: z.string().nullable(),
    app_id: z.string().nullable(),
    application: z.string().nullable(),
    expires_at: z.string().nullable().describe('ISO time, or null when the token does not expire.'),
    data_access_expires_at: z.string().nullable(),
    issued_at: z.string().nullable(),
    scopes: z.array(z.string()),
    granular_scopes: z.array(z.object({ scope: z.string(), target_count: z.number().nullable() })),
    permissions: z.object({
      granted: z.array(z.string()),
      declined: z.array(z.string()),
      expired: z.array(z.string()),
    }),
    error: z.object({ code: z.number().nullable(), subcode: z.number().nullable() }).nullable(),
  }),
  riskLevel: 'read',
  dataClassification: 'confidential',
  capabilityIds: ['core.debug_token', 'core.me.permissions'],
  async handler(_input, { graph }) {
    const dbg = await graph.get<z.infer<typeof debugTokenSchema>>('core.debug_token');
    const d = dbg.data;
    const permissions = {
      granted: [] as string[],
      declined: [] as string[],
      expired: [] as string[],
    };
    if (d.is_valid && d.type !== 'APP' && d.type !== 'PAGE') {
      const perms = await graph.list<{ permission: string; status: string }>(
        'core.me.permissions',
        {},
        { maxItems: 200 },
      );
      for (const p of perms.items) {
        if (p.status === 'granted') permissions.granted.push(p.permission);
        else if (p.status === 'declined') permissions.declined.push(p.permission);
        else if (p.status === 'expired') permissions.expired.push(p.permission);
      }
    }
    return {
      is_valid: d.is_valid,
      token_type: d.type ?? null,
      app_id: d.app_id ?? null,
      application: d.application ?? null,
      expires_at: toIso(d.expires_at),
      data_access_expires_at: toIso(d.data_access_expires_at),
      issued_at: toIso(d.issued_at),
      scopes: d.scopes ?? [],
      granular_scopes: (d.granular_scopes ?? []).map((g) => ({
        scope: g.scope,
        target_count: g.target_ids ? g.target_ids.length : null,
      })),
      permissions,
      error: d.error ? { code: d.error.code ?? null, subcode: d.error.subcode ?? null } : null,
    };
  },
});

const capabilitiesList = defineTool({
  name: 'meta_capabilities_list',
  title: 'List toolkit capabilities',
  description:
    'List the Meta API capabilities known to this server with their documentation status (VERIFIED/UNVERIFIED), required permissions, token types, risk level and official source URL. Use this to understand what a tool can do before calling it. No network calls.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    capabilities: z.array(
      z.object({
        id: z.string(),
        adapter: z.string(),
        title: z.string(),
        operation: z.string(),
        status: z.string(),
        required_permissions: z.array(z.string()),
        token_types: z.array(z.string()),
        risk_level: z.string(),
        data_classification: z.string(),
        docs_url: z.string(),
        verified_at: z.string().nullable(),
        notes: z.string().nullable(),
      }),
    ),
  }),
  riskLevel: 'read',
  dataClassification: 'public',
  capabilityIds: [],
  async handler(_input, { capabilities }) {
    return {
      capabilities: capabilities.list().map((c) => ({
        id: c.id,
        adapter: c.adapter,
        title: c.title,
        operation: c.operation,
        status: c.status,
        required_permissions: [...c.requiredPermissions],
        token_types: [...c.tokenTypes],
        risk_level: c.riskLevel,
        data_classification: c.dataClassification,
        docs_url: c.docsUrl,
        verified_at: c.verifiedAt ?? null,
        notes: c.notes ?? null,
      })),
    };
  },
});

export function createDiagnosticsAdapter(): MetaAdapter {
  return {
    id: 'core',
    version: '0.1.0-dev',
    apiVersions: SUPPORTED_GRAPH_VERSIONS,
    capabilities: DIAGNOSTICS_CAPABILITIES,
    endpoints: DIAGNOSTICS_ENDPOINTS,
    tools: [connectionStatus, tokenPermissions, capabilitiesList],
  };
}
