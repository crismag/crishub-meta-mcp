# Integration contracts

## Package API
Adapters implement:
- `id`, `version`, `apiVersions`, `capabilities`
- `requiredPermissions`, `supportedTokenTypes`, `riskLevel`, `dataClassification`
- `registerTools(registry, dependencies)` and `healthCheck(context)`
- `dispose()` for cleanup

These are conceptual names until an ADR and typed implementation exist.

## Tool invocation
Every invocation must resolve a server-owned authorized connection context, not trust arbitrary tenant, app, token or asset identifiers supplied by a model. Validate tool input and limit outputs. Return typed structured errors: NOT_CONFIGURED, PERMISSION_DENIED, REVIEW_REQUIRED, TOKEN_EXPIRED, RATE_LIMITED, UNSUPPORTED_API_VERSION, INVALID_INPUT, UPSTREAM_UNAVAILABLE.

## Versioning
Use semver for packages, record supported Meta Graph versions per adapter and expose capability discovery. Deprecate rather than silently change semantics. Version webhook event schemas and redact customer PII in telemetry.

## Consumer boundaries
RealCRM and private platform use published adapters/contracts. They manage their own tenant auth, durable jobs, billing and CRM business logic. No direct dependency on private repos from public packages. Absence of an adapter must not break host startup.
