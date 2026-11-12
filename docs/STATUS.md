# Recourse Project Status & Build Milestones

### NEEDS USER
*(None currently — all user actions completed successfully!)*

---

## Build Milestones (Schedule Reset: Overnight Sprint to Nov 12 09:00 IST Feature Freeze)

| # | Milestone | Status | Notes |
|---|---|---|---|
| C | Corrections C1–C5 (Scenario renaming, replay badging, spike exclusion, remote push, judges' vault setup) | **COMPLETED** | Renamed scenarios to official names; Expedition pack labeled recorded sandbox data; spike artifacts excluded from KPIs with unit test; `npm run setup:vault` + `/api/vault/return` added. |
| 1 | Live Contested Claim (Tent Capture `7BH91632Y92698500`) | **COMPLETED** | User filed simulated dispute `PP-R-RGO-10199647`. Detected via polling. Resolver returned `NO_GROUNDS`. Defender scored $p_{\text{win}}=0.95$, selected `CONTEST`, submitted defense message citing stored Mandate JWS, receipt hash, and simulated pristine delivery record. Status changed to `WAITING_FOR_BUYER_RESPONSE`. Labeled "evidence submitted, under PayPal review (sandbox cannot adjudicate)". Defended $45.00 tracked. |
| 2 | Demo Console UI (1920x1080 non-scrolling, fintech palette, human approval modal, mandate revoke kill switch, live agent reasoning feed, live vs replay badges) | IN PROGRESS | Numbered steps, live feed, receipt chain, mandate card, dispute card with EV bars. |
| 3 | AG Studio Dashboard at `/dashboard` (KPI tiles: Recovered $, Defended $ pending PayPal decision, Blocked $; Purchases AG Grid; Guard decisions; Dispute timeline; Spend vs Cap; Activity log) | PENDING | |
| 4 | Documentation (`README.md`, `docs/SUBMISSION.md`, `docs/RECORDING.md`) | PENDING | |
| 5 | Hosted Demo Configuration (`render.yaml`, `REPLAY_ONLY=true` support) | PENDING | |
| 6 | Final Secret Scan & Freeze Verification | PENDING | |

## Acceptance Status
- **Spike 1 (Vault & Unattended Orders):** PASS (Vault setup token -> payment token `57h784950k031805d` -> unattended order capture `76D72760UE464141G`)
- **Spike 2 (Dispute Polling & Settlement):** PASS (Polling detected `PP-R-XFQ-10198901`; `accept-claim` `200 OK`; live refund ID `22X59480TL380680H`; capture `24185227UU994700W` transitioned to `REFUNDED`)
- **Live Contested Claim:** PASS (Polling detected `PP-R-RGO-10199647`; `send-message` `200 OK`; status transitioned to `WAITING_FOR_BUYER_RESPONSE`; defense statement built strictly from stored DB records)
- **Unit Tests:** PASS (26/26 passing in Vitest across Guard, Receipts, and Disputes)
- **Golden Path (`npm run demo` & `--replay`):** PASS (All scenarios passing, receipt chain verified, per-scenario data source labeled)

---

## Sandbox Ledger

Every transaction, dispute, and refund created in the PayPal Sandbox for this project:

| Entity Type | Identifier | Amount | Creation Path | Associated Target | Current Status | Notes |
|---|---|---|---|---|---|---|
| Order | `5GS32993858853423` | $45.00 | Spike 1 Script | Vault token `57h784950k031805d` | `COMPLETED` | Initial unattended vault test (Spike artifact, excluded) |
| Capture | `76D72760UE464141G` | $45.00 | Spike 1 Script | Order `5GS32993858853423` | `PENDING` | Held due to buyer complaint in `PP-R-SQO-10196995` |
| Dispute | `PP-R-SQO-10196995` | $45.00 | Resolution Center | Capture `76D72760UE464141G` | `UNDER_REVIEW` | Spike 2 contest test; excluded from demo fixtures |
| Capture | `4MW82925T2060654E` | $45.00 | Spike 2 Script | Test order | `REFUNDED` | Target for direct capture refund verification (Spike artifact, excluded) |
| Refund | `8CL74127HE2561626` | $45.00 | Direct API Call | Capture `4MW82925T2060654E` | `COMPLETED` | Verified direct refund mechanism in Spike 2 (Spike artifact, excluded) |
| Order | `4YY66781YU2917137` | $45.00 | Full Guard Path | Mandate A (Tent) | `COMPLETED` | Approved purchase live run |
| Capture | `7BH91632Y92698500` | $45.00 | Full Guard Path | Order `4YY66781YU2917137` | `HELD` | Target of simulated buyer dispute `PP-R-RGO-10199647` |
| Dispute | `PP-R-RGO-10199647` | $45.00 | Resolution Center | Capture `7BH91632Y92698500` | `WAITING_FOR_BUYER_RESPONSE` | Simulated buyer dispute contested with stored DB records; Defended $45.00 pending |
| Order | `4JS10478D8056260X` | $38.00 | Full Guard Path | Mandate A (Jacket) | `COMPLETED` | Item not as described live run |
| Capture | `24185227UU994700W` | $38.00 | Full Guard Path | Order `4JS10478D8056260X` | `REFUNDED` | Defective item refunded via dispute settlement |
| Dispute | `PP-R-XFQ-10198901` | $38.00 | Resolution Center | Capture `24185227UU994700W` | `RESOLVED` | Resolver Case File -> Defender `accept-claim` (`NOT_ABLE_TO_WIN`) |
| Refund | `22X59480TL380680H` | $38.00 | Dispute Settlement | Capture `24185227UU994700W` | `COMPLETED` | Triggered by Defender `accept-claim` ($38.00 Recovered $) |
| Order | `8KC65034CE698390J` | $55.00 | Full Guard Path | Mandate A (Expedition Pack) | `COMPLETED` | Human approval flow live run |
| Capture | `4LE12533XH788181M` | $55.00 | Full Guard Path | Order `8KC65034CE698390J` | `COMPLETED` | Approved by user (> $50 threshold) |

### Notes on Specific Transactions
1. **Explanation of Refund `8CL74127HE2561626` ($45.00 USD):**
   - In Spike 2, to determine which PayPal API call yields an actual refund before building agent logic, `POST /v2/payments/captures/4MW82925T2060654E/refund` was invoked directly via API against a test capture. It returned `201 Created` with refund ID `8CL74127HE2561626`, proving that direct capture refund moves money immediately.
2. **Current State of Dispute `PP-R-SQO-10196995` ($45.00 USD):**
   - Reason: `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`
   - Status: `UNDER_REVIEW` (`dispute_state: "UNDER_PAYPAL_REVIEW"`, `dispute_life_cycle_stage: "CHARGEBACK"`).
   - Seller response was submitted on 2026-11-11 via `POST .../provide-evidence` with `evidence_type: "OTHER"`.
   - The dispute is awaiting PayPal sandbox internal review. Per Decision Log 2026-11-11, this dispute is excluded from production fixtures and demo assets.
