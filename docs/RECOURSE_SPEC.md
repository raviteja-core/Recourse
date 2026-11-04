# RECOURSE — Build Reference for the AI Coding Agent

> Read this whole file before writing code. It is the source of truth for scope, architecture, PayPal integration, agent design, demo scenarios, and definition of done. Where this file says **VERIFY**, do not trust it or your memory: fetch the linked PayPal docs, run a spike script against the sandbox, and record the real behavior in `docs/spike-results.md`. If reality differs from this spec, follow reality and note the change in `docs/decisions.md`.

---

## 0. Situation and hard constraints

- **What this is:** an entry in the *PayPal AI Hackathon* (Devpost: "Build What's Next with PayPal and AI"). The goal is to **win** it.
- **Deadline:** Nov 12, 2026, 12:00 pm Pacific (= Nov 13, 01:30 AM IST). Plan to submit at least a day early. **Time is short (about a week). Scope discipline matters more than ambition.**
- **Required:** the project must *meaningfully* use PayPal's developer platform (sandbox only, no real money) **and** AI. It must be a **working** prototype. Mockups and static demos are disqualifying.
- **Judging (5 equally weighted criteria):**
  1. Technological Implementation: how deeply and skillfully PayPal APIs and AI are used; non-trivial, working.
  2. Design: a complete, coherent product experience, not only a tech proof.
  3. Potential Impact: a credible, specific real problem for a real audience.
  4. Innovation/Idea: novel versus existing concepts.
  5. Presentation: a video under 3 minutes showing the product working end to end.
- Stage 1 is pass/fail on "fits theme and applies the required APIs". Judging may include automated AI analysis of the submission, and judges may score from text, images and the video alone. **The README and the video matter as much as the code.**
- **Submission requirements** (all must be satisfiable by the repo):
  - Public repo with an **open-source LICENSE** visible in the GitHub About section (use MIT or Apache-2.0).
  - Complete setup and run instructions in the README **and/or** a hosted demo URL. Judges must be able to run it.
  - Text description, list of tools and how they were used, public YouTube demo video (<3 min).
  - No third-party trademarks or copyrighted music in the video. **Use fictional merchant names. Do not use other companies' logos.**
- The hackathon allows one sponsor prize on top of one main prize. **Our sponsor target is AG Grid** (dashboard built with AG Studio). See §9.

---

## 1. The product in one paragraph

AI agents can now shop for us, but nobody has built what happens when an agent buys the wrong thing. **Recourse** is a mandate-and-dispute safety net on PayPal. A person gives an AI agent a **spending mandate** in plain English ("up to $150 on outdoor gear, from these sellers, until Friday"). The mandate is signed and the user approves their PayPal once (vault consent). The agent then shops and checks out **without the buyer present**, but every checkout passes a deterministic **Mandate Guard**. Each purchase stores a tamper-evident **receipt bundle** (mandate hash, cart, reasoning, PayPal order and capture IDs). When something goes wrong (not as described, never arrived), a **Resolver agent** builds the case and opens a **PayPal dispute** with that evidence. On the merchant side a **Defender agent** receives the dispute webhook, pulls the authorization and fulfillment evidence, decides whether to contest, offer a partial refund, or accept, and submits it through the PayPal Disputes API. A **control-tower dashboard** (AG Studio) shows mandates, spend against caps, blocked purchases, dispute lifecycle and dollars recovered.

**Tagline:** *"AI agents can spend your money. Recourse is what happens when they get it wrong."*

**Audiences:** (a) consumers delegating shopping to agents who want a safety net; (b) merchants who fear that agent-initiated orders will create chargebacks and who can now prove authorization.

**Why PayPal is central:** PayPal's moat is trust after the click (buyer protection, disputes). PayPal publicly supports the AP2 mandate model and says mandates give merchants stronger dispute protection. This project builds the missing working layer on PayPal rails. **Do not claim AP2 compliance. Describe it as "AP2-inspired".**

