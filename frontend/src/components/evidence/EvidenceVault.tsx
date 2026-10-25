import React, { useState } from 'react';
import { ShieldCheck, Upload, Check, AlertTriangle, FileCode, RefreshCw } from 'lucide-react';
import { EvidenceRecord, IntegrityStatus } from '../../theme/tokens';

interface EvidenceVaultProps {
  records: EvidenceRecord[];
  onUploadSuccess: () => void;
}

export const EvidenceVault: React.FC<EvidenceVaultProps> = ({ records, onUploadSuccess }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [verificationFeedback, setVerificationFeedback] = useState<{ id: number; message: string; pass: boolean } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(err.detail || 'Upload transmission failure');
      }
      onUploadSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload transmission failure';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const verifyIntegrityManually = async (record: EvidenceRecord) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

      if (calculatedHash === record.sha256_hash) {
        setVerificationFeedback({
          id: record.id,
          message: 'Integrity Verified: Computed SHA-256 matches the baseline digest.',
          pass: true,
        });
      } else {
        setVerificationFeedback({
          id: record.id,
          message: `CRITICAL INTEGRITY MISMATCH: Hash mismatch. Calculated ${calculatedHash.substring(0, 16)}...`,
          pass: false,
        });
      }
    };
    input.click();
  };

  const statusColor = (status: IntegrityStatus) => {
    switch (status) {
      case 'Verified': return 'text-[#007BA7] bg-[#007BA7]/10 border-[#007BA7]/30';
      case 'Tamper Detected': return 'text-[#FF2D95] bg-[#FF2D95]/10 border-[#FF2D95]/30';
      case 'Missing Baseline': return 'text-[#64748B] bg-[#0A0A0A] border-[#007BA7]/20';
      default: return 'text-[#94A3B8] bg-[#0A0A0A] border-[#007BA7]/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="p-6 rounded-lg bg-[#121216] border border-[#007BA7]/35 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-white tracking-wide">Digital Evidence Ingestion</h2>
          <p className="text-xs text-[#94A3B8] mt-1 max-w-xl">
            Files are immediately hashed using standard SHA-256 before parsing to lock down an untampered baseline.
          </p>
          {uploadError && (
            <p className="text-xs text-[#FF2D95] mt-2 font-mono flex items-center gap-1">
              <AlertTriangle size={14} /> {uploadError}
            </p>
          )}
        </div>

        <label className="relative cursor-pointer">
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
            accept=".csv,.json,.log,.txt"
          />
          <div className="bg-[#007BA7] hover:bg-[#007BA7]/80 text-white font-semibold text-xs md:text-sm px-5 py-2.5 rounded transition-all flex items-center gap-2 shadow-[0_0_15px_rgba(0,123,167,0.4)]">
            <Upload size={16} />
            {isUploading ? 'Hashing Artifact…' : 'Ingest Log Artifact'}
          </div>
        </label>
      </div>

      {verificationFeedback && (
        <div className={`p-3.5 rounded border font-mono text-xs flex items-center gap-2 ${
          verificationFeedback.pass
            ? 'bg-[#007BA7]/10 border-[#007BA7] text-[#007BA7]'
            : 'bg-[#FF2D95]/15 border-[#FF2D95] text-[#FF2D95] shadow-[0_0_12px_rgba(255,45,149,0.3)]'
        }`}>
          {verificationFeedback.pass ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{verificationFeedback.message}</span>
        </div>
      )}

      {/* Manifest Table */}
      <div className="bg-[#121216] rounded-lg border border-[#007BA7]/30 overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#007BA7]/20 flex justify-between items-center bg-[#0A0A0A]">
          <h3 className="text-sm font-semibold text-white font-mono tracking-wide">CHAIN OF CUSTODY MANIFEST</h3>
          <span className="text-xs text-[#007BA7] font-mono">{records.length} Artifacts Locked</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#121216] text-[#94A3B8] border-b border-[#007BA7]/20">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">FILENAME</th>
                <th className="p-3">INGESTION TIME (UTC)</th>
                <th className="p-3">SHA-256 BASELINE HASH</th>
                <th className="p-3">STATUS</th>
                <th className="p-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#007BA7]/10">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#64748B]">
                    No evidence registered in the current case boundary.
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#0A0A0A] transition-colors">
                    <td className="p-3 text-[#007BA7]">#{rec.id}</td>
                    <td className="p-3 font-medium text-white flex items-center gap-2">
                      <FileCode size={14} className="text-[#007BA7]" />
                      {rec.filename}
                    </td>
                    <td className="p-3 text-[#94A3B8]">{rec.upload_time}</td>
                    <td className="p-3 text-[#007BA7] font-mono select-all">
                      {rec.sha256_hash.substring(0, 16)}...{rec.sha256_hash.substring(48)}
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${statusColor(rec.status)}`}>
                        <ShieldCheck size={12} />
                        {rec.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => verifyIntegrityManually(rec)}
                        className="bg-[#0A0A0A] hover:bg-[#FF2D95]/10 text-white hover:text-[#FF2D95] border border-[#007BA7]/40 hover:border-[#FF2D95] px-2.5 py-1 rounded transition-colors text-[11px]"
                      >
                        <RefreshCw size={12} className="mr-1" /> Verify Hash
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
