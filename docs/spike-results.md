# PayPal Sandbox Spike Results

This document records the actual behavior, request/response shapes, field structures, and quirks discovered when executing spike scripts against the live PayPal Sandbox API.

---

## Spike 1: Vault Consent & Unattended Order Capture (`scripts/spike-1-vault-order.ts`)
*Status: COMPLETED (Verified against PayPal Sandbox)*

### Account Setup & Critical Environmental Requirements (README Troubleshooting)
- **Country Observation:**
  - **Observed:** vault approval failed with an India buyer and worked with US buyer and merchant; cause not isolated.
  - **Account Role Separation:** The buyer account must be a Sandbox **Personal** account (`...personal.example.com`), distinct from the merchant business account (`...business.example.com`). PayPal prohibits an account from executing transactions or vaulting agreements against itself.
  - **Browser Environment (Unverified Hypothesis):** Opening approval links in an **Incognito / Private window** was used to avoid possible session/cookie collisions between the Developer Dashboard and Sandbox checkout.
  - **Session Expiration (Unverified Hypothesis):** Setup tokens and checkout approval tokens may expire within 15–30 minutes in the sandbox environment.

### Observed API Findings & Response Shapes
1. **Setup Token Query (`GET /v3/vault/setup-tokens/{id}`):**
   - After buyer approval in browser, status transitions to `"APPROVED"`.
   - Response includes:
     - `customer.id`: `"qyKatysRMd"`
     - `payment_source.paypal.email_address`: `"[REDACTED_BUYER_EMAIL]"`
     - `payment_source.paypal.payer_id`: `"[REDACTED_BUYER_PAYER_ID]"`
     - Links include `rel: "self"` (`GET`) and `rel: "self"` (`POST /v3/vault/payment-tokens`).

2. **Payment Token Exchange (`POST /v3/vault/payment-tokens`):**
   - Payload:
     ```json
     {
       "payment_source": {
         "token": {
           "id": "1UB45166SM8396537",
           "type": "SETUP_TOKEN"
         }
       }
     }
     ```
   - Returned `201 Created` with:
     - Permanent Payment Token ID (Vault ID): `"57h784950k031805d"`
     - `customer.id`: `"qyKatysRMd"`
     - `payment_source.paypal`: email, payer ID, and customer name (`John Doe`).
     - Links include `GET` token details and `DELETE` token.

3. **Unattended Checkout with Stored Vault ID (`POST /v2/checkout/orders`):**
   - Payload structure:
     ```json
     {
       "intent": "CAPTURE",
       "purchase_units": [
         {
           "reference_id": "default",
           "amount": { "currency_code": "USD", "value": "45.00", "breakdown": { "item_total": { "currency_code": "USD", "value": "45.00" } } },
           "items": [{ "name": "Larkspur Trail 2-Person Tent", "unit_amount": { "currency_code": "USD", "value": "45.00" }, "quantity": "1", "category": "PHYSICAL_GOODS" }]
         }
       ],
       "payment_source": {
         "paypal": {
           "vault_id": "57h784950k031805d"
         }
       }
     }
     ```
   - **Crucial Finding:** The order returns with `status: "COMPLETED"` **immediately**.
   - No secondary call to `POST /v2/checkout/orders/{id}/capture` is necessary or possible.
   - **Capture ID location:** The transaction capture ID sits exactly at:
     `order.purchase_units[0].payments.captures[0].id`
   - Verified live values:
     - Order ID: `"5GS32993858853423"`
     - Capture ID: `"76D72760UE464141G"`
     - Capture Status: `"COMPLETED"`
     - Gross: `$45.00 USD`, Fee: `$2.06 USD`, Net: `$42.94 USD`
     - Seller Protection: `"ELIGIBLE"` (`ITEM_NOT_RECEIVED`, `UNAUTHORIZED_TRANSACTION`)
     - Payer: `John Doe` (`[REDACTED_BUYER_EMAIL]`, Payer ID: `[REDACTED_BUYER_PAYER_ID]`)

4. **Conclusion for Architecture:**
   - Flow A (Vault setup token -> payment token -> unattended capture) works seamlessly and deterministically in sandbox without any fallback required.
   - Orders with `vault_id` auto-capture into `COMPLETED` on creation, providing the exact `captureId` needed for tamper-evident receipt bundling and downstream disputes.

---

## Spike 2: Sandbox Dispute Lifecycle (`scripts/spike-2-disputes.ts`)
*Status: COMPLETED (Verified against PayPal Sandbox)*

### Full Live Dispute Objects & Verified API Behavior

#### 1. S3 Jacket Dispute: `PP-R-XFQ-10198901` (Accept / Refund Path)
- **Dispute ID:** `PP-R-XFQ-10198901`
- **Capture ID:** `24185227UU994700W` (Order: `4JS10478D8056260X`)
- **Reason:** `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`
- **Initial Status:** `UNDER_REVIEW` (`dispute_state: "UNDER_PAYPAL_REVIEW"`, `dispute_life_cycle_stage: "INQUIRY"`)
- **Gross Amount:** `$38.00 USD` (Merchant hold placed: `$36.18 USD`)
- **Buyer Message:** `"I received an item that is different from described. The Ridgeback jacket I received does not match the item description provided by the seller."`
- **Allowable Responses & Links:** Initially `rel: "self"`.
- **Defender Action Taken:**
  - `POST /v1/customer/disputes/PP-R-XFQ-10198901/accept-claim` with payload:
    ```json
    {
      "note": "Recourse Defender accepted claim based on delivery inspection discrepancy.",
      "accept_claim_reason": "NOT_ABLE_TO_WIN"
    }
    ```
  - **Status:** `200 OK`.
