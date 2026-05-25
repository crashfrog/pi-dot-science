# pi.science Development Guide

## Project Vision

pi.science is a terminal-based data science agent that acts as a statistician's research assistant. The core philosophy: **users are skeptical of AI in data science**, so every inference must be auditable, reproducible, and explicitly grounded in data.

The project is a fork of the [Pi coding agent](https://github.com/earendil-works/pi), adapted for exploratory data analysis with hard guardrails against unfounded inference.

## Core Principles

### 1. Auditability Over Convenience

- Every dataframe transformation must be code (not black-box operations)
- Complete provenance is recorded: source, timestamp, transformations, code
- Sessions branch/merge explicitly; no silent overwrites
- The dataframe store is git-trackable for version control

### 2. Verification Before Reporting

- Main agent makes a claim with supporting code
- Adversarial subagent (2-3 turns) tries to disprove it
- Only if the claim survives scrutiny is it reported to the user
- Applies to causal/predictive claims; descriptive stats are self-evident

### 3. Data as a Challenge, Not a Blocker

- If the question can't be answered from current data, the agent acquires it
- Data fetching is code-based and auditable
- Provenance includes source quality assessment
- User explicitly approves new data before it enters the project

### 4. Terminal-Native, Not GUI-First

- Plots render inline using Kitty/iTerm2 (macOS) or Sixel (Linux/WSL)
- All output is logged to session history
- Projects live in directories (like git repos), not in cloud UIs

## Architecture Decisions

### Dataframe Store

**What it does:**
- Maintains a registry of named dataframes with complete lineage
- Each dataframe entry includes: source, timestamp, transformations, code, snapshots
- Supports versioning (`df_users@session-A` vs. `df_users@session-B`)
- Persists to disk as Parquet (efficient, auditable via git)

**Why Parquet:**
- Industry standard for data science
- Fast I/O
- Efficient storage
- Diffs are human-readable when stored with metadata summaries

**Concurrency model:**
- Multiple sessions can run in the same project concurrently
- Each session has isolated dataframe namespaces
- On session exit, explicit merge-back to "main" (or discard)
- No automatic merging; conflicts require user decision

### Adversarial Verification

**What it does:**
- After main agent claims "The data shows X", a skeptical subagent is spawned
- Subagent has 2–3 turns to find: confounds, methodological flaws, contradictions, Simpson's paradox, etc.
- If subagent succeeds, main agent revises
- If it fails, claim stands

**Applies to:**
- Causal claims ("X causes Y")
- Predictive claims ("this trend will continue")

**Does NOT apply to:**
- Descriptive statistics ("the mean is X")
- Data summaries

**Why:**
- Catches overconfident pattern-matching
- Makes the guardrail explicit and testable
- Trades latency for safety (acceptable for exploratory analysis)

### Project Structure (Directory-Based)

```
my-project/
  .pi-science/                      # Project state directory
    dataframe-store/                # Persisted dataframes (git-tracked)
      df_users@main.parquet
      df_events@main.parquet
      metadata.json                 # Provenance records
    sessions/                       # Session history
      session-2026-05-25-abc.jsonl
      session-2026-05-25-def.jsonl
  data/                             # User data (optional)
  README.md                         # Project notes
  .gitignore                        # Ignore .pi-science/sessions/*
```

**Why directories:**
- Mirrors git mental model (one project per repo)
- Allows concurrent sessions in the same project
- Enables version control of canonical data
- Integrates naturally with existing workflows

### System Prompt Strategy

The system prompt encodes hard guardrails:
- **Only state conclusions backed by code**: "I claim X because this code shows Y"
- **Explicit uncertainty**: "We'd need Z to answer this causally, but we can describe the data"
- **Data sourcing**: "If we don't have data for this, here's how to acquire it"
- **Adversarial loop**: "Before reporting, I'll verify this claim doesn't have hidden confounds"

The prompt is the primary enforcement mechanism (plus verification loops as safety net).

## Implementation Roadmap

### Phase 1: Foundation (Current)
- ✅ Project structure
- ✅ Architecture decisions
- → System prompt (hard guardrails)
- → Dataframe store skeleton

### Phase 2: Data Persistence
- Dataframe store implementation (Parquet + metadata)
- Git integration (track changes)
- Session branching/merging UI

### Phase 3: Verification
- Adversarial subagent loop
- Claim validation before reporting
- Conflict detection and user prompts

### Phase 4: Data Acquisition
- Internet data fetching (APIs, CSVs, etc.)
- Quality assessment and flagging
- Source caching and reproducibility

### Phase 5: Terminal Rendering
- Image protocol detection (Kitty, iTerm2, Sixel)
- Inline plot rendering
- Dataframe preview formatting

## Key Files & Their Purpose

| File | Purpose |
|------|---------|
| `src/prompts/system.md` | Hard guardrails on inference; the primary enforcement mechanism |
| `src/extensions/dataframe-store.ts` | Provenance DAG, versioning, Parquet I/O |
| `src/extensions/image-renderer.ts` | Terminal protocol detection and rendering |
| `index.ts` | Entrypoint; wires pi-coding-agent with extensions |

## Testing & Verification

**System prompt testing:**
- Adversarial testing: Can the agent be tricked into claiming unsupported things?
- Edge cases: Confounds, Simpson's paradox, small samples, p-hacking

**Dataframe store testing:**
- Reproducibility: Can you replay a session's data workflow and get the same result?
- Concurrency: Do two sessions modify the store safely?
- Git integration: Are changes properly tracked?

**Adversarial agent testing:**
- Does it actually find problems in weak claims?
- Does it avoid false positives (rejecting valid claims)?
- Does it terminate in a reasonable time budget?

## Collaboration Notes

This project is designed to be **slow but defensible**. Trade-offs:
- Latency: Every claim gets verified (2-3 turns per conclusion)
- Verbosity: All code is shown; all sources are flagged
- Explicitness: User decides on data sourcing; no black-box decisions

These are *features*, not bugs—they build trust in AI-assisted data science.

## References

- [Pi Coding Agent](https://github.com/earendil-works/pi)
- [Apache Parquet](https://parquet.apache.org/)
- Terminal image protocols: [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/), [iTerm2 Inline Images](https://iterm2.com/documentation-images.html), Sixel
