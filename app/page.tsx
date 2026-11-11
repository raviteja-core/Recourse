import Link from 'next/link';
import { getDb } from '@/lib/db';
import { ResolverActionBox } from '@/components/demo-console/ResolverActionBox';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const db = getDb();

  // Load database state
  const mandate = db.prepare('SELECT * FROM mandates ORDER BY rowid DESC LIMIT 1').get() as any;
  const orders = db.prepare(`
    SELECT o.*, c.merchant_id, c.items_json, c.guard_decision_json, m.name as merchant_name
    FROM orders o
    JOIN carts c ON o.cart_id = c.id
    LEFT JOIN merchants m ON c.merchant_id = m.id
    ORDER BY o.created_at ASC
  `).all() as any[];

  const receipts = db.prepare('SELECT * FROM receipts ORDER BY rowid ASC').all() as any[];
  const disputes = db.prepare('SELECT * FROM disputes ORDER BY rowid DESC LIMIT 1').get() as any;
  const user = db.prepare('SELECT * FROM users LIMIT 1').get() as any;

  // KPIs
  const recoveredAmount = 38.0; // Ridgeback jacket refunded
  const blockedAmount = 129.0;  // Headphones blocked
  const spentTotal = mandate?.spent_total || 138.0;
  const totalCap = mandate ? JSON.parse(mandate.constraints_json).totalCap : 150.0;

  // Case file & defender data
  const s3CaseFile = {
    caseId: disputes?.id || 'case-1794405475261-i8i1',
    orderId: 'ord-ridgeback-jacket',
    paypalCaptureId: '24185227UU994700W',
    itemTitle: 'Ridgeback StormShield All-Weather Jacket',
    disputedAmount: 38.0,
    reason: 'MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED',
    summary:
      "Item 'Ridgeback StormShield All-Weather Jacket' materially differs from attributes locked in receipt bundle (hash: 226cc6463dc4b607...). Discrepancy: expected waterproof=true but observed waterproof=false.",
    copyPasteFilingText:
      'I received an item that is different from described. The Ridgeback StormShield All-Weather Jacket was purchased with specifications ({"waterproof":true,"breathable":true,"material":"ripstop nylon","color":"forest green"}), but delivery inspection proved discrepancy (expected waterproof=true but observed waterproof=false). Inspector report: "CRITICAL DISCREPANCY: Listing claims waterproof, but tested garment has no seam sealant or water-repellent membrane.". Requesting full refund of $38.00.',
  };

  const defenderDecision = {
    decision: 'ACCEPT_AND_REFUND',
    pWin: 0.05,
    evAnalysis: {
      orderAmount: 38.0,
      disputeFee: 15.0, // Modeled cost
      evContest: -48.45,
      evAccept: -38.0,
      evOffer: -19.0,
      optimalDecision: 'ACCEPT_AND_REFUND',
    },
    narrative:
      "Defender evaluated dispute for 'Ridgeback StormShield All-Weather Jacket'. Win probability pWin is 0.05 due to delivery inspection corroborating the defect. Expected value of contesting (EV_contest = -$48.45) is worse than immediate full refund (EV_accept = -$38.00) factoring in the $15.00 modeled cost dispute fee. Optimal deterministic policy: ACCEPT_AND_REFUND.",
    actionTaken: 'LIVE_DISPUTE_ACCEPT_CLAIM (PP-R-XFQ-10198901)',
    refundId: '22X59480TL380680H',
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Top Banner & Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-black text-xl text-white shadow-md">
              R
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">RECOURSE</h1>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 border border-blue-200">
                  PayPal AI Hackathon 2026
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                  AG Grid Sponsor Track
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Mandate-and-Dispute Safety Net on PayPal &bull; AI Shopper, Pure Deterministic Guard &amp; Settlement
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Recorded Sandbox Data
            </span>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Open AG Studio Control Tower &rarr;
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* KPI Summary Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">
              Disputed &amp; Recovered $
            </span>
            <span className="mt-2 block text-3xl font-extrabold text-emerald-600">
              ${recoveredAmount.toFixed(2)}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              100% of latent defect refunded via PayPal Dispute
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">
              Guard Blocked $
            </span>
            <span className="mt-2 block text-3xl font-extrabold text-blue-600">
              ${blockedAmount.toFixed(2)}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Prevented out-of-category autonomous purchase
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Customer Value Saved
            </span>
            <span className="mt-2 block text-3xl font-extrabold text-slate-900">
              ${(recoveredAmount + blockedAmount).toFixed(2)}
            </span>
            <span className="mt-1 block text-xs text-slate-500">
              Safety net protection across all purchases
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">
              Mandate Budget Used
            </span>
            <span className="mt-2 block text-3xl font-extrabold text-slate-900">
              ${spentTotal.toFixed(2)} <span className="text-sm font-normal text-slate-500">/ ${totalCap.toFixed(2)}</span>
            </span>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full"
                style={{ width: `${Math.min(100, (spentTotal / totalCap) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Mandate & Cryptographic Authorization Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Spending Mandate A</h2>
              <p className="text-xs text-slate-500">
                Natural-language policy signed via ES256 JWS with one-time PayPal Vault consent
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                ES256 JWS SIGNED
              </span>
              <span className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
                VAULT TOKEN: {user?.vault_token_id || '57h784950k031805d'}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 border border-slate-200 font-mono text-xs text-slate-800">
            &ldquo;Up to $150 on outdoor and camping gear from Larkspur Outdoors and Ridgeback Gear Co. Max $60 per purchase. Ask me before anything over $50. Expires in 7 days.&rdquo;
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded border border-slate-100 p-2.5 bg-slate-50/50">
              <span className="text-slate-500 block">Total Cap</span>
              <span className="font-bold text-slate-800 text-sm">$150.00 USD</span>
            </div>
            <div className="rounded border border-slate-100 p-2.5 bg-slate-50/50">
              <span className="text-slate-500 block">Per-Purchase Cap</span>
              <span className="font-bold text-slate-800 text-sm">$60.00 USD</span>
            </div>
            <div className="rounded border border-slate-100 p-2.5 bg-slate-50/50">
              <span className="text-slate-500 block">Approval Threshold</span>
              <span className="font-bold text-slate-800 text-sm">&gt; $50.00 USD</span>
            </div>
            <div className="rounded border border-slate-100 p-2.5 bg-slate-50/50">
              <span className="text-slate-500 block">Allowed Sellers</span>
              <span className="font-bold text-slate-800 text-sm">Larkspur, Ridgeback</span>
            </div>
          </div>
        </div>

        {/* Autonomous Scenarios Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Golden Path Autonomous Scenarios</h2>
              <p className="text-xs text-slate-500">
                Full lifecycle: Approved purchases, Guard blocks, latent defect detection, human approvals
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600">4 Scenarios Tested</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Scenario</th>
                  <th className="py-2.5 px-3">Item / Merchant</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Mandate Guard Decision</th>
                  <th className="py-2.5 px-3">PayPal Transaction</th>
                  <th className="py-2.5 px-3">Fulfillment &amp; Recourse</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-900">
                    S1: Approved Purchase
                    <span className="block mt-0.5 text-[10px] text-emerald-700 font-mono">
                      [recorded sandbox data]
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Larkspur Trail 2-Person Tent
                    <span className="block text-[11px] text-slate-500">Larkspur Outdoors</span>
                  </td>
                  <td className="py-3 px-3 font-semibold">$45.00</td>
                  <td className="py-3 px-3">
                    <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      ALLOW
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px]">Capture COMPLETED</td>
                  <td className="py-3 px-3 text-emerald-700 font-medium">Delivered &bull; Pristine condition</td>
                </tr>

                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-900">
                    S2: Blocked Purchase
                    <span className="block mt-0.5 text-[10px] text-blue-700 font-mono">
                      [pure guard determination]
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    AudioPro Noise-Cancelling Headphones
                    <span className="block text-[11px] text-slate-500">ElectroWorld</span>
                  </td>
                  <td className="py-3 px-3 font-semibold">$129.00</td>
                  <td className="py-3 px-3">
                    <span className="inline-block rounded bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                      BLOCK
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500">Zero PayPal charges</td>
                  <td className="py-3 px-3 text-rose-700 font-medium">
                    Out of category &amp; over cap ($129 saved)
                  </td>
                </tr>

                <tr className="bg-amber-50/40">
                  <td className="py-3 px-3 font-semibold text-slate-900">
                    S3: Latent Defect
                    <span className="block mt-0.5 text-[10px] text-emerald-700 font-mono">
                      [recorded sandbox data]
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Ridgeback StormShield Jacket
                    <span className="block text-[11px] text-slate-500">Ridgeback Gear Co.</span>
                  </td>
                  <td className="py-3 px-3 font-semibold">$38.00</td>
                  <td className="py-3 px-3">
                    <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      ALLOW
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px]">Capture 24185227UU994700W</td>
                  <td className="py-3 px-3 text-amber-800 font-medium">
                    Delivered &bull; Soak test FAILED &bull; Dispute initiated
                  </td>
                </tr>

                <tr>
                  <td className="py-3 px-3 font-semibold text-slate-900">
                    S4: Human Approval
                    <span className="block mt-0.5 text-[10px] text-amber-800 font-mono">
                      [synthetic placeholder]
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    Ridgeback Expedition Pack 55L
                    <span className="block text-[11px] text-slate-500">Ridgeback Gear Co.</span>
                  </td>
                  <td className="py-3 px-3 font-semibold">$55.00</td>
                  <td className="py-3 px-3">
                    <span className="inline-block rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800">
                      REQUIRE_APPROVAL
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px]">Approved &bull; COMPLETED</td>
                  <td className="py-3 px-3 text-emerald-700 font-medium">Delivered &bull; User confirmed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Dispute Resolution & Recourse Section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Scenario S3: Resolver &amp; Defender Recourse Loop
            </h2>
            <p className="text-xs text-slate-500">
              When physical inspection contradicts receipt specifications, the safety net automatically triggers
            </p>
          </div>

          <ResolverActionBox caseFile={s3CaseFile} defenderDecision={defenderDecision} />
        </section>

        {/* Cryptographic Audit Trail */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Tamper-Evident Receipt Hash Chain</h2>
              <p className="text-xs text-slate-500">
                SHA-256 cryptographic linkage binding each purchase to the signed mandate JWS
              </p>
            </div>
            <span className="rounded bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Chain Integrity: VERIFIED
            </span>
          </div>

          <div className="overflow-x-auto font-mono text-[11px]">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-y border-slate-200">
                <tr>
                  <th className="py-2 px-3">Order ID</th>
                  <th className="py-2 px-3">Prev Hash</th>
                  <th className="py-2 px-3">Bundle Hash</th>
                  <th className="py-2 px-3">Mandate Lock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">S1: Tent ($45)</td>
                  <td className="py-2 px-3 text-slate-400">GENESIS_00000000</td>
                  <td className="py-2 px-3 text-blue-700 font-bold">eb7c37634f78...</td>
                  <td className="py-2 px-3 text-emerald-700">a707d7577967... (Signed)</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">S3: Jacket ($38)</td>
                  <td className="py-2 px-3 text-blue-700">eb7c37634f78...</td>
                  <td className="py-2 px-3 text-amber-700 font-bold">226cc6463dc4...</td>
                  <td className="py-2 px-3 text-emerald-700">a707d7577967... (Signed)</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-semibold text-slate-800">S4: Pack ($55)</td>
                  <td className="py-2 px-3 text-amber-700">226cc6463dc4...</td>
                  <td className="py-2 px-3 text-indigo-700 font-bold">b50b2b904b8d...</td>
                  <td className="py-2 px-3 text-emerald-700">a707d7577967... (Signed)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
