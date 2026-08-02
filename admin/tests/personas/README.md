# Persona Eval Harness

End-to-end evaluation of NOMAD's chat personas. Drives the running app's
`/api/chat` endpoint with curated questions, captures responses, and runs
automated rule-violation and persona-signal checks.

This is a Python tool intentionally separate from the AdonisJS test runner
(`node ace test`). It's an external HTTP client that exercises the running
dev server, so personas can be evaluated as users actually experience them
(system prompt + RAG + Ollama).

## Quick start

```bash
# From admin/ with the dev server running on :39001
python tests/personas/runner.py --model qwen2.5:14b --label baseline

# Limit to specific personas or question tags
python tests/personas/runner.py --model qwen2.5:14b \
  --personas medic,electrician \
  --label medic-electrician-only
```

Results land in `tests/personas/artifacts/runs/{timestamp}-{label}/`.

## Layout

- `questions.json` — tagged question bank, grouped by intended persona
- `checks.py` — automated check functions (rule violations, persona signals)
- `runner.py` — CLI; iterates questions × personas, calls the chat API
- `artifacts/` — per-run outputs (responses, results, report)

## What it does NOT do

Automated quality grading. Survival/medical correctness needs human review.
The checks flag *prompt-rule violations* (URLs, "consult a professional",
hallucinated citations, hedge closers) and *persona signal presence* (does a
medic-trauma response mention MARCH, does an electrician response cite NEC).
Those are necessary-but-not-sufficient signals.

## Adding questions

Edit `questions.json`. Each entry:

```json
{
  "id": "med-bleed-arm",
  "persona": "medic",
  "tags": ["trauma", "hemorrhage"],
  "prompt": "my arm is bleeding badly, what do I do",
  "expect_signals": ["march", "direct_pressure", "tourniquet"],
  "forbid_signals": ["tccc_fake_product"]
}
```