**Core design principle: LLMs propose, deterministic code disposes.** No LLM ever moves money directly. The Guard, the scoring rubric and the money calls are plain code. The LLM parses, plans, reasons and explains.

---

## 2. Priorities and cut line (read this before planning)

Because of the short deadline, build in this order. **Never cut P0.**

| Priority | Feature |
|---|---|
| **P0** | Sandbox auth; vault consent (or fallback, §5.4); mandate parse + sign; Mandate Guard (+unit tests); catalog + shopping agent; guarded checkout via PayPal Orders; receipt bundles; one complete dispute lifecycle (Resolver opens → Defender responds → sandbox adjudicate → refund visible); minimal dashboard; README; license; demo script runner |
| **P1** | Second dispute scenario (not delivered, Defender *accepts*); webhook signature verification; polling fallback; tracking added to PayPal; AG Studio polish + custom widgets; hosted deploy |
| **P2** | Third scenario (false "unauthorized" claim, Defender contests and wins using the mandate); natural-language analytics via the Studio agent; human-approval flow UI; merchant reliability scoreboard |

If time is short, cut P2 first, then P1 items from the bottom up. Tell the user what you cut.

---

## 3. Architecture

```
                         ┌──────────────────────────────┐
  User (web UI) ───────► │  Recourse Web App (React)     │
                         │  - Mandate composer           │
                         │  - Agent chat / activity      │
                         │  - Control tower (AG Studio)  │
                         └──────────────┬───────────────┘
                                        │ REST/SSE
                         ┌──────────────▼───────────────┐
                         │  Recourse API (Node/TS)       │
                         │  ├─ mandate/   parse, sign    │
                         │  ├─ guard/     rules engine   │
                         │  ├─ agents/    shopper,       │
                         │  │             resolver,      │
                         │  │             defender       │
                         │  ├─ paypal/    thin client    │
                         │  ├─ merchants/ catalog +      │
                         │  │             fulfillment sim│
                         │  ├─ receipts/  hash-chained   │
                         │  ├─ webhooks/  verify + route │
                         │  └─ db/        SQLite         │
                         └───────┬───────────┬──────────┘
                                 │           │
                 PayPal Sandbox APIs      LLM provider
        (oauth, vault, orders, trackers,   (provider-agnostic
         disputes, webhooks)                via AI SDK)
```

### 3.1 Stack (defaults; adapt to the AG Grid boilerplate)

- **First step:** inspect the official boilerplate `https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate`. It has AG Studio and PayPal pre-wired. **Adopt its structure and framework** rather than starting from scratch, unless it blocks the architecture above.
- **Language:** TypeScript everywhere. Node 20+.
- **Frontend:** React (whatever the boilerplate uses).
- **Backend:** Node (Express or the framework the boilerplate uses). Keep PayPal secrets server-side only.
- **DB:** SQLite (`better-sqlite3`) so judges can run with zero infrastructure. Include a `seed` script.
- **LLM layer:** Vercel AI SDK (`ai`) with a provider switch via env (`LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`) so it works with whichever key the user has. Use structured output (Zod schemas) for every LLM call that feeds code.
- **PayPal:** a thin typed client over REST (`fetch`) for everything. Optionally use `@paypal/agent-toolkit` (`npm i @paypal/agent-toolkit`, `ai-sdk` integration) for the shopper's order and invoice tools, to visibly use PayPal's agent tooling. Money-moving calls in the Guard path should still go through our own client so the Guard stays deterministic.
- **Signing:** `jose` (ES256 JWS) for mandates. SHA-256 hash chain for receipts.
- **Tests:** Vitest. At minimum, unit tests for Guard and receipt chaining.

### 3.2 Repo layout

