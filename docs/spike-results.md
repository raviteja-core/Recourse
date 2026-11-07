# PayPal Sandbox Spike Results

This document records the actual behavior, request/response shapes, field structures, and quirks discovered when executing spike scripts against the live PayPal Sandbox API.

---

## Spike 1: Vault Consent & Unattended Order Capture (`scripts/spike-1-vault-order.ts`)
*Status: COMPLETED (Verified against PayPal Sandbox)*

### Account Setup & Critical Environmental Requirements (README Troubleshooting)
- **Account Country Matching Requirement:**
  - **Critical Finding:** Non-US sandbox buyer accounts fail USD checkout and vault agreement flows with the generic PayPal error: *"Things don’t appear to be working at the moment."*
  - **Requirement:** Both the PayPal Sandbox Business account (which owns the REST API app) and the Sandbox Personal (Buyer) account **must be US accounts** (`Country: United States`).
  - **Account Role Separation:** The buyer account must be a Sandbox **Personal** account (`...personal.example.com`), distinct from the merchant business account (`...business.example.com`). PayPal prohibits an account from executing transactions or vaulting agreements against itself.
  - **Browser Environment:** PayPal Sandbox uses aggressive cross-account tracking cookies. Always open approval links in an **Incognito / Private window** to prevent session collisions between the Developer Dashboard and Sandbox checkout.
  - **Session Expiration:** Setup tokens and checkout approval tokens expire within 15–30 minutes in the sandbox environment.

### Observed API Findings & Response Shapes
1. **Setup Token Query (`GET /v3/vault/setup-tokens/{id}`):**
   - After buyer approval in browser, status transitions to `"APPROVED"`.
   - Response includes:
     - `customer.id`: `"qyKatysRMd"`
     - `payment_source.paypal.email_address`: `"sb-k4gfj53775260@personal.example.com"`
     - `payment_source.paypal.payer_id`: `"NYNUQVQM79NSC"`
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
     - Payer: `John Doe` (`sb-k4gfj53775260@personal.example.com`, Payer ID: `NYNUQVQM79NSC`)

4. **Conclusion for Architecture:**
   - Flow A (Vault setup token -> payment token -> unattended capture) works seamlessly and deterministically in sandbox without any fallback required.
   - Orders with `vault_id` auto-capture into `COMPLETED` on creation, providing the exact `captureId` needed for tamper-evident receipt bundling and downstream disputes.

---

## Spike 2: Sandbox Dispute Lifecycle (`scripts/spike-2-disputes.ts`)
*Status: Pending Phase 1 execution*

- **Dispute Creation (`POST /v1/customer/disputes`):**
- **Provide Evidence (`POST /v1/customer/disputes/{id}/provide-evidence`):**
- **Make Offer / Accept Claim / Adjudicate:**
- **Refund Status & Visibility in Buyer Account:**
- **Field Findings & Deviations:**

---

## Spike 3: Webhook Registration & Verification (`scripts/spike-3-webhooks.ts`)
*Status: Pending Phase 1 execution*

- **Webhook Registration / ID:**
- **Signature Verification (`POST /v1/notifications/verify-webhook-signature`):**
- **Event Simulation (`POST /v1/notifications/simulate-event`):**
- **Polling Fallback Behavior:**
- **Field Findings & Deviations:**

