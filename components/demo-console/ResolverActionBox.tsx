'use client';

import React, { useState } from 'react';

export interface ResolverActionBoxProps {
  caseFile: {
    caseId: string;
    orderId: string;
    paypalCaptureId: string;
    itemTitle: string;
    disputedAmount: number;
    reason: string;
    summary: string;
    copyPasteFilingText: string;
  };
  defenderDecision?: {
    decision: string;
    pWin: number;
    evAnalysis: {
      orderAmount: number;
      disputeFee: number;
      evContest: number;
      evAccept: number;
      evOffer: number;
      optimalDecision: string;
    };
    narrative: string;
    actionTaken: string;
    refundId?: string;
  };
}

export function ResolverActionBox({ caseFile, defenderDecision }: ResolverActionBoxProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyAndOpen = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(caseFile.copyPasteFilingText);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
    // Open PayPal Sandbox Resolution Center in a new tab
    if (typeof window !== 'undefined') {
      window.open('https://www.sandbox.paypal.com/disputes', '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="space-y-6">
      {/* Resolver Case File Card */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200/60 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
              R
            </span>
            <div>
              <h3 className="font-semibold text-blue-950">Resolver Agent Case File</h3>
              <p className="text-xs text-blue-800">
                Case ID: <code className="font-mono">{caseFile.caseId}</code> &bull; Capture:{' '}
                <code className="font-mono">{caseFile.paypalCaptureId}</code>
              </p>
            </div>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 border border-blue-200">
            {caseFile.reason}
          </span>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <span className="font-medium text-slate-700">Item Claim:</span>{' '}
            <span className="text-slate-900 font-semibold">{caseFile.itemTitle}</span> ($
            {caseFile.disputedAmount.toFixed(2)} USD)
          </div>
          <p className="text-slate-700 leading-relaxed bg-white/80 p-3 rounded-lg border border-blue-100">
            {caseFile.summary}
          </p>

          <div className="mt-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Filing Statement (Structured for Resolution Center)
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-xs text-slate-100">
              {caseFile.copyPasteFilingText}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={handleCopyAndOpen}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {copied ? (
                <>
                  <svg className="h-4 w-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied! Opening Resolution Center...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  Copy case text + open Resolution Center
                </>
              )}
            </button>
            <span className="text-xs text-slate-500">
              Direct link to PayPal Sandbox Resolution Center
            </span>
          </div>
        </div>
      </div>

      {/* Defender Decision Card */}
      {defenderDecision && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                D
              </span>
              <div>
                <h3 className="font-semibold text-emerald-950">Defender Agent Decision Engine</h3>
                <p className="text-xs text-emerald-800">
                  Autonomous Merchant Defense &bull; Deterministic Policy Execution
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900 border border-emerald-300">
              {defenderDecision.decision}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="bg-white p-3 rounded-lg border border-emerald-100">
              <span className="block text-xs font-medium text-slate-500">Win Probability (pWin)</span>
              <span className="text-lg font-bold text-slate-900">
                {(defenderDecision.pWin * 100).toFixed(0)}%
              </span>
              <span className="block text-[11px] text-amber-700 mt-0.5">Defect confirmed in log</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-emerald-100">
              <span className="block text-xs font-medium text-slate-500">EV Contest</span>
              <span className="text-lg font-bold text-rose-600">
                ${defenderDecision.evAnalysis.evContest.toFixed(2)}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">pWin·V − (1−pWin)·(V+fee)</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-emerald-100">
              <span className="block text-xs font-medium text-slate-500">EV Accept (Refund)</span>
              <span className="text-lg font-bold text-emerald-700">
                ${defenderDecision.evAnalysis.evAccept.toFixed(2)}
              </span>
              <span className="block text-[11px] text-emerald-600 mt-0.5 font-medium">Optimal decision</span>
            </div>
            <div className="bg-white p-3 rounded-lg border border-emerald-100">
              <span className="block text-xs font-medium text-slate-500">EV Offer (Partial)</span>
              <span className="text-lg font-bold text-slate-700">
                ${defenderDecision.evAnalysis.evOffer.toFixed(2)}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">50% settlement</span>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-600">
            * Note: Dispute handling fee (${defenderDecision.evAnalysis.disputeFee.toFixed(2)}) is a{' '}
            <span className="font-semibold text-slate-800">modeled cost</span> assumption.
          </div>

          <div className="mt-4 bg-white p-4 rounded-lg border border-emerald-100 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                LLM Decision Narrative (Groq Llama 3)
              </span>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed italic">
              &ldquo;{defenderDecision.narrative}&rdquo;
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200/60 pt-3 text-xs text-emerald-900 font-mono">
            <div>
              <span className="font-semibold">Action Taken:</span> {defenderDecision.actionTaken}
            </div>
            {defenderDecision.refundId && (
              <div className="bg-emerald-100 px-2.5 py-1 rounded border border-emerald-200">
                <span className="font-semibold">PayPal Refund ID:</span> {defenderDecision.refundId}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
