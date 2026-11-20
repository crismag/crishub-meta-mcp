import { ErrorCode, MetaToolError } from './errors.js';
import type { GraphVersion } from './graph/version.js';

export type AssetKind = 'page' | 'ad_account' | 'business';

/**
 * Optional server-side allowlist of asset ids. When a set is present, tools
 * refuse ids outside it and filter list results to it. When absent, access is
 * bounded only by what Meta grants the configured token.
 */
export interface AssetPolicy {
  pages?: ReadonlySet<string>;
  adAccounts?: ReadonlySet<string>;
  businesses?: ReadonlySet<string>;
}

/**
 * Server-owned connection context. Tools never accept tenant, app, token or
 * connection identifiers from the model; the host resolves this context.
 */
export interface ConnectionContext {
  readonly connectionId: string;
  readonly mode: 'mock' | 'live';
  readonly graphVersion: GraphVersion;
  readonly assetPolicy: AssetPolicy;
}

function setFor(policy: AssetPolicy, kind: AssetKind): ReadonlySet<string> | undefined {
  switch (kind) {
    case 'page':
      return policy.pages;
    case 'ad_account':
      return policy.adAccounts;
    case 'business':
      return policy.businesses;
  }
}

export function normalizeAssetId(kind: AssetKind, id: string): string {
  return kind === 'ad_account' ? id.replace(/^act_/, '') : id;
}

export function isAssetAllowed(ctx: ConnectionContext, kind: AssetKind, id: string): boolean {
  const allowed = setFor(ctx.assetPolicy, kind);
  if (!allowed) return true;
  return allowed.has(normalizeAssetId(kind, id));
}

export function assertAssetAllowed(ctx: ConnectionContext, kind: AssetKind, id: string): void {
  if (!isAssetAllowed(ctx, kind, id)) {
    throw new MetaToolError(
      ErrorCode.PERMISSION_DENIED,
      `The requested ${kind.replace('_', ' ')} is not in this connection's asset allowlist.`,
    );
  }
}

export function filterAllowedAssets<T extends { id: string }>(
  ctx: ConnectionContext,
  kind: AssetKind,
  items: readonly T[],
): T[] {
  return items.filter((item) => isAssetAllowed(ctx, kind, item.id));
}

export function parseIdList(
  raw: string | undefined,
  kind: AssetKind,
): ReadonlySet<string> | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeAssetId(kind, s));
  for (const id of ids) {
    if (!/^\d{1,20}$/.test(id)) {
      throw new MetaToolError(ErrorCode.INVALID_INPUT, `Invalid ${kind} id in allowlist`);
    }
  }
  return new Set(ids);
}
