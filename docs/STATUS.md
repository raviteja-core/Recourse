
### NEEDS USER: File Sandbox Dispute for Live Dry Run (Jacket Order)
Please open your browser, log in to the PayPal Sandbox as the US buyer (`sb-j6f43743452243@personal.example.com`), navigate to the **Resolution Center**, and file a dispute for the live Jacket order:

- **PayPal Transaction / Capture ID:** `48725438S2363071K`
- **PayPal Order ID:** `4NR28859YC9045307`
- **Item:** Ridgeback StormShield All-Weather Jacket
- **Disputed Amount:** `$38.00 USD`
- **Dispute Reason:** `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED` (Item differs significantly from description)
- **Copy-Paste Filing Text:**
> I received an item that is different from described. The Ridgeback StormShield All-Weather Jacket was purchased with specifications ({"waterproof":true,"breathable":true,"material":"ripstop nylon","color":"forest green"}), but delivery inspection proved discrepancy (expected waterproof=true but observed waterproof=false). Inspector report: "CRITICAL DISCREPANCY: Listing claims waterproof, but tested garment has no seam sealant or water-repellent membrane.". Requesting full refund of $38.00.

Once submitted in the Resolution Center, reply **"filed"** (or paste the dispute ID) so Recourse can poll, detect it, and execute the Defender's automated EV settlement!

---

## Build Milestones (Schedule Reset: Sprint to Nov 12 12:00 IST Fix Freeze)

| # | Milestone | Status | Notes |
|---|---|---|---|
| F1 | Dead Controls Audit & Navigation Replacement | **COMPLETED** | Completely removed boilerplate template chrome (demo merchant, bell/help, revenue tree). Replaced with real Recourse navigation & filters. Headless Puppeteer audit ran 20/20 controls with 0 errors. |
| F2 | AG Studio Analytics Explorer & AI Clarification | **COMPLETED** | Replaced mock OpenAI proxy affordance with embedded AG Grid Community 36.2.0 table directly bound to live Recourse endpoints. Documented Groq compatibility decision in `docs/decisions.md`. |
| F3 | Replay IDs & Honest Labeling Alignment | **COMPLETED** | Removed all synthetic placeholders (`ORDER-REPLAY-*`, `CAPTURE-REPLAY-*`, `REPLAY_REFUND_SIMULATED`). Replay directly outputs real recorded sandbox IDs (`4YY66781YU2917137`, `4JS10478D8056260X`, `8KC65034CE698390J`, `22X59480TL380680H`). |
| F4 | AI Touchpoint Proof & Multi-Step Agent Tool-Calling | **COMPLETED** | Raw log lines with model, latency, and tokens added for: (1) Mandate parse, (2) Shopper agent tool-calling (`search_catalog` -> `propose_cart` -> `checkout_via_guard`), (3) Resolver case text, (4) Defender narrative. |
| F5 | Palette Strictness & Reset Idempotency | **COMPLETED** | Strict semantic colors: Green = ALLOW only, Amber = REQUIRE_APPROVAL only, Red = BLOCK only. Fixed Jacket chip. Reset is idempotent. 24h ISO timestamps standardized. |
| F6 | Live Dry Run to Filing Checkpoint | **IN PROGRESS (NEEDS USER)** | Executed fresh live dry run (`scripts/live-dry-run.ts`): Mandate A parsed via Live Groq LLM, Tent ($45 ALLOW), Jacket ($38 ALLOW), Pack ($55 REQUIRE_APPROVAL -> Approved), Headphones ($129 BLOCK), Receipt Chain verified. Reached filing checkpoint on Capture `48725438S2363071K`. |
| F7 | Hosted Demo Spec & Render Verification | **COMPLETED** | `render.yaml` pinned to Node 20.18.0 with `REPLAY_ONLY=true`. Verified local isolation with `env -i REPLAY_ONLY=true`: mutating endpoints return 403, replay runs cleanly. |
| F8 | Documentation & Verification | **COMPLETED** | Documentation updated across `README.md`, `docs/SUBMISSION.md`, `docs/RECORDING.md`, `docs/STATUS.md`. Tests passing (26/26), `next build` clean, secret scan clean. |

## Acceptance Status
- **Spike 1 (Vault & Unattended Orders):** PASS (Vault setup token -> payment token `57h784950k031805d` -> unattended order capture `76D72760UE464141G`)
- **Spike 2 (Dispute Polling & Settlement):** PASS (Polling detected `PP-R-XFQ-10198901`; `accept-claim` `200 OK`; live refund ID `22X59480TL380680H`; capture `24185227UU994700W` transitioned to `REFUNDED`)
- **Live Contested Claim:** PASS (Polling detected `PP-R-RGO-10199647`; `send-message` `200 OK`; status transitioned to `WAITING_FOR_BUYER_RESPONSE`; defense statement built strictly from stored DB records)
- **Unit Tests:** PASS (26/26 passing in Vitest across Guard, Receipts, and Disputes)
- **Golden Path (`npm run demo` & `--replay`):** PASS (All scenarios passing, receipt chain verified, per-scenario data source labeled)
- **Headless Browser Control Audit:** PASS (20/20 controls pass with zero console errors)

---

### Headless Browser Control Verification (F1 Audit Table)

