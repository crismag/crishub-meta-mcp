# Meta API target matrix (planning; verify against official docs)

| Domain | Initial read-only targets | Later gated targets | Constraints |
|---|---|---|---|
| Graph API / business assets | Pages, businesses, linked assets where authorized | permitted asset management | token type, scopes, business roles |
| Facebook Pages | Page metadata and permitted insights | content publishing/moderation | Page tasks and app review |
| Marketing API | ad accounts, campaigns, ad sets, ads, insights | campaign creation, pause, budgets | ads permissions, business verification and spend safeguards |
| Lead Ads | lead forms, authorized lead reads, lead webhook diagnostics | CRM sync and lead acknowledgments | lead access, data minimization and retention |
| Messenger | Page subscription and messaging capability diagnostics | receive/respond within Meta policy | permissions, messaging windows, review |
| Instagram | professional account metadata, media, comments, insights | publish, moderate, messaging | account type, linked assets, scopes |
| WhatsApp Cloud API | WABA/phone metadata, templates, webhook checks | template/session messaging | registration, consent, pricing/policy |
| Threads API | account/capability and insights checks | publishing/replies where supported | separate product/API permissions |
| Facebook Login for Business | auth flow design, scope validation | customer onboarding | configured products, review and security |
| Webhooks | verify challenge/signature; parse fixtures | durable event consumers | raw-body HMAC, deduplication |
| Meta app setup | documented audit checklist | dashboard-assisted setup | not all settings exposed by API |

## Research protocol
For every operation capture: official docs URL, verification date, Graph/API version, request/response schema, auth token type, permission(s), review/access tier, rate limits, test fixture and expected error modes. Mark **UNVERIFIED** until validated. Do not claim app configuration is remotely editable without a documented endpoint.

Official starting points:
- https://developers.facebook.com/docs/graph-api/
- https://developers.facebook.com/docs/marketing-apis/
- https://developers.facebook.com/docs/messenger-platform/
- https://developers.facebook.com/docs/instagram-platform/
- https://developers.facebook.com/docs/whatsapp/
- https://developers.facebook.com/docs/threads/
- https://modelcontextprotocol.io/
