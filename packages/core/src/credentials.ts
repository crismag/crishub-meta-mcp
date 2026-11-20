import { ErrorCode, MetaToolError } from './errors.js';
import { SecretToken } from './secret.js';

export type TokenType = 'user' | 'page' | 'system_user' | 'app';

/**
 * Supplies credentials to the Graph transport. Implementations may read the
 * environment, an OS keychain or a hosted vault; consumers (such as the private
 * platform) implement their own provider with tenant-aware lookup.
 */
export interface CredentialProvider {
  readonly id: string;
  /** True when a primary access token is available. Must not perform network I/O. */
  isConfigured(): boolean;
  /** Primary user or system-user token. Throws NOT_CONFIGURED if absent. */
  getAccessToken(): Promise<SecretToken>;
  /** Declared type of the primary token, if known. */
  getTokenType(): TokenType | undefined;
  /** Meta app id (not secret). */
  getAppId(): string | undefined;
  /** App secret used for appsecret_proof and app access tokens. */
  getAppSecret(): Promise<SecretToken | undefined>;
}

export interface StaticCredentials {
  accessToken?: string;
  tokenType?: TokenType;
  appId?: string;
  appSecret?: string;
}

export class StaticCredentialProvider implements CredentialProvider {
  readonly id: string = 'static';
  readonly #token?: SecretToken;
  readonly #appSecret?: SecretToken;
  readonly #tokenType?: TokenType;
  readonly #appId?: string;

  constructor(creds: StaticCredentials) {
    if (creds.accessToken) this.#token = new SecretToken(creds.accessToken);
    if (creds.appSecret) this.#appSecret = new SecretToken(creds.appSecret);
    if (creds.tokenType) this.#tokenType = creds.tokenType;
    if (creds.appId) {
      if (!/^\d{1,20}$/.test(creds.appId)) {
        throw new MetaToolError(ErrorCode.INVALID_INPUT, 'META_APP_ID must be numeric');
      }
      this.#appId = creds.appId;
    }
  }

  isConfigured(): boolean {
    return this.#token !== undefined;
  }

  async getAccessToken(): Promise<SecretToken> {
    if (!this.#token) {
      throw new MetaToolError(
        ErrorCode.NOT_CONFIGURED,
        'No Meta access token is configured. Set META_ACCESS_TOKEN in the server environment (never in chat).',
      );
    }
    return this.#token;
  }

  getTokenType(): TokenType | undefined {
    return this.#tokenType;
  }

  getAppId(): string | undefined {
    return this.#appId;
  }

  async getAppSecret(): Promise<SecretToken | undefined> {
    return this.#appSecret;
  }
}

const TOKEN_TYPES: readonly TokenType[] = ['user', 'page', 'system_user', 'app'];

/** Reads META_ACCESS_TOKEN, META_TOKEN_TYPE, META_APP_ID and META_APP_SECRET. */
export class EnvCredentialProvider extends StaticCredentialProvider {
  override readonly id = 'env';

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const tokenType = env.META_TOKEN_TYPE as TokenType | undefined;
    if (tokenType !== undefined && !TOKEN_TYPES.includes(tokenType)) {
      throw new MetaToolError(
        ErrorCode.INVALID_INPUT,
        `META_TOKEN_TYPE must be one of ${TOKEN_TYPES.join(', ')}`,
      );
    }
    const creds: StaticCredentials = {};
    if (env.META_ACCESS_TOKEN) creds.accessToken = env.META_ACCESS_TOKEN;
    if (tokenType) creds.tokenType = tokenType;
    if (env.META_APP_ID) creds.appId = env.META_APP_ID;
    if (env.META_APP_SECRET) creds.appSecret = env.META_APP_SECRET;
    super(creds);
  }
}
