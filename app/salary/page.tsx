'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import BulkConfirmTab from '@/components/salary/BulkConfirmTab';
import PayslipTab from '@/components/salary/PayslipTab';
import PaymentTrackerTab from '@/components/salary/PaymentTrackerTab';
import MonthlyReportTab from '@/components/salary/MonthlyReportTab';
import { Lock } from 'lucide-react';

type Tab = 'bulk_confirm' | 'payslip' | 'payments' | 'report';

export default function SalaryPage() {
  const { canSeeSalaryBreakdown, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('bulk_confirm');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  // Security gate: non-Admin/Ops sees lock screen
  if (!canSeeSalaryBreakdown) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-[14px] p-8 max-w-sm w-full flex flex-col items-center shadow-sm">
          <Lock size={48} strokeWidth={1.5} className="mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-bold text-white mb-2">Salary Data Locked</h2>
          <p className="text-[var(--text-muted)] text-xs font-semibold leading-relaxed mb-6">
            Only the Owner and Operations Manager can view or modify salary details.
          </p>
          <div className="font-[900] text-lg tracking-tight flex items-center leading-none opacity-40">
            <span className="text-white">near</span>
            <span className="text-white/60">bi</span>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bulk_confirm', label: 'Bulk Confirm' },
    { id: 'payslip', label: 'Payslip' },
    { id: 'payments', label: 'Payments' },
    { id: 'report', label: 'Monthly Report' },
  ];

  return (
    <div className="space-y-5 pb-6">
      {/* Tab Navigation - Hidden during printing */}
      <div className="print:hidden overflow-x-auto scrollbar-none -mx-4 px-4 pb-1 select-none">
        <div className="flex space-x-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                  isActive
                    ? 'bg-white text-[#1E2028] border-white'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-white/20 active:scale-95'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="animate-in fade-in duration-200">
        {activeTab === 'bulk_confirm' && <BulkConfirmTab />}
        {activeTab === 'payslip' && <PayslipTab />}
        {activeTab === 'payments' && <PaymentTrackerTab />}
        {activeTab === 'report' && <MonthlyReportTab />}
      </div>
    </div>
  );
}
