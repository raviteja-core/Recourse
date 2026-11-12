# Video Recording Runbook (Live Sandbox & Replay Modes)

This runbook provides the step-by-step operating procedure for recording the official Recourse demonstration video.

---

## 1. Recording Setup & Prerequisites

1. **Display & Resolution:**
   - Display Resolution: **1920 &times; 1080**.
   - Browser: Google Chrome (or Chromium) maximized at 100% zoom (no browser zoom).
   - URL: `http://localhost:3000` (Demo Console).
2. **Environment & Server:**
   - Verify server is running: `npm run start` (or `npm run dev`).
   - Clean initial state: Click the **Reset** button in the header, or run `npm run seed` in your terminal.
3. **Audio & Screen Recording Software:**
   - Use OBS Studio, QuickTime, or Loom configured to record at 1080p 60fps.
   - Microphone tested and calibrated.

---

## 2. Step-by-Step Recording Sequence (2:45 Total)

### Step 0: The Hook & Header (0:00 – 0:25)
- **On Screen:** Start on `http://localhost:3000`. Show the full 1920&times;1080 cockpit layout.
- **Visual Focus:** Hover over the KPI Strip:
  - **Recovered $ ($38.00)**
  - **Defended $ ($45.00 pending review)**
  - **Blocked $ ($129.00)**
  - **Spend vs Cap ($138 / $150)**
- **Script:** *"Welcome to Recourse, the mandate-and-dispute safety net for autonomous shopping agents on PayPal. In an era where AI agents buy with your funds, how do you prevent hallucinations, overspending, and vendor defects? Recourse provides a deterministic safety net. Let's see it in action."*

### Step 1: Mandate Parse & JWS Cryptographic Signing (0:25 – 0:50)
- **On Screen:** In Column 1 (Playbook Steps), click **Re-Parse & Sign** under Step 1.
- **Visual Focus:**
  - Watch the Center column stream the event: `[MANDATE_PARSED]` and `[MANDATE_SIGNED]`.
  - In Column 3 (Tabs), click the **Mandate JWS** tab to reveal the constraints locked in ES256 and the SHA-256 hash.
- **Script:** *"First, the user sets a natural-language mandate: 'Up to $150 on outdoor gear from Larkspur and Ridgeback, max $60 per purchase, threshold $50.' Groq parses this into strict constraints, which are cryptographically signed into an immutable ES256 JWS token. Our core rule: LLMs propose, deterministic code disposes."*

### Step 2: Autonomous Shopper & Deterministic Guard (0:50 – 1:15)
- **On Screen:** Under Step 2 (Shopper Scenarios):
  - Click **Approved purchase** (Larkspur Trail Tent $45.00).
    - Point to Center feed: Guard evaluates constraints, grants `ALLOW`, and PayPal Orders v2 captures the order with the user's vaulted payment token.
  - Click **Blocked purchase** (AudioPro Headphones $129.00).
    - Point to Center feed: Guard detects 5 violations (`MERCHANT_NOT_ALLOWED`, `CATEGORY_NOT_ALLOWED`, `OVER_PER_PURCHASE_CAP`, `OVER_TOTAL_CAP`, `ABOVE_APPROVAL_THRESHOLD`).
    - Checkout is blocked instantly without making an external API call, saving $129.00.
- **Script:** *"Next, our Shopper agent proposes purchases. The Tent cart is within bounds: Guard grants ALLOW and PayPal Orders v2 executes an unattended checkout with the user's vaulted payment token. But when the agent attempts to buy $129 headphones from an unauthorized merchant, our deterministic Guard instantly catches 5 violations and blocks checkout without making a network call, saving $129."*

### Step 3: Human-Approval Gate (1:15 – 1:40)
- **On Screen:**
  - Click **Human approval flow** (Expedition Pack $55.00).
  - The **Human-Approval Modal** immediately appears with amber warning styling.
  - Highlight the text: *"Total purchase amount of $55.00 exceeds your mandate approval threshold of $50.00."*
  - Click **Approve Purchase**.
  - Modal closes; Center feed logs `[HUMAN_APPROVAL_RECORDED]` and executes checkout.
  - In Column 3, click **Receipt Chain** to show that the human approval is sealed into the receipt bundle hash.
