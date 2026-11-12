'use client';

import React from 'react';
import Link from 'next/link';

export type DecisionFilter = 'ALL' | 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';

export function ReportsSidebar({
  activeSection,
  onNavigate,
  decisionFilter,
  onFilterChange,
  onRefresh,
}: {
  activeSection?: string;
  onNavigate?: (sectionId: string) => void;
  decisionFilter?: DecisionFilter;
  onFilterChange?: (filter: DecisionFilter) => void;
  onRefresh?: () => void;
}) {
  const navItems = [
    { id: 'operations', label: 'Operations & KPIs', icon: '📊' },
    { id: 'purchases', label: 'Purchases & Receipts (AG Grid)', icon: '🛡' },
    { id: 'guard-decisions', label: 'Guard Decisions Matrix', icon: '⚡' },
    { id: 'disputes', label: 'Disputes & Defense', icon: '⚖' },
  ];

  const handleNav = (id: string) => {
    if (onNavigate) {
      onNavigate(id);
    } else {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div className="space-y-6">
        {/* Navigation Section */}
        <div>
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-pp-muted">
            Safety Net Views
          </p>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                      active
                        ? 'bg-pp-highlight font-bold text-pp-navy border border-pp-blue/20'
                        : 'text-slate-700 hover:bg-pp-canvas hover:text-pp-navy'
                    }`}
                  >
                    <span className="text-sm">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Filter Section */}
        {onFilterChange && (
          <div>
            <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-pp-muted">
              Filter Decisions
            </p>
            <div className="space-y-1">
              {(['ALL', 'ALLOW', 'REQUIRE_APPROVAL', 'BLOCK'] as DecisionFilter[]).map((filter) => {
                const active = decisionFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => onFilterChange(filter)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? 'bg-pp-navy text-white font-bold'
                        : 'text-slate-600 hover:bg-pp-canvas'
                    }`}
                  >
                    <span>{filter === 'ALL' ? 'Show All' : filter}</span>
                    {active && <span className="text-[10px]">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="border-t border-pp-border pt-4 space-y-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-pp-border bg-white px-3 py-2 text-xs font-bold text-pp-navy hover:bg-pp-highlight transition shadow-sm"
          >
            ↻ Refresh Analytics
          </button>
        )}
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-pp-canvas px-3 py-2 text-xs font-bold text-pp-navy hover:bg-slate-200 transition"
        >
          ← Return to Console
        </Link>
      </div>
    </div>
  );
}
