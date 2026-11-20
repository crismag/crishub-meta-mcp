import type { Capability } from './capabilities.js';
import type { EndpointRule } from './graph/endpoints.js';
import type { GraphVersion } from './graph/version.js';
import type { ToolDefinition, ToolDeps } from './tools.js';

export interface HealthStatus {
  adapter: string;
  status: 'ok' | 'not_configured' | 'degraded';
  detail?: string;
}

/**
 * An independently installable Meta API adapter. Adapters only *declare*
 * endpoints, capabilities and tools; the host decides what to register.
 * Absence of an adapter must never break host startup.
 */
export interface MetaAdapter {
  readonly id: string;
  readonly version: string;
  readonly apiVersions: readonly GraphVersion[];
  readonly capabilities: readonly Capability[];
  readonly endpoints: readonly EndpointRule[];
  readonly tools: readonly ToolDefinition[];
  healthCheck?(deps: ToolDeps): Promise<HealthStatus>;
  dispose?(): Promise<void>;
}
