# PayPal Sandbox Spike Results

This document records the actual behavior, request/response shapes, field structures, and quirks discovered when executing spike scripts against the live PayPal Sandbox API.

---

## Spike 1: Vault Consent & Unattended Order Capture (`scripts/spike-1-vault-order.ts`)
*Status: Pending Phase 1 execution*

- **Setup Token Creation (`POST /v3/vault/setup-tokens`):**
- **Buyer Approval Flow:**
- **Payment Token Exchange (`POST /v3/vault/payment-tokens`):**
- **Unattended Order Capture (`POST /v2/checkout/orders` with `payment_source.paypal.vault_id`):**
- **Field Findings & Deviations:**

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
