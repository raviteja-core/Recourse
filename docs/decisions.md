# Architectural and Implementation Decisions

This log tracks every deviation from `docs/RECOURSE_SPEC.md`, architectural decisions, and dependency choices agreed upon during development.

| Date | Decision / Deviation | Rationale | Status |
|---|---|---|---|
| 2026-11-04 | Phase 0 Setup: Adopt Next.js App Router from official boilerplate | The official PayPal + AG Grid boilerplate (`hackathon-paypal-ag-grid-boilerplate`) uses Next.js App Router, React 19, and TailwindCSS v4 with pre-integrated AG Studio. Building Recourse upon this provides full AG Studio integration out of the box. | Approved |
| 2026-11-04 | Primary Dispute Path: Polling over Webhooks | Local webhooks require a public tunnel that may be flaky for judges. Polling (`GET /v1/customer/disputes`) is the primary dispute event listener. Spike 3 / Webhook signature verification is treated as a stretch goal. | Approved |
| 2026-11-04 | LLM Provider: Groq via `@ai-sdk/groq` | Fast inference and structured output via Groq with `@ai-sdk/groq` using the model specified in `LLM_MODEL`. Fallback if any will be clearly labeled as "fallback mode". | Approved |
| 2026-11-04 | Mandate Signing Key format: ES256 JWK | Fresh ES256 key generated via `scripts/generate-key.ts` and securely stored in `.env` as `MANDATE_SIGNING_PRIVATE_KEY` for `jose` signing and JWKS derivation. | Approved |


