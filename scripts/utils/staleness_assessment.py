#!/usr/bin/env python3

"""
Shared staleness assessment logic for MOC generators.

Provides consistent staleness detection across package inventories.
Uses multiple signals beyond just modification date to determine true staleness.

Author: @darianrosebrook
"""

import re
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


class StalenessLevel(Enum):
    """Staleness levels from most active to most stale."""
    ACTIVE = "active"
    CURRENT = "current"
    STABLE = "stable"
    REVIEW_NEEDED = "review_needed"
    POTENTIALLY_STALE = "potentially_stale"
    LIKELY_STALE = "likely_stale"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


@dataclass
class StalenessSignal:
    """A single staleness signal with weight and reason."""
    name: str
    weight: float
    reason: str
    category: str


@dataclass
class StalenessAssessment:
    """Complete staleness assessment for a file."""
    level: StalenessLevel
    score: float
    signals: List[StalenessSignal] = field(default_factory=list)
    recommendation: str = ""
    archive_candidate: bool = False
    archive_reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "staleness_level": self.level.value,
            "staleness_score": round(self.score, 2),
            "staleness_indicators": [s.reason for s in self.signals],
            "recommendation": self.recommendation,
            "archive_candidate": self.archive_candidate,
            "archive_reasons": self.archive_reasons,
        }


DEPRECATED_PATTERNS = {
    r"deprecated": ("explicit_deprecated", 0.9, "Explicitly marked as deprecated"),
    r"legacy": ("explicit_legacy", 0.7, "Marked as legacy code"),
    r"old_": ("old_prefix", 0.6, "Has 'old_' prefix suggesting superseded"),
    r"_old(?:_|\.ts|$)": ("old_suffix", 0.6, "Has '_old' suffix suggesting superseded"),
    r"session[_-]": ("session_doc", 0.7, "Session-specific document (temporal)"),
    r"status[_-]report": ("status_report", 0.6, "Status report (temporal)"),
}

# conscious-bot specific - extend as deprecated patterns are identified
DEPRECATED_IMPORTS = {}


TEMPORAL_THRESHOLDS = {
    "active": 7,
    "current": 30,
    "stable": 90,
    "review": 180,
    "stale": 365,
}


def get_git_commit_count(file_path: Path, days: int = 90) -> int:
    """Get number of git commits touching this file in the last N days."""
    try:
        result = subprocess.run(
            ["git", "log", f"--since={days} days ago", "--oneline", "--", str(file_path)],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=file_path.parent,
        )
        if result.returncode == 0:
            return len(result.stdout.strip().split("\n")) if result.stdout.strip() else 0
    except Exception:
        pass
    return -1


