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
- **Spike 1:** PASS (Vault setup token -> payment token `57h784950k031805d` -> unattended order capture `76D72760UE464141G`)
- **Spike 2:** PASS (Dispute polling detected `PP-R-SQO-10196995`; message defense `200 OK`; escalation `200 OK`; capture refund `201 Created` with live refund ID `8CL74127HE2561626`)
- **Unit Tests:** Pending Milestone 2
- **Golden Path (`npm run demo` & `--replay`):** Pending Milestone 2 baseline
