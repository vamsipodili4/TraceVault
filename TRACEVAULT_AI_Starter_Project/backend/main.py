from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
EVIDENCE_DIR = DATA_DIR / "evidence"
REPORT_DIR = DATA_DIR / "reports"
for directory in (EVIDENCE_DIR, REPORT_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="TRACEVAULT AI API",
    description="Evidence-first incident investigation prototype. Findings require human review.",
    version="1.0.0",
)

# CORS: allow Vite's dynamic ports (5173, 5174, 5175, ...) and https://localhost for hackathon demo
allow_all_localhost = os.getenv("TRACEVAULT_CORS", "true").lower() != "false"
if allow_all_localhost:
    # Dynamically allow any http://localhost:PORT or http://127.0.0.1:PORT
    # This avoids CORS blocking when Vite assigns a new port each restart
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"^http://localhost:\d+$|^http://127\.0\.0\.1:\d+$",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# In-memory metadata keeps the demo simple. Use a persistent database and authentication
# before deploying or storing real evidence.
evidence_items: dict[str, dict[str, Any]] = {}
events: list[dict[str, Any]] = []
audit_log: list[dict[str, Any]] = []
incidents: dict[str, dict[str, Any]] = {}
cases: dict[str, dict[str, Any]] = {}
case_notes: dict[str, list[dict[str, Any]]] = {}

class ReviewRequest(BaseModel):
    status: str = Field(pattern="^(Open|Under review|Resolved|False positive)$")
    note: str = Field(default="", max_length=2000)
    reviewer: str = Field(default="demo-analyst", max_length=120)


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    assigned_to: str = Field(default="unassigned", max_length=120)
    deadline: str = Field(default="")


class CaseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    assigned_to: str | None = Field(default=None, max_length=120)
    status: str | None = Field(default=None, pattern="^(Open|Under review|Closed)$")
    deadline: str | None = Field(default=None)


class CaseNoteAdd(BaseModel):
    note: str = Field(min_length=1, max_length=4000)
    actor: str = Field(default="demo-analyst", max_length=120)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def audit(action: str, subject: str, detail: str = "") -> None:
    audit_log.append({
        "id": str(uuid.uuid4()),
        "timestamp": now_iso(),
        "actor": "local-demo-user",
        "action": action,
        "subject": subject,
        "detail": detail[:1000],
    })

def parse_timestamp(value: Any) -> tuple[str, float]:
    raw = str(value or "").strip()
    if not raw:
        return "", 0.0
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        # Naive timestamps are retained as supplied and treated as UTC only for sorting.
        sort_value = parsed.replace(tzinfo=timezone.utc).timestamp() if parsed.tzinfo is None else parsed.timestamp()
        return raw, sort_value
    except ValueError:
        return raw, 0.0

def normalize_event(row: dict[str, Any], source_file: str, index: int) -> dict[str, Any]:
    timestamp, sort_value = parse_timestamp(row.get("timestamp") or row.get("time") or row.get("@timestamp"))
    return {
        "id": str(uuid.uuid4()),
        "timestamp": timestamp or "Unknown",
        "_sort": sort_value,
        "source": str(row.get("source") or source_file)[:200],
        "event_type": str(row.get("event_type") or row.get("event") or row.get("type") or "unknown")[:120],
        "username": str(row.get("username") or row.get("user") or "unknown")[:120],
        "ip_address": str(row.get("ip_address") or row.get("ip") or "unknown")[:100],
        "asset": str(row.get("asset") or row.get("host") or "unknown")[:200],
        "details": str(row.get("details") or row.get("message") or row.get("description") or "")[:2000],
        "source_file": source_file,
        "source_row": index,
    }

def parse_log_bytes(filename: str, raw: bytes) -> list[dict[str, Any]]:
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB prototype limit.")
    suffix = Path(filename).suffix.lower()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Please upload a UTF-8 CSV or JSON file.")
    try:
        if suffix == ".json":
            data = json.loads(text)
            rows = data.get("events", []) if isinstance(data, dict) else data
            if not isinstance(rows, list) or not all(isinstance(item, dict) for item in rows):
                raise ValueError("JSON must be a list of event objects or an object with an events list.")
        elif suffix == ".csv":
            rows = list(csv.DictReader(io.StringIO(text)))
            if not rows:
                raise ValueError("CSV has no event rows.")
        else:
            raise HTTPException(status_code=400, detail="Only .csv and .json log files are supported.")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return [normalize_event(row, filename, i + 1) for i, row in enumerate(rows)]

