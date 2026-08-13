# NOMAD AI Quality Harness

A reproducible way to measure whether NOMAD's RAG pipeline is getting better or
worse, and to tell a **code regression** apart from **a small model on modest
hardware being asked too much**.

This is a developer tool. There is no UI, nothing is user-facing, and none of it
runs in production.

> **Throughput is out of scope.** tokens/sec, time-to-first-token, and the NOMAD
> Score belong to `node ace benchmark:run`. Nothing here is comparable across
> machines and nothing here should ever be, because every developer and every
> user has different hardware. This measures *quality* only.

---

## The one-minute version

```bash
node ace eval:corpus --ingest                       # once, and after any corpus edit
node ace eval:retrieval --ablate                    # seconds, no chat model, deterministic
node ace eval:generation --model=<model> --all-modes  # minutes; answers "code or model?"
```

---

## Why the three modes matter

`eval:generation --all-modes` runs every question three ways. That is what turns
"the AI gave a bad answer" into something you can act on:

| Mode | Context the model gets | What a low score means |
|---|---|---|
| `oracle` | The golden's own documents, injected verbatim | **The model.** Retrieval was perfect by construction, so this is the model's ceiling with this prompt. |
| `e2e` | Whatever real retrieval found | The actual product experience. |
| `noretrieval` | Nothing | The model's parametric baseline — what it knows without NOMAD. |

Read the decomposition it prints:

- **`oracle` is low** → the model cannot use good context. No amount of retrieval
  work will fix it. The honest answer to the user is "run a larger model."
- **`oracle - e2e` is large** → the model *can* use good context but is not being
  given it. This is a retrieval bug, and it is ours.
- **`e2e - noretrieval` is near zero** → RAG is not contributing. Check that
  retrieval is actually reaching the prompt.

There is a fourth reference line, `--model=mock`, which needs no Ollama at all.
It answers by echoing the injected context, so it is the **extractive ceiling**:
the best a perfect model could do given the current retrieval. A real model
below the mock line is the bottleneck; a mock line that is itself low means
retrieval is.

---

## Commands

### `eval:corpus`

```bash
node ace eval:corpus --check     # validate corpus + goldens, no services needed
node ace eval:corpus --status    # fingerprint and current chunk count
node ace eval:corpus --ingest    # wipe and rebuild (always a full rebuild)
node ace eval:corpus --reset     # remove every eval chunk
```

Ingest goes through NOMAD's **real** `RagService.embedAndStoreText`, so chunk
size, the token-estimate ratio, the `search_document:` prefix, and the embedding
model are all inside the measurement. Change any of them and the score moves —
which is the point.

### Isolation: how the eval corpus stays out of your knowledge base

**The eval corpus is not a separate Qdrant collection.** It lives in the same
`nomad_knowledge_base` collection as your real documents, tagged with the
reserved payload value `collection: __nomad_eval__`. That is not a shortcut —
NOMAD "collections" *are* payload tags rather than separate Qdrant collections,
so using the tag means the harness exercises the same filter path production
chat uses, with no production code changed to accommodate it.

Three separate mechanisms keep the two apart:

**1. Writes are scoped.** Ingest only ever adds points carrying the eval tag.
`--reset` deletes by that filter and nothing else. Your documents are never
written, re-tagged, or deleted. (On the machine this was built on: 306 points
before ingest, 335 after — exactly the 29 eval chunks, nothing else moved.)

**2. Reads are filtered server-side.** Every eval query passes
`must: [{ key: 'collection', match: { value: '__nomad_eval__' } }]`, and Qdrant
applies it during search against a keyword payload index, so your documents
never compete for a result slot. Verified directly against a knowledge base
containing unrelated content — the same query returns a real user document at
similarity **0.83** unfiltered, and only eval documents at ~0.50 filtered:

```
unfiltered:  0.831  evolution_of_steam_locomotive.txt
filtered:    0.522  water-river-song.md  [eval]
```

**3. A leak would fail the run, loudly.** Every retrieved chunk's `source` is
resolved back to a corpus document by path. Anything outside
`tests/eval/corpus/` is counted as an unresolved chunk, and a non-zero count
prints an error and exits 1 rather than quietly reporting a score. The check is
on the resolved path, not the file extension — NOMAD embeds its own
`admin/docs/*.md` into the knowledge base on first run, so an extension check
would have accepted a leaked `faq.md` as the plausible document id "faq".
See `tests/unit/eval_source_guard.spec.ts`.

**The one thing the tag does not isolate** is the *physical* collection: your
documents and the eval fixtures share an HNSW index. That has no effect on
correctness (the filter is applied during search) and results were verified
byte-identical across runs, but if you want true physical separation the change
is to thread a collection name through `_ensureCollection`,
`embedAndStoreText`, and `searchSimilarDocuments`. That was deliberately not
done, because it means touching three production methods for a test-only
benefit that the payload filter already delivers.

### `eval:retrieval`

