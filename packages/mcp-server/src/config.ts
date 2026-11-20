import {
  ErrorCode,
  MetaToolError,
  parseGraphVersion,
  parseIdList,
  parseMockScenario,
  type AssetPolicy,
  type GraphVersion,
  type LogLevel,
  type MockScenario,
} from '@crishub-meta-mcp/core';

export const KNOWN_ADAPTERS = ['facebook', 'marketing'] as const;
export type AdapterId = (typeof KNOWN_ADAPTERS)[number];

export interface ServerConfig {
  mode: 'mock' | 'live';
  graphVersion: GraphVersion;
  mockScenario: MockScenario;
  adapters: AdapterId[];
  enableUnverifiedTools: boolean;
  assetPolicy: AssetPolicy;
  logLevel: LogLevel;
  timeoutMs: number;
}

const bool = (v: string | undefined) => v === '1' || v?.toLowerCase() === 'true';

/**
 * Configuration comes only from the server environment (set by the MCP client
 * config or the host), never from tool arguments.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const mode = (env.META_MODE ?? 'mock').toLowerCase();
  if (mode !== 'mock' && mode !== 'live') {
    throw new MetaToolError(ErrorCode.INVALID_INPUT, 'META_MODE must be "mock" or "live".');
  }
  const adapters = (env.META_ADAPTERS ?? KNOWN_ADAPTERS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const a of adapters) {
    if (!(KNOWN_ADAPTERS as readonly string[]).includes(a)) {
      throw new MetaToolError(
        ErrorCode.INVALID_INPUT,
        `Unknown adapter in META_ADAPTERS: ${a.slice(0, 32)}`,
      );
    }
  }
  const logLevel = (env.META_LOG_LEVEL ?? 'info') as LogLevel;
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) {
    throw new MetaToolError(
      ErrorCode.INVALID_INPUT,
      'META_LOG_LEVEL must be debug, info, warn, error or silent.',
    );
  }
  const timeoutMs = Number(env.META_TIMEOUT_MS ?? 10_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60_000) {
    throw new MetaToolError(
      ErrorCode.INVALID_INPUT,
      'META_TIMEOUT_MS must be an integer between 500 and 60000.',
    );
  }
  const assetPolicy: AssetPolicy = {};
  const pages = parseIdList(env.META_ALLOWED_PAGE_IDS, 'page');
  const adAccounts = parseIdList(env.META_ALLOWED_AD_ACCOUNT_IDS, 'ad_account');
  const businesses = parseIdList(env.META_ALLOWED_BUSINESS_IDS, 'business');
  if (pages) assetPolicy.pages = pages;
  if (adAccounts) assetPolicy.adAccounts = adAccounts;
  if (businesses) assetPolicy.businesses = businesses;

  return {
    mode,
    graphVersion: parseGraphVersion(env.META_GRAPH_VERSION),
    mockScenario: parseMockScenario(env.META_MOCK_SCENARIO),
    adapters: adapters as AdapterId[],
    enableUnverifiedTools: bool(env.META_ENABLE_UNVERIFIED_TOOLS),
    assetPolicy,
    logLevel,
    timeoutMs,
  };
}
