'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Building2, CircleCheck, ArrowLeft, ChevronRight } from 'lucide-react';

export default function HomePage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedBranch, setSelectedBranch] = useState<'daily' | 'hypermarket' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, user, setBranch } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'kiosk') {
        router.replace('/kiosk');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, router]);

  const handleContinue = () => {
    if (selectedBranch) {
      setStep(2);
    }
  };

  const handleBack = () => {
    setError('');
    setStep(1);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const success = await login(email, password);
      if (success) {
        // If logged-in user is admin/ops/head HR, set their viewed branch to the selected branch
        const storedUser = localStorage.getItem('nearbi_user');
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          if (parsed.role === 'admin' || parsed.role === 'ops_manager' || (parsed.role === 'staff_executive' && parsed.branch === null)) {
            setBranch(selectedBranch);
          }
        }
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const branchLabel = selectedBranch === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-[18px] p-6 shadow-2xl flex flex-col">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6">
          <div className="font-[900] text-[44px] tracking-tight flex items-center leading-none mb-2">
            <span className="text-white">near</span>
            <span className="text-white">bi</span>
          </div>
          <div className="border border-white/20 text-[var(--text-secondary)] text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider bg-transparent">
            STAFF PORTAL
          </div>
        </div>

        {step === 1 ? (
          <div className="flex flex-col">
            <h2 className="text-white text-base font-bold text-center mb-5">
              Select your branch
            </h2>

            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={() => setSelectedBranch('daily')}
                className={`w-full flex items-center p-4 rounded-[14px] border transition-all text-left ${
                  selectedBranch === 'daily'
                    ? 'border-white/40 bg-[var(--bg-elevated)]'
                    : 'border-[var(--border)] bg-[var(--bg-surface)] active:bg-[var(--bg-elevated)]'
                }`}
              >
                <Building2 size={24} strokeWidth={1.5} style={{ color: '#F5A800' }} className="mr-3 flex-shrink-0" />
                <span className="font-semibold text-sm flex-1 text-white">
                  Nearbi Daily
                </span>
                {selectedBranch === 'daily' && (
                  <CircleCheck size={18} strokeWidth={1.5} style={{ color: '#4ADE80' }} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedBranch('hypermarket')}
                className={`w-full flex items-center p-4 rounded-[14px] border transition-all text-left ${
                  selectedBranch === 'hypermarket'
                    ? 'border-white/40 bg-[var(--bg-elevated)]'
                    : 'border-[var(--border)] bg-[var(--bg-surface)] active:bg-[var(--bg-elevated)]'
                }`}
              >
                <Building2 size={24} strokeWidth={1.5} style={{ color: '#F5A800' }} className="mr-3 flex-shrink-0" />
                <span className="font-semibold text-sm flex-1 text-white">
                  Nearbi Hypermarket
                </span>
                {selectedBranch === 'hypermarket' && (
                  <CircleCheck size={18} strokeWidth={1.5} style={{ color: '#4ADE80' }} />
                )}
              </button>
            </div>

            <button
              onClick={handleContinue}
              disabled={!selectedBranch}
              className={`w-full min-h-[46px] rounded-[10px] font-bold text-[15px] transition-all flex items-center justify-center ${
                selectedBranch
                  ? 'bg-white text-[#1E2028] hover:bg-gray-200 active:scale-[0.98]'
                  : 'bg-[var(--bg-input)] text-[var(--text-muted)] cursor-not-allowed border border-[var(--border)]'
              }`}
            >
              <span>Continue</span>
              <ChevronRight size={18} strokeWidth={1.5} className="ml-1.5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={handleBack}
                className="text-[var(--text-muted)] text-xs font-semibold hover:text-white flex items-center transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={1.5} className="mr-1.5" />
                <span>Back</span>
              </button>
              <div className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-bold px-2.5 py-0.5 rounded border border-[var(--border-strong)]">
                {branchLabel}
              </div>
            </div>

            <h2 className="text-white text-lg font-bold mb-4">Sign in</h2>

            {error && (
              <div className="bg-[var(--danger-bg)] border border-[var(--danger)] text-[#F87171] text-xs font-semibold px-3 py-2 rounded-md mb-4">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 focus:outline-none focus:border-white/40 text-sm text-white"
                  placeholder="name@nearbi.com"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-muted)] mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border)] rounded-[10px] p-3 focus:outline-none focus:border-white/40 text-sm text-white"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[46px] bg-white text-[#1E2028] font-bold text-[15px] rounded-[10px] hover:bg-gray-200 active:scale-[0.98] transition-all mt-2"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
