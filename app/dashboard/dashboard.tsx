'use client';

import { useState } from 'react';
import { AppShell } from './components/app-shell';
import { ReportsSidebar, type DecisionFilter } from './components/sidebar';
import { RecourseSafetyNetView } from './components/RecourseSafetyNetView';
import { DashboardSkeleton } from './components/skeleton';

export function Dashboard() {
  const [activeSection, setActiveSection] = useState('operations');
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('ALL');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <AppShell
      onRefresh={handleRefresh}
      sidebar={
        <ReportsSidebar
          activeSection={activeSection}
          onNavigate={handleNavigate}
          decisionFilter={decisionFilter}
          onFilterChange={setDecisionFilter}
          onRefresh={handleRefresh}
        />
      }
    >
      <div key={refreshKey} className="flex-1 bg-pp-canvas">
        <RecourseSafetyNetView filter={decisionFilter} />
      </div>
    </AppShell>
  );
}