- **Two-Way Outcome Verification:**
  1. **Dispute Status (`GET /v1/customer/disputes/PP-R-XFQ-10198901`):**
     - `transaction_status`: `"REFUNDED"`
     - `evidence[1].action_info`: `{"action": "ACCEPT_CLAIM", "response_option": "REFUND"}`
     - `refund_details.transactions[0].id`: `"22X59480TL380680H"`
     - `money_movements`: Debit `$38.00` from merchant, credit `$38.00` to buyer.
  2. **Capture Status (`GET /v2/payments/captures/24185227UU994700W`):**
     - `status`: `"REFUNDED"`
     - Gross: `$38.00 USD`, Fee: `$1.82 USD`, Net: `$36.18 USD`.
- **Replay Fixture:** Saved to `data/fixtures/recorded-sandbox-disputes.json` labeled `"recorded sandbox data"`.

#### 2. S5 Tent Dispute: `PP-R-SQO-10196995` (Contest Path)
- **Dispute ID:** `PP-R-SQO-10196995`
- **Capture ID:** `76D72760UE464141G` (Order: `5GS32993858853423`)
- **Reason:** `MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED`
- **Stage 1 (Inquiry Stage):**
  - Actions available: `send-message`, `escalate`.
  - `POST /v1/customer/disputes/{id}/send-message` succeeded (`200 OK`). Defense note added to `messages[]`.
  - `POST /v1/customer/disputes/{id}/escalate` succeeded (`200 OK`). State transitioned to `REQUIRED_ACTION` / `WAITING_FOR_SELLER_RESPONSE` (`dispute_life_cycle_stage: "CHARGEBACK"`).
  - Calling `provide-evidence` or `adjudicate` in Stage 1 returned `400: ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`.
- **Stage 2 (Seller Response / Chargeback Stage):**
  - Links available: `accept_claim`, `provide_evidence`.
  - Due date: `2026-11-18T04:59:59.000Z`.
  - Evidence requested: `["OTHER", "PROOF_OF_REFUND"]`.
  - Calling `POST /v1/customer/disputes/PP-R-SQO-10196995/provide-evidence`:
    - Calling with `evidence_type: "PROOF_OF_FULFILLMENT"` failed with `400: EVIDENCE_TYPE_IS_NOT_ALLOWED` because PayPal specifically requested type `"OTHER"` for this claim.
    - Calling with payload:
      ```json
      {
        "evidences": [
          {
            "evidence_type": "OTHER",
            "notes": "Merchant audit defense: Purchase authorized via signed mandate JWS. Receipt SHA-256 hash verified. Item delivered in pristine condition matching catalog specification."
          }
        ]
      }
      ```
      **Succeeded with `200 OK`!**
  - Status transitioned to: `status: "UNDER_REVIEW"`, `dispute_state: "UNDER_PAYPAL_REVIEW"`, with evidence added under `action_info: {"action": "PROVIDE_EVIDENCE"}`.
  - Sandbox `POST /v1/customer/disputes/{id}/adjudicate`:
    - Returned `400: ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE` across both inquiry and review stages. In PayPal sandbox, adjudicate requires specific internal mock conditions not exposed on standard REST apps.
- **Contest Path Summary:** The contest path works programmatically via `send-message` (inquiry stage) and `provide-evidence` (chargeback stage). Full cryptographic audit defense (mandate JWS + receipt SHA-256 hash) is committed into PayPal's dispute record.

---

## Live Contested Claim Verification: Tent Dispute (`PP-R-RGO-10199647`)
*Status: COMPLETED (Verified live against PayPal Sandbox)*

- **Dispute ID:** `PP-R-RGO-10199647`
- **Target Transaction:** Capture `7BH91632Y92698500` (Order `4YY66781YU2917137`, Larkspur Trail 2-Person Tent, $45.00 USD)
- **Simulated Buyer Ground:** User submitted a simulated buyer dispute stating *"The tent I received does not match the online product listing description; it is a completely different model and color."*
- **Resolver Evaluation:** Returned `NO_GROUNDS` (`ITEM_MATCHES_LISTING`). Stored delivery inspection confirmed pristine condition with factory seal intact.
- **Defender Evidence Scoring & EV:**
  - $p_{\text{win}} = 0.95$ (backed by Mandate JWS and pristine delivery record).
  - $\text{EV}_{\text{contest}} = -3.00$ vs $\text{EV}_{\text{accept}} = -45.00$ (modeled dispute handling fee: $15.00).
  - Deterministic Policy: `CONTEST`.
- **Evidence Construction:** Cites only facts stored in SQLite:
  `"Mandate JWS verified (hash: 1bf1243347d65130...). Deterministic Guard ALLOW. Receipt bundle cryptographically locked at purchase (SHA-256: a5bddaf6d6206cee...). Simulated delivery record (sandbox): carrier USPS, tracking 940016136261526288224, status DELIVERED, condition PRISTINE."`
- **Action Taken:** `POST /v1/customer/disputes/PP-R-RGO-10199647/send-message` (`200 OK`).
- **Post-Submission State:** Status moved from `WAITING_FOR_SELLER_RESPONSE` to `WAITING_FOR_BUYER_RESPONSE`.
- **Display Status:** `"evidence submitted, under PayPal review (sandbox cannot adjudicate)"`.
- **Accounting:** Tracked as **Defended $45.00 pending PayPal decision**.

---

## Spike 3: Webhook Registration & Verification (`scripts/spike-3-webhooks.ts`)
*Status: Pending Phase 1 execution*

- **Webhook Registration / ID:**
- **Signature Verification (`POST /v1/notifications/verify-webhook-signature`):**
- **Event Simulation (`POST /v1/notifications/simulate-event`):**
- **Polling Fallback Behavior:**
- **Field Findings & Deviations:**

