'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Building2, CircleCheck, ArrowLeft, ChevronRight, Smartphone } from 'lucide-react';

export default function HomePage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedBranch, setSelectedBranch] = useState<'daily' | 'hypermarket' | 'staff' | null>(null);
  const [loginType, setLoginType] = useState<'management' | 'staff'>('management');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, staffLogin, user, setBranch } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'staff') {
        router.replace('/my');
      } else if (user.role === 'kiosk') {
        router.replace('/kiosk');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, router]);

  const handleContinue = () => {
    if (selectedBranch) {
      if (selectedBranch === 'staff') {
        setLoginType('staff');
      } else {
        setLoginType('management');
      }
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
      if (loginType === 'management') {
        const success = await login(email, password);
        if (success) {
          // Get the user that was just saved
          const stored = localStorage.getItem('nearbi_user');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.role === 'kiosk') {
              // Force set branch in both context and localStorage
              setBranch(selectedBranch);
              if (selectedBranch) {
                localStorage.setItem('nearbi_branch', selectedBranch);
              }
              // Small delay to ensure state is set
              await new Promise(r => setTimeout(r, 100));
              router.push('/kiosk');
              return;
            } else if (parsed.role === 'admin' || (parsed.role === 'staff_executive' && parsed.branch === null)) {
              setBranch(selectedBranch === 'staff' ? null : selectedBranch);
            } else if (parsed.role === 'ops_manager') {
              setBranch(null);
            }
          }
          router.push('/dashboard');
        } else {
          setError('Invalid email or password');
        }
      } else {
        const success = await staffLogin(mobileNumber, password);
        if (!success) {
          setError('Invalid mobile number or password');
        }
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const branchLabel = selectedBranch === 'daily'
    ? 'Nearbi Daily'
    : selectedBranch === 'hypermarket'
    ? 'Nearbi Hypermarket'
    : 'Staff Portal';

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Curved background decoration */}
      <div className="absolute bottom-0 left-0 right-0 h-64 bg-[#F2F2F2] rounded-t-[100px] transform translate-y-12 -z-10 w-full" />

      <div className="w-full max-w-[400px] bg-white border border-[#E8E8E8] rounded-[24px] p-8 shadow-[0_4px_20px_rgba(0,0,0,0.08)] flex flex-col relative z-10">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6">
          <div className="font-[900] text-[44px] tracking-tight flex items-center leading-none mb-2.5">
            <span className="text-[#1A1A1A]">near</span>
            <span className="text-[#1A1A1A]">bi</span>
          </div>
          <div className="bg-[#1A1A1A] text-white text-[10px] font-bold px-3.5 py-1 rounded-[20px] uppercase tracking-wider">
            STAFF PORTAL
          </div>
        </div>

        {step === 1 ? (
          <div className="flex flex-col">
            <h2 className="text-[#1A1A1A] text-base font-bold text-center mb-5">
              Select your branch or login option
            </h2>

            <div className="space-y-3 mb-6">
              <button
                type="button"
                onClick={() => setSelectedBranch('daily')}
                className={`w-full flex items-center p-4 rounded-[20px] border transition-all duration-200 text-left ${
                  selectedBranch === 'daily'
                    ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)]'
                    : 'border-[#E8E8E8] bg-white text-[#1A1A1A] hover:bg-[#F8F8F8]'
                }`}
              >
                <Building2 size={24} strokeWidth={1.5} className="mr-3 flex-shrink-0" style={{ color: selectedBranch === 'daily' ? '#FFFFFF' : '#1A1A1A' }} />
                <span className="font-semibold text-sm flex-1">
                  Nearbi Daily
                </span>
                {selectedBranch === 'daily' && (
                  <CircleCheck size={18} strokeWidth={1.5} style={{ color: '#FFFFFF' }} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedBranch('hypermarket')}
                className={`w-full flex items-center p-4 rounded-[20px] border transition-all duration-200 text-left ${
                  selectedBranch === 'hypermarket'
                    ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)]'
                    : 'border-[#E8E8E8] bg-white text-[#1A1A1A] hover:bg-[#F8F8F8]'
                }`}
              >
                <Building2 size={24} strokeWidth={1.5} className="mr-3 flex-shrink-0" style={{ color: selectedBranch === 'hypermarket' ? '#FFFFFF' : '#1A1A1A' }} />
                <span className="font-semibold text-sm flex-1">
                  Nearbi Hypermarket
                </span>
                {selectedBranch === 'hypermarket' && (
                  <CircleCheck size={18} strokeWidth={1.5} style={{ color: '#FFFFFF' }} />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedBranch('staff')}
                className={`w-full flex items-center p-4 rounded-[20px] border transition-all duration-200 text-left ${
                  selectedBranch === 'staff'
                    ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)]'
                    : 'border-[#E8E8E8] bg-white text-[#1A1A1A] hover:bg-[#F8F8F8]'
                }`}
              >
                <Smartphone size={24} strokeWidth={1.5} className="mr-3 flex-shrink-0" style={{ color: selectedBranch === 'staff' ? '#FFFFFF' : '#1A1A1A' }} />
                <span className="font-semibold text-sm flex-1">
                  Staff Login
                </span>
                {selectedBranch === 'staff' && (
                  <CircleCheck size={18} strokeWidth={1.5} style={{ color: '#FFFFFF' }} />
                )}
              </button>
            </div>

            <button
              onClick={handleContinue}
              disabled={!selectedBranch}
              className={`w-full min-h-[46px] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center ${
                selectedBranch
                  ? 'bg-[#1A1A1A] text-white hover:bg-[#333333] active:scale-[0.98]'
                  : 'bg-[#F2F2F2] text-[#999999] cursor-not-allowed border border-[#E8E8E8]'
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
                className="text-[#999999] text-xs font-semibold hover:text-[#1A1A1A] flex items-center transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={1.5} className="mr-1.5" />
                <span>Back</span>
              </button>
              <div className="bg-[#F2F2F2] text-[#555555] text-xs font-bold px-3 py-1 rounded-full">
                {branchLabel}
              </div>
            </div>

            {/* Tab selector */}
            <div className="flex bg-[#F2F2F2] rounded-full p-1 mb-3">
              <button
                type="button"
                onClick={() => setLoginType('management')}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-full transition-all ${
                  loginType === 'management'
                    ? 'bg-white text-[#1A1A1A] shadow-sm'
                    : 'text-[#999999] hover:text-[#1A1A1A]'
                }`}
              >
                Management
              </button>
              <button
                type="button"
                onClick={() => setLoginType('staff')}
                className={`flex-1 text-center py-2 text-xs font-bold rounded-full transition-all ${
                  loginType === 'staff'
                    ? 'bg-white text-[#1A1A1A] shadow-sm'
                    : 'text-[#999999] hover:text-[#1A1A1A]'
                }`}
              >
                Staff Login
              </button>
            </div>

            <p className="text-[10px] text-[#999999] font-bold text-center mb-4 uppercase tracking-wider">
              {loginType === 'management' ? 'For HR, Ops, Admin' : 'For store staff'}
            </p>

            {error && (
              <div className="bg-[#FDECEA] border border-[#C0392B]/20 text-[#C0392B] text-xs font-semibold px-3 py-2 rounded-md mb-4">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              {loginType === 'management' ? (
                <div>
                  <label className="block text-[11px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] focus:ring-4 focus:ring-[#1A1A1A]/8 text-[#1A1A1A] font-bold placeholder:text-[#999999]"
                    placeholder="name@nearbi.com"
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    pattern="[0-9]{10}"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').substring(0, 10))}
                    className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] focus:ring-4 focus:ring-[#1A1A1A]/8 text-[#1A1A1A] font-bold placeholder:text-[#999999]"
                    placeholder="e.g. 9876543210"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-[#999999] uppercase tracking-wider mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-sm focus:outline-none focus:border-[#1A1A1A] focus:ring-4 focus:ring-[#1A1A1A]/8 text-[#1A1A1A] font-bold placeholder:text-[#999999]"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[46px] bg-[#1A1A1A] text-white font-bold text-[15px] rounded-[12px] hover:bg-[#333333] active:scale-[0.98] transition-all shadow-[0_2px_8px_rgba(0,0,0,0.15)] mt-2"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>

              {loginType === 'staff' && (
                <p className="text-[11px] text-[#999999] text-center mt-4">
                  Forgot password? Contact your manager
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
