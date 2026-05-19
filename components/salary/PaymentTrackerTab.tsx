'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getCurrentMonthStr, formatMonthDisplay } from './utils';

export default function PaymentTrackerTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const month = getCurrentMonthStr();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);

  // Payment Bottom Sheet State
  const [selectedConf, setSelectedConf] = useState<SalaryConfirmation | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<'cash' | 'upi'>('upi');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const { data: staffData } = await supabase.from('staff').select('*, branch:branches(name)').eq('active', true);
      const { data: confData } = await supabase.from('salary_confirmations').select('*').eq('month', month);
      const { data: payData } = await supabase.from('salary_payments').select('*').eq('month', month);

      if (staffData) setStaffList(staffData);
      if (confData) setConfirmations(confData);
      if (payData) setPayments(payData);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPayment = (conf: SalaryConfirmation) => {
    setSelectedConf(conf);
    setPayAmount(conf.net_salary.toString());
    setPayMode('upi');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('');
  };

  const handleConfirmPayment = async () => {
    if (!user || !selectedConf) return;
    setSubmitting(true);
    try {
      const staffInfo = staffList.find(s => s.id === selectedConf.staff_id);
      
      const { error } = await supabase.from('salary_payments').insert({
        staff_id: selectedConf.staff_id,
        month: month,
        amount_paid: Number(payAmount),
        payment_mode: payMode,
        paid_at: new Date(payDate).toISOString(),
        paid_by: user.email,
        branch_id: staffInfo?.branch_id,
        notes: payNotes
      });

      if (error) throw error;
      
      alert('Payment recorded ✓');
      setSelectedConf(null);
      await fetchData();

    } catch (e) {
      console.error(e);
      alert('Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-400">Loading payments...</div>;

  const totalConfirmed = confirmations.reduce((sum, c) => sum + c.net_salary, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0);
  const pendingAmount = totalConfirmed - totalPaid;

  // Filter staff who have confirmations
  const confirmedStaffIds = confirmations.map(c => c.staff_id);
  const relevantStaff = staffList.filter(s => confirmedStaffIds.includes(s.id));

  const pendingList = confirmations.filter(c => !payments.find(p => p.staff_id === c.staff_id));
  const paidList = payments.filter(p => confirmations.find(c => c.staff_id === p.staff_id));

  return (
    <div className="space-y-6 relative">
      <div className="print:hidden">
        <h2 className="text-xl font-bold text-white">Salary Payments — {formatMonthDisplay(month)}</h2>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1A1A1A] border border-[#333] rounded-xl p-4">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Total Confirmed</div>
          <div className="text-xl font-bold text-white">{formatCurrency(totalConfirmed)}</div>
        </div>
        <div className="bg-[#1A1A1A] border border-[#333] rounded-xl p-4">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Paid ({paidList.length}/{confirmations.length})</div>
          <div className="text-xl font-bold text-[#69F0AE]">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="col-span-2 bg-brand-accent/10 border border-brand-accent/20 rounded-xl p-4 flex justify-between items-center">
          <div className="text-sm text-brand-accent font-bold uppercase tracking-wider">Pending Amount</div>
          <div className="text-2xl font-black text-brand-accent">{formatCurrency(pendingAmount)}</div>
        </div>
      </div>

      {/* Pending Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-[#333] pb-2 mt-4">Pending Payment ({pendingList.length})</h3>
        
        {pendingList.length === 0 && (
          <div className="text-center py-6 text-gray-600 italic">No pending payments.</div>
        )}

        {pendingList.map(conf => {
          const s = staffList.find(x => x.id === conf.staff_id);
          if (!s) return null;
          return (
            <div key={conf.id} className="bg-[#111] border border-[#333] rounded-2xl p-4 flex justify-between items-center">
              <div>
                <div className="font-bold text-white">{s.name}</div>
                <div className="text-xs text-gray-400">{s.branch?.name} • {s.department}</div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="text-lg font-bold text-brand-accent mb-2">{formatCurrency(conf.net_salary)}</div>
                <button 
                  onClick={() => handleOpenPayment(conf)}
                  className="bg-brand-accent/20 text-brand-accent border border-brand-accent/30 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider active:scale-95"
                >
                  Mark as Paid
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paid Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest border-b border-[#333] pb-2 mt-8">Paid ({paidList.length})</h3>
        
        {paidList.map(pay => {
          const s = staffList.find(x => x.id === pay.staff_id);
          if (!s) return null;
          return (
            <div key={pay.id} className="bg-[#1A1A1A] border border-[#2E7D32]/30 rounded-2xl p-4 flex justify-between items-center opacity-80">
              <div>
                <div className="font-bold text-white flex items-center">
                  {s.name}
                  <span className="ml-2 bg-[#2E7D32]/20 text-[#69F0AE] text-[9px] px-1.5 py-0.5 rounded uppercase font-bold border border-[#2E7D32]/30">
                    {pay.payment_mode}
                  </span>
                </div>
                <div className="text-xs text-gray-400">{s.branch?.name} • Paid on {new Date(pay.paid_at).toLocaleDateString()}</div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="text-lg font-bold text-[#69F0AE]">{formatCurrency(pay.amount_paid)}</div>
                <div className="text-[10px] text-[#2E7D32] uppercase font-bold tracking-widest flex items-center mt-1">
                  <span className="mr-1">✓</span> Paid
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment Bottom Sheet */}
      {selectedConf && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
          <div className="bg-[#111] border border-[#333] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom-10">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Record Payment</h3>
              <button onClick={() => setSelectedConf(null)} className="text-gray-400 hover:text-white p-2">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Staff Name</label>
                <div className="bg-[#1A1A1A] border border-[#333] text-gray-300 p-3 rounded-xl">
                  {staffList.find(s => s.id === selectedConf.staff_id)?.name}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Amount (₹)</label>
                <input 
                  type="number" 
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white p-3 rounded-xl focus:outline-none focus:border-brand-accent text-xl font-bold"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Payment Mode</label>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setPayMode('upi')}
                    className={`flex-1 py-3 rounded-xl font-bold border transition-colors ${payMode === 'upi' ? 'bg-brand-accent text-[#111] border-brand-accent' : 'bg-[#1A1A1A] text-gray-400 border-[#333]'}`}
                  >
                    UPI
                  </button>
                  <button 
                    onClick={() => setPayMode('cash')}
                    className={`flex-1 py-3 rounded-xl font-bold border transition-colors ${payMode === 'cash' ? 'bg-brand-accent text-[#111] border-brand-accent' : 'bg-[#1A1A1A] text-gray-400 border-[#333]'}`}
                  >
                    CASH
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Date Paid</label>
                <input 
                  type="date" 
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white p-3 rounded-xl focus:outline-none focus:border-brand-accent"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1 block">Notes (Optional)</label>
                <input 
                  type="text" 
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. advance deduction"
                  className="w-full bg-[#1A1A1A] border border-[#333] text-white p-3 rounded-xl focus:outline-none focus:border-brand-accent"
                />
              </div>

              <button 
                onClick={handleConfirmPayment}
                disabled={submitting || !payAmount}
                className="w-full bg-brand-accent text-[#111] font-bold text-lg py-4 rounded-xl shadow-[0_4px_14px_rgba(245,168,0,0.4)] active:scale-95 transition-all mt-4 disabled:opacity-50"
              >
                {submitting ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
