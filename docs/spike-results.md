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

### Observed API Behavior & Lifecycle Findings
1. **Dispute Polling (`GET /v1/customer/disputes`):**
   - Polling successfully retrieved the active dispute filed via Resolution Center.
   - Identified Dispute ID: `"PP-R-SQO-10196995"`
   - `reason`: `"MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"`
   - `status`: `"UNDER_REVIEW"`
   - `dispute_state`: `"UNDER_PAYPAL_REVIEW"` (transitions to `"REQUIRED_OTHER_PARTY_ACTION"` upon escalation)
   - `dispute_life_cycle_stage`: `"INQUIRY"`
   - `dispute_amount`: `{"currency_code": "USD", "value": "45.00"}`
   - `disputed_transactions`:
     - `seller_transaction_id`: `"76D72760UE464141G"` (Capture ID)
     - `buyer_transaction_id`: `"9BK04809FG933510S"`
     - `transaction_status`: `"HELD"`
     - `fund_movements`: Debit hold placed on merchant for `$42.94 USD` (gross minus fee).

2. **Contesting Dispute via Merchant Messaging (`POST /v1/customer/disputes/{id}/send-message`):**
   - Successfully posted merchant defense message (`200 OK`).
   - The message is immediately stored in the dispute record under `messages[]` with `posted_by: "SELLER"`.

3. **Escalating from Inquiry to Claim (`POST /v1/customer/disputes/{id}/escalate`):**
   - Escalation succeeded with `200 OK`.
   - Dispute state transitioned to `"REQUIRED_OTHER_PARTY_ACTION"`.

4. **Provide Evidence & Adjudication Restrictions:**
   - Calling `POST /v1/customer/disputes/{id}/provide-evidence` or `/adjudicate` before PayPal specifically requests evidence returned `400/422: {"issue": "ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE"}`.
   - Per PayPal's state machine, adjudication and evidence uploads require PayPal to set the status to `WAITING_FOR_SELLER_RESPONSE` and emit the corresponding `"rel": "adjudicate"` HATEOAS link.

5. **Refund Mechanism Findings (Which Action Yields a Real Refund):**
   - **Capture Refund (`POST /v2/payments/captures/{id}/refund`):**
     - Tested against a live unattended vault order capture (`4MW82925T2060654E`).
     - Succeeded immediately with `201 Created`, returning `status: "COMPLETED"` and Refund ID `"8CL74127HE2561626"`.
     - Money is immediately moved back, visible in both accounts' transaction histories.
   - **Dispute Accept Claim (`POST /v1/customer/disputes/{id}/accept-claim`):**
     - Requires payload with `note` and valid `accept_claim_reason` (e.g. `"NOT_ABLE_TO_WIN"`, `"DID_NOT_SHIP_ITEM"`, `"COMPANY_POLICY"`).
     - When a refund is accepted, PayPal settles the dispute and issues the refund. For automated programmatic execution in Defender, `POST /v2/payments/captures/{id}/refund` provides 100% deterministic, immediate settlement.

---

## Spike 3: Webhook Registration & Verification (`scripts/spike-3-webhooks.ts`)
*Status: Pending Phase 1 execution*

- **Webhook Registration / ID:**
- **Signature Verification (`POST /v1/notifications/verify-webhook-signature`):**
- **Event Simulation (`POST /v1/notifications/simulate-event`):**
- **Polling Fallback Behavior:**
- **Field Findings & Deviations:**

