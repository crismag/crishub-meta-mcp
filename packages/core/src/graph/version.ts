import { ErrorCode, MetaToolError } from '../errors.js';

/**
 * Graph API versions this toolkit is tested against. Source:
 * https://developers.facebook.com/docs/graph-api/changelog/versions/ (checked 2026-11-20):
 * v26.0 introduced 2026-07-29; v25.0 available until 2028-07-29.
 * v24.0 is excluded because the Marketing API dropped it on 2026-10-06.
 */
export const SUPPORTED_GRAPH_VERSIONS = ['v25.0', 'v26.0'] as const;
export type GraphVersion = (typeof SUPPORTED_GRAPH_VERSIONS)[number];
export const DEFAULT_GRAPH_VERSION: GraphVersion = 'v26.0';

export function parseGraphVersion(raw: string | undefined): GraphVersion {
  if (raw === undefined || raw.trim() === '') return DEFAULT_GRAPH_VERSION;
  const v = raw.trim();
  if ((SUPPORTED_GRAPH_VERSIONS as readonly string[]).includes(v)) return v as GraphVersion;
  throw new MetaToolError(
    ErrorCode.UNSUPPORTED_API_VERSION,
    `Graph API version "${v.slice(0, 16)}" is not supported. Supported: ${SUPPORTED_GRAPH_VERSIONS.join(', ')}`,
  );
}