```bash
node ace eval:retrieval
node ace eval:retrieval --ablate         # is the reranker earning its complexity?
node ace eval:retrieval --threshold=0.5  # sweep the cutoff
node ace eval:retrieval --tag=multi-hop
node ace eval:retrieval --verbose        # show every miss and what it retrieved
node ace eval:retrieval --report         # write JSON + Markdown to reports/
```

Embedding is the only model call, and its output is stable, so **this tier is
deterministic and hardware-independent**. Two runs produce byte-identical
numbers. A movement here is a code change, full stop — which makes it the only
tier worth gating CI on.

Multi-turn goldens are scored on their raw final message, because resolving the
coreference needs the chat model and would make the tier non-deterministic. That
bucket therefore reports the honest floor; the rewrite's contribution shows up in
the generation tier instead.

### `eval:generation`

```bash
node ace eval:generation --model=mock                       # no Ollama required
node ace eval:generation --model=llama3.2:latest --all-modes
node ace eval:generation --model=llama3:8b --repeats=5 --verbose
node ace eval:generation --model=... --tag=out-of-corpus
```

Runs at `temperature: 0` with a fixed seed. That reduces variance but does not
eliminate it — llama.cpp batching and GPU scheduling still move outputs — so
`--repeats` defaults to 3 and any question whose pass/fail flips across repeats
is reported as **unstable** and excluded from gating. Do not read an unstable
question as a regression.

Before scoring, the harness evicts other resident models and burns one throwaway
generation, borrowed from `BenchmarkService` for the same reason it added them:
a cold first run behaves differently.

### `eval:matrix`

```bash
node ace eval:matrix --models=qwen2.5:0.5b,llama3.2:latest,llama3:8b --limit=25
node ace eval:matrix --models=... --promote
```

Produces the **capability table** — the artifact that answers a support ticket.
When a user reports a bad answer, look up their model:

- scoring at or near its row → the model is at its ceiling, not a bug
- scoring well below its row → their config or our code, worth investigating

### `eval:compare`

```bash
node ace eval:retrieval --report
node ace eval:compare <report.json> --promote=retrieval     # set the baseline
node ace eval:compare tests/eval/baselines/<fp>/retrieval.json <new-report.json>
```

Exits non-zero when any metric regresses beyond the tolerance (default `0.02`).
It boots no services, so CI can run it against a committed baseline without
standing up MySQL, Redis, Qdrant, or Ollama.

**It refuses to compare reports with different corpus fingerprints.** That is
correct behaviour, not a limitation: if the corpus, chunk size, or embedding
model changed, the two runs measured different things and diffing them would
manufacture a regression. Re-baseline instead.

---

## The corpus and the goldens

- `corpus/*.md` — 28 short documents across NOMAD's real domains.
- `goldens/*.jsonl` — 99 questions, one JSON object per line.

The corpus is built with deliberate traps, not just easy questions:

