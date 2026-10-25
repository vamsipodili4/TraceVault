import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LayoutDashboard, Clock, Shield, AlertTriangle, History,
  Upload, Play, RotateCcw, FileText, Download, Check, X,
  Hash, Calendar, User, Server, File, Search, RefreshCw,
} from 'lucide-react';

const API = '/api';

interface Summary {
  evidence_count: number;
  event_count: number;
  alert_count: number;
  open_alert_count: number;
  assessment: string;
}

interface Event {
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

interface Alert {
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

interface Evidence {
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

const SEVERITY_COLOR: Record<string, string> = {
  High: '#e74c3c',
  Medium: '#f39c12',
  Low: '#3498db',
  Info: '#95a5a6',
};

const STATUS_COLOR: Record<string, string> = {
  Open: '#e74c3c',
  'Under review': '#f39c12',
  Resolved: '#27ae60',
  'False positive': '#95a5a6',
};

function App() {
  const [activeView, setActiveView] = useState<'dashboard' | 'timeline' | 'evidence' | 'alerts' | 'audit' | 'cases'>('dashboard');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [caseForm, setCaseForm] = useState<{ title: string; description: string; assigned_to: string; deadline: string }>({
    title: '', description: '', assigned_to: 'unassigned', deadline: '',
  });
  const [newNote, setNewNote] = useState('');
  const [creatingCase, setCreatingCase] = useState(false);
  const [closingCase, setClosingCase] = useState(false);
  const [closingCaseId, setClosingCaseId] = useState<string | null>(null);
  const [closeDecision, setCloseDecision] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [uploading, setUploading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  const API_TIMEOUT = 10000;

  function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = API_TIMEOUT): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).then((res) => {
      clearTimeout(timeoutId);
      return res;
    });
  }

  const fetching = useRef(false);

