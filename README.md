# TRACEVAULT AI
Threat Reconstruction, Analysis, and Chain-of-Evidence Vault

A hackathon-ready, evidence-first cybersecurity incident investigation prototype.
It imports authorized CSV/JSON logs, preserves uploaded files, computes SHA-256 hashes,
normalizes events, applies transparent detection rules, shows a chronological timeline,
records audit events, and exports a PDF incident report.

## Safety and scope
- Use only systems and log files you are authorized to investigate.
- The included dataset is synthetic.
- Findings are indicators for human review, not proof that an attack occurred.
- SHA-256 detects a mismatch against a previously recorded hash; it does not prove the
  source was authentic before collection or that source timestamps are trustworthy.
- This prototype is not a replacement for a qualified incident-response professional.

## Requirements
- Python 3.10+
- Node.js 18+ (optional, for the React UI)

## 1. Start the backend
From this directory:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

API docs: http://127.0.0.1:8000/docs

## 2. Start the frontend (optional)
Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open the URL printed by Vite (usually http://localhost:5173).

## 3. Demo flow
1. Click **Load demo incident** in the UI, or call `POST /api/demo/load`.
2. Open **Timeline** and review the suspicious event groups.
3. Open **Evidence Vault** to inspect SHA-256 hashes.
4. Click **Export PDF report**.
5. To demonstrate integrity checking, call `POST /api/evidence/{evidence_id}/verify` after the evidence file has changed in the stored evidence directory. Do not modify the original source file used for a real investigation.

## Input format
CSV or JSON. Event fields accepted:
`timestamp`, `source`, `event_type`, `username`, `ip_address`, `asset`, `details`.

JSON can be a list of objects or an object with an `events` list.
All times are interpreted as supplied; timestamps without timezone information are not silently converted.
