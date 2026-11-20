import type { TokenType } from './credentials.js';

export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED' | 'BLOCKED' | 'DEPRECATED' | 'PLANNED';
export type RiskLevel = 'read' | 'write' | 'destructive';
export type DataClassification = 'public' | 'business' | 'confidential' | 'pii';

/** A documented Meta capability backing one or more tools. */
export interface Capability {
  id: string;
  adapter: string;
  title: string;
  /** HTTP method and Graph path template, e.g. "GET /{page-id}/leadgen_forms". */
  operation: string;
  requiredPermissions: readonly string[];
  tokenTypes: readonly TokenType[];
  riskLevel: RiskLevel;
  dataClassification: DataClassification;
  /** Documentation status of the endpoint (see docs/API_RESEARCH_LEDGER.md). */
  status: VerificationStatus;
  docsUrl: string;
  /** ISO date the docs were last checked. */
  verifiedAt?: string;
  notes?: string;
}

export class CapabilityRegistry {
  readonly #caps = new Map<string, Capability>();

  register(cap: Capability): void {
    if (this.#caps.has(cap.id)) throw new Error(`Duplicate capability id: ${cap.id}`);
    if (!/^https:\/\/developers\.facebook\.com\//.test(cap.docsUrl)) {
      throw new Error(`Capability ${cap.id} must cite an official developers.facebook.com URL`);
    }
    this.#caps.set(cap.id, Object.freeze({ ...cap }));
  }

  get(id: string): Capability | undefined {
    return this.#caps.get(id);
  }

  list(): Capability[] {
    return [...this.#caps.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
}
