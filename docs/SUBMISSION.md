# Devpost Submission & Video Script: Recourse

---

## 1. Devpost Submission Text

### Project Title
**Recourse: Mandate-and-Dispute Safety Net on PayPal**

### Tagline
*Autonomous AI agents buy with your funds; Recourse ensures they stay within constraints and provides cryptographic dispute recourse when deliveries go wrong.*

---

### Inspiration
The autonomous agent revolution is coming to commerce. Soon, personal AI shoppers will buy groceries, equipment, and travel tickets on our behalf without prompting us at every click.

However, granting an LLM direct access to move money creates terrifying vulnerabilities:
1. **LLM Hallucinations & Overspending:** An agent instructed to *"Buy a good camping stove under $50"* might splurge on a $250 titanium expedition stove.
2. **Merchant & Category Boundary Drift:** An agent tasked with outdoor gear might buy luxury electronics from unapproved stores.
3. **Vendor Defects & Misrepresentation:** If an item arrives broken, fake, or missing advertised waterproof coatings, who fights for the buyer? And if a buyer falsely disputes a pristine delivery, how does the merchant defend itself?

We built **Recourse** to solve this: an end-to-end financial safety net that pairs cryptographic user mandates and deterministic pre-checkout guards with autonomous post-purchase dispute defense on PayPal.

---

### What It Does
Recourse wraps autonomous agent shopping in a tamper-evident financial safety net:

1. **Natural-Language Mandates & ES256 JWS Signing:**
   Users state their purchase intent in plain English (*"Up to $150 on outdoor gear from Larkspur and Ridgeback. Max $60/order. Ask me before anything over $50."*). Groq LLM parses this into a strict Zod schema, which is canonicalized into deterministic JSON and signed with an **ES256 JWS** private key and SHA-256 hash.
2. **Deterministic Mandate Guard ("LLMs Propose, Deterministic Code Disposes"):**
   Before moving any money, pure deterministic code evaluates the proposed cart against 12 strict rules (per-purchase caps, total budgets, category white-lists, merchant white-lists, expiration, and kill switch revocation). Zero money moves without cryptographic compliance.
3. **Unattended PayPal Orders v2 Checkout:**
   Approved carts execute unattended checkouts using PayPal's **Orders v2 API** with stored `payment_source.paypal.vault_id` tokens, requiring no manual card entry.
4. **Tamper-Evident Receipt Chain:**
   Each purchase produces a cryptographically locked receipt bundle containing the cart snapshot, vendor attributes, Guard ALLOW decision, and previous receipt hash (forming an unbroken SHA-256 chain).
5. **Human-Approval Gate:**
   When an item exceeds the user's approval threshold ($55 Expedition Pack > $50 threshold), the Guard halts checkout and triggers an interactive **Human-Approval Modal**. Checkout proceeds only upon explicit user confirmation, and the human approval record is locked into the receipt.
6. **Accelerated Fulfillment Simulator & Virtual Clock:**
   Advances virtual time by days to simulate vendor fulfillment, USPS carrier tracking, and physical delivery condition inspections (pristine vs latent defects).
7. **Autonomous Recourse Loop:**
   - **Resolver Agent (Buyer Advocate):** Cross-references delivered conditions against locked receipt attributes. If an item arrives defective (e.g., Ridgeback Jacket lacking waterproof seam sealant), it prepares a standardized Case File with one-click copy text for the PayPal Resolution Center.
   - **Defender Agent (Merchant Side):** Evaluates disputes using an objective evidence scoring rubric ($p_{\text{win}}$) and **Expected Value (EV)** decision policy.
     - **Refund Path:** If evidence corroborates the defect, EV of accepting is superior ($-\$38.00 > -\$48.45$ after factoring in the $15.00 modeled dispute handling fee). Defender invokes PayPal's `POST .../accept-claim` with `NOT_ABLE_TO_WIN`, instantly issuing a verified refund (**$38.00 Recovered $**).
     - **Contest Path:** If evidence proves pristine delivery matching the catalog listing, Defender calculates high win probability ($p_{\text{win}} = 0.95$) and submits an evidence statement citing the Mandate JWS, receipt hash, and simulated delivery record via `POST .../send-message` (**Defended $45.00 pending review**).
8. **Demo Console UI & AG Studio Dashboard:**
   - **Demo Console (`/`):** 1920&times;1080 non-scrolling cockpit layout with interactive playbook steps, live agent reasoning feed, receipt chain inspector, and EV analysis cards.
   - **AG Studio Dashboard (`/dashboard`):** Interactive KPI tiles (Recovered $, Defended $, Blocked $), Purchases AG Grid with receipt hashes, Guard decisions matrix, and dispute timeline.

