# Security and privacy baseline

- Local stdio first. Remote MCP requires authentication, transport security, origin protections and a threat model.
- No arbitrary Graph URL execution, raw token exposure or uncontrolled agent actions.
- Credentials sourced from secure environment/secret provider; never stored in repository, MCP tool output, logs or documentation.
- Scope operations by app, user and business asset; server-side authorization is mandatory in hosted consumers.
- Validate inputs, restrict endpoints, prevent SSRF, redact errors and cap payload sizes.
- Webhooks must validate Meta's signature against exact raw request bytes using constant-time comparison; challenge verification alone is insufficient. Deduplicate deliveries.
- Respect Meta terms, deletion requests, privacy/data retention and applicable law. No unnecessary customer PII in fixtures.
- Maintain dependency scanning, vulnerability disclosure instructions, audit trails for future writes and opt-in live tests.
- Never claim Meta approval or business verification without observed evidence.
