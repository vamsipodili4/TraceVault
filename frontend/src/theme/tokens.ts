export const CyberTokens = {
  bg: {
    base: '#0A0A0A',
    surface: '#121216',
    surfaceHover: '#181822',
    border: 'rgba(0, 123, 167, 0.25)',
  },
  accent: {
    cerulean: '#007BA7',
    ceruleanGlow: 'rgba(0, 123, 167, 0.45)',
    neonRose: '#FF2D95',
    neonRoseGlow: 'rgba(255, 45, 149, 0.45)',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#94A3B8',
    muted: '#64748B',
  },
} as const;

export type SeverityLevel = 'info' | 'warning' | 'danger';
export type BadgeType = 'Observation' | 'Investigate' | 'High priority' | 'Potential incident';
export type IntegrityStatus = 'Verified' | 'Tamper Detected' | 'Missing Baseline' | 'Processing Error';

export interface EvidenceRecord {
  id: number;
  filename: string;
  upload_time: string;
  sha256_hash: string;
  file_size_bytes: number;
  status: IntegrityStatus;
  source_device?: string;
  recorded_by?: string;
  backend_id?: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  source: string;
  event_type: string;
  user: string;
  ip_address?: string;
  asset?: string;
  source_file?: string;
  severity: SeverityLevel;
  badge: BadgeType;
  description: string;
  raw_payload?: Record<string, unknown>;
  associated_evidence_id?: number;
}

export interface InvestigationReport {
  report_metadata: {
    title: string;
    case_id: string;
    generated_at: string;
    investigator: string;
    status: string;
  };
  chain_of_custody: EvidenceRecord[];
  suspicious_findings: TimelineEvent[];
  full_timeline: TimelineEvent[];
  limitations: string[];
}