```
recourse/
  README.md                 # judges read this first (see §12)
  LICENSE                   # MIT or Apache-2.0
  AGENTS.md                 # short pointer to docs/RECOURSE_SPEC.md + rules
  .env.example
  docs/
    RECOURSE_SPEC.md        # this file
    spike-results.md        # real PayPal behavior learned in spikes
    decisions.md            # deviations and why
    architecture.png|md
  scripts/
    spike-1-vault-order.ts
    spike-2-disputes.ts
    spike-3-webhooks.ts
    seed.ts
    demo.ts                 # runs the golden path headlessly (the acceptance test)
  server/ (api)  web/ (ui)  # or the boilerplate's layout
```

---

## 4. Data model (SQLite)

Keep it small. Suggested tables (add columns as needed):

- `users(id, name, paypal_customer_id, vault_token_id, vault_status)`
- `mandates(id, user_id, nl_text, constraints_json, status[active|revoked|expired], signed_jws, hash, created_at, expires_at, spent_total)`
- `merchants(id, name, profile[reliable|sloppy|unreliable], default_ship_days)`  *(fictional, §8)*
- `products(id, merchant_id, title, description, category, price, currency, attributes_json)`  *(attributes such as `waterproof:true` are the ground truth used in disputes)*
- `carts(id, mandate_id, items_json, total, status, guard_decision_json)`
- `orders(id, cart_id, paypal_order_id, paypal_capture_id, status, amount, created_at)`
- `fulfillments(id, order_id, carrier, tracking_number, status, events_json, delivery_report_json)`
- `receipts(id, order_id, mandate_hash, bundle_json, prev_hash, hash, created_at)`
- `disputes(id, order_id, paypal_dispute_id, reason, status, opened_by, evidence_json, offer_json, outcome, refunded_amount, created_at, updated_at)`
- `agent_events(id, actor[shopper|guard|resolver|defender|system], type, payload_json, reasoning_text, created_at)`  *(feeds the dashboard's activity log)*
- `webhook_events(id, paypal_event_id, event_type, payload_json, verified, processed_at)`

---

## 5. PayPal integration spec

**Sandbox base URL:** `https://api-m.sandbox.paypal.com`. Never hardcode production. Config via env.

### 5.1 Auth

`POST /v1/oauth2/token`, Basic auth (client id : secret), body `grant_type=client_credentials`. Cache the token and refresh before expiry (sandbox tokens last hours, not days). Retry once on 401.

### 5.2 Idempotency and logging

- Send a `PayPal-Request-Id` header (UUID, stored with the cart or order) on create calls so retries don't double-charge.
- Log every PayPal request and response (redact tokens and secrets) to `agent_events` or a debug log. Store `PayPal-Debug-Id` from responses for troubleshooting.

### 5.3 Flow A (primary): vault once, then unattended orders

1. **Account setup (manual, user already did most of it):** the sandbox business account must have **"Save payment methods"** enabled (Dashboard, sandbox business account, Payment capabilities). A sandbox personal (buyer) account is needed.
2. **Consent:** create a **setup token** (`POST /v3/vault/setup-tokens`, `payment_source.paypal`, `usage_type: "MERCHANT"`, with `experience_context` return and cancel URLs) → redirect the buyer to the approve link → on return, exchange it for a **payment token** (`POST /v3/vault/payment-tokens`, `payment_source.token = {id: <setup_token_id>, type: "SETUP_TOKEN"}`). Store `payment_token.id` and `customer.id` on the user. **VERIFY** exact fields against the docs.
   - Docs: https://developer.paypal.com/api/payment-tokens/save-without-purchase/paypal
   - Alternative (vault on first purchase): https://developer.paypal.com/sdk/js/save-with-purchase/paypal
3. **Unattended purchase (human not present):** `POST /v2/checkout/orders` with `intent: "CAPTURE"`, a single `purchase_units[]` for the cart (amount breakdown, `custom_id` = our order id, `invoice_id` unique), and `payment_source.paypal.vault_id = <payment_token.id>`. **VERIFY** the exact shape including any `stored_credential` fields. With a vault token the order may come back `COMPLETED` immediately; check status before calling `/capture`. Save `order.id` and the `capture.id` from `purchase_units[0].payments.captures[0]`.
4. Webhooks of interest: `VAULT.PAYMENT-TOKEN.CREATED`, `PAYMENT.CAPTURE.COMPLETED`.

### 5.4 Flow B (fallback if vaulting misbehaves in the sandbox): authorize the budget, capture per purchase

Buyer approves an order with `intent: "AUTHORIZE"` for the mandate's total cap. Each agent purchase performs a **partial capture** against that authorization (`POST /v2/payments/authorizations/{id}/capture` with an `amount`, `final_capture: false`). Authorization validity is limited (days), so re-authorize if needed. **VERIFY** limits (max captures, honor period) in docs and record them in `docs/spike-results.md`. Use this only if Flow A fails; tell the user.

### 5.5 Shipment tracking (P1)

When the fulfillment simulator "ships" an order, add tracking to the PayPal transaction (Shipment Tracking API, `POST /v1/shipping/trackers-batch`, with `transaction_id` = capture id, `tracking_number`, `carrier`, `status`). **VERIFY.** This both uses more of PayPal and gives the Defender real tracking evidence.

### 5.6 Disputes (the heart of the demo)

Docs to read first (fetch them; do not guess):
- Integration guide (includes **sandbox-only** methods): https://developer.paypal.com/docs/disputes/integration-guide
- API reference: https://developer.paypal.com/api/customer-disputes/v1/
- Test values: https://developer.paypal.com/platforms/disputes/reference/dispute-api-test-values.md

Capabilities confirmed in the docs: in the sandbox you can **create a dispute** (requires set-up buyer-side credentials), **update dispute status**, and **settle (adjudicate)** a dispute; you can **provide evidence**, **make an offer**, **accept a claim**, **appeal**, **send messages**, and read disputes. Merchants cannot create disputes in live, but they can in the sandbox, which is why our demo can run the full lifecycle.

Endpoints to wire (paths under `/v1/customer/disputes`; **VERIFY** each):
- `GET /` list, `GET /{id}` show
- `POST /` create (sandbox) with the buyer-side setup from the guide: reason, `disputed_transactions[{seller_transaction_id: <capture id>}]`, amount, messages. Our **Resolver** performs this step.
- `POST /{id}/provide-evidence` (multipart: JSON `input` + optional files; evidence types include proof of fulfillment, proof of delivery, receipt copy; `tracking_info`, `notes`)
- `POST /{id}/make-offer` (offer types such as refund, refund with return; `offer_amount`)
- `POST /{id}/accept-claim`
- `POST /{id}/send-message`
- Sandbox-only: `POST /{id}/adjudicate` (outcome buyer-favor or seller-favor) and the require-evidence / status-update call. Needed to finish a case without PayPal staff.

Webhooks: `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`. For **local dev without a public URL**, use the simulate-event API (`POST /v1/notifications/simulate-event`) and/or a tunnel.

**If sandbox dispute creation turns out to be unworkable via API:** document it, and fall back to creating the dispute in the sandbox buyer's Resolution Center by hand for the video, while the Resolver still generates and displays the case package. Tell the user honestly.

### 5.7 Webhooks (all)

- Endpoint `POST /api/webhooks/paypal`. Verify every event with `POST /v1/notifications/verify-webhook-signature` (needs `PAYPAL_WEBHOOK_ID`). Persist to `webhook_events` (dedupe on PayPal event id), then route to the right handler.
- **Polling fallback (P1):** a background job calling `GET /v1/customer/disputes` every ~15 s in demo mode, so the demo never depends on the tunnel being up.

### 5.8 PayPal MCP / Agent Toolkit (optional, high visibility)

- Toolkit: https://github.com/paypal/AI-Toolkit and `@paypal/agent-toolkit`; MCP server `@paypal/mcp` (needs a sandbox access token). Good for a tool-use demonstration (list transactions, disputes, invoices). Use if it adds real value; don't let it block P0.

---

## 6. The Mandate

### 6.1 Natural language to structured constraints (LLM, Zod-validated)

```ts
type MandateConstraints = {
  currency: "USD";
  totalCap: number;             // total budget
  perPurchaseCap?: number;
  approvalThreshold?: number;   // above this, require human approval
  maxPurchases?: number;
  categoriesAllow: string[];    // e.g. ["outdoor","camping"]
  categoriesDeny?: string[];
  merchantsAllow?: string[];    // merchant ids; empty = any seeded merchant
  expiresAt: string;            // ISO
  requireTracking?: boolean;
};
```

The LLM output **must** be shown to the user as an editable card for confirmation before signing. Ambiguity ("around $150") resolves to the strict reading, and the UI says so.

### 6.2 Signing

On approval, build the mandate JSON, compute `hash = sha256(canonicalJSON)`, sign as ES256 JWS with a server key (`MANDATE_SIGNING_PRIVATE_KEY`, generate one in `scripts/`). Store both. Anyone can verify the JWS with the public key (expose `/.well-known/recourse-jwks.json`).

### 6.3 Mandate Guard (pure function, heavily unit-tested)

`evaluate(mandate, cart, state) → { decision: "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK", reasons: ReasonCode[] }`

Reason codes: `SIGNATURE_INVALID`, `MANDATE_EXPIRED`, `MANDATE_REVOKED`, `OVER_TOTAL_CAP`, `OVER_PER_PURCHASE_CAP`, `MAX_PURCHASES`, `CATEGORY_NOT_ALLOWED`, `MERCHANT_NOT_ALLOWED`, `PRICE_DRIFT` (price differs from the quoted price by >N%), `CART_MISMATCH` (cart differs from what the agent proposed), `ABOVE_APPROVAL_THRESHOLD`.

Rules: verify signature first; any hard failure means BLOCK; threshold only means REQUIRE_APPROVAL. **Every** evaluation is written to `agent_events` with a plain-English explanation. The checkout function **refuses to run** without an ALLOW (or a recorded human approval).

### 6.4 Receipt bundle (tamper-evident evidence)

On each captured order, create:

```json
{
  "receiptId": "...",
  "mandateHash": "...",
  "mandateJws": "...",
  "cart": {"merchantId":"...","items":[{"sku":"...","title":"...","price":0,"attributesAtPurchase":{}}],"total":0},
  "guard": {"decision":"ALLOW","reasons":[]},
  "agentRationale": "why the agent chose this item",
  "paypal": {"orderId":"...","captureId":"...","vaultTokenId":"..."},
  "createdAt": "...",
  "prevHash": "...",
  "hash": "sha256(prevHash + canonical(bundle))"
}
```

The Defender uses this as proof the purchase was authorized and in-bounds. The Resolver uses `attributesAtPurchase` to prove "not as described".

---

## 7. The agents (all LLM calls via the provider-agnostic layer; all outputs schema-validated)

### 7.1 Shopper agent
- **Tools:** `search_catalog(query, filters)`, `get_product(id)`, `propose_cart(items)`, `checkout(cartId)` (always routes through Guard), `request_human_approval(cartId, reason)`, `get_mandate_status()`.
- **Behavior:** reads the mandate, shops, explains choices, and **may deliberately attempt** out-of-bounds items in the demo scenario so the Guard visibly blocks them. Streams its reasoning to the activity log.

### 7.2 Resolver agent (buyer side)
- **Triggers:** a fulfillment event (delivered / overdue) generates a **delivery report** (§8). The Resolver compares the report to `attributesAtPurchase` and the tracking status.
- **Tools:** `get_receipt`, `get_tracking`, `get_delivery_report`, `compare_to_listing`, `open_dispute(reason, amount, evidence)`, `send_message`.
- **Output:** a structured **Case File** (claim, reason code, facts, evidence list, requested remedy) shown in the UI **before** filing (approval by default; auto-file toggle for the demo).
- **Integrity rule:** file **only** disputes supported by recorded facts. Never invent evidence.

### 7.3 Defender agent (merchant side)
- **Trigger:** `CUSTOMER.DISPUTE.CREATED` (or polling).
- **Tools:** `get_dispute`, `get_receipt_bundle`, `get_tracking`, `get_fulfillment_log`, `score_evidence`, `provide_evidence`, `make_offer`, `accept_claim`.
- **Decision logic (deterministic core, LLM narrates):**
  - `score_evidence(dispute, receipt, fulfillment)` returns `pWin` in [0,1] from a fixed rubric: authorization proof in mandate and signature (+), delivery proof/tracking (+), item attributes match listing (+), buyer's claim contradicted by delivery report (+), contradicting facts (−).
  - `EV_contest = pWin·V − (1−pWin)·(V + fee)` vs `EV_offer = −offerAmount`, vs `EV_accept = −V` (V = order value; fee configurable). Choose the max. Offer a **partial refund** when the evidence is mixed.
  - The LLM writes the evidence narrative and the explanation of why it chose contest/offer/accept. The decision comes from the numbers.
- **Integrity rule:** submit only real stored evidence. Never fabricate tracking numbers or documents.

### 7.4 Natural-language analytics (P2)
Use AG Studio's agent framework (see §9) to let the user ask "why was order X disputed?" or "how much did the Guard save me?".

---

## 8. Merchants and fulfillment simulator (all fictional)

All simulated merchants **share one sandbox PayPal business account**. State this in the README (a real multi-seller marketplace would use PayPal's platform products, which are out of scope).

Seed three merchants (invent names; no real brands):

| Merchant | Profile | Behavior |
|---|---|---|
| **Larkspur Outdoors** | reliable | ships on time, items match listings |
| **Ridgeback Gear Co.** | sloppy | ships a **non-waterproof** jacket listed as waterproof (item not as described) |
| **Cobalt Camp Supply** | unreliable | tracking stalls, never delivers |

The simulator emits tracking events over **accelerated time** (a demo clock endpoint such as `POST /api/sim/advance?days=5`) and produces a `delivery_report` (observed attributes, condition, delivery confirmation).

### Demo scenarios (the golden path)

- **S1 Approved purchase:** the agent buys a tent from Larkspur within the mandate; the Guard ALLOWs; capture succeeds; receipt created; delivered.
- **S2 Blocked purchase:** the agent tries an out-of-category or over-cap item; the Guard BLOCKs with the reason shown. (Prevention.)
- **S3 Not as described (P0 dispute):** the Ridgeback jacket arrives non-waterproof. The Resolver opens `ITEM_NOT_AS_DESCRIBED`. The Defender scores low `pWin`, **offers a partial or full refund**, the buyer accepts or the sandbox adjudicates **buyer-favor**, and the refund shows in the sandbox buyer account. (Recourse.)
- **S4 Not delivered (P1):** Cobalt order stalls. The Resolver opens `MERCHANDISE_OR_SERVICE_NOT_RECEIVED`. The Defender finds no delivery proof and **accepts the claim**.
- **S5 False unauthorized claim (P2):** the buyer disputes an in-bounds, delivered order as unauthorized. The Defender **contests** with mandate JWS + receipt hash + tracking and the sandbox adjudicates **seller-favor**. (Merchant protection, the key merchant-side story.)

`scripts/demo.ts` must run S1 → S2 → S3 (and S4/S5 if built) end to end against the real sandbox with the demo clock, printing a clear log. It is the acceptance test and the rehearsal for the video.

---

## 9. Dashboard (control tower) — AG Grid sponsor target

AG Grid's prize rewards **polish** (custom widgets, theming, layout) and use of the **Studio Agent Framework**. Read: https://www.ag-grid.com/studio/react/quick-start/, https://www.ag-grid.com/studio/react/custom-widgets/, https://www.ag-grid.com/studio/react/ai-agents/ . A free 45-day trial license is available; put the key in `.env`.

Widgets (build P0 first):
1. **Spend vs cap** gauge per mandate (P0)
2. **Purchases grid** (AG Grid) with status, merchant, amount, receipt hash (P0)
3. **Guard decisions** (allowed / needs approval / blocked) with reason breakdown (P0)
4. **Dispute timeline/funnel** (opened → evidence → offer → resolved) (P0)
5. **Recovered $** and **Blocked $** KPI tiles (P0, the "impact" numbers for the video)
6. **Agent activity log** with reasoning (P1)
7. **Merchant reliability scoreboard** (P2)
8. A custom-themed layout with Recourse branding (P1)

The API exposes flat JSON endpoints under `/api/analytics/*` that Studio's data engine reads. Keep the data model friendly to dashboards (denormalized views are fine).

---

## 10. Backend API surface (suggested)

```
POST /api/users/:id/vault/setup        -> {approveUrl}
GET  /api/vault/return                 -> completes vaulting
POST /api/mandates/parse               -> proposed constraints (not yet signed)
POST /api/mandates                     -> sign + activate
POST /api/mandates/:id/revoke
POST /api/agent/shop                   -> run shopper (SSE stream of events)
POST /api/carts/:id/approve            -> human approval for REQUIRE_APPROVAL
GET  /api/orders  /api/receipts/:id  /api/disputes  /api/events
POST /api/disputes/:orderId/open       -> Resolver files case
POST /api/webhooks/paypal
POST /api/sim/advance?days=N           -> demo clock + fulfillment events
POST /api/demo/reset                   -> reseed
GET  /api/analytics/*                  -> dashboard data
GET  /.well-known/recourse-jwks.json
```

---

## 11. Environment and secrets

`.env.example` (commit this; **never commit `.env`**):

```
PAYPAL_ENV=sandbox
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
# buyer-side sandbox credentials needed by the dispute-creation setup (see Disputes guide)
PAYPAL_BUYER_EMAIL=
PAYPAL_BUYER_PASSWORD=
PUBLIC_BASE_URL=http://localhost:3000
LLM_PROVIDER=
LLM_MODEL=
LLM_API_KEY=
MANDATE_SIGNING_PRIVATE_KEY=
AG_GRID_LICENSE_KEY=
DATABASE_PATH=./data/recourse.db
DEMO_MODE=true
```

Rules:
- `.gitignore` must exclude `.env`, `data/*.db`, key files. **The repo is public.** A leaked secret is a real risk. Before every commit, make sure no secret is staged.
- Sandbox only. No real cards, no real money. Redact tokens in logs.
- Verify webhook signatures; don't trust unverified payloads.

---

## 12. README requirements (judges read this first)

Sections, in order:
1. One-line pitch + screenshot/GIF of the dashboard.
2. **The problem** (2–3 sentences) and **who it is for**.
3. **What it does** (mandate → guard → purchase → dispute → recovery) with a diagram.
4. **How PayPal is used** (a table: Vault/Payment Tokens, Orders v2, Shipment Tracking, Disputes API incl. sandbox adjudication, Webhooks, optional Agent Toolkit/MCP) and **How AI is used** (parser, shopper, resolver, defender, analytics).
5. **Quick start for judges** (≤10 steps): prerequisites, `cp .env.example .env`, how to create sandbox accounts and enable "Save payment methods", install, seed, run, **one command to run the demo** (`npm run demo`), test buyer credentials, tunnel/webhook note and the polling fallback.
6. Tech stack, AG Grid usage, what was built during the hackathon, known limitations (honest: sandbox only; shared merchant account; "AP2-inspired", not compliant).
7. License.

---

## 13. Build phases and definition of done

**Phase 0: Orient (first 30 min).** Read this file, inspect the boilerplate, create the repo skeleton, `.env` from the user's credentials (**never print secrets**). Produce a short plan and wait for the user's go-ahead.

**Phase 1: Spikes (must finish before building features).** Write and run the three scripts; record exact results, request/response shapes, and any deviations in `docs/spike-results.md`:
1. `spike-1-vault-order.ts`: setup token → buyer approval (give the user clear manual steps) → payment token → unattended order + capture.
2. `spike-2-disputes.ts`: create a sandbox dispute against a captured payment → provide evidence → make offer → adjudicate. Confirm the refund appears.
3. `spike-3-webhooks.ts`: register a webhook, receive a dispute event (simulate-event or real), verify the signature.

If a spike fails, switch to the documented fallback (§5.4, §5.6, polling), tell the user, and continue.

**Phase 2: Core engine (P0).** Mandate parse/sign, Guard + tests, catalog/seed, shopper, guarded checkout, receipts, fulfillment sim.

**Phase 3: Disputes (P0 then P1).** Resolver, Defender, scoring, webhook/polling, S3 end to end, then S4.

**Phase 4: Dashboard + polish.** AG Studio widgets, branding, deploy (any host; judges can alternatively run locally).

**Phase 5: Ship.** README, license, `npm run demo` green, hosted demo (if possible), a screenshots folder for the video, final secret scan.

**Definition of done (acceptance):**
- [ ] `npm run demo` completes S1, S2, S3 against the real PayPal sandbox with no manual steps beyond one-time vault consent.
- [ ] Guard unit tests pass, including every reason code.
- [ ] A refund from the dispute is visible on the sandbox buyer account.
- [ ] Dashboard shows live data from the run (spend vs cap, blocked purchases, dispute timeline, recovered $).
- [ ] README quick start works from a fresh clone.
- [ ] No secrets in git history; LICENSE present; repo public.

---

## 14. Video storyboard (design the UI so each beat is clean on screen; total <3:00)

1. **0:00–0:15 Hook:** "AI agents can now spend your money. What happens when they get it wrong?"
2. **0:15–0:45 Mandate:** type the plain-English mandate → parsed card → approve PayPal once.
3. **0:45–1:15 Agent shops:** approved purchase (S1); a **blocked** purchase with the Guard's reason (S2).
4. **1:15–2:15 Things go wrong:** jacket arrives not waterproof → Resolver's case file → dispute opened → Defender's evidence score and choice → resolution → refund appears.
5. **2:15–2:45 Merchant side + dashboard:** receipts prove authorization; KPIs "Recovered $" and "Blocked $".
6. **2:45–3:00 Close:** who it's for, why PayPal, "trust after the click for the agent era".

---

## 15. Rules of engagement for the AI agent

1. Spike first. Never assume a PayPal field exists. Read the docs, run the call.
2. Keep money movement in deterministic code; LLM outputs are validated by schemas before use.
3. Ask the user before: installing heavy dependencies, changing the architecture, cutting P0, or anything touching real accounts.
4. Never print, log, or commit secrets. Never paste the client secret into chat.
5. Prefer the smallest working version of each feature, and keep the demo path always runnable (green `npm run demo`) from Phase 2 onward.
6. Update `docs/decisions.md` for every deviation, and keep a running checklist of §13 in the plan.
7. Be honest in the README about limits. Don't overclaim (no "AP2 compliant", no "production ready").

---

## 16. Reference links

- Hackathon: https://paypalaihackathon.devpost.com/ (rules, resources)
- PayPal developer docs: https://developer.paypal.com/ · REST API: https://developer.paypal.com/api/rest/
- PayPal AI docs: https://docs.paypal.ai/ · Agent Toolkit: https://github.com/paypal/AI-Toolkit , https://github.com/paypal/agent-toolkit
- Orders v2, Vault (Payment Method Tokens v3): see §5.3 links
- Disputes: guide + API + test values in §5.6
- Webhooks: https://developer.paypal.com/api/webhooks/overview
- Sandbox getting-started repo: https://github.com/paypaldev/getting-started-with-paypal-sandbox
- AG Grid boilerplate: https://github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate · AG Studio docs: §9
- AP2 (PayPal's support announcement): https://developer.paypal.com/community/blog/PayPal-Agent-Payments-Protocol/