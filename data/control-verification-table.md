### Headless Browser Control Verification (F1 Audit)

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