  const fetchAll = useCallback(async (): Promise<boolean> => {
    if (fetching.current) return false;
    fetching.current = true;
    setGlobalLoading(true);
    try {
      const [summaryRes, eventsRes, alertsRes, evidenceRes, auditRes] = await Promise.all([
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
    let interval;
    let failures = 0;

    const tick = async () => {
      const ok = await fetchAll();
      if (ok) {
        failures = 0;
      } else {
        failures += 1;
        if (failures >= 3 && interval) {
          clearInterval(interval);
          interval = null;
        }
      }
    };

    // Load once on mount so the page renders data immediately.
    tick();

    interval = setInterval(tick, 5000);
    return () => {
      if (interval) clearInterval(interval);
    };
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

  async function resetDemo() {
    if (!window.confirm('Clear all in-memory demo records? Files on disk are retained.')) return;
    setResetting(true);
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/reset`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setResetting(false);
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
    setCreatingCase(true);
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseForm),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      await fetchAll();
      setActiveCase(created);
      setCaseForm({ title: '', description: '', assigned_to: 'unassigned', deadline: '' });
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingCase(false);
      setGlobalLoading(false);
    }
  }

  async function updateCase(caseId: string, updates: Partial<Case>) {
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function addCaseNote(caseId: string) {
    if (!newNote.trim()) return;
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
      setNewNote('');
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalLoading(false);
    }
  }

  async function closeCase(caseId: string, decision: string) {
    if (!decision.trim()) return;
    setClosingCase(true);
    setGlobalLoading(true);
    try {
      const res = await fetchWithTimeout(`${API}/cases/${caseId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: decision }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchAll();
      setClosingCaseId(null);
      setCloseDecision('');
    } catch (err) {
      console.error(err);
    } finally {
      setClosingCase(false);
      setGlobalLoading(false);
    }
  }

  function exportReport() {
    window.open(`${API}/report.pdf`, '_blank');
  }

  const filteredEvents = events.filter(
    (e) =>
      e.timestamp.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.event_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.asset.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.ip_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.details.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  function renderTimeline() {
    if (events.length === 0) {
      return (
        <div className="notice">
          <strong>No events.</strong> Load the demo incident or upload a CSV/JSON log file to populate the timeline.
        </div>
      );
    }

    const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return (
      <div className="timeline">
        {sorted.map((event) => (
          <div key={event.id} className="timeline-row">
            <div className="timeline-mark" />
            <div className="event-time">{event.timestamp}</div>
            <div className="event-content">
              <strong>{event.event_type}</strong>
              <p>{event.details}</p>
              <small>
                <User size={10} /> {event.username} &nbsp;|&nbsp; <Server size={10} /> {event.asset} &nbsp;|&nbsp;
                <Hash size={10} /> {event.ip_address} &nbsp;|&nbsp; <File size={10} /> {event.source_file} row {event.source_row}
              </small>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderEvidence() {
    return (
      <div>
        <div className="upload-box">
          <div className="upload-symbol">
            <Upload size={24} />
          </div>
          <h3>Upload Evidence File</h3>
          <p>CSV, JSON, LOG, and TXT files up to 10 MB. Uploaded files are preserved and hashed with SHA-256.</p>
          <label className="upload-label">
            <span className="primary" style={{ opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading…' : 'Choose file'}
            </span>
            <input type="file" hidden accept=".csv,.json,.log,.txt" onChange={handleUpload} disabled={uploading} />
          </label>
          <span className="hint">Files are stored locally in the evidence directory and hashed at collection time.</span>
        </div>

        <div className="section-heading">
          <strong>Evidence Vault</strong>
          <span className="version">{evidenceList.length} items</span>
        </div>

        {evidenceList.length === 0 ? (
          <div className="notice">No evidence collected yet.</div>
        ) : (
          evidenceList.map((item) => (
            <div key={item.id} className="timeline-row evidence-row">
              <div className="timeline-mark" style={{ background: '#4bdbd3' }} />
              <div className="event-content grow">
                <strong>{item.filename}</strong>
                <small>
                  <Hash size={10} /> {item.sha256}
                </small>
                <small>{item.size_bytes.toLocaleString()} bytes · Collected: {item.collected_at}</small>
                {item.events_imported !== undefined && <small>{item.events_imported} events imported</small>}
                <code>{item.stored_name}</code>
              </div>
              <div className="evidence-actions">
                <div className="verified">
                  <Check size={12} /> Integrity verified at collection
                </div>
                <button className="small secondary" onClick={() => verifyEvidence(item.id)}>
                  <RefreshCw size={12} /> Re-verify
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  function renderAlerts() {
    const sorted = [...alerts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (sorted.length === 0) {
      return (
        <div className="notice">
          <strong>No alerts.</strong> No suspicious-indicator rules matched the loaded events.
        </div>
      );
    }

    return (
      <div>
        <div className="section-heading">
          <strong>Suspicious Indicators</strong>
          <span className="version">{sorted.length} matches</span>
        </div>
        {sorted.map((alert) => (
          <div key={alert.id} className="alert-card">
            <div className="alert-top">
              <div className="rule-tag" style={{ color: SEVERITY_COLOR[alert.severity] || '#95a5a6' }}>
                <AlertTriangle size={12} /> {alert.severity}
              </div>
              <span className="rule-tag">{alert.rule}</span>
              <span className="review-state" style={{ color: STATUS_COLOR[alert.status] || '#95a5a6' }}>
                {alert.status}
              </span>
            </div>
            <h3>{alert.title}</h3>
            <p>{alert.reason}</p>
            <small style={{ display: 'block', marginBottom: '10px' }}>
              <Calendar size={10} /> {alert.timestamp}
            </small>
            {alert.review_note && (
              <div className="notice" style={{ marginTop: 0 }}>
                <small>Note: {alert.review_note}</small>
              </div>
            )}
            <div className="review-actions">
              <button
                className="small"
                style={{ border: '1px solid #304156', background: '#0d1827', color: '#a8bad1', borderRadius: '5px' }}
                onClick={() => reviewAlert(alert.id, 'Resolved', alert.review_note || 'Closed after review.')}
              >
                <Check size={12} /> Resolve
              </button>
              <button
                className="small"
                style={{ border: '1px solid #304156', background: '#0d1827', color: '#a8bad1', borderRadius: '5px' }}
                onClick={() => reviewAlert(alert.id, 'Under review', alert.review_note || 'Under active investigation.')}
              >
                <RefreshCw size={12} /> Under Review
              </button>
              <button
                className="small"
                style={{ border: '1px solid #304156', background: '#0d1827', color: '#a8bad1', borderRadius: '5px' }}
                onClick={() => reviewAlert(alert.id, 'False positive', 'Reviewed; no action needed.')}
              >
                <X size={12} /> False Positive
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderAudit() {
    if (auditLog.length === 0) {
      return <div className="notice">No audit entries recorded.</div>;
    }
    return (
      <div className="timeline">
        {auditLog.map((entry) => (
          <div key={entry.id} className="timeline-row audit-row">
            <div className="audit-symbol">
              <History size={16} />
            </div>
            <div className="event-content">
              <strong>{entry.action}</strong>
              <p>{entry.subject}</p>
              <small>{entry.detail}</small>
              <small>
                <Calendar size={10} /> {entry.timestamp} &nbsp;|&nbsp; <User size={10} /> {entry.actor}
              </small>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderDashboard() {
    const recentEvents = [...events]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(0, 10);

    return (
      <div>
        <div className="welcome">
          <div style={{ flex: 1 }}>
            <div className="status-label">
              <span className="online-dot" style={{ background: backendHealthy ? '#36d8b2' : '#e74c3c' }} />{' '}
              Tracevault AI
            </div>
            <h2>Threat <em>Reconstruction &amp; Evidence Vault</em></h2>
            <p>
              This dashboard provides indicators for human review. Rule matches are not proof of compromise.
              SHA-256 hashing detects post-collection changes but does not prove original source authenticity.
            </p>
            <div className="welcome-actions">
              <button className="primary" onClick={loadDemo} disabled={demoLoading}>
                {demoLoading ? 'Loading…' : <><Play size={14} /> Load demo incident</>}
              </button>
              <button className="secondary" onClick={resetDemo} disabled={resetting}>
                {resetting ? 'Resetting…' : <><RotateCcw size={14} /> Reset demo</>}
              </button>
              <button className="secondary" onClick={exportReport}>
                <Download size={14} /> Export PDF report
              </button>
            </div>
          </div>
          <div className="hero-art">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="core" />
          </div>
        </div>

        <div className="section-heading"><strong>Overview</strong></div>

        <div className="stats">
          <div className="stat-card" style={{ gridColumn: 'span 1' }}>
            <small>Evidence items</small>
            <strong>{summary?.evidence_count ?? 0}</strong>
          </div>
          <div className="stat-card" style={{ gridColumn: 'span 1' }}>
            <small>Events loaded</small>
            <strong>{summary?.event_count ?? 0}</strong>
          </div>
          <div className="stat-card" style={{ gridColumn: 'span 1' }}>
            <small>Total alerts</small>
            <strong style={{ color: '#e74c3c' }}>{summary?.alert_count ?? 0}</strong>
          </div>
          <div className="stat-card" style={{ gridColumn: 'span 1' }}>
            <small>Open alerts</small>
            <strong style={{ color: '#f39c12' }}>{summary?.open_alert_count ?? 0}</strong>
          </div>
        </div>

        {events.length > 0 && (
          <>
            <div className="section-heading"><strong>Recent events</strong></div>
            {renderTimeline()}
          </>
        )}

        <div className="assessment" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="notice" style={{ flex: 1, minWidth: '280px', background: 'rgba(12, 25, 37, 0.6)' }}>
            <strong style={{ display: 'block', marginBottom: '6px' }}>Assessment</strong>
            <span style={{ fontSize: '11px', lineHeight: '1.5' }}>
              {summary?.assessment ?? 'No events loaded.'}
            </span>
          </div>
      </div>
    </div>
    );
  }

  function statusColor(status: string) {
    return STATUS_COLOR[status as keyof typeof STATUS_COLOR] || '#95a5a6';
  }

  function renderCaseList() {
    if (cases.length === 0) {
      return (
        <div className="notice">No cases yet. Create a case to start an investigation.</div>
      );
    }
    return (
      <div>
        {cases.map((c) => (
          <div key={c.id} className="alert-card">
            <div className="alert-top">
              <span className="rule-tag" style={{ color: statusColor(c.status) }}>{c.status}</span>
              {c.assigned_to && c.assigned_to !== 'unassigned' && (
                <span className="rule-tag"><User size={10} /> {c.assigned_to}</span>
              )}
              <span className="review-state" style={{ color: '#31d6d1' }}>{c.note_count} notes</span>
            </div>
            <h3 style={{ cursor: 'pointer' }} onClick={() => setActiveCase(c)}>
              {c.title}
            </h3>
            <p>{c.description || 'No description.'}</p>
            <small style={{ display: 'block', marginBottom: '6px' }}>
              <Calendar size={10} /> Created {c.created_at.slice(0, 16)} &nbsp;|&nbsp;
              <Clock size={10} /> Updated {c.updated_at.slice(0, 16)}
              {c.deadline && <span> &nbsp;|&nbsp; Deadline {c.deadline.slice(0, 16)}</span>}
            </small>
            <div className="review-actions">
              <button className="small" onClick={() => setActiveCase(c)}>
                <FileText size={12} /> Open case
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderCaseDetail() {
    const c = activeCase;
    if (!c) return null;
    const isOpen = c.status !== 'Closed';
    return (
      <div>
        <div className="section-heading">
          <strong>Case detail</strong>
          <button className="secondary" onClick={() => setActiveCase(null)}>Back to cases</button>
        </div>

        <div className="upload-box">
          <h3>{c.title}</h3>
          <p>{c.description || 'No description.'}</p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
            <span className="review-state" style={{ color: statusColor(c.status) }}>{c.status}</span>
            <span className="rule-tag"><User size={10} /> {c.assigned_to || 'unassigned'}</span>
            {c.deadline && <span className="rule-tag"><Calendar size={10} /> {c.deadline.slice(0, 16)}</span>}
            {c.closed_at && <span className="rule-tag">Closed {c.closed_at.slice(0, 16)}</span>}
          </div>
          <p style={{ marginTop: '8px', fontSize: '11px', color: '#8da3bd' }}>
            Created {c.created_at.slice(0, 16)} &nbsp;|&nbsp; Updated {c.updated_at.slice(0, 16)}
          </p>
        </div>

        {isOpen && (
          <div className="upload-box" style={{ marginTop: '14px' }}>
            <h3>Assignment &amp; status</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                placeholder="Assigned to"
                value={c.assigned_to}
                onChange={(e) => updateCase(c.id, { assigned_to: e.target.value })}
                style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8', flex: 1, minWidth: '150px' }}
              />
              <select
                value={c.status}
                onChange={(e) => updateCase(c.id, { status: e.target.value })}
                style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8' }}
              >
                <option>Open</option>
                <option>Under review</option>
                <option>Closed</option>
              </select>
              <button className="small" onClick={() => setClosingCaseId(c.id)}>
                Close case
              </button>
            </div>
            <p style={{ marginTop: '8px', fontSize: '11px', color: '#8da3bd' }}>
              Setting status to Closed records the closure decision and timestamp in the audit trail.
            </p>
          </div>
        )}

        {closingCaseId === c.id && (
          <div className="upload-box" style={{ marginTop: '14px' }}>
            <h3>Close case</h3>
            <p>Record the documented closure decision.</p>
            <textarea
              placeholder="Closure decision / outcome"
              value={closeDecision}
              onChange={(e) => setCloseDecision(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8', marginBottom: '8px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="small" onClick={() => closeCase(c.id, closeDecision)} disabled={closingCase || !closeDecision.trim()}>
                {closingCase ? 'Closing…' : 'Confirm close'}
              </button>
              <button className="small" style={{ background: 'transparent', border: '1px solid #304156', color: '#a8bad1' }} onClick={() => { setClosingCaseId(null); setCloseDecision(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="upload-box" style={{ marginTop: '14px' }}>
          <h3>Case notes</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <input
              placeholder="Add a note…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8', flex: 1, minWidth: '220px' }}
            />
            <button className="small" onClick={() => addCaseNote(c.id)} disabled={!newNote.trim() || !isOpen}>
              Add note
            </button>
          </div>
          {(c.notes || []).length === 0 ? (
            <p style={{ fontSize: '11px', color: '#8da3bd' }}>No notes yet.</p>
          ) : (
            (c.notes || []).map((n) => (
              <div key={n.id} style={{ borderBottom: '1px solid #1a293b', padding: '8px 0', fontSize: '11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#70849d' }}>
                  <span>{n.actor}</span>
                  <span>{n.timestamp.slice(0, 16)}</span>
                </div>
                <div style={{ marginTop: '2px' }}>{n.note}</div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  function renderCases() {
    return (
      <div>
        <div className="section-heading">
          <strong>Case Management</strong>
          <span className="version">{cases.length} cases</span>
        </div>

        <div className="upload-box">
          <h3>Create Case</h3>
          <p>Create an investigation, assign an officer, and set a deadline.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '560px' }}>
            <input
              placeholder="Case title"
              value={caseForm.title}
              onChange={(e) => setCaseForm({ ...caseForm, title: e.target.value })}
              disabled={creatingCase}
              style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8', width: '100%' }}
            />
            <input
              placeholder="Description"
              value={caseForm.description}
              onChange={(e) => setCaseForm({ ...caseForm, description: e.target.value })}
              disabled={creatingCase}
              style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8', width: '100%' }}
            />
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                placeholder="Assigned to"
                value={caseForm.assigned_to}
                onChange={(e) => setCaseForm({ ...caseForm, assigned_to: e.target.value })}
                disabled={creatingCase}
                style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8', flex: 1 }}
              />
              <input
                type="datetime-local"
                value={caseForm.deadline ? caseForm.deadline.slice(0, 16) : ''}
                onChange={(e) => setCaseForm({ ...caseForm, deadline: e.target.value + ':00Z' })}
                disabled={creatingCase}
                style={{ padding: '6px 8px', border: '1px solid #24354a', borderRadius: '6px', background: '#0d1827', color: '#e6edf8' }}
              />
            </div>
            <button className="primary" onClick={createCase} disabled={creatingCase || !caseForm.title.trim()}>
              {creatingCase ? 'Creating…' : <><FileText size={14} /> Create case</>}
            </button>
          </div>
        </div>

        {activeCase ? renderCaseDetail() : renderCaseList()}
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Shield size={24} />
          </div>
          <div>
            <strong>TRACEVAULT <span>AI</span></strong>
            <small>Threat Investigation</small>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <button className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveView('dashboard')}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className={`nav-item ${activeView === 'timeline' ? 'active' : ''}`} onClick={() => setActiveView('timeline')}>
            <Clock size={18} /> Timeline
          </button>
          <button className={`nav-item ${activeView === 'evidence' ? 'active' : ''}`} onClick={() => setActiveView('evidence')}>
            <Shield size={18} /> Evidence Vault
          </button>
          <button className={`nav-item ${activeView === 'alerts' ? 'active' : ''}`} onClick={() => setActiveView('alerts')}>
            <AlertTriangle size={18} /> Alerts
          </button>
          <button className={`nav-item ${activeView === 'cases' ? 'active' : ''}`} onClick={() => setActiveView('cases')}>
            <FileText size={18} /> Cases
          </button>
          <button className={`nav-item ${activeView === 'audit' ? 'active' : ''}`} onClick={() => setActiveView('audit')}>
            <History size={18} /> Audit Log
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="online-dot" />
          <span style={{ color: backendHealthy ? '#36d8b2' : '#e74c3c' }}>
            {backendHealthy ? 'Backend online' : 'Backend offline'}
          </span>
          <span className="version">v1.0.0</span>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>
            {activeView === 'dashboard' ? 'Dashboard' : activeView === 'timeline' ? 'Timeline' : activeView === 'evidence' ? 'Evidence Vault' : activeView === 'alerts' ? 'Alerts' : 'Audit Log'}
          </h1>
          <div className="top-actions">
            {activeView === 'evidence' && (
              <div className="env-pill">
                <FileText size={12} /> {evidenceList.length} evidence items
              </div>
            )}
            {activeView === 'alerts' && (
              <div className="live-tag">
                <AlertTriangle size={12} /> {alerts.filter((a) => a.status === 'Open').length} open
              </div>
            )}
            {activeView === 'timeline' && events.length > 0 && (
              <div className="env-pill">
                <Clock size={12} /> {events.length} events
              </div>
            )}
            {activeView === 'dashboard' && (
              <>
                <button className="icon-btn" onClick={loadDemo} disabled={demoLoading}>
                  <Play size={16} />
                </button>
                <button className="icon-btn" onClick={() => setActiveView('evidence')}>
                  <Upload size={16} />
                </button>
              </>
            )}
            <button className="icon-btn" onClick={exportReport} disabled={activeView !== 'dashboard'}>
              <Download size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '24px 0' }}>
          {activeView === 'dashboard' && renderDashboard()}
          {activeView === 'timeline' && (
            <div>
              <div className="section-heading">
                <div className="search">
                  <input
                    type="text"
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Search size={14} />
                </div>
              </div>
              {renderTimeline()}
            </div>
          )}
          {activeView === 'evidence' && renderEvidence()}
          {activeView === 'alerts' && renderAlerts()}
          {activeView === 'audit' && renderAudit()}
          {activeView === 'cases' && renderCases()}
        </div>
      </main>

      {globalLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span className="loading-text">Loading…</span>
        </div>
      )}
    </div>
  );
}

export default App;