| Page | Control | Type | Status | Verified Effect |
| :--- | :--- | :--- | :---: | :--- |
| `/` | **REPLAY FIXTURE Mode Button** | Button | `PASS` | Switched application mode to Replay Fixture (replayMode=true) |
| `/` | **LIVE SANDBOX Mode Button** | Button | `PASS` | Switched application mode to Live Sandbox (replayMode=false) |
| `/` | **Reset Demo State Button** | Button | `PASS` | Called /api/demo/reset: cleared tables, seeded merchants/products, and created clean Mandate A |
| `/` | **Scenario 1: Approved purchase (Larkspur Tent)** | Button | `PASS` | AI Shopper tool-calling checkout executed -> ALLOW ($45.00), order and receipt created |
| `/` | **Scenario 2: Item not as described (Ridgeback Jacket)** | Button | `PASS` | AI Shopper tool-calling checkout executed -> ALLOW ($38.00 green chip), receipt hash locked |
| `/` | **Scenario 3: Human approval flow (Expedition Pack)** | Button | `PASS` | Guard Soft Gate triggered -> opened Human Approval Gate modal ($55.00 > $50 threshold) |
| `/` | **Modal Action: Approve Purchase ($55.00)** | Modal Button | `PASS` | Recorded human approval in receipt audit bundle and executed checkout -> COMPLETED |
| `/` | **Scenario 4: Blocked purchase (AudioPro Headphones)** | Button | `PASS` | Guard blocked purchase (CATEGORY_NOT_ALLOWED, MERCHANT_NOT_ALLOWED, OVER_PER_PURCHASE_CAP) |
| `/` | **Step 3: Advance Demo Clock (+3.5 Days)** | Button | `PASS` | Advanced virtual demo clock +3.5 days, triggered fulfillment simulation & delivery inspection |
| `/` | **Tab: Cryptographic Receipt Chain** | Tab Button | `PASS` | Switched main center pane to interactive SHA-256 Receipt Chain Inspector with JWS verifier |
| `/` | **Tab: Disputes & EV Settlement** | Tab Button | `PASS` | Switched main center pane to Dispute Defense & Expected Value Optimization Inspector |
| `/` | **Operations Dashboard Link** | Link | `PASS` | Direct link to /dashboard (Recourse Operations Dashboard) |
| `/dashboard` | **Sidebar: Operations & KPIs** | Navigation Button | `PASS` | Smooth-scrolled to #operations KPI tiles (Recovered $, Defended $, Blocked $, Spend vs Cap) |
| `/dashboard` | **Sidebar: Purchases & Receipts (AG Grid)** | Navigation Button | `PASS` | Smooth-scrolled to #purchases AG Grid Community table |
| `/dashboard` | **Sidebar: Guard Decisions Matrix** | Navigation Button | `PASS` | Smooth-scrolled to #guard-decisions evaluation breakdown panel |
| `/dashboard` | **Sidebar: Disputes & Defense** | Navigation Button | `PASS` | Smooth-scrolled to #disputes PayPal dispute timeline and EV analysis panel |
| `/dashboard` | **Decision Filter: ALLOW only** | Filter Button | `PASS` | Filtered AG Grid rows to ALLOW-only purchases (Tent & Jacket) |
| `/dashboard` | **Decision Filter: Show All** | Filter Button | `PASS` | Reset AG Grid filter to display all executed purchases |
| `/dashboard` | **TopBar Refresh Button (↻ Refresh Data)** | Button | `PASS` | Triggered instant live analytics re-fetch across purchases, KPIs, and disputes |
| `/dashboard` | **Return to Cockpit Link (← Demo Console)** | Link | `PASS` | Active link pointing to / (Demo Console Cockpit) |

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
| Order | `0V817837K2473284D` | $45.00 | Live Dry Run | Mandate A (Tent) | `COMPLETED` | Live dry run approved purchase |
| Capture | `2YC315038C753571A` | $45.00 | Live Dry Run | Order `0V817837K2473284D` | `COMPLETED` | Live sandbox capture |
| Order | `4NR28859YC9045307` | $38.00 | Live Dry Run | Mandate A (Jacket) | `COMPLETED` | Live dry run defective purchase |
| Capture | `48725438S2363071K` | $38.00 | Live Dry Run | Order `4NR28859YC9045307` | `COMPLETED` | Target of pending live dispute (NEEDS USER filing) |
| Order | `66485307KV105180M` | $55.00 | Live Dry Run | Mandate A (Expedition Pack) | `COMPLETED` | Live dry run human approval flow |
| Capture | `4T796483EG502433F` | $55.00 | Live Dry Run | Order `66485307KV105180M` | `COMPLETED` | Live sandbox capture post-approval |

### Notes on Specific Transactions
1. **Explanation of Refund `8CL74127HE2561626` ($45.00 USD):**
   - In Spike 2, to determine which PayPal API call yields an actual refund before building agent logic, `POST /v2/payments/captures/4MW82925T2060654E/refund` was invoked directly via API against a test capture. It returned `201 Created` with refund ID `8CL74127HE2561626`, proving that direct capture refund moves money immediately.
2. **Current State of Dispute `PP-R-SQO-10196995` ($45.00 USD):**
   - Reason: `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`
   - Status: `UNDER_REVIEW` (`dispute_state: "UNDER_PAYPAL_REVIEW"`, `dispute_life_cycle_stage: "CHARGEBACK"`).
   - Seller response was submitted on 2026-11-11 via `POST .../provide-evidence` with `evidence_type: "OTHER"`.
   - The dispute is awaiting PayPal sandbox internal review. Per Decision Log 2026-11-11, this dispute is excluded from production fixtures and demo assets.