---

### How We Built It
- **Frontend & App Architecture:** Next.js App Router, React 19, TailwindCSS v4 with fintech dark-mode palette.
- **Analytics & Data Grids:** AG Grid 36.2.0 and AG Studio 3.0.0 with custom PayPal theme tokens.
- **Backend & Database:** Node.js, TypeScript, and SQLite (`better-sqlite3`) for atomic local audit storage.
- **PayPal APIs:**
  - **Orders v2:** Unattended order capture with `payment_source.paypal.vault_id`.
  - **Vault v3:** Setup token creation (`POST /v3/vault/setup-tokens`) and permanent payment token exchange (`POST /v3/vault/payment-tokens`).
  - **Disputes v1:** Polling (`GET /v1/customer/disputes`), claim settlement (`POST .../accept-claim`), and defense evidence submission (`POST .../send-message`).
- **Cryptography & Mandate Signing:** `jose` for ECDSA P-256 (ES256) JWS generation and canonical JSON SHA-256 hashing.
- **Inference:** Fast Groq inference (`llama-3.3-70b-versatile`) via `@ai-sdk/groq` for natural-language mandate parsing.
- **Verification:** Vitest unit test suite (26 passing tests) and automated Puppeteer browser verification.

---

### Challenges We Ran Into
1. **Sandbox Country Isolation:** In early testing, vault approval failed when using an Indian sandbox buyer account against USD transactions. We diagnosed the root cause and verified that US personal buyer accounts paired with US business merchant accounts execute vault checkout reliably. We documented this finding prominently for hackathon evaluators.
2. **Dispute Lifecycle Allowable Actions:** PayPal's Disputes API dynamically changes available links across lifecycle stages. At the `INQUIRY` stage, calling `provide-evidence` or `accept-claim` returns `400: ACTION_NOT_ALLOWED_IN_CURRENT_DISPUTE_STATE`. We engineered the Defender to dynamically query `links` and dispatch `send-message` at inquiry, and `accept-claim` / `provide-evidence` with requested types (`"OTHER"`) at claim stages.
3. **Honest Labeling & Sandbox Limitations:** In PayPal sandbox, the `adjudicate` mock endpoint returns `400` on standard REST applications. Rather than faking a seller victory, we strictly adhered to integrity: contested claims are transparently displayed as *"evidence submitted, under PayPal review (sandbox cannot adjudicate)"*.

---

### Accomplishments That We're Proud Of
- **Real Money Movement Verified Live:** Triggered actual dispute settlement on capture `24185227UU994700W` via `accept-claim`, yielding real refund transaction ID `22X59480TL380680H` ($38.00) verified in PayPal Sandbox activity.
- **Zero Hallucination Money Movement:** Strictly enforced Rule 4: *"LLMs propose, deterministic code disposes."* No LLM ever directly signs a payment payload or decides a refund.
- **Cryptographic Tamper-Evidence:** Full receipt bundle hash chain where any modification to cart items, mandate text, or guard decisions breaks the SHA-256 chain.
- **100% Clean Security History:** Deep scan across all git commits proves zero credentials, private keys, or PayPal client secrets were ever committed to version control.

---

### What We Learned
Autonomous commerce cannot rely on LLM self-policing. By pairing the natural language flexibility of LLMs with deterministic state machines and cryptographic primitives, we can build agents that users genuinely trust with their money.

---

### What's Next for Recourse (Future Work)
- **Webhook Signature Verification:** Automated real-time dispute notification ingestion using PayPal's Webhook Signature Verification API (`POST /v1/notifications/verify-webhook-signature`).
- **PayPal Shipment Tracking API Sync:** Ingesting live carrier delivery webhooks directly into the fulfillment simulator.
- **Merchant Reliability Scoreboard:** Cross-mandate vendor defect ratings to inform future Guard risk scoring.
- **Natural-Language Analytics in AG Studio:** Conversational querying of safety net ledger data via Groq OpenAI proxy inside AG Studio.

---

## 2. Tools & Technologies Used

