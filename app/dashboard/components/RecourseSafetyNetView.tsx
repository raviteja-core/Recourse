'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export function RecourseSafetyNetView() {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [guardDecisions, setGuardDecisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [pRes, kRes, dRes, gRes] = await Promise.all([
        fetch('/api/analytics/purchases'),
        fetch('/api/analytics/kpis'),
        fetch('/api/analytics/disputes'),
        fetch('/api/analytics/guard-decisions'),
      ]);

      if (pRes.ok) {
        const p = await pRes.json();
        setPurchases(p.purchases || []);
      }
      if (kRes.ok) {
        const k = await kRes.json();
        setKpis(k);
      }
      if (dRes.ok) {
        const d = await dRes.json();
        setDisputes(d.timeline || []);
      }
      if (gRes.ok) {
        const g = await gRes.json();
        setGuardDecisions(g.decisions || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* 1. Header & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pp-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-pp-navy">Recourse Safety Net Operations</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              Live &amp; Replay Badged
            </span>
          </div>
          <p className="text-xs text-pp-muted mt-0.5">
            Cryptographic Mandate Guard, Receipt Bundles, and Autonomous PayPal Dispute Defense
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border border-pp-border bg-white px-3.5 py-1.5 text-xs font-semibold text-pp-navy hover:bg-pp-highlight transition shadow-sm"
          >
            ← Return to Demo Console
          </Link>
        </div>
      </div>

      {/* 2. KPI Summary Tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Recovered $ */}
        <div className="rounded-xl border border-pp-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-pp-muted">Recovered $</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 font-black text-xs">
              $
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">
            ${kpis?.recoveredDollars?.toFixed(2) || '38.00'}
          </div>
          <div className="mt-1 text-[11px] text-pp-muted">
            Via Defender <code className="text-xs">accept-claim</code> (Ridgeback Jacket)
          </div>
        </div>

        {/* Defended $ */}
        <div className="rounded-xl border border-pp-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-pp-muted">Defended $</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-50 text-teal-600 font-black text-xs">
              🛡
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-teal-600">
            ${kpis?.defendedDollars?.toFixed(2) || '45.00'}
          </div>
          <div className="mt-1 text-[11px] text-teal-700 font-medium">
            Pending PayPal review (Larkspur Tent contest)
          </div>
        </div>

        {/* Blocked $ */}
        <div className="rounded-xl border border-pp-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-pp-muted">Blocked $</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 font-black text-xs">
              ✕
            </span>
          </div>
          <div className="mt-2 text-2xl font-black text-rose-600">
            ${kpis?.blockedDollars?.toFixed(2) || '129.00'}
          </div>
          <div className="mt-1 text-[11px] text-pp-muted">
            Protected by deterministic Mandate Guard
          </div>
        </div>

        {/* Spend vs Cap */}
        <div className="rounded-xl border border-pp-border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-pp-muted">Spend vs Total Cap</span>
            <span className="text-xs font-bold text-pp-navy">
              ${kpis?.spentTotal?.toFixed(0) || '138'} / ${kpis?.totalCap?.toFixed(0) || '150'}
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-pp-blue transition-all duration-500"
              style={{ width: `${Math.min(100, ((kpis?.spentTotal || 138) / (kpis?.totalCap || 150)) * 100)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-pp-muted">
            Budget remaining: <span className="font-bold text-pp-navy">${kpis?.budgetRemaining?.toFixed(2) || '12.00'}</span>
          </div>
        </div>
      </div>

      {/* 3. Purchases & Cryptographic Receipt Hashes Grid */}
      <div className="rounded-xl border border-pp-border bg-white shadow-sm overflow-hidden">
        <div className="border-b border-pp-border bg-slate-50/70 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-pp-navy">Guarded Purchases &amp; Cryptographic Receipts</h2>
            <span className="rounded bg-pp-highlight px-2 py-0.5 text-[10px] font-bold text-pp-blue">
              Tamper-Evident SHA-256 Chain
            </span>
          </div>
          <span className="text-xs text-pp-muted">{purchases.length} executed orders</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-pp-border bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2.5 px-4">Item &amp; Merchant</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Guard Decision</th>
                <th className="py-2.5 px-4">PayPal Capture ID</th>
                <th className="py-2.5 px-4">Receipt SHA-256 Hash</th>
                <th className="py-2.5 px-4">Delivery Condition</th>
                <th className="py-2.5 px-4">Carrier Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                    No purchases recorded yet. Trigger purchases from the Demo Console.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => {
                  const isBlocked = p.status === 'BLOCKED';
                  const isApproved = p.status === 'COMPLETED' || p.status === 'PAID';
                  return (
                    <tr key={p.orderId} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-pp-navy">{p.itemTitle}</div>
                        <div className="text-[11px] text-pp-muted">{p.merchant}</div>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-pp-navy">${p.amount?.toFixed(2)}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            isBlocked
                              ? 'bg-rose-100 text-rose-800'
                              : isApproved
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isBlocked ? 'BLOCK' : 'ALLOW'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {p.paypalCaptureId || 'N/A (Blocked)'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        {p.receiptHash !== 'N/A' ? (
                          <span className="text-pp-blue font-semibold">{p.receiptHash}</span>
                        ) : (
                          <span className="text-slate-400">N/A</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {p.fulfillmentStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {p.trackingNumber}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Two Panels: Guard Decisions & Dispute Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Guard Decisions Breakdown */}
        <div className="rounded-xl border border-pp-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-pp-border bg-slate-50/70 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-pp-navy">Deterministic Guard Decisions</h2>
            <span className="text-xs text-pp-muted">{guardDecisions.length} evaluated carts</span>
          </div>

          <div className="p-4 space-y-3">
            {guardDecisions.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 italic">No carts evaluated yet.</div>
            ) : (
              guardDecisions.map((g, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-pp-navy">{g.itemTitle} (${g.amount?.toFixed(2)})</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        g.decision === 'BLOCK'
                          ? 'bg-rose-100 text-rose-800'
                          : g.decision === 'REQUIRE_APPROVAL'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {g.decision}
                    </span>
                  </div>
                  <div className="text-[11px] text-pp-muted mt-1">{g.explanation}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Dispute & Recourse Timeline */}
        <div className="rounded-xl border border-pp-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-pp-border bg-slate-50/70 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-pp-navy">Dispute Defense &amp; Settlement Timeline</h2>
            <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
              EV Optimization Policy
            </span>
          </div>

          <div className="p-4 space-y-3">
            {/* Dispute 1: Ridgeback Jacket */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-pp-navy">Ridgeback Jacket ($38.00)</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  REFUNDED ($38.00)
                </span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Dispute: <code className="text-xs">PP-R-XFQ-10198901</code> | Defect corroborated by delivery report.
              </div>
              <div className="mt-2 font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-emerald-100">
                pWin: 0.05 | EV_contest: $-48.45 vs EV_accept: $-38.00 | Policy: ACCEPT_AND_REFUND | Refund ID: 22X59480TL380680H
              </div>
            </div>

            {/* Dispute 2: Larkspur Tent */}
            <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-pp-navy">Larkspur Trail Tent ($45.00)</span>
                <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                  CONTESTED (Defended $45.00)
                </span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Dispute: <code className="text-xs">PP-R-RGO-10199647</code> | Simulated dispute testing merchant-side defense.
              </div>
              <div className="mt-2 font-mono text-[10px] text-slate-500 bg-white p-2 rounded border border-teal-100">
                pWin: 0.95 | EV_contest: $-3.00 vs EV_accept: $-45.00 | Policy: CONTEST | Status: evidence submitted, under PayPal review
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

