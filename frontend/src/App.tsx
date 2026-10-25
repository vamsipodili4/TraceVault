import { useEffect, useState, useCallback, useRef } from 'react';
import { Download, Play, Plus, User, Calendar, X, Check } from 'lucide-react';
import { AppShell } from './components/layout/AppShell';
import { TimelineExplorer } from './components/timeline/TimelineExplorer';
import { EvidenceVault } from './components/evidence/EvidenceVault';
import { EvidenceRecord, TimelineEvent, SeverityLevel, BadgeType, IntegrityStatus } from './theme/tokens';

const API = '/api';

interface Summary {
  evidence_count: number;
  event_count: number;
  alert_count: number;
  open_alert_count: number;
  assessment: string;
}

interface BackendEvent {
  id: string;
  timestamp: string;
  source: string;
  event_type: string;
  username: string;
  ip_address: string;
  asset: string;
  details: string;
  source_file: string;
  source_row: number;
}

interface BackendAlert {
  id: string;
  severity: string;
  rule: string;
  title: string;
  reason: string;
  event_ids: string[];
  timestamp: string;
  status: string;
  review_note: string;
}

interface BackendEvidence {
  id: string;
  filename: string;
  stored_name: string;
  size_bytes: number;
  sha256: string;
  collected_at: string;
  source: string;
  verification: string;
  events_imported?: number;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  subject: string;
  detail: string;
}

interface Case {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  status: string;
  deadline: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  closure_decision: string | null;
  note_count: number;
  notes?: CaseNote[];
}

interface CaseNote {
  id: string;
  case_id: string;
  note: string;
  actor: string;
  timestamp: string;
}

const STATUS_COLOR: Record<string, string> = {
  Open: '#FF2D95',
  'Under review': '#fbbf24',
  Resolved: '#22C55E',
  'False positive': '#94A3B8',
};

function deriveSeverityAndBadge(event: BackendEvent): { severity: SeverityLevel; badge: BadgeType } {
  const text = (event.event_type + ' ' + event.details).toLowerCase();
  if (text.includes('mass file modification') || text.includes('ransomware') || text.includes('files encrypted')) {
    return { severity: 'danger', badge: 'Potential incident' };
  }
  if (text.includes('privilege escalation') || text.includes('permission changed') || text.includes('admin role granted')) {
    return { severity: 'warning', badge: 'High priority' };
  }
  if (text.includes('failed login') || text.includes('login failed') || text.includes('authentication failure')) {
    return { severity: 'warning', badge: 'Investigate' };
  }
  return { severity: 'info', badge: 'Observation' };
}

function mapBackendEventToTimeline(e: BackendEvent): TimelineEvent {
  const { severity, badge } = deriveSeverityAndBadge(e);
  return {
    id: e.id,
    timestamp: e.timestamp,
    source: e.source,
    event_type: e.event_type,
    user: e.username,
    ip_address: e.ip_address,
    asset: e.asset,
    source_file: e.source_file,
    severity,
    badge,
    description: e.details,
    raw_payload: {},
    associated_evidence_id: undefined,
  };
}

function mapBackendEvidenceToRecord(e: BackendEvidence, index: number): EvidenceRecord {
  const status: IntegrityStatus = e.verification === 'Verified at collection' ? 'Verified' : 'Missing Baseline';
  return {
    id: index + 1,
    filename: e.filename,
    upload_time: e.collected_at,
    sha256_hash: e.sha256,
    file_size_bytes: e.size_bytes,
    status,
    source_device: e.source,
    recorded_by: 'local-demo-user',
    backend_id: e.id,
  };
}