| Tag | What it tests |
|---|---|
| `distractor` | `water-river-song.md` is a poem that shares vocabulary with real water questions and answers none of them. This is exactly the "poetic, tangential passage" failure `SYSTEM_PROMPTS.rag_context` rule 1 defends against. |
| `near-miss` | Water-bath vs pressure canning: two documents that look alike and give opposite advice. |
| `out-of-corpus` | Questions the corpus genuinely cannot answer, including adversarial ones about topics the corpus *partly* covers (the TR-88's warranty). The right answer is to decline. |
| `fictional` | The Thornfield protocol and the TR-88 pump do not exist. No model can know them, so a correct answer proves retrieval worked rather than that the model memorised the internet. |
| `acronym` / `acronym-control` | The same question asked with an acronym and spelled out, to measure what `preprocessQuery`'s 28-entry glossary expansion actually buys. |
| `chunk-boundary` | Facts buried late in the one long document, which is the only one that splits into multiple chunks. |
| `multi-hop` | Answers requiring two documents (elevation table + boiling times). |
| `multi-turn` | A pronoun in the second turn, the only thing that exercises `rewriteQueryWithContext`. |

### Golden format

```jsonc
{
  "id": "water-boil-altitude-01",
  "query": "How long do I need to boil water at high altitude?",
  "turns": [],                                  // prior messages for multi-turn cases
  "relevantDocIds": ["water-boiling"],          // corpus filenames without .md
  "mustInclude": ["\\b(3|three) minutes?"],     // case-insensitive REGEX
  "mustNotInclude": ["distill"],
  "expectRefusal": false,                       // true for out-of-corpus
  "tags": ["single-hop", "numeric"]
}
```

`mustInclude` and `mustNotInclude` entries are **regular expressions**, so one
entry can accept "3 minutes" or "three minutes" without inflating the list.
Every pattern is compiled at load, so a bad regex fails immediately rather than
on the one run where it finally matters.

Validation is strict on purpose. A golden that lists a document not in the
corpus, or that expects a refusal while also naming relevant documents, is
rejected at load — those mistakes are otherwise invisible and just quietly lower
the score forever.

### Editing the corpus

Any edit changes the fingerprint, which invalidates every existing baseline.
That is deliberate. After editing:

```bash
node ace eval:corpus --check     # validate first
node ace eval:corpus --ingest    # rebuild
node ace eval:retrieval --report
node ace eval:compare <report.json> --promote=retrieval
```

Note the safety facts in the corpus are real. If you add documents, keep any
health, water, or food-safety content accurate — invent only clearly-fictional
non-safety things (place names, equipment model numbers) when you need something
unguessable.

---

## What the metrics mean

**Retrieval** — measured at two levels, because they answer different questions.
Document level (recall, hit rate, MRR, nDCG) collapses chunks to their source
document: *did the answer's document reach the context?* Chunk level (precision)
does not dedupe: *how much of what we injected is noise?* — five chunks from one
irrelevant document cost a small model five slots.

`nDCG` normalizes against the *known* number of relevant documents, not against
whatever was retrieved. It is the metric that catches "right documents, wrong
order", a reranking regression that leaves recall untouched while pushing the
answer to position five where a 1B model's 2-result budget will never see it.
The implementation is cross-checked against `pytrec_eval` (TREC's reference
implementation) — see `tests/unit/eval_retrieval_metrics.spec.ts`.

**Generation** — all deterministic, no judge model required:

| Metric | What it catches |
|---|---|
| `correctness` | The `mustInclude` / `mustNotInclude` assertions. |
| `refusalCorrectness` | Declining out-of-corpus questions *and* not hedging on answerable ones. This is the "Sorry, I wasn't able to find specific context" symptom, measured. |
| `leakageRate` | Narrating retrieval ("according to Context 1", "the knowledge base"), which `rag_context` rule 4 forbids. Pure regex, zero ambiguity, catches a bad prompt edit on the first run. |
| `groundedness` | Fraction of the answer's numeric claims that appear in the injected context. |
| `thinkTagLeakRate` | Reasoning tags reaching the user. Should always be 0. |

**Groundedness only sees numbers, and only numbers above 10.** An answer that
fabricates a procedure or a proper noun scores a perfect 1.0. It is a
fabrication *detector*, not a faithfulness guarantee. Numbers are the right
first target for this domain — a wrong bleach dose or canner pressure is a wrong
answer with consequences — but do not read a high score as "the answer is
faithful". Small integers are excluded because "3 layers" and "step 2" appear in
any prose and would swamp the signal.

---

## Known limitations

Read these before trusting a number.

1. **The corpus is small, so retrieval recall has little headroom.** 28
   documents produce 29 chunks; retrieving the top 5 means retrieving 17% of the
   entire corpus on every query. Real NOMAD knowledge bases hold millions of
   chunks. `recall@5` therefore sits near 0.99 and cannot detect a modest
   retrieval regression. The metrics that *do* have headroom on this corpus are
   `recall@1`, `precision@k`, `nonEmptyRateOnRefusal`, and the score
   distributions. To make recall discriminating, add substantially more
   distractor documents, or ingest `install/wikipedia_en_100_mini_*.zim` under
   the eval tag as a harder tier.

2. **`oracle` is not guaranteed to beat `e2e`.** Oracle injects the golden's
   whole documents; e2e injects up to `maxResults` retrieved chunks, which can
   include a genuinely helpful extra document. Treat small inversions as noise
   unless they survive `--repeats=5`.

3. **Temperature 0 is not determinism.** The generation tier still moves between
   runs. Always report `--repeats` ≥ 3 before concluding anything, and ignore
   questions the harness flags as unstable.

4. **No LLM judge yet.** Faithfulness beyond numeric grounding, completeness,
   and answer relevance are not measured. `autoevals` (MIT, TypeScript, talks to
   Ollama through the same `/v1` endpoint `OllamaService` already uses) is the
   intended addition, reported in a separate section and never mixed into the
   deterministic scores — a weak local judge grading a weak local model is not
   something to gate on.

---

## Layout

```
tests/eval/
  corpus/         28 markdown fixtures — the frozen knowledge base
  goldens/        99 questions as JSONL
  baselines/      <corpus-fingerprint>/*.json — COMMITTED; the gate compares against these
  reports/        run artifacts — gitignored
```

Baselines are filed under their corpus fingerprint so it is structurally
impossible to overwrite one corpus's baseline with a run against another.

Implementation:

- `app/utils/eval/*` — pure functions (metrics, golden parsing, report diffing).
  No I/O, no models, no services. 153 tests, run with:

  ```bash
  npm run test:eval    # this harness only — should always be green
  npm run test:unit    # every tests/unit spec
  ```

  `test:unit` currently reports **6 pre-existing failures** unrelated to this
  harness: `drug_interactions`, `drug_ingest_status`, and `drug_labels` are
  written against `@japa/runner` rather than `node:test`, and
  `app_auto_update`, `content_auto_update`, and `content_auto_update_backoff`
  import services that need a booted application. Both groups belong in the Japa
  suite (`node ace test`, which needs MySQL and Redis). They fail identically
  before and after any change here — use `test:eval` when you want a signal you
  can trust.
- `app/services/eval_*_service.ts` — orchestration; these need Qdrant and Ollama.
- `commands/eval/*` — the CLI.
- `app/services/rag_pipeline_service.ts` — the prompt pipeline, shared with the
  chat endpoint. The harness measures production code, not a copy of it.
