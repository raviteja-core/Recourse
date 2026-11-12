# Architectural and Implementation Decisions

This log tracks every deviation from `docs/RECOURSE_SPEC.md`, architectural decisions, and dependency choices agreed upon during development.

| Date | Decision / Deviation | Rationale | Status |
|---|---|---|---|
| 2026-11-04 | Phase 0 Setup: Adopt Next.js App Router from official boilerplate | The official PayPal + AG Grid boilerplate (`hackathon-paypal-ag-grid-boilerplate`) uses Next.js App Router, React 19, and TailwindCSS v4 with pre-integrated AG Studio. Building Recourse upon this provides full AG Studio integration out of the box. | Approved |
| 2026-11-04 | Primary Dispute Path: Polling over Webhooks | Local webhooks require a public tunnel that may be flaky for judges. Polling (`GET /v1/customer/disputes`) is the primary dispute event listener. Spike 3 / Webhook signature verification is treated as a stretch goal. | Approved |
| 2026-11-04 | LLM Provider: Groq via `@ai-sdk/groq` | Fast inference and structured output via Groq with `@ai-sdk/groq` using the model specified in `LLM_MODEL`. Fallback if any will be clearly labeled as "fallback mode". | Approved |
| 2026-11-04 | Mandate Signing Key format: ES256 JWK | Fresh ES256 key generated via `scripts/generate-key.ts` and securely stored in `.env` as `MANDATE_SIGNING_PRIVATE_KEY` for `jose` signing and JWKS derivation. | Approved |
| 2026-11-07 | Dispute Origination: Manual Resolution Center Filing | Standard PayPal REST sandbox credentials lack `GRANT_PROXY_CLIENT` scope for buyer assertion proxying. Resolver outputs structured Case File with one-click copy text for buyer manual filing. | Verified |
| 2026-11-11 | Dispute Settlement: `accept-claim` with `NOT_ABLE_TO_WIN` | Defender uses `POST /v1/customer/disputes/{id}/accept-claim` with `accept_claim_reason: "NOT_ABLE_TO_WIN"`, which returns `200 OK` and transitions capture to `REFUNDED` with live refund transaction ID. Direct capture refund serves as fallback. | Verified |
| 2026-11-11 | Dispute Contest: `provide-evidence` with `OTHER` | `POST /v1/customer/disputes/{id}/provide-evidence` requires `{ evidences: [{ evidence_type, notes }] }` matching requested type (`"OTHER"`). Adjudicate endpoint returns `400` in standard sandbox; contest path is verified via `provide-evidence` and `send-message`. | Verified |
| 2026-11-11 | Dispute Handling Cost: Modeled Assumption | Modeled $15 dispute handling fee is configurable via `DISPUTE_HANDLING_COST` and labeled "modeled cost" across code, UI, and documentation. | Verified |
| 2026-11-11 | Evidence Integrity Defect in Spike 2 Tent Artifact | The Spike 2 tent dispute (`PP-R-SQO-10196995`) evidence note cited a signed mandate JWS, receipt SHA-256 hash, and pristine delivery report. That order originated from Spike 1 prior to mandate and fulfillment simulator implementation; asserting non-existent records violated 'never fabricate evidence'. The defect was logged and corrected: `PP-R-SQO-10196995` is excluded from all fixtures, UI, and demo assets. The Defender engine was refactored to cite ONLY facts present in DB tables (mandates, receipts, fulfillments). Missing records yield 'no record available' and penalize pWin. | Defect Fixed |
| 2026-11-12 | Live Contested Claim on Tent Capture 7BH91632Y92698500 | Dispute `PP-R-RGO-10199647` filed in sandbox by user as simulated buyer dispute. Resolver returned `NO_GROUNDS`. Defender evaluated $p_{\text{win}}=0.95$, selected `CONTEST`, and submitted defense message citing stored Mandate JWS, receipt hash, and simulated pristine delivery record via `send-message` (`200 OK`). Status changed to `WAITING_FOR_BUYER_RESPONSE`. Displayed as "evidence submitted, under PayPal review (sandbox cannot adjudicate)". Defended $45.00 tracked in KPIs. | Verified |




