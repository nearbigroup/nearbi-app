'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

export default function StaffChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;

    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password cannot be the same as current password.');
      return;
    }

    setSubmitting(true);

    try {
      // user.email holds the 10-digit mobile number for staff role
      const res = await changePassword(user.email, currentPassword, newPassword);
      if (res) {
        setSuccess('Password updated successfully!');
        showToast('Password changed successfully');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          router.push('/my');
        }, 1500);
      } else {
        setError('Incorrect current password. Please try again.');
      }
    } catch (err: any) {
      console.error('Error changing password:', err);
      setError(err.message || 'Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-3 shadow-sm flex items-center justify-between">
        <button
          onClick={() => router.push('/my')}
          className="p-1 text-[var(--text-secondary)] hover:text-[#1A1A1A] transition-all active:scale-95 flex items-center space-x-1 text-xs font-bold"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <span className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider">Change Password</span>
        <Lock size={16} className="text-[var(--text-secondary)]" />
      </div>

      {/* Change Password Form */}
      <div className="bg-white border border-[#E8E8E8] rounded-[16px] p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-extrabold text-[#1A1A1A] uppercase tracking-wider border-b border-[var(--border)] pb-2 mb-2">Update Security Credentials</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-[var(--danger)] p-3 rounded-lg text-xs font-bold flex items-center space-x-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] p-3 rounded-lg text-xs font-bold flex items-center space-x-2">
              <CheckCircle size={16} className="flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Current Password (PIN)
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full text-[#1A1A1A] font-bold !pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[#1A1A1A]"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              New Password (Min 6 chars)
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full text-[#1A1A1A] font-bold !pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[#1A1A1A]"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Verify Password */}
          <div>
            <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full text-[#1A1A1A] font-bold !pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[#1A1A1A]"
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl hover:bg-[#333333] active:scale-95 transition-all shadow flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Global Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-[var(--success-bg)] border border-[var(--success)]/20 text-[var(--success)] text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg z-[15000] backdrop-blur-sm transition-all duration-300">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
