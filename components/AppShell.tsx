'use client';

import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, branch, logout, isLoading } = useAuth();
  const pathname = usePathname();

  // Do not show AppShell on login page or kiosk page
  if (pathname === '/' || pathname === '/kiosk' || isLoading || !user) {
    return <>{children}</>;
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Attend', path: '/attendance', icon: '🕐' },
    { label: 'Staff', path: '/staff', icon: '👥' },
    { label: 'Leave', path: '/leave', icon: '📋' },
    { label: 'Salary', path: '/salary', icon: '💰' },
  ];

  return (
    <div className="min-h-screen bg-brand-primary flex flex-col app-frame">
      {/* Top Bar */}
      <header 
        className="text-white"
        style={{
          background: '#111111',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          minHeight: '56px',
        }}
      >
        <div className="flex items-center space-x-3">
          <div className="font-bold text-[22px] tracking-tight flex">
            <span className="text-white">near</span>
            <span className="text-brand-accent">bi</span>
          </div>
          <div className="bg-brand-accent text-[#111] text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
            STAFF
          </div>
        </div>
        <div className="flex items-center space-x-4">
          {branch && (
            <div className="text-brand-accent font-medium text-sm border border-brand-accent/30 bg-brand-accent/10 px-2.5 py-1 rounded-md capitalize max-w-[120px] truncate">
              {branch}
            </div>
          )}
          <button 
            onClick={logout}
            className="text-[12px] font-medium border border-[#333] hover:border-gray-400 px-[10px] py-[4px] rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main 
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 20px))',
          paddingLeft: '16px',
          paddingRight: '16px',
          paddingTop: '12px',
          maxWidth: '480px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {children}
      </main>

      {/* Bottom Nav */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '480px',
        zIndex: 9999,
        background: '#FFFFFF',
        borderTop: '2px solid #F5A800',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.10)',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        display: 'flex',
      }}>
        <div className="w-full max-w-[480px] mx-auto flex justify-between px-0">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.path);
            return (
              <Link 
                key={item.path} 
                href={item.path}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  minHeight: '60px',
                  border: 'none',
                  background: isActive ? '#FFF8E7' : '#FFFFFF',
                  borderTop: isActive 
                    ? '3px solid #F5A800' 
                    : '3px solid transparent',
                  cursor: 'pointer',
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: '22px' }}>{item.icon}</span>
                <span style={{ 
                  fontSize: '10px', 
                  marginTop: '3px',
                  color: isActive ? '#D48F00' : '#9E9E9E'
                }}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
