import { z } from 'zod';
import {
  SUPPORTED_GRAPH_VERSIONS,
  assertAssetAllowed,
  defineTool,
  filterAllowedAssets,
  pagingInput,
  pagingOutput,
  type Capability,
  type EndpointRule,
  type MetaAdapter,
} from '@crishub-meta-mcp/core';

const VERIFIED_AT = '2026-11-20';

export const FACEBOOK_CAPABILITIES: Capability[] = [
  {
    id: 'facebook.businesses.list',
    adapter: 'facebook',
    title: 'List business portfolios the user can access',
    operation: 'GET /{user-id}/businesses',
    requiredPermissions: ['business_management'],
    tokenTypes: ['user', 'system_user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/graph-api/reference/user/businesses',
    verifiedAt: VERIFIED_AT,
    notes:
      'Endpoint verified. The reference page does not name the permission; business_management is per the permissions reference.',
  },
  {
    id: 'facebook.pages.list',
    adapter: 'facebook',
    title: 'List Pages the user has a role on',
    operation: 'GET /{user-id}/accounts',
    requiredPermissions: ['pages_show_list'],
    tokenTypes: ['user'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/graph-api/reference/user/accounts',
    verifiedAt: VERIFIED_AT,
    notes:
      'Explicit fields= list excludes access_token; any access_token in responses is stripped.',
  },
  {
    id: 'facebook.pages.get',
    adapter: 'facebook',
    title: 'Read Page metadata',
    operation: 'GET /{page-id}',
    requiredPermissions: ['pages_read_engagement'],
    tokenTypes: ['user', 'page'],
    riskLevel: 'read',
    dataClassification: 'business',
    status: 'VERIFIED',
    docsUrl: 'https://developers.facebook.com/docs/graph-api/reference/page',
    verifiedAt: VERIFIED_AT,
    notes:
      'category/fan_count need PPCA/PPMA for public reads; fan_count may reflect followers on New Pages Experience.',
  },
];

const paging = z
  .object({
    next: z.string().optional(),
    cursors: z.object({ after: z.string().optional() }).optional(),
  })
  .optional();

const businessSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  verification_status: z.string().optional(),
  created_time: z.string().optional(),
});
const pageListItemSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  tasks: z.array(z.string()).optional(),
});
const pageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  link: z.string().optional(),
  fan_count: z.number().optional(),
  followers_count: z.number().optional(),
  verification_status: z.string().optional(),
});

const PAGE_FIELDS = [
  'id',
  'name',
  'category',
  'link',
  'fan_count',
  'followers_count',
  'verification_status',
] as const;

export const FACEBOOK_ENDPOINTS: EndpointRule[] = [
  {
    id: 'facebook.businesses.list',
    method: 'GET',
    template: '/{user}/businesses',
    pathParams: { user: 'self' },
    allowedFields: ['id', 'name', 'verification_status', 'created_time'],
    defaultFields: ['id', 'name', 'verification_status', 'created_time'],
    paginated: true,
    maxLimit: 100,
    tokenType: 'primary',
    responseSchema: z.object({ data: z.array(businessSchema), paging }),
  },
  {
    id: 'facebook.pages.list',
    method: 'GET',
    template: '/{user}/accounts',
    pathParams: { user: 'self' },
    allowedFields: ['id', 'name', 'category', 'tasks'],
    defaultFields: ['id', 'name', 'category', 'tasks'],
    paginated: true,
    maxLimit: 100,
    tokenType: 'primary',
    // Zod strips unknown keys, so an access_token returned by Meta is dropped here.
    responseSchema: z.object({ data: z.array(pageListItemSchema), paging }),
  },
  {
    id: 'facebook.pages.get',
    method: 'GET',
    template: '/{page_id}',
    pathParams: { page_id: 'numeric_id' },
    allowedFields: PAGE_FIELDS,
    defaultFields: ['id', 'name', 'category', 'link', 'verification_status'],
    paginated: false,
    tokenType: 'primary',
    responseSchema: pageSchema,
  },
];

const numericId = z.string().regex(/^\d{1,20}$/, 'must be a numeric id');

const businessesList = defineTool({
  name: 'meta_businesses_list',
  title: 'List Meta business portfolios',
  description:
    'List business portfolios (Business Manager) the configured user can access. Read-only.',
  inputSchema: z.object({ ...pagingInput }),
  outputSchema: z.object({ businesses: z.array(businessSchema), ...pagingOutput }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['facebook.businesses.list'],
  async handler(input, { graph, context }) {
    const res = await graph.list<z.infer<typeof businessSchema>>(
      'facebook.businesses.list',
      { pathParams: { user: 'me' }, ...(input.after ? { after: input.after } : {}) },
      { maxItems: input.limit ?? 25, maxPages: 3 },
    );
    return {
      businesses: filterAllowedAssets(context, 'business', res.items),
      truncated: res.truncated,
      ...(res.nextCursor ? { next_cursor: res.nextCursor } : {}),
    };
  },
});

const pagesList = defineTool({
  name: 'meta_pages_list',
  title: 'List Facebook Pages',
  description:
    'List Facebook Pages the configured user has a role on, with their tasks (e.g. ADVERTISE, MODERATE). Page access tokens are never requested or returned.',
  inputSchema: z.object({ ...pagingInput }),
  outputSchema: z.object({ pages: z.array(pageListItemSchema), ...pagingOutput }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['facebook.pages.list'],
  async handler(input, { graph, context }) {
    const res = await graph.list<z.infer<typeof pageListItemSchema>>(
      'facebook.pages.list',
      { pathParams: { user: 'me' }, ...(input.after ? { after: input.after } : {}) },
      { maxItems: input.limit ?? 25, maxPages: 3 },
    );
    return {
      pages: filterAllowedAssets(context, 'page', res.items),
      truncated: res.truncated,
      ...(res.nextCursor ? { next_cursor: res.nextCursor } : {}),
    };
  },
});

const pagesGet = defineTool({
  name: 'meta_pages_get',
  title: 'Get Facebook Page metadata',
  description: 'Read allowlisted metadata fields for one Facebook Page by numeric id. Read-only.',
  inputSchema: z.object({
    page_id: numericId.describe('Numeric Facebook Page id.'),
    fields: z
      .array(z.enum(PAGE_FIELDS))
      .min(1)
      .max(PAGE_FIELDS.length)
      .optional()
      .describe('Subset of allowlisted fields.'),
  }),
  outputSchema: z.object({ page: pageSchema }),
  riskLevel: 'read',
  dataClassification: 'business',
  capabilityIds: ['facebook.pages.get'],
  async handler(input, { graph, context }) {
    assertAssetAllowed(context, 'page', input.page_id);
    const fields = input.fields ? [...new Set(['id', ...input.fields])] : undefined;
    const page = await graph.get<z.infer<typeof pageSchema>>('facebook.pages.get', {
      pathParams: { page_id: input.page_id },
      ...(fields ? { fields } : {}),
    });
    return { page };
  },
});

export function createFacebookAdapter(): MetaAdapter {
  return {
    id: 'facebook',
    version: '0.1.0-dev',
    apiVersions: SUPPORTED_GRAPH_VERSIONS,
    capabilities: FACEBOOK_CAPABILITIES,
    endpoints: FACEBOOK_ENDPOINTS,
    tools: [businessesList, pagesList, pagesGet],
  };
}
