import React, { useState, useMemo } from 'react';
import { Filter, Search, AlertCircle, ShieldAlert, CheckCircle2, Terminal } from 'lucide-react';
import { TimelineEvent, SeverityLevel } from '../../theme/tokens';

interface TimelineExplorerProps {
  events: TimelineEvent[];
  isLoading: boolean;
  onRefresh: () => void;
}

const SEVERITY_CONFIG: Record<SeverityLevel, { icon: React.ElementType; color: string; border: string; bg: string; glow: string }> = {
  danger: {
    icon: AlertCircle,
    color: '#FF2D95',
    border: '#FF2D95',
    bg: '#FF2D95/15',
    glow: 'rgba(255,45,149,0.3)',
  },
  warning: {
    icon: ShieldAlert,
    color: '#fbbf24',
    border: '#f59e0b',
    bg: '#f59e0b/15',
    glow: 'rgba(245,158,11,0.2)',
  },
  info: {
    icon: CheckCircle2,
    color: '#007BA7',
    border: '#007BA7',
    bg: '#007BA7/15',
    glow: 'rgba(0,123,167,0.3)',
  },
};

export const TimelineExplorer: React.FC<TimelineExplorerProps> = ({ events, isLoading, onRefresh }) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const matchesSeverity = filterSeverity === 'all' || evt.severity === filterSeverity;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        evt.description.toLowerCase().includes(q) ||
        evt.user.toLowerCase().includes(q) ||
        evt.event_type.toLowerCase().includes(q) ||
        (evt.ip_address && evt.ip_address.toLowerCase().includes(q)) ||
        (evt.source && evt.source.toLowerCase().includes(q));
      return matchesSeverity && matchesSearch;
    });
  }, [events, filterSeverity, searchQuery]);

  const getSeverityBadge = (severity: SeverityLevel, badge: string) => {
    const cfg = SEVERITY_CONFIG[severity];
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-medium bg-amber-950/40 border border-amber-500/40 text-amber-300 ${cfg.bg} border-[#${cfg.border.replace('#','')}] text-[#${cfg.color.replace('#','')}] shadow-[0_0_8px_${cfg.glow}]`}>
        <Icon size={12} className={`text-[#${cfg.color.replace('#','')}]`} />
        {badge}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Search & Controls */}
      <div className="flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center bg-[#121216] p-4 rounded-lg border border-[#007BA7]/30 shadow-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-[#64748B]" size={16} />
          <input
            type="text"
            placeholder="Search timeline by user, action, host or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0A0A0A] border border-[#007BA7]/30 rounded pl-9 pr-4 py-2 text-xs md:text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#007BA7] focus:ring-1 focus:ring-[#007BA7] font-mono"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <Filter size={16} className="text-[#007BA7]" />
          <select
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="bg-[#0A0A0A] border border-[#007BA7]/30 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#007BA7]"
          >
            <option value="all">All Severities</option>
            <option value="danger">Critical (Neon Rose)</option>
            <option value="warning">Investigate (Amber)</option>
            <option value="info">Observation (Cerulean)</option>
          </select>

          <button
            onClick={onRefresh}
            className="bg-[#121216] hover:bg-[#007BA7]/20 text-[#007BA7] hover:text-white border border-[#007BA7]/40 px-3.5 py-2 rounded text-xs font-mono transition-all"
            aria-label="Refresh timeline"
          >
            Sync
          </button>
        </div>
      </div>

      {/* Chronological Stream */}
      <div className="bg-[#121216] rounded-lg border border-[#007BA7]/25 p-5 min-h-[420px]">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-[#0A0A0A] h-20 rounded border border-[#007BA7]/20" />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Terminal size={38} className="text-[#007BA7]/40 mb-3" />
            <p className="text-white font-medium text-sm">No security telemetry matching filters</p>
            <p className="text-xs text-[#64748B] mt-1 max-w-sm">
              Upload authenticated evidence bundles into the Vault to populate the incident timeline.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2 before:top-3 before:bottom-3 before:w-[2px] before:bg-[#007BA7]/30">
            {filteredEvents.map((evt, idx) => {
              const cfg = SEVERITY_CONFIG[evt.severity];
              return (
                <div
                  key={evt.id || idx}
                  className={`relative bg-[#0A0A0A] p-4 rounded-md border transition-all space-y-2 group shadow-sm ${
                    evt.severity === 'danger'
                      ? 'border-[#FF2D95]/40 hover:border-[#FF2D95] hover:shadow-[0_0_15px_rgba(255,45,149,0.15)]'
                      : 'border-[#007BA7]/25 hover:border-[#007BA7] hover:shadow-[0_0_15px_rgba(0,123,167,0.15)]'
                  }`}
                >
                  {/* Visual Node Pin */}
                  <div className={`absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full border-2 bg-[#0A0A0A] ${
                    evt.severity === 'danger'
                      ? 'border-[#FF2D95] shadow-[0_0_8px_#FF2D95]'
                      : evt.severity === 'warning'
                      ? 'border-[#fbbf24] shadow-[0_0_6px_#fbbf24]'
                      : 'border-[#007BA7] shadow-[0_0_8px_#007BA7]'
                  }`} />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono border-b border-[#007BA7]/15 pb-2">
                    <span className="text-[#007BA7] font-semibold tracking-wider">{evt.timestamp}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[#64748B]">LOG: {evt.source}</span>
                      {getSeverityBadge(evt.severity, evt.badge)}
                    </div>
                  </div>

                  <div className="text-sm text-white font-medium leading-relaxed">
                    {evt.description}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-[#94A3B8] pt-1">
                    <span>ACTOR: <strong className="text-white">{evt.user}</strong></span>
                    <span>TYPE: <strong className="text-white">{evt.event_type}</strong></span>
                    {evt.ip_address && evt.ip_address !== 'unknown' && (
                      <span>IP: <strong className="text-white">{evt.ip_address}</strong></span>
                    )}
                    {evt.asset && evt.asset !== 'unknown' && (
                      <span>ASSET: <strong className="text-white">{evt.asset}</strong></span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#007BA7]/10">
                    <span className="text-[#64748B] text-xs">Source file: {evt.source_file}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#121216]/50 rounded border border-[#007BA7]/10">
        <div className="flex items-center gap-1 text-xs text-[#94A3B8] font-mono">
          {filteredEvents.length} of {events.length} events displayed
        </div>
        <div className="text-xs text-[#007BA7] font-mono">
          Chronological sort applied
        </div>
      </div>
    </div>
  );
};
