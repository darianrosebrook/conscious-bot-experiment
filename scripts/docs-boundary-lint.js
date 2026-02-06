import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
const files = [
  path.join(repoRoot, "docs", "planning", "cognitive-flow-detailed.md"),
  path.join(repoRoot, "docs", "planning", "IDLE_INTROSPECTION_DESIGN.md"),
  path.join(repoRoot, "docs", "planning", "SESSION_SUMMARY_2026-02-03.md"),
  path.join(repoRoot, "docs", "planning", "KEEPALIVE_AND_EVAL_ACCEPTANCE_CRITERIA.md"),
  path.join(repoRoot, "docs", "testing", "agency-emission-live-verification.md"),
  path.join(repoRoot, "readme.md"),
];

const bannedPatterns = [
  { name: "[GOAL: tag", regex: /\[GOAL:/ },
  { name: "extractGoalTag", regex: /\bextractGoalTag\b/ },
  { name: "structured intent", regex: /\bstructured intent\b/i },
  { name: "intent extraction", regex: /\bintent extraction\b/i },
  { name: "goal tag extraction", regex: /\bgoal tag extraction\b/i },
];

function isHeading(line) {
  const match = /^(#{1,6})\s+(.+)$/.exec(line);
  if (!match) return null;
  return { level: match[1].length, text: match[2] };
}

async function scanFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  if (/Status:\s*Legacy/i.test(content)) {
    return [];
  }
  const lines = content.split(/\r?\n/);
  let inCode = false;
  let legacyLevel = null;
  const findings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      inCode = !inCode;
      continue;
    }

    const heading = isHeading(line);
    if (heading) {
      const isLegacy = /legacy/i.test(heading.text);
      if (isLegacy) {
        legacyLevel = heading.level;
      } else if (legacyLevel !== null && heading.level <= legacyLevel) {
        legacyLevel = null;
      }
    }

    if (inCode || legacyLevel !== null) {
      continue;
    }

    for (const pattern of bannedPatterns) {
      if (pattern.regex.test(line)) {
        findings.push({
          line: i + 1,
          pattern: pattern.name,
          text: line.trim(),
        });
      }
    }
  }

  return findings;
}

let hadErrors = false;

for (const filePath of files) {
  const findings = await scanFile(filePath);
  if (findings.length === 0) continue;
  hadErrors = true;
  for (const finding of findings) {
    console.error(
      `${filePath}:${finding.line}: banned phrase outside Legacy section: ${finding.pattern}\n  ${finding.text}`
    );
  }
}

if (hadErrors) {
  process.exitCode = 1;
}
