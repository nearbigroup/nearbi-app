'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { House, CalendarDays, ClipboardList, Timer, AlertCircle, LogOut, User } from 'lucide-react';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center">
        <div className="text-[#1A1A1A] font-bold animate-pulse text-sm">Loading staff portal...</div>
      </div>
    );
  }

  if (!user || user.role !== 'staff') {
    return null; // Will be redirected by AuthProvider
  }

  const navItems = [
    { label: 'Home', path: '/my', icon: <House size={22} strokeWidth={1.5} /> },
    { label: 'Attend', path: '/my/attendance', icon: <CalendarDays size={22} strokeWidth={1.5} /> },
    { label: 'Leave', path: '/my/leave', icon: <ClipboardList size={22} strokeWidth={1.5} /> },
    { label: 'OT', path: '/my/overtime', icon: <Timer size={22} strokeWidth={1.5} /> },
    { label: 'Fines', path: '/my/fines', icon: <AlertCircle size={22} strokeWidth={1.5} /> },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8] flex flex-col relative app-frame select-none font-sans">
      {/* Top Header */}
      <header className="bg-white text-[#1A1A1A] sticky top-0 z-[1000] px-4 py-3 flex items-center justify-between min-h-[56px] border-b border-[#E8E8E8] shadow-[0_1px_3px_rgba(0,0,0,0.06)] pt-[calc(12px+env(safe-area-inset-top,0px))]">
        <div className="flex items-center space-x-2">
          <div className="font-[900] text-[20px] tracking-tight flex items-center cursor-pointer" onClick={() => !user.mustChangePassword && router.push('/my')}>
            <span className="text-[#1A1A1A]">near</span>
            <span className="text-[#1A1A1A]">bi</span>
          </div>
          <div className="bg-[#1A1A1A] text-white text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ml-1.5">
            STAFF
          </div>
        </div>

        {!user.mustChangePassword && (
          <div className="flex items-center space-x-3">
            <div className="text-[#555555] font-bold text-xs text-right max-w-[120px] truncate">
              {user.name}
            </div>
            
            <button
              onClick={() => router.push('/my/profile')}
              className="p-1 text-[#999999] hover:text-[#1A1A1A] transition-colors active:scale-90"
              title="Profile"
            >
              <User size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
            </button>

            <button
              onClick={logout}
              className="bg-[#F2F2F2] text-[#555555] hover:text-[#1A1A1A] hover:bg-[#EBEBEB] px-2.5 py-1.5 text-[11px] rounded-[8px] font-bold active:scale-95 transition-all flex items-center space-x-1"
            >
              <LogOut size={13} strokeWidth={1.5} style={{ color: 'currentColor' }} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Page Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 pb-[calc(80px+env(safe-area-inset-bottom,20px))]">
        {children}
      </main>

      {/* Bottom Tab Navigation */}
      {!user.mustChangePassword && (
        <nav className="fixed bottom-0 left-0 right-0 z-[9999] bg-white border-t border-[#E8E8E8] shadow-[0_-2px_12px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,16px)]">
          <div className="max-w-md mx-auto flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex-1 flex flex-col items-center justify-center min-h-[60px] cursor-pointer border-t-2 select-none transition-all ${
                    isActive
                      ? 'border-[#1A1A1A] text-[#1A1A1A] bg-[#F8F8F8]'
                      : 'border-transparent text-[#BBBBBB] hover:text-[#1A1A1A]'
                  }`}
                >
                  <span className="mb-0.5">{item.icon}</span>
                  <span className="text-[10px] font-semibold">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
