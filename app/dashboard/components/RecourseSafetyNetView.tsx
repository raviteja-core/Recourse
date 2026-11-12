'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule, ValidationModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import type { DecisionFilter } from './sidebar';

// Register AG Grid Community modules
ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

// Custom Cell Renderers for AG Grid
const DecisionCellRenderer = (params: any) => {
  const decision = params.value || (params.data?.status === 'BLOCKED' ? 'BLOCK' : 'ALLOW');
  let colorClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (decision === 'REQUIRE_APPROVAL') {
    colorClasses = 'bg-amber-100 text-amber-800 border-amber-300';
  } else if (decision === 'BLOCK') {
    colorClasses = 'bg-rose-100 text-rose-800 border-rose-300';
  }

  return (
    <div className="flex h-full items-center">
      <span className={`rounded-md border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${colorClasses}`}>
        {decision}
      </span>
    </div>
  );
};

const StatusCellRenderer = (params: any) => {
  const status = params.value;
  if (status === 'REFUNDED') {
    return (
      <div className="flex h-full items-center">
        <span className="rounded-md border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-800">
          REFUNDED ($38)
        </span>
      </div>
    );
  }
  if (status === 'COMPLETED' || status === 'PAID') {
    return (
      <div className="flex h-full items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
        <span className="text-xs font-semibold text-emerald-800">COMPLETED</span>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center">
      <span className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">
        {status}
      </span>
    </div>
  );
};

const ItemCellRenderer = (params: any) => {
  return (
    <div className="flex h-full flex-col justify-center py-1">
      <span className="font-bold text-xs text-pp-navy leading-tight">{params.data?.itemTitle}</span>
      <span className="text-[10px] text-pp-muted">{params.data?.merchant}</span>
    </div>
  );
};

const ReceiptHashCellRenderer = (params: any) => {
  const hash = params.value;
  if (!hash || hash === 'N/A') {
    return <span className="text-slate-400 italic">N/A</span>;
  }
  return (
    <div className="flex h-full items-center">
      <span className="font-mono text-[11px] text-pp-blue font-semibold tracking-tight" title={hash}>
        {hash}
      </span>
    </div>
  );
};

export function RecourseSafetyNetView({
  filter = 'ALL',
}: {
  filter?: DecisionFilter;
}) {
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

  // Filter purchases according to decision filter
  const filteredPurchases = useMemo(() => {
    if (filter === 'ALL') return purchases;
    return purchases.filter((p) => p.guardDecision === filter);
  }, [purchases, filter]);

  // AG Grid Column Definitions
  const columnDefs: ColDef[] = useMemo(
    () => [
      {
        headerName: 'Item & Merchant',
        field: 'itemTitle',
        cellRenderer: ItemCellRenderer,
        flex: 2,
        minWidth: 220,
        sortable: true,
        filter: true,
      },
      {
        headerName: 'Amount',
        field: 'amount',
        valueFormatter: (p) => (p.value !== undefined ? `$${Number(p.value).toFixed(2)}` : '$0.00'),
        width: 110,
        sortable: true,
        cellClass: 'font-extrabold text-pp-navy flex items-center',
      },
      {
        headerName: 'Guard Decision',
        field: 'guardDecision',
        cellRenderer: DecisionCellRenderer,
        width: 150,
        sortable: true,
        filter: true,
      },
      {
        headerName: 'Order Status',
        field: 'status',
        cellRenderer: StatusCellRenderer,
        width: 150,
        sortable: true,
      },
      {
        headerName: 'PayPal Capture ID',
        field: 'paypalCaptureId',
        width: 190,
        cellClass: 'font-mono text-[11px] text-slate-600 flex items-center',
      },
      {
        headerName: 'Receipt SHA-256 Hash',
        field: 'receiptHash',
        cellRenderer: ReceiptHashCellRenderer,
        width: 200,
      },
      {
        headerName: 'Fulfillment & Carrier',
        field: 'fulfillmentStatus',
        width: 160,
        cellRenderer: (p: any) => (
          <div className="flex h-full items-center gap-1.5">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
              {p.value}
            </span>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6 p-6">
      {/* 1. Header & Navigation */}
      <div id="operations" className="flex flex-wrap items-center justify-between gap-4 border-b border-pp-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-pp-navy">Recourse Safety Net Operations</h1>
            <span className="rounded-full bg-pp-navy px-3 py-0.5 text-xs font-semibold text-white">
              Deterministic Pre-Checkout Guard &amp; Autonomous PayPal Defense
            </span>
          </div>
          <p className="text-xs text-pp-muted mt-0.5">
            Cryptographic Mandate JWS, Receipt Hash Chain, and EV-Optimal Dispute Adjudication
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

      {/* 3. AG Grid: Guarded Purchases & Cryptographic Receipts */}
      <div id="purchases" className="rounded-xl border border-pp-border bg-white shadow-sm overflow-hidden">
        <div className="border-b border-pp-border bg-slate-50/70 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-pp-navy">Guarded Purchases &amp; Cryptographic Receipts</h2>
            <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
              AG Grid Community 36.2.0
            </span>
            <span className="rounded bg-pp-highlight px-2 py-0.5 text-[10px] font-bold text-pp-blue">
              Tamper-Evident SHA-256 Chain
            </span>
          </div>
          <div className="flex items-center gap-2">
            {filter !== 'ALL' && (
              <span className="text-xs font-bold text-pp-navy bg-slate-100 px-2 py-0.5 rounded">
                Filtered: {filter}
              </span>
            )}
            <span className="text-xs text-pp-muted">{filteredPurchases.length} executed orders</span>
          </div>
        </div>

        {/* AG Grid Container */}
        <div className="ag-theme-quartz w-full" style={{ height: 320 }}>
          <AgGridReact
            theme="legacy"
            rowData={filteredPurchases}
            columnDefs={columnDefs}
            rowHeight={48}
            headerHeight={40}
            pagination={false}
          />
        </div>
      </div>

      {/* 4. Two Panels: Guard Decisions & Dispute Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Guard Decisions Breakdown */}
        <div id="guard-decisions" className="rounded-xl border border-pp-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-pp-border bg-slate-50/70 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-pp-navy">Deterministic Guard Decisions</h2>
            <span className="text-xs text-pp-muted">{guardDecisions.length} evaluated carts in current run</span>
          </div>

          <div className="p-4 space-y-3">
            {guardDecisions.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 italic">No carts evaluated yet.</div>
            ) : (
              guardDecisions.map((g, idx) => {
                let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                if (g.decision === 'REQUIRE_APPROVAL') {
                  badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
                } else if (g.decision === 'BLOCK') {
                  badgeClass = 'bg-rose-100 text-rose-800 border-rose-300';
                }
                return (
                  <div key={idx} className="rounded-lg border border-slate-200 p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-pp-navy">{g.itemTitle} (${Number(g.amount).toFixed(2)})</span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-extrabold uppercase ${badgeClass}`}>
                        {g.decision}
                      </span>
                    </div>
                    <div className="text-[11px] text-pp-muted mt-1">{g.explanation}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Dispute & Recourse Timeline */}
        <div id="disputes" className="rounded-xl border border-pp-border bg-white shadow-sm overflow-hidden">
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
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
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
                <span className="rounded bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 border border-teal-200">
                  CONTESTED (Defended $45.00)
                </span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Dispute: <code className="text-xs">PP-R-RGO-10199647</code> | Testing autonomous merchant-side defense.
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
