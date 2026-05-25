# Issue Tracker Configuration

## Overview

pi.science tracks issues in **GitHub Issues**.

Skills that consume this configuration:
- `to-issues` — breaks plans into issues
- `triage` — evaluates and routes issues
- `to-prd` — creates PRDs from context
- `qa` — validates issues before hand-off

## GitHub Issues

**Location:** https://github.com/crashfrog/pi-dot-science/issues

**How skills interact:**
- Read issues: `gh issue list`, `gh issue view`
- Create issues: `gh issue create --title "..." --body "..." --label "..."`
- Update labels: `gh issue edit <number> --add-label "..."`

**Requirements:**
- GitHub CLI (`gh`) must be installed and authenticated
- Issues are created with:
  - **Title** — one-line summary
  - **Body** — full context (problem, acceptance criteria, etc.)
  - **Labels** — from the triage vocabulary (see `docs/agents/triage-labels.md`)

## Label Workflow

When a new issue arrives:
1. Maintainer (or triage skill) applies `needs-triage`
2. Triage process evaluates the issue
3. Issue progresses through states: `needs-info` → `ready-for-agent` → `ready-for-human` or `wontfix`

See `docs/agents/triage-labels.md` for the full label vocabulary.

## Linking Issues in Code

When referencing an issue in a commit or PR, use the standard GitHub syntax:

```
Fixes #123
Relates to #456
```

This auto-links the issue and (for `Fixes`/`Closes`) closes it when merged.