def detect(events_in: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Transparent heuristic rules; never a definitive malware/breach verdict."""
    alerts: list[dict[str, Any]] = []
    by_user: dict[str, list[dict[str, Any]]] = {}
    for event in events_in:
        by_user.setdefault(event["username"], []).append(event)

        text = (event["event_type"] + " " + event["details"]).lower()
        if any(term in text for term in ("privilege escalation", "permission changed", "admin role granted", "role changed")):
            alerts.append({
                "id": str(uuid.uuid4()), "severity": "High", "rule": "Privilege change",
                "title": "Account privilege change recorded",
                "reason": "The event text contains a permission or privilege-change indicator.",
                "event_ids": [event["id"]], "timestamp": event["timestamp"],
                "status": "Open", "review_note": "",
            })
        if any(term in text for term in ("ransomware", "mass file modification", "mass file rename", "files encrypted")):
            alerts.append({
                "id": str(uuid.uuid4()), "severity": "High", "rule": "Unusual file activity",
                "title": "Potentially unusual file modification activity",
                "reason": "The event text contains a mass-change or encryption indicator; validate against normal business activity.",
                "event_ids": [event["id"]], "timestamp": event["timestamp"],
                "status": "Open", "review_note": "",
            })
        if any(term in text for term in ("failed login", "login failed", "authentication failure")):
            alerts.append({
                "id": str(uuid.uuid4()), "severity": "Medium", "rule": "Failed authentication",
                "title": "Failed authentication recorded",
                "reason": "A failed-login indicator appears in the event. A single failure is not proof of malicious activity.",
                "event_ids": [event["id"]], "timestamp": event["timestamp"],
                "status": "Open", "review_note": "",
            })

    # Flag an account appearing with multiple distinct IPs. This is a review cue only.
    for username, user_events in by_user.items():
        ips = sorted({e["ip_address"] for e in user_events if e["ip_address"] != "unknown"})
        if len(ips) >= 2 and username != "unknown":
            latest = max(user_events, key=lambda e: e.get("_sort", 0))
            alerts.append({
                "id": str(uuid.uuid4()), "severity": "Medium", "rule": "Multiple source IPs",
                "title": f"Account observed from {len(ips)} IP addresses",
                "reason": "The same username appears with multiple IP addresses in this upload. VPNs, travel, NAT and shared systems can explain this.",
                "event_ids": [e["id"] for e in user_events], "timestamp": latest["timestamp"],
                "status": "Open", "review_note": "",
            })
    return alerts

def recalculate_incident() -> None:
    global events
    events.sort(key=lambda e: e.get("_sort", 0))
    alert_list = detect(events)
    incidents.clear()
    incidents["current"] = {
        "id": "current",
        "title": "Imported log investigation",
        "created_at": now_iso(),
        "status": "Open",
        "event_count": len(events),
        "alert_count": len(alert_list),
        "alerts": alert_list,
        "assessment": "Review recommended" if alert_list else ("No rule matches; this does not prove the environment is safe." if events else "No events loaded."),
    }

def public_event(event: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in event.items() if not k.startswith("_")}

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "TRACEVAULT AI", "version": "1.0.0"}

@app.get("/api/summary")
def summary():
    incident = incidents.get("current", {})
    return {
        "evidence_count": len(evidence_items),
        "event_count": len(events),
        "alert_count": len(incident.get("alerts", [])),
        "open_alert_count": sum(1 for a in incident.get("alerts", []) if a["status"] == "Open"),
        "assessment": incident.get("assessment", "No events loaded."),
    }

@app.get("/api/events")
def get_events():
    return [public_event(e) for e in sorted(events, key=lambda e: e.get("_sort", 0))]

@app.get("/api/alerts")
def get_alerts():
    return incidents.get("current", {}).get("alerts", [])

@app.get("/api/evidence")
def get_evidence():
    return list(evidence_items.values())

@app.get("/api/audit")
def get_audit():
    return list(reversed(audit_log[-500:]))

@app.post("/api/evidence/upload")
async def upload_evidence(file: UploadFile = File(...)):
    filename = Path(file.filename or "evidence.bin").name
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds the 10 MB prototype limit.")
    suffix = Path(filename).suffix.lower()
    if suffix not in {".csv", ".json", ".log", ".txt"}:
        raise HTTPException(status_code=400, detail="Supported evidence types: CSV, JSON, LOG, TXT.")
    evidence_id = str(uuid.uuid4())
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)[:100] or "evidence.bin"
    stored_path = EVIDENCE_DIR / f"{evidence_id}_{safe_name}"
    stored_path.write_bytes(raw)
    digest = sha256_file(stored_path)
    item = {
        "id": evidence_id, "filename": filename, "stored_name": stored_path.name,
        "size_bytes": len(raw), "sha256": digest, "collected_at": now_iso(),
        "source": "User-uploaded file", "verification": "Verified at collection",
    }
    evidence_items[evidence_id] = item
    audit("EVIDENCE_COLLECTED", evidence_id, f"filename={filename}; sha256={digest}")
    if suffix in {".csv", ".json"}:
        parsed = parse_log_bytes(filename, raw)
        events.extend(parsed)
        recalculate_incident()
        audit("LOGS_PARSED", evidence_id, f"events_added={len(parsed)}")
        item["events_imported"] = len(parsed)
    return item

@app.post("/api/evidence/{evidence_id}/verify")
def verify_evidence(evidence_id: str):
    item = evidence_items.get(evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail="Evidence item not found.")
    path = EVIDENCE_DIR / item["stored_name"]
    if not path.exists():
        current_hash = None
        result = "Missing"
    else:
        current_hash = sha256_file(path)
        result = "Match" if current_hash == item["sha256"] else "Mismatch"
    audit("EVIDENCE_VERIFIED", evidence_id, f"result={result}")
    return {"id": evidence_id, "recorded_sha256": item["sha256"], "current_sha256": current_hash, "result": result,
            "note": "A matching hash supports post-collection integrity only; it does not prove source authenticity."}

@app.post("/api/alerts/{alert_id}/review")
def review_alert(alert_id: str, request: ReviewRequest):
    alerts = incidents.get("current", {}).get("alerts", [])
    for alert in alerts:
        if alert["id"] == alert_id:
            alert["status"] = request.status
            alert["review_note"] = request.note
            audit("ALERT_REVIEWED", alert_id, f"status={request.status}; reviewer={request.reviewer}; note={request.note}")
            return alert
    raise HTTPException(status_code=404, detail="Alert not found.")

@app.post("/api/demo/load")
def load_demo():
    global events
    sample = [
        {"timestamp":"2026-10-24T09:02:00+05:30","source":"auth.log","event_type":"login_success","username":"accounting.user","ip_address":"203.0.113.44","asset":"acct-ws-03","details":"Successful login from an unfamiliar demo IP address."},
        {"timestamp":"2026-10-24T09:05:00+05:30","source":"audit.json","event_type":"privilege escalation","username":"accounting.user","ip_address":"203.0.113.44","asset":"acct-server-01","details":"Admin role granted in synthetic test event."},
        {"timestamp":"2026-10-24T09:08:00+05:30","source":"file-events.csv","event_type":"mass file modification","username":"accounting.user","ip_address":"203.0.113.44","asset":"acct-share-01","details":"Mass file modification observed in synthetic test data."},
        {"timestamp":"2026-10-24T09:09:00+05:30","source":"auth.log","event_type":"failed login","username":"backup.operator","ip_address":"198.51.100.17","asset":"acct-server-01","details":"Authentication failure; synthetic demo event."},
        {"timestamp":"2026-10-24T09:10:00+05:30","source":"auth.log","event_type":"login_success","username":"accounting.user","ip_address":"198.51.100.22","asset":"acct-ws-03","details":"Same demo account observed from another IP; may have benign explanations."},
    ]
    events = [normalize_event(row, row["source"], i + 1) for i, row in enumerate(sample)]
    recalculate_incident()
    audit("DEMO_LOADED", "current", "Loaded synthetic sample events.")
    return {"message": "Synthetic demo incident loaded.", "event_count": len(events), "alert_count": len(incidents["current"]["alerts"])}

@app.delete("/api/reset")
def reset_demo():
    global events
    events = []
    evidence_items.clear()
    incidents.clear()
    audit("DEMO_RESET", "all", "Cleared in-memory demo records.")
    return {"message": "Demo records cleared. Existing files in the evidence directory were retained for safer review."}

@app.get("/api/report.pdf")
def export_report():
    path = REPORT_DIR / "tracevault_incident_report.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("TRACEVAULT AI — Incident Investigation Report", styles["Title"]),
        Paragraph(f"Generated: {now_iso()}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph("<b>Assessment:</b> " + incidents.get("current", {}).get("assessment", "No events loaded."), styles["BodyText"]),
        Paragraph("This is a decision-support report. Rule matches are indicators for human review, not proof of compromise.", styles["BodyText"]),
        Spacer(1, 12),
        Paragraph("Evidence inventory", styles["Heading2"]),
    ]
    evidence_rows = [["Filename", "SHA-256", "Size (bytes)", "Collected at"]]
    for item in evidence_items.values():
        evidence_rows.append([item["filename"][:35], item["sha256"][:20] + "...", str(item["size_bytes"]), item["collected_at"][:25]])
    if len(evidence_rows) == 1:
        evidence_rows.append(["No uploaded evidence", "-", "-", "-"])
    table = Table(evidence_rows, repeatRows=1, colWidths=[145, 150, 65, 130])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#10243A")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
        ("FONTSIZE", (0,0), (-1,-1), 7),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("WORDWRAP", (0,0), (-1,-1), True),
    ]))
    story += [table, Spacer(1, 12), Paragraph("Suspicious indicators", styles["Heading2"])]
    alert_rows = [["Time", "Severity", "Rule", "Reason", "Review status"]]
    for alert in incidents.get("current", {}).get("alerts", []):
        alert_rows.append([alert["timestamp"][:25], alert["severity"], alert["rule"], alert["reason"], alert["status"]])
    if len(alert_rows) == 1:
        alert_rows.append(["-", "-", "No rule matches", "No matches does not mean the system is safe.", "-"])
    table2 = Table(alert_rows, repeatRows=1, colWidths=[80, 48, 90, 210, 62])
    table2.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#10243A")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("GRID", (0,0), (-1,-1), 0.4, colors.grey),
        ("FONTSIZE", (0,0), (-1,-1), 7),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story += [table2, Spacer(1, 12), Paragraph("Event timeline", styles["Heading2"])]
    for event in sorted(events, key=lambda e: e.get("_sort", 0)):
        line = f'{event["timestamp"]} | {event["event_type"]} | user={event["username"]} | asset={event["asset"]} | source={event["source"]} | {event["details"]}'
        story.append(Paragraph(line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), styles["BodyText"]))
        story.append(Spacer(1, 4))
    story += [Spacer(1, 12), Paragraph("Limitations", styles["Heading2"]),
              Paragraph("Hashing can reveal post-collection changes when compared with a trusted recorded hash, but does not establish original authenticity, timestamp accuracy, or legal admissibility. Missing logs cannot be reconstructed. Validate findings with an authorized professional.", styles["BodyText"])]
    doc.build(story)
    audit("REPORT_EXPORTED", "current", path.name)
    return FileResponse(path, media_type="application/pdf", filename="tracevault_incident_report.pdf")


@app.get("/api/cases")
def list_cases():
    result = []
    for case in cases.values():
        item = dict(case)
        item["note_count"] = len(case_notes.get(case["id"], []))
        result.append(item)
    result.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    return result


@app.post("/api/cases")
def create_case(request: CaseCreate):
    case_id = str(uuid.uuid4())
    case = {
        "id": case_id,
        "title": request.title,
        "description": request.description,
        "assigned_to": request.assigned_to,
        "status": "Open",
        "deadline": request.deadline,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "closed_at": None,
        "closure_decision": None,
    }
    cases[case_id] = case
    case_notes[case_id] = []
    audit("CASE_CREATED", case_id, f"title={request.title}; assigned_to={request.assigned_to}")
    return case


@app.get("/api/cases/{case_id}")
def get_case(case_id: str):
    case = cases.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    item = dict(case)
    item["notes"] = list(case_notes.get(case_id, []))
    return item


@app.patch("/api/cases/{case_id}")
def update_case(case_id: str, request: CaseUpdate):
    case = cases.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    changes = []
    for field in ("title", "description", "assigned_to", "status", "deadline"):
        value = getattr(request, field)
        if value is not None:
            case[field] = value
            changes.append(f"{field}={value}")
    if request.status == "Closed" and case.get("closed_at") is None:
        case["closed_at"] = now_iso()
    case["updated_at"] = now_iso()
    audit("CASE_UPDATED", case_id, "; ".join(changes))
    return case


@app.post("/api/cases/{case_id}/notes")
def add_case_note(case_id: str, request: CaseNoteAdd):
    case = cases.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    note = {
        "id": str(uuid.uuid4()),
        "case_id": case_id,
        "note": request.note,
        "actor": request.actor,
        "timestamp": now_iso(),
    }
    case_notes.setdefault(case_id, []).append(note)
    case["updated_at"] = now_iso()
    audit("CASE_NOTE_ADDED", case_id, f"actor={request.actor}; note={request.note[:200]}")
    return note


@app.post("/api/cases/{case_id}/close")
def close_case(case_id: str, request: CaseNoteAdd):
    case = cases.get(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")
    case["status"] = "Closed"
    case["closed_at"] = now_iso()
    case["closure_decision"] = request.note
    case["updated_at"] = now_iso()
    note = {
        "id": str(uuid.uuid4()),
        "case_id": case_id,
        "note": f"[Case closed] {request.note}",
        "actor": request.actor,
        "timestamp": now_iso(),
    }
    case_notes.setdefault(case_id, []).append(note)
    audit("CASE_CLOSED", case_id, f"actor={request.actor}; decision={request.note[:200]}")
    return case