| Tool / Technology | Specific Version / Endpoint | How It Was Used in Recourse |
|---|---|---|
| **PayPal Orders v2** | `POST /v2/checkout/orders` | Executes unattended captured payments using vaulted payment token ID |
| **PayPal Vault v3** | `POST /v3/vault/setup-tokens`, `POST /v3/vault/payment-tokens` | Establishes buyer merchant agreement and exchanges for permanent `vault_id` |
| **PayPal Disputes v1** | `GET /v1/customer/disputes`, `POST .../accept-claim`, `POST .../send-message` | Polls open claims, submits cryptographic defense messages, and settles valid defect refunds |
| **AG Grid Community** | `36.2.0` | Powers the interactive Guarded Purchases Grid with receipt hashes, sorting, and status badges |
| **AG Studio** | `3.0.0` | Embedded analytics builder for exploring sales, payouts, and merchant metrics |
| **Groq AI SDK** | `@ai-sdk/groq` (`llama-3.3-70b-versatile`) | Fast natural-language user prompt parsing into structured JSON mandate schema |
| **jose** | `5.9.6` | Deterministic ES256 ECDSA P-256 cryptographic signature and JWKS generation |
| **Better-SQLite3** | `11.8.1` | Embedded high-speed SQLite database for atomic audit logging, receipts, and demo state |
| **Vitest** | `3.2.7` | Unit testing engine validating Guard rules, dispute rubric, and receipt chain integrity |
| **Puppeteer** | `25.17.0` | Headless browser automation verifying 1920&times;1080 UI layout and zero console errors |

---

## 3. Timed Video Demonstration Script (< 3:00)

**Total Duration:** 2 minutes 45 seconds  
**Setting:** Browser open to `http://localhost:3000` (Demo Console, 1920&times;1080 resolution, dark fintech UI).

| Timestamp | Visual Action on Screen | Spoken Script |
|---|---|---|
| **0:00 - 0:25** | Show Demo Console UI header, KPI strip ($38 Recovered, $45 Defended, $129 Blocked), and 3-column cockpit. | *"Welcome to Recourse, the mandate-and-dispute safety net for autonomous shopping agents on PayPal. In an era where AI agents buy with your funds, how do you prevent hallucinations, overspending, and vendor defects? Recourse provides a deterministic safety net. Let's see it in action."* |
| **0:25 - 0:50** | Click **Step 1: Re-Parse & Sign**. Show JWS token and hash update in Right column. | *"First, the user sets a natural-language mandate: 'Up to $150 on outdoor gear from Larkspur and Ridgeback, max $60 per purchase, threshold $50.' Groq parses this into strict constraints, which are cryptographically signed into an immutable ES256 JWS token. Our core rule: LLMs propose, deterministic code disposes."* |
| **0:50 - 1:15** | Click **Approved purchase (Tent $45)**. Then click **Blocked purchase (Headphones $129)**. Point to Live Reasoning feed. | *"Next, our Shopper agent proposes purchases. The Tent cart is within bounds: Guard grants ALLOW and PayPal Orders v2 executes an unattended checkout with the user's vaulted payment token. But when the agent attempts to buy $129 headphones from an unauthorized merchant, our deterministic Guard instantly catches 5 violations and blocks checkout without making a network call, saving $129."* |
| **1:15 - 1:40** | Click **Human approval flow (Pack $55)**. Modal pops up. Click **Approve Purchase**. | *"What about purchases over the user's $50 threshold? When the agent proposes a $55 Expedition Pack, the Guard halts execution with REQUIRE_APPROVAL. The interactive Human-Approval modal appears. Once the user reviews and clicks Approve, checkout completes and the human approval decision is permanently locked into the cryptographic receipt bundle."* |
| **1:40 - 2:05** | Click **Advance +3.5 Days & Inspect Delivery**. Then click **Poll Disputes & Run Defender**. | *"Now, let's accelerate our demo clock to simulate physical delivery. Our fulfillment inspector discovers that a Ridgeback Jacket delivered has no waterproof membrane. Our buyer Resolver agent generates an evidence Case File. In the PayPal Sandbox Resolution Center, the dispute is detected. Our merchant Defender agent scores the evidence: since the defect is corroborated, the Expected Value of an immediate refund beats contesting. Defender invokes PayPal's accept-claim API with reason NOT_ABLE_TO_WIN, issuing an immediate $38 verified refund."* |
| **2:05 - 2:25** | Point to Dispute card showing Tent dispute contest with $p_{\text{win}} = 0.95$. | *"Conversely, when a simulated dispute is filed on the pristine Tent, Defender calculates an 95% win probability backed by our immutable Mandate JWS and inspection report. Defender deterministically selects CONTEST and submits our cryptographic audit trail to PayPal, defending $45."* |
| **2:25 - 2:45** | Click **AG Studio Dashboard** button. Show Purchases AG Grid with receipt hashes and KPI tiles. | *"Finally, our AG Studio Operations Dashboard renders all guarded purchases, tamper-evident SHA-256 receipt hashes, Guard decision matrices, and dispute EV timelines in an interactive AG Grid interface. Recourse brings deterministic security, cryptographic integrity, and autonomous peace of mind to AI commerce on PayPal. Thank you!"* |
