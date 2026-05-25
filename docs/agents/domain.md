# Domain Documentation Consumer Rules

## Overview

Skills like `improve-codebase-architecture`, `tdd`, and `diagnose` read domain documentation to understand pi.science's language, constraints, and past decisions. This file describes what they expect to find and how to maintain it.

## Layout: Single-Context

pi.science uses a **single-context** layout:

```
pi-dot-science/
  CONTEXT.md                # Domain language and constraints (see below)
  docs/adr/                 # Architectural decision records
    0001-dataframe-store.md
    0002-provenance-model.md
    0003-verification-loop.md
    ...
  src/                      # Source code
  ...
```

**Why single-context:** pi.science is a unified project, not a monorepo. One domain model, one ADR log.

## CONTEXT.md

**Purpose:** Capture the domain language, key concepts, constraints, and mental models that skills need to understand the project.

**Location:** `/CONTEXT.md` (repo root)

**What goes in it:**
- **Problem statement** — What problem is pi.science solving?
- **Core concepts** — Dataframe store, provenance, verification loop, session, project, etc.
- **Constraints** — Hard rules that shape decisions (e.g., "all inference must be code-backed", "dataframes are immutable after commit")
- **Non-goals** — What pi.science deliberately does NOT do
- **Terminology** — Domain-specific terms and their definitions

**Skill consumption:**
- `improve-codebase-architecture` reads CONTEXT to understand the domain and find refactoring opportunities
- `tdd` reads CONTEXT to understand what "correct" means for a test
- `diagnose` reads CONTEXT to understand what might be wrong

**Maintenance:**
- Update CONTEXT.md when you discover new constraints, terminology, or non-goals
- Keep it concise (2–4 pages); link to ADRs for detailed decisions

**Example sections:**

```markdown
# pi.science Domain Model

## Problem

Users assume AI in data science is a falsehood machine. pi.science builds trust by making every inference auditable, reproducible, and explicitly grounded in data.

## Core Concepts

### Dataframe Store
A versioned registry of named dataframes with complete lineage (source, code, timestamps, snapshots). Enables reproducible analysis and prevents silent data corruption.

### Provenance
The complete history of how a dataframe came to be: where it originated, what code transformed it, when, and by whom. Every transformation is recorded and executable.

### Verification Loop
Before claiming a causal or predictive result, a skeptical subagent tries to disprove it (2–3 turns). The claim only stands if it survives scrutiny.

### Session & Project
- **Project**: A directory containing a pi.science analysis. Equivalent to a git repo.
- **Session**: One interactive analysis session within a project. Sessions have isolated dataframe namespaces and can be merged back to main on exit.

## Constraints

- All inference must be code-backed (no speculative claims)
- Causal claims require causal evidence (experiments, instrumental variables, etc.)
- Data provenance must be persistent and auditable
- No silent data mutations; all changes are explicit and versioned

## Non-Goals

- Real-time collaboration (sessions are single-user)
- Cloud storage (projects are local directories)
- Automated predictions (users make analytical choices)
- GUI-first (terminal-native)
```

## docs/adr/

**Purpose:** Record major architectural decisions and the reasoning behind them. ADRs are immutable once written; they explain WHY we chose a path, not just WHAT we chose.

**Location:** `/docs/adr/` (directory at repo root)

**Naming:** `NNNN-decision-name.md` (e.g., `0001-dataframe-store-parquet.md`)

**Format:** 
- Status (Proposed, Accepted, Deprecated, Superseded)
- Context (the situation we faced)
- Decision (what we chose and why)
- Consequences (trade-offs and implications)
- Alternatives considered (and why we rejected them)

**Skill consumption:**
- `improve-codebase-architecture` reads ADRs to understand past decisions and avoid reworking settled questions
- `tdd` reads ADRs to understand the architectural constraints in a feature area

**Maintenance:**
- Write one ADR per significant architectural decision
- Keep ADRs immutable (if a decision changes, write a new ADR that supersedes the old one)
- Link ADRs from CONTEXT.md where relevant
- Link ADRs from code comments when they explain WHY something is the way it is

**Example ADR:**

```markdown
# ADR 0001: Use Parquet for Dataframe Persistence

**Status:** Accepted

**Context:**
We need to persist dataframes across sessions with complete provenance. Requirements:
- Efficient I/O (exploratory analysis is latency-sensitive)
- Git-trackable (users want version control)
- Auditable (users need to see what changed between versions)
- Reproducible (data snapshots must be restorable)

**Decision:**
Use Apache Parquet as the primary format for dataframe storage, with JSON metadata summaries for diffs and git tracking.

**Consequences:**
- Fast I/O and efficient storage
- Git diffs on metadata are readable; Parquet binary diffs are not
- Requires Parquet library in Python environment
- Snapshots can get large for big datasets (but that's a feature—allows auditing)

**Alternatives Considered:**
- CSV: Too slow for large datasets, no schema, imprecise (loses types)
- SQLite: Adds a database dependency, harder to understand provenance from a `.db` file
- Binary pickle: Fast but not portable, not standard in data science
```

## For Skills: How to Use These Files

### `improve-codebase-architecture`

Reads: CONTEXT.md (to understand domain), docs/adr/ (to see settled questions)

Uses to:
- Identify refactoring opportunities that align with domain constraints
- Avoid suggesting changes that contradict past decisions
- Propose new ADRs for architecture changes

### `tdd`

Reads: CONTEXT.md (to understand what correct means), docs/adr/ (to understand constraints)

Uses to:
- Write tests that verify domain correctness, not just code behavior
- Avoid writing tests for settled architectural decisions
- Link tests to relevant ADRs

### `diagnose`

Reads: CONTEXT.md (to understand what's broken), docs/adr/ (to trace root causes)

Uses to:
- Understand what "expected behavior" means
- Trace bugs back to architectural assumptions
- Suggest fixes that respect past decisions

## Maintaining This File

This file doesn't change often. When to update it:

- Adding a new section to CONTEXT.md or ADRs → update the "Maintenance" section above
- Changing the directory layout → update the "Layout" section
- Adding new skills that consume domain docs → update the "For Skills" section

If you move CONTEXT.md or docs/adr/, you MUST update this file and all references in other documentation.
