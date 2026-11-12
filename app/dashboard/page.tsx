import type { Metadata } from 'next';
import { Dashboard } from './dashboard';

export const metadata: Metadata = {
  title: 'Recourse Operations Dashboard | PayPal Safety Net',
  description: 'Autonomous financial safety net for PayPal AI agents with AG Grid',
};

export default function DashboardPage() {
  return <Dashboard />;
}
