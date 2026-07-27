"""Runner for the persona eval harness.

Loops over questions x personas, hits the running dev server's chat API,
captures responses, runs checks from checks.py, and writes per-run
artifacts to tests/personas/artifacts/runs/{timestamp}-{label}/.

Usage:
    python tests/personas/runner.py --model qwen2.5:14b --label baseline
    python tests/personas/runner.py --model qwen2.5:14b \\
        --personas medic,electrician \\
        --label medic-electrician-only
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import requests

from checks import CheckResult, run_all_checks

DEFAULT_BASE_URL = "http://127.0.0.1:39001"
DEFAULT_TIMEOUT = 180  # seconds per chat call

ROOT = Path(__file__).resolve().parent
QUESTIONS_PATH = ROOT / "questions.json"
ARTIFACTS_DIR = ROOT / "artifacts" / "runs"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run NOMAD persona eval")
    p.add_argument("--model", required=True, help="Ollama model name (e.g. qwen2.5:14b)")
    p.add_argument("--label", default="run", help="Short label for this run (becomes part of the dir name)")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL)
    p.add_argument("--personas", default=None, help="Comma-separated persona keys to include (default: all)")
    p.add_argument("--tags", default=None, help="Comma-separated tags to include (default: all)")
    p.add_argument("--limit", type=int, default=None, help="Cap number of questions (for smoke testing)")
    p.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    return p.parse_args()


def filter_questions(questions: list[dict], args: argparse.Namespace) -> list[dict]:
    filtered = questions
    if args.personas:
        wanted = {p.strip() for p in args.personas.split(",")}
        filtered = [q for q in filtered if q["persona"] in wanted]
    if args.tags:
        wanted = {t.strip() for t in args.tags.split(",")}
        filtered = [q for q in filtered if set(q.get("tags", [])) & wanted]
    if args.limit:
        filtered = filtered[: args.limit]
    return filtered


def create_session(base_url: str, model: str, persona: str, title: str) -> int:
    r = requests.post(
        f"{base_url}/api/chat/sessions",
        json={"title": title, "model": model, "persona": persona},
        timeout=15,
    )
    r.raise_for_status()
    return int(r.json()["id"])


def delete_session(base_url: str, session_id: int) -> None:
    try:
        requests.delete(f"{base_url}/api/chat/sessions/{session_id}", timeout=15)
    except requests.RequestException:
        pass  # cleanup best-effort


def chat_once(base_url: str, model: str, session_id: int, prompt: str, timeout: int) -> dict:
    r = requests.post(
        f"{base_url}/api/ollama/chat",
        json={
            "model": model,
            "sessionId": session_id,
            "stream": False,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()


def run_one(args: argparse.Namespace, question: dict, run_dir: Path) -> dict:
    persona = question["persona"]
    qid = question["id"]
    title = f"eval-{qid}"

    started = time.time()
    sid = create_session(args.base_url, args.model, persona, title)
    try:
        resp = chat_once(args.base_url, args.model, sid, question["prompt"], args.timeout)
        content = (resp.get("message") or {}).get("content", "") or ""
    finally:
        delete_session(args.base_url, sid)
    elapsed = time.time() - started

    checks = run_all_checks(content, question)

    out = {
        "id": qid,
        "persona": persona,
        "tags": question.get("tags", []),
        "prompt": question["prompt"],
        "model": args.model,
        "session_id": sid,
        "elapsed_seconds": round(elapsed, 1),
        "response": content,
        "checks": [dataclasses.asdict(c) for c in checks],
    }

    (run_dir / "responses").mkdir(parents=True, exist_ok=True)
    (run_dir / "responses" / f"{qid}.json").write_text(json.dumps(out, indent=2))

    return out


def summarize(results: list[dict]) -> dict:
    """Per-check pass/fail counts overall and per-persona."""
    overall: Counter = Counter()
    by_persona: dict[str, Counter] = defaultdict(Counter)
    per_check_pass: Counter = Counter()
    per_check_total: Counter = Counter()
    per_check_by_persona_pass: dict[tuple[str, str], int] = defaultdict(int)
    per_check_by_persona_total: dict[tuple[str, str], int] = defaultdict(int)

    for r in results:
        persona = r["persona"]
        overall["questions"] += 1
        by_persona[persona]["questions"] += 1
        for c in r["checks"]:
            per_check_total[c["check"]] += 1
            per_check_by_persona_total[(persona, c["check"])] += 1
            if c["passed"]:
                per_check_pass[c["check"]] += 1
                per_check_by_persona_pass[(persona, c["check"])] += 1
                overall["passed"] += 1
            else:
                overall["failed"] += 1

    return {
        "totals": {
            "questions": overall["questions"],
            "checks_passed": overall["passed"],
            "checks_failed": overall["failed"],
        },
        "by_persona": {
            persona: {"questions": counts["questions"]}
            for persona, counts in by_persona.items()
        },
        "per_check": {
            check: {
                "passed": per_check_pass[check],
                "total": per_check_total[check],
                "pass_rate": round(per_check_pass[check] / per_check_total[check], 3) if per_check_total[check] else 0.0,
            }
            for check in sorted(per_check_total)
        },
        "per_check_by_persona": {
            f"{persona}/{check}": {
                "passed": per_check_by_persona_pass[(persona, check)],
                "total": per_check_by_persona_total[(persona, check)],
            }
            for (persona, check) in sorted(per_check_by_persona_total)
        },
    }


def write_report(results: list[dict], summary: dict, run_dir: Path, args: argparse.Namespace) -> None:
    lines: list[str] = []
    lines.append(f"# Persona Eval Report — {run_dir.name}")
    lines.append("")
    lines.append(f"- Model: `{args.model}`")
    lines.append(f"- Questions: {summary['totals']['questions']}")
    lines.append(f"- Checks passed: {summary['totals']['checks_passed']}")
    lines.append(f"- Checks failed: {summary['totals']['checks_failed']}")
    lines.append("")

    lines.append("## Per-check pass rate (overall)")
    lines.append("")
    lines.append("| Check | Passed | Total | Rate |")
    lines.append("|---|---|---|---|")
    for check, stats in summary["per_check"].items():
        lines.append(f"| `{check}` | {stats['passed']} | {stats['total']} | {stats['pass_rate']:.0%} |")
    lines.append("")

    # Failures by question — most useful for prompt iteration
    lines.append("## Failures by question")
    lines.append("")
    for r in results:
        failed = [c for c in r["checks"] if not c["passed"]]
        if not failed:
            continue
        lines.append(f"### `{r['id']}` ({r['persona']}) — {len(failed)} failed")
        lines.append(f"_Prompt:_ {r['prompt']}")
        lines.append("")
        for c in failed:
            ev = c.get("evidence")
            ev_str = f" — evidence: `{ev}`" if ev else ""
            lines.append(f"- ❌ `{c['check']}`{ev_str}")
        lines.append("")

    (run_dir / "report.md").write_text("\n".join(lines))


def main() -> int:
    args = parse_args()

    if not QUESTIONS_PATH.exists():
        print(f"ERROR: {QUESTIONS_PATH} not found", file=sys.stderr)
        return 1

    questions = json.loads(QUESTIONS_PATH.read_text())
    questions = filter_questions(questions, args)
    if not questions:
        print("No questions matched filters", file=sys.stderr)
        return 1

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = ARTIFACTS_DIR / f"{timestamp}-{args.label}"
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"Running {len(questions)} questions on {args.model}")
    print(f"Artifacts: {run_dir}")
    print()

    results: list[dict] = []
    for i, q in enumerate(questions, 1):
        print(f"[{i}/{len(questions)}] {q['persona']:>12} | {q['id']} ...", flush=True, end=" ")
        try:
            r = run_one(args, q, run_dir)
            failed = sum(1 for c in r["checks"] if not c["passed"])
            total = len(r["checks"])
            print(f"{r['elapsed_seconds']:.0f}s ({total - failed}/{total} checks)")
            results.append(r)
        except Exception as exc:
            print(f"ERROR: {exc}")

    summary = summarize(results)
    (run_dir / "results.json").write_text(json.dumps(
        {"model": args.model, "label": args.label, "summary": summary, "results": results},
        indent=2,
    ))
    write_report(results, summary, run_dir, args)

    print()
    print(f"Done. Summary in {run_dir / 'report.md'}")
    print(f"  Checks passed: {summary['totals']['checks_passed']}")
    print(f"  Checks failed: {summary['totals']['checks_failed']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
