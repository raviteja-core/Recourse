'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

// Recourse Operations Shell: clean, professional fintech UI with real navigation and mode indicator.

function TopBar({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-pp-border bg-white px-6">
      {/* Brand Lockup */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pp-navy font-black text-xl text-white shadow-md">
          R
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-base tracking-tight text-pp-navy">RECOURSE</span>
            <span className="text-xs text-pp-muted font-semibold">| Operations Dashboard</span>
          </div>
          <p className="text-[11px] text-pp-muted">Autonomous Financial Safety Net for PayPal AI Agents</p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
          ● LIVE SANDBOX CONNECTED
        </span>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-lg border border-pp-border bg-white px-3 py-1.5 text-xs font-bold text-pp-navy hover:bg-pp-highlight transition shadow-sm"
            title="Refresh dashboard data"
          >
            ↻ Refresh Data
          </button>
        )}

        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-lg bg-pp-navy px-3.5 py-1.5 text-xs font-bold text-white hover:bg-pp-blue-dark transition shadow-sm"
        >
          ← Demo Console Cockpit
        </Link>
      </div>
    </header>
  );
}

export function AppShell({
  sidebar,
  children,
  onRefresh,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex h-dvh flex-col bg-pp-canvas font-paypal text-pp-ink">
      <TopBar onRefresh={onRefresh} />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-64 shrink-0 flex-col border-r border-pp-border bg-white" aria-label="Recourse Navigation">
          {sidebar}
        </nav>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
