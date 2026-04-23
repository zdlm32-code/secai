#!/usr/bin/env python3
"""Import a text file with Section/Lesson/Transcript structure into the SecAI+ Study Lab."""

import json
import re
import sys
import urllib.request
from pathlib import Path

API_BASE = "http://localhost:3000"

# Map section numbers/titles to exam domains
SECTION_DOMAIN_MAP = {
    "Section 7": "basic-ai",      # Data Processing
    "Section 8": "basic-ai",      # RAG
    "Section 9": "securing-ai",   # Security in AI Lifecycle
    "Section 10": "ai-grc",       # Human-Centric AI Design
    "Section 11": "securing-ai",  # Domain 2 Overview
    "Section 12": "securing-ai",  # Data and Training Attacks
    "Section 13": "securing-ai",  # Prompt and Input Manipulation
    "Section 14": "securing-ai",  # Model Extraction and Info Leakage
    "Section 15": "securing-ai",  # Integration and Operational Attacks
    "Section 16": "securing-ai",  # AI Security Controls
    "Section 17": "securing-ai",  # AI Access Controls
    "Section 18": "securing-ai",  # Encryption and Data Safety
    "Section 19": "securing-ai",  # AI Monitoring and Auditing
    "Section 20": "ai-security",  # Domain 3 Overview
    "Section 21": "ai-security",  # AI-Assisted Security Tools
    "Section 22": "ai-security",  # AI Security Use Cases
    "Section 23": "ai-security",  # AI-Enabled Attacks
    "Section 24": "ai-security",  # Automating Security Tasks
    "Section 25": "ai-grc",       # Domain 4 Overview
    "Section 26": "ai-grc",       # AI Governance
    "Section 27": "ai-grc",       # AI Risks
    "Section 28": "ai-grc",       # AI Compliance
    "Section 29": "ai-grc",       # What's Next / Exam Prep
}


def parse_file(path: Path):
    """Parse the transcript file into a list of (section, module, title, text) tuples."""
    content = path.read_text(encoding="utf-8")
    lines = content.split("\n")

    lessons = []
    current_section = None
    current_lesson_num = None
    current_title = None
    current_body = []

    section_re = re.compile(r"^Section \d+:")
    lesson_re = re.compile(r"^(\d+)\.\s+(.+)")

    def flush():
        if current_lesson_num is not None and current_title is not None:
            body = "\n".join(current_body).strip()
            lessons.append({
                "section": current_section,
                "module": f"Lesson {current_lesson_num}",
                "title": current_title,
                "text": body,
            })

    for line in lines:
        if section_re.match(line):
            flush()
            current_section = line.strip()
            current_lesson_num = None
            current_title = None
            current_body = []
        elif lesson_re.match(line):
            flush()
            m = lesson_re.match(line)
            current_lesson_num = int(m.group(1))
            current_title = m.group(2).strip()
            current_body = []
        else:
            if current_lesson_num is not None:
                current_body.append(line)

    flush()
    return lessons


def post_transcript(lesson):
    """POST one lesson to the web app."""
    # Determine domain from section
    domain = "basic-ai"  # fallback
    for section_key, dom in SECTION_DOMAIN_MAP.items():
        if lesson["section"] and lesson["section"].startswith(section_key + ":"):
            domain = dom
            break

    payload = json.dumps({
        "title": lesson["title"],
        "domain": domain,
        "module": f"{lesson['section']} — {lesson['module']}" if lesson["section"] else lesson["module"],
        "text": lesson["text"],
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{API_BASE}/api/transcripts",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result, domain
    except Exception as e:
        return {"error": str(e)}, domain


def main():
    if len(sys.argv) < 2:
        print("Usage: import-transcripts.py <path-to-file>")
        sys.exit(1)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    lessons = parse_file(path)
    print(f"Parsed {len(lessons)} lessons")

    by_domain = {}
    failed = []

    for i, lesson in enumerate(lessons, 1):
        result, domain = post_transcript(lesson)
        if result.get("success"):
            wc = result["meta"]["wordCount"]
            by_domain[domain] = by_domain.get(domain, 0) + 1
            print(f"  [{i}/{len(lessons)}] [{domain}] {lesson['title']} ({wc} words)")
        else:
            failed.append((lesson["title"], result.get("error", "unknown")))
            print(f"  [{i}/{len(lessons)}] FAILED: {lesson['title']}: {result}")

    print(f"\n=== IMPORT SUMMARY ===")
    print(f"Imported: {len(lessons) - len(failed)} / {len(lessons)}")
    for d, c in sorted(by_domain.items()):
        print(f"  {d}: {c} lessons")
    if failed:
        print(f"\nFailed: {len(failed)}")
        for title, err in failed:
            print(f"  - {title}: {err}")


if __name__ == "__main__":
    main()
