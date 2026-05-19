'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const { login } = useAuth();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!selectedBranch) return;
    
    const success = login(email, password, selectedBranch);
    if (!success) {
      setError('Invalid email or password');
    }
  };

  const branchName = selectedBranch === 'daily' ? 'Nearbi Daily' : 'Nearbi Hypermarket';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="nearbi-card w-full max-w-md p-8 shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="font-bold text-4xl tracking-tight flex mb-2">
            <span className="text-brand-text">near</span>
            <span className="text-brand-accent">bi</span>
          </div>
          <div className="bg-brand-accent/20 text-brand-accent text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
            Staff Portal
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold text-center mb-6">Select your branch</h2>
            
            <div className="space-y-4">
              {[
                { id: 'daily', name: 'Nearbi Daily', icon: '🏪' },
                { id: 'hypermarket', name: 'Nearbi Hypermarket', icon: '🏪' }
              ].map((branch) => {
                const isSelected = selectedBranch === branch.id;
                return (
                  <button
                    key={branch.id}
                    onClick={() => setSelectedBranch(branch.id)}
                    className={`w-full flex items-center p-4 rounded-xl border-2 transition-all ${
                      isSelected 
                        ? 'border-brand-accent bg-[#FFF8E7]' 
                        : 'border-brand-border bg-white hover:border-brand-accent/50'
                    }`}
                  >
                    <span className="text-3xl mr-4">{branch.icon}</span>
                    <span className="font-medium text-lg flex-1 text-left">{branch.name}</span>
                    {isSelected && (
                      <span className="text-brand-accent font-bold text-xl">✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!selectedBranch}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                selectedBranch 
                  ? 'bg-brand-accent text-brand-text hover:bg-[#E09900]' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center mb-6">
              <button 
                onClick={() => {
                  setStep(1);
                  setError('');
                }}
                className="text-gray-400 hover:text-brand-text transition-colors p-2 -ml-2"
              >
                ← Back
              </button>
              <div className="ml-auto">
                <span className="bg-brand-accent text-brand-text text-xs font-bold px-3 py-1 rounded-full uppercase">
                  {branchName}
                </span>
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-1">Sign in</h2>
            <p className="text-brand-text-secondary text-sm mb-6">Admin access only</p>

            {error && (
              <div className="bg-brand-danger/10 border border-brand-danger/30 text-brand-danger text-sm font-medium px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-brand-text-secondary mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-border focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent bg-white"
                  placeholder="name@nearbi.com"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-brand-text-secondary mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-border focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent bg-white"
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 rounded-xl font-bold text-lg bg-brand-accent text-brand-text hover:bg-[#E09900] transition-colors mt-6"
              >
                Sign in
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