- **Script:** *"What about purchases over the user's $50 threshold? When the agent proposes a $55 Expedition Pack, the Guard halts execution with REQUIRE_APPROVAL. The interactive Human-Approval modal appears. Once the user reviews and clicks Approve, checkout completes and the human approval decision is permanently locked into the cryptographic receipt bundle."*

### Step 4: Accelerated Fulfillment & Recourse Loop (1:40 – 2:05)
- **On Screen:**
  - Click Step 3: **Advance +3.5 Days & Inspect Delivery**.
    - Watch delivery reports appear in feed: Tent is `PRISTINE`, Jacket has `DEFECTIVE_NOT_AS_DESCRIBED` (missing waterproof coating).
  - Click Step 4/5: **Poll Disputes & Run Defender**.
    - In Column 3, switch to the **Disputes & EV** tab.
    - Highlight the Ridgeback Jacket card:
      - $p_{\text{win}} = 0.05$
      - $\text{EV}_{\text{contest}} = -\$48.45$ vs $\text{EV}_{\text{accept}} = -\$38.00$ (modeled $15 fee)
      - Decision: `ACCEPT_AND_REFUND` &rarr; live PayPal refund ID `22X59480TL380680H`.
- **Script:** *"Now, let's accelerate our demo clock to simulate physical delivery. Our fulfillment inspector discovers that a Ridgeback Jacket delivered has no waterproof membrane. Our buyer Resolver agent generates an evidence Case File. In the PayPal Sandbox Resolution Center, the dispute is detected. Our merchant Defender agent scores the evidence: since the defect is corroborated, the Expected Value of an immediate refund beats contesting. Defender invokes PayPal's accept-claim API with reason NOT_ABLE_TO_WIN, issuing an immediate $38 verified refund."*

### Step 5: Contested Fraudulent Claim (2:05 – 2:25)
- **On Screen:**
  - In the **Disputes & EV** tab, scroll to the second card: **Larkspur Trail Tent**.
  - Highlight the contest metrics:
    - Evidence score: $p_{\text{win}} = 0.95$ (backed by Mandate JWS and pristine delivery report)
    - $\text{EV}_{\text{contest}} = -\$3.00$ vs $\text{EV}_{\text{accept}} = -\$45.00$
    - Decision: `CONTEST` &rarr; evidence submitted via `send-message` (`200 OK`).
    - Status: *"evidence submitted, under PayPal review (sandbox cannot adjudicate)"*.
- **Script:** *"Conversely, when a simulated dispute is filed on the pristine Tent, Defender calculates an 95% win probability backed by our immutable Mandate JWS and inspection report. Defender deterministically selects CONTEST and submits our cryptographic audit trail to PayPal, defending $45."*

### Step 6: AG Studio Operations Dashboard (2:25 – 2:45)
- **On Screen:**
  - In the header, click **AG Studio Dashboard**.
  - Page navigates to `/dashboard`.
  - Highlight the **Purchases AG Grid** showing orders, merchants, amounts, and full SHA-256 receipt hashes.
  - Highlight the Guard Decisions Matrix and the Dispute Settlement Timeline.
  - Conclude with full view of the operations dashboard.
- **Script:** *"Finally, our AG Studio Operations Dashboard renders all guarded purchases, tamper-evident SHA-256 receipt hashes, Guard decision matrices, and dispute EV timelines in an interactive AG Grid interface. Recourse brings deterministic security, cryptographic integrity, and autonomous peace of mind to AI commerce on PayPal. Thank you!"*

---

## 3. Fallback Procedures

- **If PayPal Sandbox Network Delays Occur:**
  - Toggle the top bar badge to **REPLAY FIXTURE** mode.
  - All actions will execute instantly using pre-recorded sanitized sandbox data from `data/fixtures/`.
  - The badge will clearly read `REPLAY FIXTURE` without interrupting video flow.
- **If Reset is Needed Mid-Recording:**
  - Click the **Reset** button in the header top right.
  - The database is instantly repopulated with initial seeded state in < 100ms.

