#!/usr/bin/env python3
"""
audit-runlog.py

Clusters run.log into stable "issue signatures" so you can see:
- What repeats (hotspots)
- Where it likely lives (component/package hints)
- Whether fixes actually reduced incidence (before/after comparisons)

Usage:
  python3 scripts/audit-runlog.py run.log --out artifacts/runlog-audit --top 50
"""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple


# --- ANSI escape stripping ---
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]|\x1b\].*?\x07")

# --- Punctuation-only line filter ---
# Lines that are only whitespace plus JSON structural characters ({, }, [, ], comma)
PUNCT_ONLY_RE = re.compile(r"^[\s{}\[\],]*$")

HEX_RE = re.compile(r"\b[0-9a-f]{8,}\b", re.IGNORECASE)
NUM_RE = re.compile(r"\b\d{3,}\b")
TASK_RE = re.compile(r"\bcognitive-task-[A-Za-z0-9_-]+\b")
REQ_RE  = re.compile(r"\bep-[A-Za-z0-9_-]+\b")
UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)

# Duration/timing patterns: "in 8ms", "(3ms)", "1287ms", etc.
DURATION_RE = re.compile(r"\b(\d+)\s*ms\b")
# HTTP status + timing: "200 in 8ms" → "<STATUS> in <NUM>ms"
HTTP_TIMING_RE = re.compile(r"\b(\d{3})\s+in\s+\d+ms\b")

# Inline JSON tails: truncate after a known structural prefix + JSON blob
# Matches: prefix followed by a JSON object/array that runs to end of line
JSON_TAIL_RE = re.compile(r'(:\s*)\{.*$')
JSON_ARRAY_TAIL_RE = re.compile(r'(:\s*)\[.*$')

# Common "structured-ish" prefixes you already use
# Allow spaces inside brackets for names like [Minecraft Interface], [Core API], etc.
COMPONENT_RE = re.compile(r"^\[([A-Za-z0-9_ :-]{2,64})\]\s*")

# Also match emoji-prefixed or parenthesized component markers
EMOJI_PREFIX_RE = re.compile(r"^[^\w\[]*\[([A-Za-z0-9_ :-]{2,64})\]")

# Loosely detect timestamps if present
TS_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ][0-9:.+-Z]{5,}")
TS_MS_RE  = re.compile(r"^\d{13}\b")  # epoch ms


def strip_ansi(s: str) -> str:
    """Remove ANSI escape sequences from a string."""
    return ANSI_RE.sub("", s)


def normalize_line(s: str) -> str:
    s = strip_ansi(s).strip()
    s = UUID_RE.sub("<UUID>", s)
    s = TASK_RE.sub("<TASK>", s)
    s = REQ_RE.sub("<REQ>", s)
    s = HEX_RE.sub("<HEX>", s)
    # Normalize HTTP timing first (e.g., "200 in 8ms" → "<STATUS> in <DUR>")
    s = HTTP_TIMING_RE.sub(r"<STATUS> in <DUR>", s)
    # Normalize remaining durations (e.g., "(3ms)" → "(<DUR>)")
    s = DURATION_RE.sub("<DUR>", s)
    s = NUM_RE.sub("<NUM>", s)
    # Truncate inline JSON tails — they carry per-event payloads that defeat clustering
    s = JSON_TAIL_RE.sub(r"\1<JSON>", s)
    s = JSON_ARRAY_TAIL_RE.sub(r"\1<JSON>", s)
    return s


def detect_severity(raw: str) -> str:
    l = raw.lower()
    if " fatal" in l or l.startswith("fatal"):
        return "FATAL"
    if " error" in l or l.startswith("error") or "exception" in l or "traceback" in l:
        return "ERROR"
    if " warn" in l or l.startswith("warn") or "warning" in l or "ignored" in l or "not allowed" in l:
        return "WARN"
    if " fail" in l or "failed" in l or "timeout" in l or "disconnected" in l:
        return "WARN"
    return "INFO"


