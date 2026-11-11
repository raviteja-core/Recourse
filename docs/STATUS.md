# Recourse Project Status & Build Milestones

This file tracks progress against the Build Order defined in Scope Update v2.

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Spike 2 (Dispute polling, contest via messages, escalation, refund verification) | **COMPLETED** | Verified against PayPal Sandbox (`PP-R-SQO-10196995` detected via polling; contest message posted; escalation verified; live capture refund verified). |
| 2 | Core Engine (Mandate parse + sign, Guard + tests, DB, catalog, shopper, vault_id checkout, receipts, fulfillment simulator + demo clock) | **COMPLETED** | Fully implemented and passing: Groq Mandate parser, ES256 JWS signing, pure Guard (12 reason codes tested), DB schema, catalog, shopper, live & replay checkout, hash-chained receipts, accelerated fulfillment clock. |
| 3 | S3 Jacket "not as described" lifecycle (Resolver case file -> manual file -> Defender polls & refunds -> capture verified) | **COMPLETED** | Verified end-to-end live against PayPal Sandbox: Resolver prepared Case File from stored attributes and delivery defect; user filed in Resolution Center; Defender detected `PP-R-XFQ-10198901`, scored evidence ($p_{\text{win}} = 0.05$), evaluated EV, called `accept-claim` (`200 OK`), verified capture `24185227UU994700W` transitioned to `REFUNDED` with live refund ID `22X59480TL380680H`. Recorded real sandbox fixture. |
| 4 | Demo Console UI + Dashboard P0 widgets (spend vs cap, purchases grid, guard decisions, dispute timeline, KPIs) | PENDING | |
| 5 | Human-approval flow (`REQUIRE_APPROVAL` UI + receipt recording) | PENDING | |
| 6 | S4 "not delivered" (Mandate B -> Cobalt Camp Supply $29 stove -> tracking stalls -> Defender accepts claim -> refund verified) | PENDING | |
| 7 | S5 Contested Claim (Tent dispute contest using Mandate JWS + receipt hash + delivery report) | PENDING | |
| 8 | Shipment tracking evidence via PayPal Tracking API | PENDING | |
| 9 | Mandate revoke ("kill switch" + optional vault token deletion) | PENDING | |
| 10| Merchant reliability scoreboard + agent activity log + AG Studio theme | PENDING | |
| 11| Natural-language analytics via AG Studio agent framework (Groq OpenAI proxy) | PENDING | |
| 12| Hosted demo on Render (replay mode) + Webhooks signature verification | PENDING | |
| 13| README, `docs/SUBMISSION.md`, final secret scan | PENDING | |

## Acceptance Status
- **Spike 1 (Vault & Unattended Orders):** PASS (Vault setup token -> payment token `57h784950k031805d` -> unattended order capture `76D72760UE464141G`)
- **Spike 2 (Dispute Polling & Settlement):** PASS (Polling detected `PP-R-XFQ-10198901`; `accept-claim` `200 OK`; live refund ID `22X59480TL380680H`; capture `24185227UU994700W` transitioned to `REFUNDED`)
- **Unit Tests:** PASS (24/24 passing in Vitest across Guard, Receipts, and Disputes)
- **Golden Path (`npm run demo` & `--replay`):** PASS (All scenarios passing, receipt chain verified, per-scenario data source labeled)

---

## Sandbox Ledger

Every transaction, dispute, and refund created in the PayPal Sandbox for this project:

| Entity Type | Identifier | Amount | Creation Path | Associated Target | Current Status | Notes |
|---|---|---|---|---|---|---|
| Order | `5GS32993858853423` | $45.00 | Spike 1 Script | Vault token `57h784950k031805d` | `COMPLETED` | Initial unattended vault test |
| Capture | `76D72760UE464141G` | $45.00 | Spike 1 Script | Order `5GS32993858853423` | `PENDING` | Held due to buyer complaint in `PP-R-SQO-10196995` |
| Dispute | `PP-R-SQO-10196995` | $45.00 | Resolution Center | Capture `76D72760UE464141G` | `UNDER_REVIEW` | Spike 2 contest test; excluded from demo fixtures |
| Capture | `4MW82925T2060654E` | $45.00 | Spike 2 Script | Test order | `REFUNDED` | Target for direct capture refund verification |
| Refund | `8CL74127HE2561626` | $45.00 | Direct API Call | Capture `4MW82925T2060654E` | `COMPLETED` | Verified direct refund mechanism in Spike 2 |
| Order | `4YY66781YU2917137` | $45.00 | Full Guard Path | Mandate A (Tent) | `COMPLETED` | S1 live run |
| Capture | `7BH91632Y92698500` | $45.00 | Full Guard Path | Order `4YY66781YU2917137` | `COMPLETED` | In-bounds authorized purchase |
| Order | `4JS10478D8056260X` | $38.00 | Full Guard Path | Mandate A (Jacket) | `COMPLETED` | S3 live run |
| Capture | `24185227UU994700W` | $38.00 | Full Guard Path | Order `4JS10478D8056260X` | `REFUNDED` | Defective item refunded via dispute |
| Dispute | `PP-R-XFQ-10198901` | $38.00 | Resolution Center | Capture `24185227UU994700W` | `RESOLVED` | S3 Resolver Case File -> Defender `accept-claim` |
| Refund | `22X59480TL380680H` | $38.00 | Dispute Settlement | Capture `24185227UU994700W` | `COMPLETED` | Triggered by Defender `accept-claim` (`NOT_ABLE_TO_WIN`) |
| Order | `8KC65034CE698390J` | $55.00 | Full Guard Path | Mandate A (Expedition Pack) | `COMPLETED` | S4 Human Approval flow |
| Capture | `4LE12533XH788181M` | $55.00 | Full Guard Path | Order `8KC65034CE698390J` | `COMPLETED` | Approved by user (> $50 threshold) |

### Notes on Specific Transactions
1. **Explanation of Refund `8CL74127HE2561626` ($45.00 USD):**
   - In Spike 2, to determine which PayPal API call yields an actual refund before building agent logic, `POST /v2/payments/captures/4MW82925T2060654E/refund` was invoked directly via API against a test capture. It returned `201 Created` with refund ID `8CL74127HE2561626`, proving that direct capture refund moves money immediately.
2. **Current State of Dispute `PP-R-SQO-10196995` ($45.00 USD):**
   - Reason: `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`
   - Status: `UNDER_REVIEW` (`dispute_state: "UNDER_PAYPAL_REVIEW"`, `dispute_life_cycle_stage: "CHARGEBACK"`).
   - Seller response was submitted on 2026-11-11 via `POST .../provide-evidence` with `evidence_type: "OTHER"`.
   - The dispute is awaiting PayPal sandbox internal review. Per Decision Log 2026-11-11, this dispute is excluded from production fixtures and demo assets.
