import { z } from 'zod';
import type { CapabilityRegistry, DataClassification, RiskLevel } from './capabilities.js';
import type { ConnectionContext } from './context.js';
import type { CredentialProvider } from './credentials.js';
import { ErrorCode, MetaToolError, toSafeError, type SafeError } from './errors.js';
import type { GraphClient } from './graph/client.js';
import type { Logger } from './logger.js';
import { redactDeep } from './redact.js';

export interface ToolDeps {
  graph: GraphClient;
  context: ConnectionContext;
  credentials: CredentialProvider;
  capabilities: CapabilityRegistry;
  logger: Logger;
}

export interface ToolDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
> {
  /** MCP tool name, `meta_<domain>_<action>` (ADR 0002). */
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  riskLevel: RiskLevel;
  dataClassification: DataClassification;
  /** Capability ids from the registry that back this tool. */
  capabilityIds: readonly string[];
  /** When true, the tool is only registered if unverified tools are explicitly enabled. */
  experimental?: boolean;
  handler(input: z.infer<I>, deps: ToolDeps): Promise<z.infer<O>>;
}

export type ToolResult<T = unknown> = { ok: true; data: T } | { ok: false; error: SafeError };

const TOOL_NAME = /^meta_[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Helper that preserves generic inference for tool definitions. */
export function defineTool<I extends z.ZodObject, O extends z.ZodObject>(
  def: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return def;
}

export interface ToolRegistryOptions {
  /** Phase 1 permits only read tools. Writes require a future ADR (Sprint 4). */
  allowedRiskLevels?: readonly RiskLevel[];
}

export class ToolRegistry {
  readonly #tools = new Map<string, ToolDefinition>();
  readonly #allowedRisk: readonly RiskLevel[];

  constructor(options: ToolRegistryOptions = {}) {
    this.#allowedRisk = options.allowedRiskLevels ?? ['read'];
  }

  register<I extends z.ZodObject, O extends z.ZodObject>(tool: ToolDefinition<I, O>): void {
    if (!TOOL_NAME.test(tool.name) || tool.name.length > 64)
      throw new Error(`Invalid tool name: ${tool.name}`);
    if (this.#tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    if (!this.#allowedRisk.includes(tool.riskLevel)) {
      throw new Error(
        `Tool ${tool.name} has risk level "${tool.riskLevel}", which is not enabled.`,
      );
    }
    this.#tools.set(tool.name, tool as unknown as ToolDefinition);
  }

  get(name: string): ToolDefinition | undefined {
    return this.#tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.#tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Validate input strictly, run the handler, validate output (fail closed) and
   * deep-redact the result. Never throws.
   */
  async invoke(name: string, rawInput: unknown, deps: ToolDeps): Promise<ToolResult> {
    const tool = this.#tools.get(name);
    if (!tool)
      return {
        ok: false,
        error: toSafeError(new MetaToolError(ErrorCode.ENDPOINT_NOT_ALLOWED, 'Unknown tool.')),
      };
    const parsed = tool.inputSchema.strict().safeParse(rawInput ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return {
        ok: false,
        error: toSafeError(new MetaToolError(ErrorCode.INVALID_INPUT, `Invalid input. ${issues}`)),
      };
    }
    try {
      const output = await tool.handler(parsed.data, deps);
      const checked = tool.outputSchema.safeParse(output);
      if (!checked.success) {
        deps.logger.error('tool output failed schema validation', { tool: name });
        return {
          ok: false,
          error: toSafeError(
            new MetaToolError(ErrorCode.INTERNAL_ERROR, 'Tool produced invalid output.'),
          ),
        };
      }
      return { ok: true, data: redactDeep(checked.data) };
    } catch (err) {
      if (!(err instanceof MetaToolError)) {
        deps.logger.error('tool failed with unexpected error', {
          tool: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return { ok: false, error: toSafeError(err) };
    }
  }
}

/** Shared pagination output shape. */
export const pagingOutput = {
  truncated: z.boolean().describe('True when more results exist beyond the returned page budget.'),
  next_cursor: z.string().optional().describe('Pass as `after` to continue listing.'),
};

export const pagingInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum items to return (1-100, default 25).'),
  after: z
    .string()
    .regex(/^[A-Za-z0-9_\-=%.]{1,1024}$/)
    .optional()
    .describe('Opaque cursor returned as next_cursor by a previous call.'),
};
