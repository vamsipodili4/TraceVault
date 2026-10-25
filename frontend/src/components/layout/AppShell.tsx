import React, { useState } from 'react';
import { ShieldAlert, Database, Clock, FileText, Activity, Menu, X, Terminal, Lock } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  activeRoute: string;
  onRouteChange: (route: string) => void;
  caseId?: string;
}

export const AppShell: React.FC<AppShellProps> = ({ children, activeRoute, onRouteChange, caseId = "CASE-2026-09A" }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'timeline', label: 'Timeline Explorer', icon: Clock },
    { id: 'vault', label: 'Evidence Vault', icon: Database },
    { id: 'detection', label: 'Detection Center', icon: ShieldAlert },
    { id: 'report', label: 'Report Manifest', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col antialiased selection:bg-[#FF2D95]/30 selection:text-white font-manrope">
      {/* Top Header */}
      <header className="h-16 border-b border-[#007BA7]/30 bg-[#0A0A0A]/90 backdrop-blur-md sticky top-0 z-40 px-4 md:px-8 flex items-center justify-between shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-[#94A3B8] hover:text-[#007BA7] p-1 rounded"
            aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <div
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => onRouteChange('overview')}
          >
            <div className="w-9 h-9 rounded bg-[#121216] border border-[#007BA7] flex items-center justify-center text-[#007BA7] group-hover:border-[#FF2D95] group-hover:text-[#FF2D95] group-hover:shadow-[0_0_12px_rgba(255,45,149,0.5)] transition-all">
              <Terminal size={19} />
            </div>
            <div>
              <span className="font-extrabold tracking-widest text-base text-white">TRACEVAULT</span>
              <span className="text-[11px] font-mono text-[#007BA7] ml-1.5 px-1.5 py-0.5 rounded bg-[#007BA7]/10 border border-[#007BA7]/40 shadow-[0_0_8px_rgba(0,123,167,0.3)]">
                AI
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="hidden sm:flex items-center gap-2 bg-[#121216] px-3.5 py-1.5 rounded border border-[#007BA7]/30 text-[#94A3B8]">
            <span className="w-2 h-2 rounded-full bg-[#007BA7] shadow-[0_0_8px_#007BA7] animate-pulse" />
            <span>ACTIVE INCIDENT: <strong className="text-white">{caseId}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 bg-[#FF2D95]/10 border border-[#FF2D95]/30 text-[#FF2D95] px-3 py-1.5 rounded">
            <Lock size={12} />
            <span className="tracking-wide">TAMPER GUARD ACTIVE</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="w-64 border-r border-[#007BA7]/20 bg-[#0A0A0A] hidden md:flex flex-col justify-between p-4">
          <nav className="space-y-2" aria-label="Main Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onRouteChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#121216] text-[#FF2D95] border border-[#FF2D95]/60 shadow-[0_0_15px_rgba(255,45,149,0.25)]'
                      : 'text-[#94A3B8] hover:bg-[#121216] hover:text-[#007BA7] hover:border hover:border-[#007BA7]/30'
                  }`}
                >
                  <Icon size={18} className={isActive ? 'text-[#FF2D95]' : 'text-[#007BA7]'} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="p-3.5 bg-[#121216] rounded border border-[#007BA7]/20 text-xs text-[#94A3B8] space-y-1">
            <p className="font-semibold text-white tracking-wide">FIPS 180-4 Engine</p>
            <p className="text-[11px] text-[#64748B]">SHA-256 Pre-Ingest Checksum</p>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 bg-[#0A0A0A]/95 z-50 md:hidden p-4 space-y-2 flex flex-col border-b border-[#007BA7]/30">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onRouteChange(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded text-base ${
                    isActive ? 'bg-[#121216] text-[#FF2D95] border border-[#FF2D95]' : 'text-[#94A3B8]'
                  }`}
                >
                  <Icon size={20} className={isActive ? 'text-[#FF2D95]' : 'text-[#007BA7]'} />
                  {item.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-radial-gradient from-[#121216] via-[#0A0A0A] to-[#0A0A0A]">
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
