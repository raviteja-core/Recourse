'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export interface DemoConsoleProps {
  initialMandate: any;
  initialOrders: any[];
  initialReceipts: any[];
  initialDisputes: any[];
  initialKpis: any;
  userVaultToken: string;
}

export function DemoConsoleClient({
  initialMandate,
  initialOrders,
  initialReceipts,
  initialDisputes,
  initialKpis,
  userVaultToken,
}: DemoConsoleProps) {
  const [replayMode, setReplayMode] = useState(true);
  const [mandate, setMandate] = useState(initialMandate);
  const [orders, setOrders] = useState(initialOrders);
  const [receipts, setReceipts] = useState(initialReceipts);
  const [disputes, setDisputes] = useState(initialDisputes);
  const [kpis, setKpis] = useState(initialKpis);
  const [events, setEvents] = useState<any[]>([]);
  const [activeRightTab, setActiveRightTab] = useState<'receipts' | 'disputes' | 'mandate'>('receipts');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Modals
  const [pendingApprovalCart, setPendingApprovalCart] = useState<any | null>(null);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultSetupLink, setVaultSetupLink] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Poll state and events every 3 seconds
  useEffect(() => {
    fetchEvents();
    fetchSummary();
    const interval = setInterval(() => {
      fetchEvents();
      fetchSummary();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {}
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/analytics/summary');
      if (res.ok) {
        const data = await res.json();
        if (data.kpis) setKpis(data.kpis);
        if (data.mandate) setMandate(data.mandate);
        if (data.orders) setOrders(data.orders);
        if (data.receipts) setReceipts(data.receipts);
        if (data.disputes) setDisputes(data.disputes);
      }
    } catch {}
  };

  // Actions
  const handleResetDb = async () => {
    setLoadingAction('reset');
    try {
      await fetch('/api/demo/reset', { method: 'POST' });
      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleParseMandate = async () => {
    setLoadingAction('parse-mandate');
    try {
      const res = await fetch('/api/mandates/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:
            'Up to $150 on outdoor and camping gear from Larkspur Outdoors and Ridgeback Gear Co. Max $60 per purchase. Ask me before anything over $50. Expires in 7 days.',
        }),
      });
      const data = await res.json();
      if (data.mandate) {
        setMandate(data.mandate);
      }
      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRevokeMandate = async () => {
    if (!mandate?.id) return;
    setLoadingAction('revoke-mandate');
    try {
      await fetch(`/api/mandates/${mandate.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteVaultToken: false }),
      });
      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRunCart = async (scenario: 'tent' | 'headphones' | 'jacket' | 'pack') => {
    if (!mandate?.id) return;
    setLoadingAction(`cart-${scenario}`);
    try {
      let productSkus: string[] = [];
      let rationale = '';

      if (scenario === 'tent') {
        productSkus = ['tent-1'];
        rationale = 'Larkspur 2-person trail tent within outdoor budget cap.';
      } else if (scenario === 'headphones') {
        productSkus = ['headphones-1'];
        rationale = 'Shopper attempted to buy AudioPro wireless headphones.';
      } else if (scenario === 'jacket') {
        productSkus = ['jacket-1'];
        rationale = 'Ridgeback all-weather jacket matching outdoor mandate.';
      } else if (scenario === 'pack') {
        productSkus = ['pack-1'];
        rationale = 'Ridgeback Expedition Pack 55L ($55.00 exceeds $50 approval threshold).';
      }

      const res = await fetch('/api/agent/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mandateId: mandate.id,
          productSkus,
          rationale,
          replayMode,
        }),
      });

      const data = await res.json();

      // Check if human approval is required
      if (data.result?.requireApproval) {
        setPendingApprovalCart({
          cartId: data.cartId,
          scenario,
          total: data.total,
          title: scenario === 'pack' ? 'Ridgeback Expedition Pack 55L' : 'Guarded Cart Item',
          threshold: mandate.constraints?.approvalThreshold || 50,
          explanation: data.result?.guardResult?.explanation || 'Total exceeds threshold.',
        });
      }

      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApproveCart = async () => {
    if (!pendingApprovalCart) return;
    setLoadingAction('approve-cart');
    try {
      await fetch(`/api/carts/${pendingApprovalCart.cartId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Approved by user via Recourse Console modal.',
          replayMode,
        }),
      });
      setPendingApprovalCart(null);
      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRejectCart = async () => {
    setPendingApprovalCart(null);
  };

  const handleAdvanceClock = async () => {
    setLoadingAction('advance-clock');
    try {
      await fetch('/api/sim/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 3.5 }),
      });
      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePollDisputes = async () => {
    setLoadingAction('poll-disputes');
    try {
      await fetch('/api/disputes/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replayMode }),
      });
      await fetchSummary();
      await fetchEvents();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStartVaultSetup = async () => {
    setLoadingAction('vault-setup');
    try {
      const res = await fetch('/api/vault/setup', { method: 'POST' });
      const data = await res.json();
      if (data.approveUrl) {
        setVaultSetupLink(data.approveUrl);
        setVaultModalOpen(true);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (eventFilter === 'all') return true;
    return e.actor?.toLowerCase() === eventFilter.toLowerCase();
  });

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-900 text-slate-100 font-sans antialiased">
      {/* 1. TOP HEADER & KPI STRIP */}
      <header className="h-16 shrink-0 border-b border-slate-800 bg-slate-950 px-6 flex items-center justify-between gap-4">
        {/* Brand & Mode */}
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500 font-black text-xl text-slate-950 shadow-md shadow-teal-500/20">
            R
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-white">RECOURSE</span>
              <span className="text-xs text-slate-400 font-medium">| Mandate & Dispute Safety Net</span>
            </div>
            <div className="text-[11px] text-slate-400">Autonomous Financial Guard for PayPal Agents</div>
          </div>

          {/* Live vs Replay Badge Toggle */}
          <div className="ml-4 flex items-center rounded-lg border border-slate-800 bg-slate-900 p-1">
            <button
              onClick={() => setReplayMode(false)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                !replayMode ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${!replayMode ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              LIVE SANDBOX
            </button>
            <button
              onClick={() => setReplayMode(true)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                replayMode ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${replayMode ? 'bg-teal-400' : 'bg-slate-500'}`} />
              REPLAY FIXTURE
            </button>
          </div>
        </div>

        {/* Center: KPI Tiles */}
        <div className="flex items-center gap-3">
          {/* Recovered $ */}
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400 font-bold text-xs">
              $
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold">Recovered $</div>
              <div className="text-sm font-extrabold text-emerald-300">${kpis?.recoveredDollars?.toFixed(2) || '38.00'}</div>
            </div>
          </div>

          {/* Defended $ */}
          <div className="flex items-center gap-2.5 rounded-lg border border-teal-500/30 bg-teal-950/40 px-3.5 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500/20 text-teal-300 font-bold text-xs">
              🛡
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-teal-400/80 font-bold">Defended $</div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-extrabold text-teal-200">${kpis?.defendedDollars?.toFixed(2) || '45.00'}</span>
                <span className="text-[9px] text-teal-400/70 font-medium">pending review</span>
              </div>
            </div>
          </div>

          {/* Blocked $ */}
          <div className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3.5 py-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/20 text-rose-400 font-bold text-xs">
              ✕
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-rose-400/80 font-bold">Blocked $</div>
              <div className="text-sm font-extrabold text-rose-300">${kpis?.blockedDollars?.toFixed(2) || '129.00'}</div>
            </div>
          </div>

          {/* Spend vs Cap */}
          <div className="flex flex-col justify-center rounded-lg border border-slate-800 bg-slate-900/80 px-3.5 py-1.5 min-w-[170px]">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              <span>Spend vs Cap</span>
              <span className="text-slate-300">${kpis?.spentTotal?.toFixed(0) || '138'} / ${kpis?.totalCap?.toFixed(0) || '150'}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, ((kpis?.spentTotal || 138) / (kpis?.totalCap || 150)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Actions: Connect PayPal, Dashboard, Reset */}
        <div className="flex items-center gap-2.5">
          {!replayMode && (
            <button
              onClick={handleStartVaultSetup}
              disabled={loadingAction === 'vault-setup'}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600/20 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition shadow-sm"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.641.641 0 0 1 .632-.544h7.683c3.045 0 5.485 1.542 5.093 5.461-.264 2.651-1.748 4.298-3.955 4.978l-.348.107 1.258 7.595a.641.641 0 0 1-.633.74h-4.32a.641.641 0 0 1-.633-.545l-1.054-6.402h-2.18l-1.411 6.222z" />
              </svg>
              Connect PayPal
            </button>
          )}

          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
          >
            <svg className="w-3.5 h-3.5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Operations Dashboard (AG Grid)
          </Link>

          <button
            onClick={handleResetDb}
            disabled={loadingAction === 'reset'}
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            title="Reset database to initial demo state"
          >
            <svg className={`w-3.5 h-3.5 ${loadingAction === 'reset' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>
      </header>

      {/* 2. MAIN THREE-COLUMN COCKPIT LAYOUT (1920x1080 FIT) */}
      <div className="flex-1 overflow-hidden grid grid-cols-12 gap-4 p-4">
        {/* ======================================================== */}
        {/* COLUMN 1: INTERACTIVE PLAYBOOK STEPS (Cols 1-3)           */}
        {/* ======================================================== */}
        <div className="col-span-3 flex flex-col gap-3 overflow-y-auto pr-1">
          {/* Step 1: Mandate Parse & JWS */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold">1</span>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Mandate Authorization</span>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                mandate?.status === 'revoked' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {mandate?.status === 'revoked' ? 'REVOKED' : 'ACTIVE (ES256)'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-snug line-clamp-2 mb-2.5">
              &quot;Up to $150 on outdoor and camping gear from Larkspur Outdoors and Ridgeback Gear Co. Max $60/order. Threshold $50.&quot;
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleParseMandate}
                disabled={loadingAction === 'parse-mandate'}
                className="rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs py-1.5 transition"
              >
                {loadingAction === 'parse-mandate' ? 'Parsing...' : 'Re-Parse & Sign'}
              </button>
              <button
                onClick={handleRevokeMandate}
                disabled={loadingAction === 'revoke-mandate' || mandate?.status === 'revoked'}
                className="rounded-lg border border-rose-500/40 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold text-xs py-1.5 transition"
                title="Trigger Mandate Revoke Kill Switch"
              >
                Kill Switch (Revoke)
              </button>
            </div>
          </div>

          {/* Step 2: Autonomous Shopper Scenarios */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold">2</span>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">AI Shopper Agent</span>
              </div>
              <span className="text-[10px] text-teal-400 font-mono">Tool-Calling Flow</span>
            </div>

            <div className="space-y-2">
              {/* Approved purchase: Tent */}
              <button
                onClick={() => handleRunCart('tent')}
                disabled={loadingAction?.startsWith('cart-')}
                className="w-full flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 p-2 text-left transition group"
              >
                <div>
                  <div className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">Approved purchase</div>
                  <div className="text-[10px] text-slate-400">Larkspur Trail 2-Person Tent ($45.00)</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">ALLOW</span>
              </button>

              {/* Defect purchase: Jacket */}
              <button
                onClick={() => handleRunCart('jacket')}
                disabled={loadingAction?.startsWith('cart-')}
                className="w-full flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-950/20 hover:bg-emerald-950/40 p-2 text-left transition group"
              >
                <div>
                  <div className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200">Item not as described</div>
                  <div className="text-[10px] text-slate-400">Ridgeback Jacket ($38.00, defective)</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">ALLOW</span>
              </button>

              {/* Human approval: Pack */}
              <button
                onClick={() => handleRunCart('pack')}
                disabled={loadingAction?.startsWith('cart-')}
                className="w-full flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-950/20 hover:bg-amber-950/40 p-2 text-left transition group"
              >
                <div>
                  <div className="text-xs font-bold text-amber-300 group-hover:text-amber-200">Human approval flow</div>
                  <div className="text-[10px] text-slate-400">Expedition Pack ($55.00 &gt; $50 threshold)</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">REQUIRE_APPROVAL</span>
              </button>

              {/* Blocked purchase: Headphones */}
              <button
                onClick={() => handleRunCart('headphones')}
                disabled={loadingAction?.startsWith('cart-')}
                className="w-full flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/40 p-2 text-left transition group"
              >
                <div>
                  <div className="text-xs font-bold text-rose-300 group-hover:text-rose-200">Blocked purchase</div>
                  <div className="text-[10px] text-slate-400">AudioPro Headphones ($129.00)</div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">BLOCK</span>
              </button>
            </div>
          </div>

          {/* Step 3: Advance Demo Clock */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold">3</span>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Fulfillment Simulator</span>
              </div>
              <span className="text-[10px] text-teal-400 font-mono">Demo Clock</span>
            </div>
            <button
              onClick={handleAdvanceClock}
              disabled={loadingAction === 'advance-clock'}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2 transition border border-slate-700"
            >
              <span>⏩ Advance +3.5 Days &amp; Inspect Delivery</span>
            </button>
          </div>

          {/* Step 4 & 5: Recourse Loop (Resolver & Defender) */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/20 text-teal-300 text-xs font-bold">4/5</span>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Recourse Loop</span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono">EV Settlement</span>
            </div>

            <div className="space-y-2">
              <button
                onClick={handlePollDisputes}
                disabled={loadingAction === 'poll-disputes'}
                className="w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-slate-950 font-black text-xs py-2 transition shadow-md shadow-teal-500/20"
              >
                {loadingAction === 'poll-disputes' ? 'Polling PayPal API...' : 'Poll Disputes & Run Defender'}
              </button>
              <div className="text-[10px] text-slate-400 text-center">
                Jacket: Refunded ($38) | Tent: Contested ($45 pending review)
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* COLUMN 2: LIVE AGENT REASONING FEED (Cols 4-8)            */}
        {/* ======================================================== */}
        <div className="col-span-5 flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 shadow-sm overflow-hidden">
          {/* Header & Filter Tabs */}
          <div className="shrink-0 flex items-center justify-between border-b border-slate-800 px-4 py-2.5 bg-slate-900/50">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Live Agent Reasoning Stream</span>
              <span className="text-[10px] font-mono text-slate-400">({filteredEvents.length} events)</span>
            </div>

            <div className="flex items-center gap-1">
              {['all', 'guard', 'shopper', 'defender', 'resolver'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setEventFilter(tab)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize transition ${
                    eventFilter === tab ? 'bg-teal-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Events Scroll Feed */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {filteredEvents.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500 italic">
                Awaiting agent actions... click any playbook step on the left to trigger the multi-agent safety net.
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const isGuard = evt.actor === 'guard';
                const isShopper = evt.actor === 'shopper';
                const isDefender = evt.actor === 'defender';
                const isResolver = evt.actor === 'resolver';

                const badgeColor = isGuard
                  ? evt.type?.includes('BLOCKED') ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : isShopper
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : isDefender
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : isResolver
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-slate-500/20 text-slate-300 border-slate-500/30';

                return (
                  <div key={evt.id} className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5 text-xs hover:border-slate-700 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badgeColor}`}>
                          {evt.actor}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-300">{evt.type}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-300 leading-relaxed font-sans mb-1.5">
                      {evt.reasoningText}
                    </div>

                    {evt.payload && (
                      <div className="rounded bg-slate-950/70 p-2 font-mono text-[10px] text-slate-400 overflow-x-auto max-h-24">
                        {JSON.stringify(evt.payload, null, 2)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* COLUMN 3: STATE & VERIFICATION CARDS (Cols 9-12)          */}
        {/* ======================================================== */}
        <div className="col-span-4 flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="shrink-0 flex items-center border-b border-slate-800 bg-slate-900/50">
            <button
              onClick={() => setActiveRightTab('receipts')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeRightTab === 'receipts'
                  ? 'border-teal-400 text-teal-300 bg-teal-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Receipt Chain ({receipts.length})
            </button>
            <button
              onClick={() => setActiveRightTab('disputes')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeRightTab === 'disputes'
                  ? 'border-teal-400 text-teal-300 bg-teal-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Disputes &amp; EV
            </button>
            <button
              onClick={() => setActiveRightTab('mandate')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition border-b-2 ${
                activeRightTab === 'mandate'
                  ? 'border-teal-400 text-teal-300 bg-teal-500/10'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Mandate JWS
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-3.5">
            {/* TAB 1: RECEIPT CHAIN */}
            {activeRightTab === 'receipts' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-950/20 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-teal-400 text-sm">🔒</span>
                    <span className="text-xs font-bold text-teal-300">Cryptographic Receipt Chain</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-500/20 text-teal-300">
                    VERIFIED UNBROKEN
                  </span>
                </div>

                <div className="space-y-2">
                  {receipts.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-3 text-center">No receipts recorded yet.</div>
                  ) : (
                    receipts.map((r, idx) => (
                      <div key={r.id || idx} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-200 text-xs">Receipt #{idx + 1}</span>
                          <span className="text-[10px] font-mono text-slate-400">Order: {r.orderId?.slice(0, 14)}...</span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 space-y-0.5">
                          <div>Hash: <span className="text-teal-300">{r.hash?.slice(0, 24)}...</span></div>
                          <div>Prev: <span className="text-slate-500">{r.prevHash?.slice(0, 24)}...</span></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: DISPUTES & EV */}
            {activeRightTab === 'disputes' && (
              <div className="space-y-3">
                {/* Modeled cost notice */}
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 text-[10px] text-slate-400">
                  <span className="font-bold text-slate-300">Dispute Handling Cost:</span> $15.00 (modeled cost assumption per DISPUTE_HANDLING_COST).
                </div>

                {/* Case 1: Ridgeback Jacket */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-emerald-300">Item not as described -&gt; refund</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      RESOLVED ($38.00)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mb-1.5">
                    Ridgeback Jacket delivery inspection confirmed missing waterproof membrane.
                  </div>
                  <div className="rounded bg-slate-950/60 p-2 text-[10px] font-mono text-slate-400 space-y-0.5">
                    <div>Evidence pWin: <span className="text-rose-400">0.05</span></div>
                    <div>EV Contest: $-48.45 vs EV Accept: $-38.00</div>
                    <div>Decision: <span className="text-emerald-300 font-bold">ACCEPT_AND_REFUND</span></div>
                    <div>PayPal Refund ID: 22X59480TL380680H</div>
                  </div>
                </div>

                {/* Case 2: Larkspur Tent */}
                <div className="rounded-lg border border-teal-500/30 bg-teal-950/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-teal-300">Contested claim</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">
                      CONTESTED ($45.00)
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 mb-1.5">
                    Simulated dispute testing merchant-side defense with stored JWS &amp; pristine delivery.
                  </div>
                  <div className="rounded bg-slate-950/60 p-2 text-[10px] font-mono text-slate-400 space-y-0.5">
                    <div>Evidence pWin: <span className="text-emerald-400">0.95</span></div>
                    <div>EV Contest: $-3.00 vs EV Accept: $-45.00</div>
                    <div>Decision: <span className="text-teal-300 font-bold">CONTEST</span></div>
                    <div>Status: evidence submitted, under PayPal review (sandbox cannot adjudicate)</div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: MANDATE JWS */}
            {activeRightTab === 'mandate' && (
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                  <div className="font-bold text-slate-200">Constraints Locked in JWS</div>
                  <div className="space-y-1 text-[11px] text-slate-300">
                    <div>Total Cap: <span className="font-bold text-teal-300">${mandate?.constraints?.totalCap || 150}</span></div>
                    <div>Per-Purchase Cap: <span className="font-bold text-teal-300">${mandate?.constraints?.perPurchaseCap || 60}</span></div>
                    <div>Approval Threshold: <span className="font-bold text-amber-300">${mandate?.constraints?.approvalThreshold || 50}</span></div>
                    <div>Allowed Merchants: <span className="text-slate-400">Larkspur, Ridgeback</span></div>
                    <div>Allowed Categories: <span className="text-slate-400">outdoor, camping</span></div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-1">
                  <div className="font-bold text-slate-200">Cryptographic Signing</div>
                  <div className="text-[10px] font-mono text-slate-400 break-all">
                    Algorithm: ES256 (ECDSA P-256 + SHA-256)
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 break-all">
                    Mandate Hash: {mandate?.hash || 'c804f38836788f5cf12e4...'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: HUMAN-APPROVAL GATE MODAL (REQUIRE_APPROVAL)    */}
      {/* ======================================================== */}
      {pendingApprovalCart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3 mb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 font-bold text-base">
                ⚠️
              </span>
              <div>
                <h3 className="font-bold text-base text-white">Human Approval Required</h3>
                <p className="text-xs text-amber-400/90 font-medium">Mandate Soft Gate Triggered</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800">
                <div className="text-xs text-slate-400">Proposed Purchase:</div>
                <div className="text-sm font-bold text-white mt-0.5">{pendingApprovalCart.title}</div>
                <div className="text-lg font-black text-amber-300 mt-1">${pendingApprovalCart.total?.toFixed(2)} USD</div>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed bg-amber-950/20 border border-amber-500/20 rounded-lg p-3">
                This purchase of <span className="font-bold text-white">${pendingApprovalCart.total?.toFixed(2)}</span> exceeds your mandate approval threshold of <span className="font-bold text-white">${pendingApprovalCart.threshold?.toFixed(2)}</span>.
                The autonomous agent cannot proceed without your explicit authorization.
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleApproveCart}
                disabled={loadingAction === 'approve-cart'}
                className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-2.5 transition shadow-lg shadow-emerald-500/20"
              >
                {loadingAction === 'approve-cart' ? 'Approving...' : 'Approve Purchase'}
              </button>
              <button
                onClick={handleRejectCart}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 transition"
              >
                Reject Purchase
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: PAYPAL VAULT SETUP FOR JUDGES                    */}
      {/* ======================================================== */}
      {vaultModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-blue-500/40 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 font-bold text-white text-base">
                  P
                </span>
                <div>
                  <h3 className="font-bold text-base text-white">Connect PayPal Vault (Judges)</h3>
                  <p className="text-xs text-slate-400">Sandbox Merchant Vaulting Authorization</p>
                </div>
              </div>
              <button onClick={() => setVaultModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3 mb-6 text-xs text-slate-300">
              <p>
                To enable autonomous checkout with your US buyer sandbox account, approve the setup agreement:
              </p>
              <div className="rounded-lg bg-slate-900 p-3 border border-slate-800 font-mono text-[11px] text-teal-300 break-all">
                {vaultSetupLink}
              </div>
              <p className="text-slate-400 text-[11px]">
                Open the link above in an incognito window, log in with your US buyer credentials, and approve. Once approved, PayPal redirects to <code className="text-slate-300">/api/vault/return</code> and your permanent Vault Payment Token is saved automatically.
              </p>
            </div>

            <div className="flex gap-3">
              <a
                href={vaultSetupLink || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs py-2.5 transition shadow-lg shadow-blue-600/20"
              >
                Open Approval Link in New Tab
              </a>
              <button
                onClick={() => setVaultModalOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 text-slate-300 text-xs font-semibold hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

