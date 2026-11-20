# Meta API research ledger

Evidence for every Meta operation the toolkit calls. Statuses:

- **VERIFIED**: the operation, parameters and fields were read on the cited official page on the stated date.
- **UNVERIFIED**: the official page could not be loaded or does not document the read; the backing tool is
  `experimental` and disabled unless `META_ENABLE_UNVERIFIED_TOOLS=true`.
- Permission names marked † are not stated on the endpoint reference itself and are taken from the
  [Permissions reference](https://developers.facebook.com/docs/permissions).

"VERIFIED" means _documented_, not that any particular app has access: permissions, access levels, App Review,
business verification and Page tasks still apply per app. No live Meta API calls were made to build this ledger.

Verification method: official pages on developers.facebook.com read on **2026-11-20**. Fixtures are synthetic
(`packages/core/src/mock/fixtures.ts`).

## Versions

| Item             | Value                                                                                      | Source                                                             |
| ---------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Latest Graph API | v26.0 (introduced 2026-07-29, available until TBD)                                         | https://developers.facebook.com/docs/graph-api/changelog/versions/ |
| v25.0            | available until 2028-07-29                                                                 | same                                                               |
| v24.0            | Graph until 2028-02-18; **Marketing API ended 2026-10-06** → not supported by this toolkit | same                                                               |
| Toolkit support  | `v25.0`, `v26.0` (default `v26.0`)                                                         | `packages/core/src/graph/version.ts`                               |

Note: some reference pages show `v27.0` in examples, but the changelog does not list it yet. Re-check before adding it.

## Operations

| Capability id                   | Operation                                        | Source                                                                                                                                                                                                                  | Token                                                    | Permissions                                                              | Status                                                                                                                                | Tool                                 | Tests                          |
| ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------ |
| core.debug_token                | `GET /debug_token?input_token=`                  | [debug_token](https://developers.facebook.com/docs/graph-api/reference/debug_token)                                                                                                                                     | app token, or app developer's user token of the same app | none                                                                     | VERIFIED                                                                                                                              | meta_token_permissions               | core/test/diagnostics.test.ts  |
| core.me.permissions             | `GET /me/permissions`                            | [user/permissions](https://developers.facebook.com/docs/graph-api/reference/user/permissions)                                                                                                                           | user                                                     | none                                                                     | VERIFIED                                                                                                                              | meta_token_permissions               | core/test/diagnostics.test.ts  |
| core.internal.page_access_token | `GET /{page-id}?fields=access_token`             | [page](https://developers.facebook.com/docs/graph-api/reference/page)                                                                                                                                                   | user                                                     | page task                                                                | Internal only (never exposed)                                                                                                         | used by meta_lead_forms_list         | core/test/graph-client.test.ts |
| facebook.businesses.list        | `GET /me/businesses`                             | [user/businesses](https://developers.facebook.com/docs/graph-api/reference/user/businesses)                                                                                                                             | user, system user                                        | business_management†                                                     | VERIFIED                                                                                                                              | meta_businesses_list                 | meta-facebook/test             |
| facebook.pages.list             | `GET /me/accounts?fields=id,name,category,tasks` | [user/accounts](https://developers.facebook.com/docs/graph-api/reference/user/accounts); `fields=` usage: [insights get-started](https://developers.facebook.com/docs/insights/get-started)                             | user                                                     | pages_show_list†                                                         | VERIFIED                                                                                                                              | meta_pages_list                      | meta-facebook/test             |
| facebook.pages.get              | `GET /{page-id}`                                 | [page](https://developers.facebook.com/docs/graph-api/reference/page)                                                                                                                                                   | user, page                                               | pages_read_engagement (Page-owned data); PPCA/PPMA for public fields     | VERIFIED                                                                                                                              | meta_pages_get                       | meta-facebook/test             |
| marketing.ad_accounts.list      | `GET /me/adaccounts`                             | [user/adaccounts](https://developers.facebook.com/docs/graph-api/reference/user/adaccounts) (page failed to load)                                                                                                       | user, system user                                        | ads_read† (expected)                                                     | **UNVERIFIED**                                                                                                                        | meta_ad_accounts_list (experimental) | meta-marketing/test            |
| marketing.ad_accounts.get       | `GET /act_{id}`                                  | [ad-account](https://developers.facebook.com/docs/marketing-api/reference/ad-account)                                                                                                                                   | user, system user                                        | ads_read† / ads_management†                                              | VERIFIED                                                                                                                              | meta_ad_accounts_get                 | meta-marketing/test            |
| marketing.campaigns.list        | `GET /act_{id}/campaigns`                        | [ad-account/campaigns](https://developers.facebook.com/docs/marketing-api/reference/ad-account/campaigns/), fields: [ad-campaign-group](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group) | user, system user                                        | ads_read†                                                                | VERIFIED                                                                                                                              | meta_campaigns_list                  | meta-marketing/test            |
| marketing.insights.query        | `GET /act_{id}/insights`                         | [ad-account/insights](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights), [best practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices/)                  | user, system user                                        | ads_read†                                                                | VERIFIED                                                                                                                              | meta_insights_query                  | meta-marketing/test            |
| marketing.lead_forms.list       | `GET /{page-id}/leadgen_forms?fields=id,name`    | [Lead Ads create guide](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/create)                                                                                                | **Page** token (ADVERTISE task)                          | ads_management, pages_manage_ads, pages_read_engagement, pages_show_list | **UNVERIFIED** (only `id,name` reads shown; `status`, `locale`, `created_time` undocumented for reads; reference documents POST only) | meta_lead_forms_list (experimental)  | meta-marketing/test            |

### Endpoint notes

- **debug_token** response `data`: app_id, application, error{code,message,subcode}, expires_at, data_access_expires_at,
  is_valid, issued_at, metadata, profile_id, scopes[], granular_scopes[{scope, target_ids?}], user_id. `type` is not
  listed on the page but is commonly returned; the tool treats it as optional. The tool returns counts instead of
  `target_ids` and omits `user_id`.
- **/me/permissions**: `data[]` of {permission, status ∈ granted|declined|expired} with `paging`.
- **/me/accounts**: The reference does not say whether `access_token` is returned by default. The toolkit always
  sends an explicit `fields=` list without it, strips unknown keys via schema and deep-redacts output; the mock
  deliberately returns `access_token` to prove this.
- **Page**: `verification_status` ∈ blue_verified|gray_verified|not_verified (`is_verified` is deprecated). `fan_count`
  may reflect followers for New Pages Experience Pages.
- **Ad account**: `account_status` 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, 7 PENDING_RISK_REVIEW, 8 PENDING_SETTLEMENT,
  9 IN_GRACE_PERIOD, 100 PENDING_CLOSURE, 101 CLOSED. `amount_spent` units are not stated consistently: returned raw
  with `currency`.
- **Campaigns**: `effective_status` filter is a JSON array; without filters archived/deleted campaigns are excluded.
  Budgets are numeric strings, returned raw.
- **Insights**: levels ad|adset|campaign|account; `time_range` overrides `date_preset`; `time_increment` all_days
  (default)|monthly|1–90; max 37 months history (error 3018); invalid cursor error 2642; `lifetime` preset removed
  in v10.0. Toolkit limits: account and campaign levels only (adset/ad withheld until `adset_id`/`ad_id` fields are verified; campaign rows always carry `campaign_id`/`campaign_name`), allowlisted fields, presets excluding `maximum`, ranges ≤ 93 days, ≤ 500 rows,
  synchronous only (async `report_run_id` workflow is out of scope for Sprint 1). reach, frequency and spend are
  estimates.
- **Lead retrieval** (Sprint 2, not implemented): [retrieving guide](https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving):
  `/{form-id}/leads`, permissions ads_management, leads_retrieval, pages_show_list, pages_read_engagement,
  pages_manage_ads; rate limit 200 × 24 × leads created in 90 days per 24 h; BUC error 80005.

## Cross-cutting behaviour

| Topic             | Evidence                                                                                                                | Source                                                                                 | Implementation                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Error body        | message, type, code, error_subcode, error_user_title, error_user_msg, fbtrace_id                                        | [error handling](https://developers.facebook.com/docs/graph-api/guides/error-handling) | `graph/error-map.ts`                                        |
| Token errors      | 190 (subcodes 458, 459, 460, 463, 464, 467, 492), 102                                                                   | same                                                                                   | `TOKEN_EXPIRED`                                             |
| Permission errors | 10, 200–299, 3, 368                                                                                                     | same                                                                                   | `PERMISSION_DENIED` / `REVIEW_REQUIRED` (message heuristic) |
| Transient         | 1, 2 (retry); `is_transient` is not on the page but honoured when present                                               | same                                                                                   | `UPSTREAM_UNAVAILABLE`, retried                             |
| Rate limits       | 4, 17, 32, 613, 341; BUC 80000–80014                                                                                    | [rate limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting) | `RATE_LIMITED`, not retried                                 |
| Usage headers     | X-App-Usage {call_count,total_cputime,total_time}; X-Business-Use-Case-Usage {…, estimated_time_to_regain_access (min)} | same                                                                                   | `parseUsageHeaders`, `meta_connection_status.usage`         |
| Pagination        | cursor-based `paging.cursors.after`, `next` absent on last page; short pages ≠ end                                      | [results](https://developers.facebook.com/docs/graph-api/results)                      | `GraphClient.list` re-applies cursors; never fetches `next` |
| appsecret_proof   | HMAC-SHA256(access_token, app_secret), sent as `appsecret_proof` (hex, per PHP example)                                 | [securing requests](https://developers.facebook.com/docs/graph-api/securing-requests)  | `computeProof`                                              |

## Not yet researched (later sprints)

Messenger, Instagram, WhatsApp Cloud API, Threads, Webhooks (signature/challenge), Marketing API rate-limit page,
LeadgenForm node reference (failed to load). All remain **UNVERIFIED** and unimplemented.