def extract_component(raw: str) -> Optional[str]:
    m = COMPONENT_RE.match(raw)
    if m:
        return m.group(1)
    m = EMOJI_PREFIX_RE.match(raw)
    if m:
        return m.group(1)
    return None


KEYWORDS = [
    "updateTaskProgress",
    "updateTaskStatus",
    "verifyInventoryDelta",
    "No active session",
    "origin field ignored",
    "not allowed",
    "Disconnected",
    "Reconnected",
    "timeout",
    "report_episode",
    "trace_bundle_hash",
    "bindingHash",
    "normalizeActionResponse",
    "acquire_material",
    "collectBlock",
    "executeAction",
    "ok: true",
    "ok: false",
    "status transition",
    "ECONNREFUSED",
    "ECONNRESET",
    "socket hang up",
    "AbortError",
    "retry",
    "backoff",
    "circuit breaker",
]


def keyword_hits(s: str) -> List[str]:
    hits = []
    for k in KEYWORDS:
        if k.lower() in s.lower():
            hits.append(k)
    return hits


@dataclass
class Cluster:
    signature: str
    severity: str
    component: str
    count: int
    first_seen_line: int
    last_seen_line: int
    examples: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)


@dataclass
class CollapsedLine:
    """A line that may represent a collapsed brace block."""
    idx: int
    text: str
    # The full raw content of all lines in the block (for severity/keyword extraction)
    block_text: str = ""


def collapse_brace_blocks(lines: List[Tuple[int, str]]) -> List[CollapsedLine]:
    """Collapse pretty-printed object dumps into single synthetic lines.

    Detects lines ending with '{' and reads until braces re-balance,
    replacing the entire block with: PREFIX <OBJECT>.
    Preserves the full block text for severity/keyword detection.
    """
    result: List[CollapsedLine] = []
    i = 0
    while i < len(lines):
        idx, line = lines[i]
        stripped = line.rstrip()

        # Check if line ends with '{' (start of a pretty-printed object)
        if stripped.endswith("{"):
            prefix = stripped[:-1].rstrip()
            depth = stripped.count("{") - stripped.count("}")
            block_lines = [line]
            i += 1
            # Read until braces balance
            while i < len(lines) and depth > 0:
                _, bline = lines[i]
                depth += bline.count("{") - bline.count("}")
                block_lines.append(bline)
                i += 1
            # Emit a single synthetic line with the prefix
            synthetic = f"{prefix} <OBJECT>" if prefix else "<OBJECT>"
            full_block = "\n".join(block_lines)
            result.append(CollapsedLine(idx=idx, text=synthetic, block_text=full_block))
        else:
            result.append(CollapsedLine(idx=idx, text=line, block_text=line))
            i += 1
    return result


def process_log(logfile: str) -> List[Cluster]:
    clusters: Dict[Tuple[str, str, str], Cluster] = {}

    # Phase 1: read all lines and strip ANSI (keep all lines for brace balancing)
    raw_lines: List[Tuple[int, str]] = []
    with open(logfile, "r", encoding="utf-8", errors="replace") as f:
        for idx, raw in enumerate(f, start=1):
            raw = strip_ansi(raw).rstrip("\n")
            if not raw.strip():
                continue
            raw_lines.append((idx, raw))

    # Phase 2: collapse brace-delimited object dumps (needs all lines for balance)
    collapsed = collapse_brace_blocks(raw_lines)

    # Phase 3: drop punctuation-only lines that survived collapse
    collapsed = [cl for cl in collapsed if not PUNCT_ONLY_RE.match(cl.text)]

    # Phase 4: cluster
    for cl in collapsed:
        # Re-check after collapse — some synthetic lines may be empty
        if not cl.text.strip():
            continue

        # Use block_text for severity/keyword detection (captures content inside objects)
        sev = detect_severity(cl.block_text)
        comp = extract_component(cl.text) or "<no-component>"
        norm = normalize_line(cl.text)

        key = (comp, sev, norm)

        if key not in clusters:
            clusters[key] = Cluster(
                signature=f"{comp} | {sev} | {norm}",
                severity=sev,
                component=comp,
                count=0,
                first_seen_line=cl.idx,
                last_seen_line=cl.idx,
            )

        c = clusters[key]
        c.count += 1
        c.last_seen_line = cl.idx
        if len(c.examples) < 5:
            c.examples.append(cl.text)
        for h in keyword_hits(cl.block_text):
            if h not in c.keywords:
                c.keywords.append(h)

    sev_weight = {"FATAL": 4, "ERROR": 3, "WARN": 2, "INFO": 1}
    ranked = sorted(
        clusters.values(),
        key=lambda c: (sev_weight.get(c.severity, 0), c.count),
        reverse=True,
    )
    return ranked