def get_git_last_commit_date(file_path: Path) -> Optional[datetime]:
    """Get the date of the last git commit touching this file."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%ci", "--", str(file_path)],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=file_path.parent,
        )
        if result.returncode == 0 and result.stdout.strip():
            date_str = result.stdout.strip()
            return datetime.strptime(date_str[:19], "%Y-%m-%d %H:%M:%S")
    except Exception:
        pass
    return None


def check_deprecated_patterns(path: str, content: str = "") -> List[StalenessSignal]:
    """Check for deprecated patterns in path and content."""
    signals = []
    path_lower = path.lower()
    content_lower = content.lower() if content else ""

    for pattern, (name, weight, reason) in DEPRECATED_PATTERNS.items():
        if re.search(pattern, path_lower) or (content and re.search(pattern, content_lower[:1000])):
            signals.append(StalenessSignal(
                name=name,
                weight=weight,
                reason=reason,
                category="structural",
            ))
    return signals


def check_deprecated_imports(imports: List[str]) -> List[StalenessSignal]:
    """Check for deprecated import patterns."""
    signals = []
    for imp in imports:
        for deprecated, suggestion in DEPRECATED_IMPORTS.items():
            if imp.startswith(deprecated) or deprecated in imp:
                signals.append(StalenessSignal(
                    name=f"deprecated_import_{deprecated.replace('.', '_')}",
                    weight=0.5,
                    reason=f"Imports deprecated module '{imp}'. {suggestion}",
                    category="dependency",
                ))
    return signals


def check_temporal_staleness(
    days_since_modification: int,
    git_commits_90d: int = -1,
) -> List[StalenessSignal]:
    """Check for temporal staleness signals."""
    signals = []
    if days_since_modification > TEMPORAL_THRESHOLDS["stale"]:
        signals.append(StalenessSignal(
            name="very_old_modification",
            weight=0.8,
            reason=f"Not modified in {days_since_modification} days (over 1 year)",
            category="temporal",
        ))
    elif days_since_modification > TEMPORAL_THRESHOLDS["review"]:
        signals.append(StalenessSignal(
            name="old_modification",
            weight=0.5,
            reason=f"Not modified in {days_since_modification} days (over 6 months)",
            category="temporal",
        ))
    elif days_since_modification > TEMPORAL_THRESHOLDS["stable"]:
        signals.append(StalenessSignal(
            name="moderate_age",
            weight=0.2,
            reason=f"Not modified in {days_since_modification} days (over 3 months)",
            category="temporal",
        ))
    if git_commits_90d == 0 and days_since_modification > 30:
        signals.append(StalenessSignal(
            name="no_recent_commits",
            weight=0.3,
            reason="No git commits in 90 days despite older modification",
            category="temporal",
        ))
    return signals


def check_todo_density(
    todos: Dict[str, List],
    lines: int,
) -> List[StalenessSignal]:
    """Check for high TODO density as staleness signal."""
    signals = []
    total_todos = sum(len(v) for v in todos.values())
    if total_todos == 0 or lines == 0:
        return signals
    p0_count = len(todos.get("P0-GOV", []))
    p1_count = len(todos.get("P1-METRIC", []))
    critical_todos = p0_count + p1_count
    if critical_todos >= 3:
        signals.append(StalenessSignal(
            name="high_critical_todos",
            weight=0.4,
            reason=f"Has {critical_todos} critical TODOs (P0/P1) that may block progress",
            category="structural",
        ))
    todo_density = total_todos / (lines / 50) if lines else 0
    if todo_density > 2:
        signals.append(StalenessSignal(
            name="high_todo_density",
            weight=0.3,
            reason=f"High TODO density ({total_todos} TODOs in {lines} lines)",
            category="structural",
        ))
    return signals


def check_archive_candidate(
    path: str,
    title: Optional[str] = None,
    content_type: str = "code",
) -> Tuple[bool, List[str]]:
    """Determine if a file is an archive candidate based on patterns."""
    path_lower = path.lower()
    title_lower = (title or "").lower()
    reasons = []
    if "archive" in path_lower:
        return False, []
    if content_type == "documentation":
        temporal_patterns = [
            (r"session[_-]", "Session-specific document"),
            (r"status[_-]report", "Status report"),
            (r".*[_-]summary$", "Summary document"),
            (r".*[_-]report$", "Report document"),
        ]
        for pattern, reason in temporal_patterns:
            if re.search(pattern, path_lower):
                reasons.append(reason)
    if content_type in ("code", "script"):
        version_patterns = [
            (r"_old(?:_|\.ts|$)", "References old version"),
        ]
        for pattern, reason in version_patterns:
            if re.search(pattern, path_lower):
                reasons.append(reason)
    return len(reasons) > 0, reasons


def compute_staleness_score(signals: List[StalenessSignal]) -> float:
    """Compute overall staleness score from signals."""
    if not signals:
        return 0.0
    by_category: Dict[str, List[float]] = {}
    for signal in signals:
        if signal.category not in by_category:
            by_category[signal.category] = []
        by_category[signal.category].append(signal.weight)
    category_scores = []
    for category, weights in by_category.items():
        weights.sort(reverse=True)
        category_score = weights[0]
        for w in weights[1:]:
            category_score += w * 0.5
        category_scores.append(min(1.0, category_score))
    base_score = max(category_scores)
    multi_category_bonus = 0.1 * (len(category_scores) - 1)
    return min(1.0, base_score + multi_category_bonus)


def determine_staleness_level(score: float, is_archived: bool = False) -> StalenessLevel:
    """Determine staleness level from score."""
    if is_archived:
        return StalenessLevel.ARCHIVED
    if score >= 0.8:
        return StalenessLevel.DEPRECATED
    elif score >= 0.6:
        return StalenessLevel.LIKELY_STALE
    elif score >= 0.4:
        return StalenessLevel.POTENTIALLY_STALE
    elif score >= 0.25:
        return StalenessLevel.REVIEW_NEEDED
    elif score >= 0.1:
        return StalenessLevel.STABLE
    elif score >= 0.05:
        return StalenessLevel.CURRENT
    return StalenessLevel.ACTIVE


def get_recommendation(level: StalenessLevel, content_type: str = "code") -> str:
    """Generate recommendation based on staleness level."""
    recommendations = {
        StalenessLevel.ACTIVE: "Active development - no action needed",
        StalenessLevel.CURRENT: "Current - keep active",
        StalenessLevel.STABLE: "Stable - monitor for relevance",
        StalenessLevel.REVIEW_NEEDED: "Review for currency - may need updates",
        StalenessLevel.POTENTIALLY_STALE: "Review for relevance - consider updating or archiving",
        StalenessLevel.LIKELY_STALE: "Likely stale - update or archive soon",
        StalenessLevel.DEPRECATED: "Deprecated - archive or remove",
        StalenessLevel.ARCHIVED: "Archived - historical reference only",
    }
    return recommendations.get(level, "Review needed")


def assess_staleness(
    path: str,
    days_since_modification: int,
    content: str = "",
    imports: List[str] = None,
    todos: Dict[str, List] = None,
    lines: int = 0,
    content_type: str = "code",
    title: Optional[str] = None,
    use_git: bool = True,
) -> StalenessAssessment:
    """Perform comprehensive staleness assessment."""
    signals = []
    is_archived = "archive" in path.lower()
    imports = imports or []
    todos = todos or {}

    if not is_archived:
        signals.extend(check_temporal_staleness(days_since_modification))
        signals.extend(check_deprecated_patterns(path, content))
        if imports:
            signals.extend(check_deprecated_imports(imports))
        if todos and lines > 0:
            signals.extend(check_todo_density(todos, lines))
        if use_git:
            file_path = Path(path)
            if file_path.exists():
                git_commits = get_git_commit_count(file_path, days=90)
                if git_commits >= 0:
                    signals.extend(check_temporal_staleness(
                        days_since_modification,
                        git_commits_90d=git_commits,
                    ))

    score = compute_staleness_score(signals)
    level = determine_staleness_level(score, is_archived)
    archive_candidate, archive_reasons = check_archive_candidate(path, title, content_type)
    recommendation = get_recommendation(level, content_type)

    return StalenessAssessment(
        level=level,
        score=score,
        signals=signals,
        recommendation=recommendation,
        archive_candidate=archive_candidate and not is_archived,
        archive_reasons=archive_reasons,
    )