function App() {
  const [activeRoute, setActiveRoute] = useState<'overview' | 'timeline' | 'vault' | 'detection' | 'cases' | 'report'>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<BackendEvent[]>([]);
  const [alerts, setAlerts] = useState<BackendAlert[]>([]);
  const [evidenceList, setEvidenceList] = useState<BackendEvidence[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [caseForm, setCaseForm] = useState({ title: '', description: '', assigned_to: '', deadline: '' });
  const [noteInput, setNoteInput] = useState('');
  const [closeInput, setCloseInput] = useState('');
  const [caseError, setCaseError] = useState<string | null>(null);

  const API_TIMEOUT = 10000;
  const fetching = useRef(false);

  function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = API_TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).then((res) => {
      clearTimeout(timeoutId);
      return res;
    });
  }

  const fetchAll = useCallback(async (): Promise<boolean> => {
    if (fetching.current) return false;
    fetching.current = true;
    setGlobalLoading(true);
    try {
      const [summaryRes, eventsRes, alertsRes, evidenceRes, auditRes, casesRes] = await Promise.all([
        fetchWithTimeout(`${API}/summary`).then(r => r.json()),
        fetchWithTimeout(`${API}/events`).then(r => r.json()),
        fetchWithTimeout(`${API}/alerts`).then(r => r.json()),
        fetchWithTimeout(`${API}/evidence`).then(r => r.json()),
        fetchWithTimeout(`${API}/audit`).then(r => r.json()),
        fetchWithTimeout(`${API}/cases`).then(r => r.json()),
      ]);
      setSummary(summaryRes);
      setEvents(eventsRes);
      setAlerts(alertsRes);
      setEvidenceList(evidenceRes);
      setAuditLog(auditRes);
      setCases(casesRes);
      setBackendHealthy(true);
      return true;
    } catch (err) {
      setBackendHealthy(false);
      console.error('Failed to fetch data:', err);
      return false;
    } finally {
      setGlobalLoading(false);
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    let interval: any;
    let failures = 0;
    const tick = async () => {
      const ok = await fetchAll();
      if (ok) {
        failures = 0;
      } else {
        failures += 1;
        if (failures >= 3 && interval) {
          clearInterval(interval);
        }
      }
    };
    tick();
    interval = setInterval(tick, 5000);
    return () => { if (interval) clearInterval(interval); };
  }, [fetchAll]);

  async function loadDemo() {
    setDemoLoading(true);
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/demo/load`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      console.error(err);
      setBackendHealthy(false);
    } finally {
      setDemoLoading(false);
      setGlobalLoading(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setGlobalLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithTimeout(`${API}/evidence/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      setGlobalLoading(false);
      e.target.value = '';
    }
  }

  async function verifyEvidence(evidenceId: string) {
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/evidence/${evidenceId}/verify`, { method: 'POST' });
      const result = await res.json();
      await fetchAll();
      return result;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setGlobalLoading(false);
    }
  }

  async function reviewAlert(alertId: string, status: string, note: string) {
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/alerts/${alertId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function createCase() {
    if (!caseForm.title.trim()) return;
    setGlobalLoading(true);
    setCaseError(null);
    try {
      const res = await fetchWithTimeout(`${API}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseForm),
      });
      if (!res.ok) throw new Error(await res.text());
      setShowCreateCase(false);
      setCaseForm({ title: '', description: '', assigned_to: '', deadline: '' });
      await fetchAll();
    } catch (err: unknown) {
      setCaseError(err instanceof Error ? err.message : 'Failed to create case.');
    } finally {
      setGlobalLoading(false);
    }
  }

  async function viewCase(caseId: string) {
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}`);
      if (!res.ok) throw new Error(await res.text());
      const detailed = await res.json();
      setSelectedCase(detailed);
      setShowCreateCase(false);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function updateCaseStatus(caseId: string, status: string) {
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
      if (selectedCase?.id === caseId) {
        const res2 = await fetchWithTimeout(`${API}/cases/${caseId}`);
        if (res2.ok) {
          setSelectedCase(await res2.json());
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function addCaseNote(caseId: string, note: string, actor: string = 'demo-analyst') {
    if (!note.trim()) return;
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, actor }),
      });
      if (!res.ok) throw new Error(await res.text());
      const noteRes = await res.json();
      await fetchAll();
      if (selectedCase?.id === caseId) {
        setSelectedCase((prev) =>
          prev ? { ...prev, notes: [...(prev.notes ?? []), noteRes] } : prev,
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
      setNoteInput('');
    }
  }

  async function closeCase(caseId: string, note: string, actor: string = 'demo-analyst') {
    if (!note.trim()) return;
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, actor }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
      setSelectedCase(null);
      setCloseInput('');
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  function statusBadgeColor(status: string): string {
    switch (status) {
      case 'Open':
        return 'text-[#FF2D95]';
      case 'Under review':
        return 'text-[#fbbf24]';
      case 'Closed':
        return 'text-[#22C55E]';
      default:
        return 'text-[#94A3B8]';
    }
  }

  function exportReport() {
    window.open(`${API}/report.pdf`, '_blank');
  }

  const timelineEvents: TimelineEvent[] = events.map(mapBackendEventToTimeline).sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp),
  );

  const vaultRecords: EvidenceRecord[] = evidenceList.map((e, i) => mapBackendEvidenceToRecord(e, i));

  const openAlertCount = alerts.filter((a) => a.status === 'Open').length;

  const statusColor = (status: string) => {
    return STATUS_COLOR[status as keyof typeof STATUS_COLOR] || '#94A3B8';
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <AppShell
        activeRoute={activeRoute}
        onRouteChange={(route: string) => {
        const r = route as 'overview' | 'timeline' | 'vault' | 'detection' | 'cases' | 'report';
        if (r === 'cases') {
          setSelectedCase(null);
          setShowCreateCase(false);
        }
        setActiveRoute(r);
      }}
        caseId="CASE-2026-09A"
      >
        {activeRoute === 'overview' && (
          <div className="space-y-6">
            <div className="bg-[#121216] rounded-lg border border-[#007BA7]/20 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-wide">Investigation Overview</h2>
                  <p className="text-xs text-[#64748B]">Know what happened. Preserve what matters.</p>
                </div>
                <span className="rounded-full border border-[#007BA7]/30 bg-[#007BA7]/10 px-3 py-1 text-xs text-[#007BA7] font-mono">
                  CYBER DEMO
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0A0A0A] p-4 rounded border border-[#007BA7]/15">
                  <p className="text-xs text-[#64748B]">Evidence Items</p>
                  <p className="text-2xl font-bold text-white">{summary?.evidence_count ?? 0}</p>
                </div>
                <div className="bg-[#0A0A0A] p-4 rounded border border-[#007BA7]/15">
                  <p className="text-xs text-[#64748B]">Events Analyzed</p>
                  <p className="text-2xl font-bold text-white">{summary?.event_count ?? 0}</p>
                </div>
                <div className="bg-[#0A0A0A] p-4 rounded border border-[#007BA7]/15">
                  <p className="text-xs text-[#64748B]">Rule Matches</p>
                  <p className="text-2xl font-bold text-[#FF2D95]">{summary?.alert_count ?? 0}</p>
                </div>
                <div className="bg-[#0A0A0A] p-4 rounded border border-[#007BA7]/15">
                  <p className="text-xs text-[#64748B]">Open Reviews</p>
                  <p className="text-2xl font-bold text-[#fbbf24]">{summary?.open_alert_count ?? 0}</p>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={loadDemo}
                  disabled={demoLoading}
                  className="bg-[#007BA7] hover:bg-[#007BA7]/80 text-white font-bold text-xs px-4 py-2 rounded transition-all shadow-[0_0_15px_rgba(0,123,167,0.4)] disabled:opacity-60"
                >
                  {demoLoading ? 'Loading…' : <><Play size={14} /> Load demo incident</>}
                </button>
                <button
                  onClick={() => setActiveRoute('vault')}
                  className="border border-[#007BA7]/30 hover:bg-[#121216]/60 text-white font-bold text-xs px-4 py-2 rounded transition-colors"
                >
                  Open Evidence Vault
                </button>
              </div>
            </div>

            {events.length > 0 && (
              <div className="bg-[#121216] rounded-lg border border-[#007BA7]/20 p-6 shadow-lg">
                <h3 className="text-xs font-bold text-white tracking-wide mb-4">Assessment</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  {summary?.assessment ?? 'No events loaded.'}
                </p>
              </div>
            )}
          </div>
        )}

        {activeRoute === 'timeline' && (
          <TimelineExplorer
            events={timelineEvents}
            isLoading={globalLoading}
            onRefresh={fetchAll}
          />
        )}

        {activeRoute === 'vault' && (
          <EvidenceVault
            records={vaultRecords}
            onUploadSuccess={() => fetchAll()}
          />
        )}

        {activeRoute === 'detection' && (
          <div className="space-y-6">
            <div className="bg-[#121216] rounded-lg border border-[#007BA7]/20 p-6 shadow-lg">
              <h2 className="text-lg font-bold text-white tracking-wide">Detection Center</h2>
              <p className="text-xs text-[#64748B] mt-1">Transparent heuristic rules with supporting event references.</p>
              {alerts.length === 0 ? (
                <div className="mt-6 p-4 text-center text-[#64748B] bg-[#0A0A0A] rounded border border-[#007BA7]/15">
                  No alerts loaded. Load the demo incident to see detection matches.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="bg-[#0A0A0A] p-4 rounded border border-[#007BA7]/15">
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-mono font-medium ${statusColor(alert.status)}`}>
                          {alert.status}
                        </span>
                        <span className={`text-xs font-mono ${alert.severity === 'High' ? 'text-[#FF2D95]' : 'text-[#fbbf24]'}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white">{alert.title}</h4>
                      <p className="text-xs text-[#94A3B8] mt-1">{alert.reason}</p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-[#64748B] font-mono">
                        <span>Rule: {alert.rule}</span>
                        <span>Events: {alert.event_ids.join(', ')}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => reviewAlert(alert.id, 'Resolved', alert.review_note || 'Closed after review.')}
                          className="text-xs border border-[#007BA7]/30 text-[#007BA7] px-3 py-1 rounded hover:bg-[#121216]/60"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => reviewAlert(alert.id, 'Under review', alert.review_note || 'Under active investigation.')}
                          className="text-xs border border-[#007BA7]/30 text-[#fbbf24] px-3 py-1 rounded hover:bg-[#121216]/60"
                        >
                          Under Review
                        </button>
                        <button
                          onClick={() => reviewAlert(alert.id, 'False positive', 'Reviewed; no action needed.')}
                          className="text-xs border border-[#007BA7]/30 text-[#94A3B8] px-3 py-1 rounded hover:bg-[#121216]/60"
                        >
                          False Positive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeRoute === 'cases' && (
          <div className="space-y-6">
            <div className="bg-[#121216] rounded-lg border border-[#007BA7]/20 p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-wide">Case Management</h2>
                  <p className="text-xs text-[#64748B] mt-1">Create, track, and close investigation cases.</p>
                </div>
                {!selectedCase && !showCreateCase && (
                  <button
                    onClick={() => setShowCreateCase(true)}
                    className="bg-[#FF2D95] hover:bg-[#FF2D95]/80 text-white font-bold text-xs px-4 py-2 rounded transition-all shadow-[0_0_15px_rgba(255,45,149,0.4)] flex items-center gap-2"
                  >
                    <Plus size={14} /> New Case
                  </button>
                )}
              </div>
              {showCreateCase && (
                <div className="bg-[#0A0A0A] rounded border border-[#007BA7]/20 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white">New Investigation Case</h3>
                  {caseError && <p className="text-xs text-[#FF2D95]">{caseError}</p>}
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-[#94A3B8] font-mono">Case Title</label>
                      <input
                        type="text"
                        value={caseForm.title}
                        onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })}
                        className="w-full bg-[#121216] border border-[#007BA7]/30 rounded px-3 py-2 text-sm text-white focus:border-[#FF2D95] focus:outline-none transition-colors"
                        placeholder="e.g. Suspicious login investigation"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] font-mono">Description</label>
                      <textarea
                        value={caseForm.description}
                        onChange={(e) => setCaseForm({ ...caseForm, description: e.target.value })}
                        className="w-full bg-[#121216] border border-[#007BA7]/30 rounded px-3 py-2 text-sm text-white focus:border-[#FF2D95] focus:outline-none transition-colors"
                        placeholder="Case description or summary"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] font-mono">Assigned To</label>
                      <input
                        type="text"
                        value={caseForm.assigned_to}
                        onChange={(e) => setCaseForm({ ...caseForm, assigned_to: e.target.value })}
                        className="w-full bg-[#121216] border border-[#007BA7]/30 rounded px-3 py-2 text-sm text-white focus:border-[#FF2D95] focus:outline-none transition-colors"
                        placeholder="Assignee name"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] font-mono">Deadline</label>
                      <input
                        type="datetime-local"
                        value={caseForm.deadline}
                        onChange={(e) => setCaseForm({ ...caseForm, deadline: e.target.value })}
                        className="w-full bg-[#121216] border border-[#007BA7]/30 rounded px-3 py-2 text-sm text-white focus:border-[#FF2D95] focus:outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createCase}
                      disabled={!caseForm.title.trim() || globalLoading}
                      className="bg-[#007BA7] hover:bg-[#007BA7]/80 text-white font-bold text-xs px-4 py-2 rounded transition-all disabled:opacity-60 flex items-center gap-2"
                    >
                      <Plus size={12} /> Create Case
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateCase(false);
                        setCaseForm({ title: '', description: '', assigned_to: '', deadline: '' });
                        setCaseError(null);
                      }}
                      className="border border-[#007BA7]/30 hover:bg-[#121216]/60 text-white font-bold text-xs px-4 py-2 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!showCreateCase && !selectedCase && (
                cases.length === 0 ? (
                  <div className="p-6 text-center text-[#64748B] bg-[#0A0A0A] rounded border border-[#007BA7]/15">
                    No cases created yet. Click "New Case" to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-[#0A0A0B] text-[#94A3B8] border-b border-[#007BA7]/20">
                        <tr>
                          <th className="p-3">CASE ID</th>
                          <th className="p-3">TITLE</th>
                          <th className="p-3">STATUS</th>
                          <th className="p-3">ASSIGNEE</th>
                          <th className="p-3">DEADLINE</th>
                          <th className="p-3">CREATED</th>
                          <th className="p-3">NOTES</th>
                          <th className="p-3 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#007BA7]/10">
                        {cases.map((c) => (
                          <tr key={c.id} className="hover:bg-[#0A0A0B] transition-colors">
                            <td className="p-3 text-[#007BA7]">{c.id.substring(0, 8)}…</td>
                            <td className="p-3 font-medium text-white">{c.title}</td>
                            <td className="p-3">
                              <span className={`inline-flex items-center text-xs ${statusBadgeColor(c.status)}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 text-[#94A3B8] flex items-center gap-1">
                              <User size={12} />{c.assigned_to}
                            </td>
                            <td className="p-3 text-[#94A3B8] flex items-center gap-1">
                              <Calendar size={12} />{c.deadline ? new Date(c.deadline).toLocaleDateString() : '—'}
                            </td>
                            <td className="p-3 text-[#94A3B8]">{new Date(c.created_at).toLocaleDateString()}</td>
                            <td className="p-3 text-[#007BA7]">{c.note_count}</td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => viewCase(c.id)}
                                className="text-[#007BA7] hover:text-[#FF2D95] px-2 py-1 rounded transition-colors text-xs"
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
              {selectedCase && (
                <div className="bg-[#0A0A0A] rounded border border-[#007BA7]/20 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{selectedCase.title}</h3>
                    <button
                      onClick={() => setSelectedCase(null)}
                      className="text-[#94A3B8] hover:text-[#FF2D95] p-1 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-[#64748B]">ID</span>
                      <span className="text-[#007BA7] ml-2 font-mono">{selectedCase.id}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Status</span>
                      <span className={`ml-2 ${statusBadgeColor(selectedCase.status)}`}>
                        {selectedCase.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Assignee</span>
                      <span className="text-[#94A3B8] ml-2">{selectedCase.assigned_to}</span>
                    </div>
                    <div className="md:col-span-3">
                      <span className="text-[#64748B]">Description</span>
                      <p className="text-[#94A3B8] mt-1">{selectedCase.description || 'No description provided.'}</p>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Deadline</span>
                      <span className="text-[#94A3B8] ml-2 flex items-center gap-1">
                        <Calendar size={12} />
                        {selectedCase.deadline ? new Date(selectedCase.deadline).toLocaleDateString() : 'No deadline'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Created</span>
                      <span className="text-[#94A3B8] ml-2">{new Date(selectedCase.created_at).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[#64748B]">Updated</span>
                      <span className="text-[#94A3B8] ml-2">{new Date(selectedCase.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-[#007BA7]/10">
                    {selectedCase.status === 'Open' && (
                      <button
                        onClick={() => updateCaseStatus(selectedCase.id, 'Under review')}
                        className="text-xs border border-[#fbbf24]/30 text-[#fbbf24] px-3 py-1 rounded hover:bg-[#121216]/60 transition-colors"
                      >
                        Mark Under Review
                      </button>
                    )}
                    {selectedCase.status !== 'Closed' && (
                      <button
                        onClick={() => setCloseInput('')}
                        className="text-xs border border-[#FF2D95]/30 text-[#FF2D95] px-3 py-1 rounded hover:bg-[#121216]/60 transition-colors"
                      >
                        Close Case
                      </button>
                    )}
                  </div>

                  {closeInput !== '' && (
                    <div className="bg-[#121216] rounded border border-[#007BA7]/20 p-4 space-y-3">
                      <h4 className="text-xs font-bold text-white">Closure Decision</h4>
                      <textarea
                        value={closeInput}
                        onChange={(e) => setCloseInput(e.target.value)}
                        className="w-full bg-[#0A0A0A] border border-[#007BA7]/30 rounded px-3 py-2 text-xs text-white focus:border-[#FF2D95] focus:outline-none transition-colors"
                        placeholder="Enter closure decision..."
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => closeCase(selectedCase.id, closeInput)}
                          disabled={!closeInput.trim() || globalLoading}
                          className="bg-[#FF2D95] hover:bg-[#FF2D95]/80 text-white font-bold text-xs px-3 py-1 rounded transition-colors disabled:opacity-60 flex items-center gap-1"
                        >
                          <Check size={12} /> Confirm Close
                        </button>
                        <button
                          onClick={() => setCloseInput('')}
                          className="border border-[#007BA7]/30 hover:bg-[#121216]/60 text-xs text-[#94A3B8] px-3 py-1 rounded transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#007BA7]/10">
                    <h4 className="text-xs font-bold text-[#94A3B8] mb-2">
                      Notes ({selectedCase.notes?.length ?? 0})
                    </h4>
                    {selectedCase.notes && selectedCase.notes.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedCase.notes.map((note) => (
                          <div key={note.id} className="text-xs bg-[#121216] rounded p-2 border border-[#007BA7]/10">
                            <span className="text-[#94A3B8] font-mono">[{note.timestamp}] {note.actor}:</span>
                            <p className="text-[#94A3B8] mt-1">{note.note}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#64748B]">No notes yet.</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add a note..."
                        className="flex-1 bg-[#121216] border border-[#007BA7]/30 rounded px-3 py-2 text-xs text-white focus:border-[#FF2D95] focus:outline-none transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && noteInput.trim()) {
                            addCaseNote(selectedCase.id, noteInput.trim());
                          }
                        }}
                      />
                      <button
                        onClick={() => addCaseNote(selectedCase.id, noteInput.trim())}
                        disabled={!noteInput.trim() || globalLoading}
                        className="bg-[#007BA7] hover:bg-[#007BA7]/80 text-white font-bold text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-60"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeRoute === 'report' && (
          <div className="space-y-6">
            <div className="bg-[#121216] rounded-lg border border-[#007BA7]/20 p-6 shadow-lg">
              <h2 className="text-lg font-bold text-white tracking-wide">Forensic Report Generator</h2>
              <p className="text-xs text-[#64748B] mt-1">Generate downloadable PDF reports from actual case data.</p>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={exportReport}
                  className="bg-[#007BA7] hover:bg-[#007BA7]/80 text-white font-bold text-xs px-4 py-2 rounded transition-all shadow-[0_0_15px_rgba(0,123,167,0.4)]"
                >
                  <Download size={14} className="mr-1" /> Export PDF Report
                </button>
                <button
                  onClick={loadDemo}
                  className="border border-[#007BA7]/30 hover:bg-[#121216]/60 text-white font-bold text-xs px-4 py-2 rounded transition-colors"
                >
                  Load Demo Data
                </button>
              </div>
              <div className="mt-6 p-4 bg-[#0A0A0A] rounded border border-[#007BA7]/15">
                <h3 className="text-xs font-bold text-[#94A3B8] mb-3 tracking-wide">Report Contents</h3>
                <ul className="text-xs text-[#64748B] space-y-1">
                  <li>• Incident summary and assessment</li>
                  <li>• Chronological event timeline</li>
                  <li>• Evidence hashes and chain of custody</li>
                  <li>• Detection alerts and reviewer decisions</li>
                  <li>• Limitations and unresolved questions</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </AppShell>

      {globalLoading && (
        <div className="fixed inset-0 z-50 bg-[#0A0A0A]/95 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#007BA7]/30 border-t-[#007BA7] rounded-full animate-spin" />
          <p className="mt-4 text-xs text-[#94A3B8] font-mono">Loading…</p>
        </div>
      )}
    </div>
  );
}

export default App;