def write_outputs(ranked: List[Cluster], logfile: str, outdir: str, top: int, min_count: int) -> None:
    os.makedirs(outdir, exist_ok=True)

    json_path = os.path.join(outdir, "runlog_clusters.json")
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump([asdict(c) for c in ranked], jf, indent=2)

    md_path = os.path.join(outdir, "runlog_summary.md")
    now = datetime.now(timezone.utc).isoformat()

    # Severity breakdown
    sev_counts: Dict[str, int] = {}
    for c in ranked:
        sev_counts[c.severity] = sev_counts.get(c.severity, 0) + c.count

    # Component breakdown (top 20)
    comp_counts: Dict[str, int] = {}
    for c in ranked:
        comp_counts[c.component] = comp_counts.get(c.component, 0) + c.count
    top_comps = sorted(comp_counts.items(), key=lambda x: x[1], reverse=True)[:20]

    with open(md_path, "w", encoding="utf-8") as mf:
        mf.write(f"# run.log Audit Summary\n\n")
        mf.write(f"Generated: {now}\n\n")
        mf.write(f"Log file: `{logfile}`\n\n")
        mf.write(f"Total unique clusters: {len(ranked)}\n\n")

        mf.write("## Severity Breakdown\n\n")
        mf.write("| Severity | Line Count |\n|---|---|\n")
        for sev in ["FATAL", "ERROR", "WARN", "INFO"]:
            if sev in sev_counts:
                mf.write(f"| {sev} | {sev_counts[sev]} |\n")
        mf.write("\n")

        mf.write("## Component Breakdown (Top 20)\n\n")
        mf.write("| Component | Line Count |\n|---|---|\n")
        for comp, cnt in top_comps:
            mf.write(f"| {comp} | {cnt} |\n")
        mf.write("\n")

        mf.write("---\n\n## Top Clusters\n\n")

        shown = 0
        for c in ranked:
            if c.count < min_count:
                continue
            mf.write(f"### {c.component} -- {c.severity} -- x{c.count}\n\n")
            if c.keywords:
                mf.write(f"**Keywords:** {', '.join(c.keywords)}\n\n")
            mf.write(f"Lines {c.first_seen_line}..{c.last_seen_line}\n\n")
            mf.write("```\n")
            for ex in c.examples[:3]:
                mf.write(f"{ex}\n")
            mf.write("```\n\n---\n\n")
            shown += 1
            if shown >= top:
                break

    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("logfile", help="Path to run.log")
    ap.add_argument("--out", default="artifacts/runlog-audit", help="Output directory")
    ap.add_argument("--top", type=int, default=50, help="Top N clusters to include")
    ap.add_argument("--min", type=int, default=2, help="Minimum count to include in summary")
    args = ap.parse_args()

    ranked = process_log(args.logfile)
    write_outputs(ranked, args.logfile, args.out, args.top, args.min)


if __name__ == "__main__":
    main()
