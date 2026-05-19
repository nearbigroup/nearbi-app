'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import BulkConfirmTab from '@/components/salary/BulkConfirmTab';
import PayslipTab from '@/components/salary/PayslipTab';
import PaymentTrackerTab from '@/components/salary/PaymentTrackerTab';
import MonthlyReportTab from '@/components/salary/MonthlyReportTab';

type Tab = 'bulk_confirm' | 'payslip' | 'payments' | 'report';

export default function Salary() {
  const { canSeeSalaryBreakdown, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('bulk_confirm');

  if (isLoading) return null;

  if (!canSeeSalaryBreakdown) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center z-[100]">
        <div className="bg-[#1A1A1A] border border-[#333] p-10 rounded-3xl max-w-sm w-full">
          <div className="text-6xl mb-6">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-3">Salary is private</h2>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            Only the owner and operations manager can view salary details.
          </p>
          <div className="font-bold text-xl tracking-tight flex justify-center opacity-50">
            <span className="text-white">near</span>
            <span className="text-brand-accent">bi</span>
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
    <div className="space-y-6 pb-6">
      {/* Tab Navigation - Hidden during printing */}
      <div className="print:hidden overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
        <div className="flex space-x-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand-accent text-[#111]'
                  : 'bg-white/5 text-gray-400 hover:text-white border border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Tab Content */}
      <div className="animate-in fade-in duration-300">
        {activeTab === 'bulk_confirm' && <BulkConfirmTab />}
        {activeTab === 'payslip' && <PayslipTab />}
        {activeTab === 'payments' && <PaymentTrackerTab />}
        {activeTab === 'report' && <MonthlyReportTab />}
      </div>
    </div>
  );
}
