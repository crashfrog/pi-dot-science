# Triage Label Vocabulary

## The Five Canonical Labels

pi.science uses five triage labels to route issues through the development workflow.

| Label | State | Meaning | Next Step |
|-------|-------|---------|-----------|
| `needs-triage` | Unevaluated | Issue has arrived; maintainer hasn't assessed it yet | Maintainer evaluates and applies one of: `needs-info`, `ready-for-agent`, `ready-for-human`, or `wontfix` |
| `needs-info` | Blocked | Issue lacks sufficient context to proceed; waiting on reporter to provide it | Reporter responds; maintainer re-evaluates and moves to next state |
| `ready-for-agent` | Ready | Issue is fully specified and an AFK agent can implement it with no human context | Agent picks up and implements (uses `yolo` skill) |
| `ready-for-human` | Ready | Issue is fully specified but requires human judgment, design, or creative work | Human developer picks up and implements |
| `wontfix` | Terminal | Issue will not be actioned (duplicate, out of scope, design decision, etc.) | Close the issue |

## Applying Labels

**When creating an issue:**
- Don't add a label initially (leave it unlabeled)
- Or apply `needs-triage` if you want to signal it needs evaluation

**During triage:**
- Maintainer reads the issue and asks: "Can I implement this as-is, or does it need clarity?"
  - If unclear → `needs-info`
  - If clear and AFK-implementable → `ready-for-agent`
  - If clear but needs human judgment → `ready-for-human`
  - If won't be implemented → `wontfix`

**When an agent or human picks up an issue:**
- Remove the triage label (`needs-triage`, `needs-info`, etc.)
- Work proceeds; label is re-applied if needed (e.g., if reporter responds with clarity, move from `needs-info` to `ready-for-agent`)

## Label Details

### `needs-triage`

**Use this when:**
- A new issue has just been opened
- You want to flag it for review but aren't sure what state it's in yet

**Who should act:**
- Maintainer (evaluate and transition)

### `needs-info`

**Use this when:**
- The issue lacks sufficient detail to implement
- You need the reporter to clarify (e.g., "Can you provide a minimal reproduction?" or "What's the exact version you're running?")
- The issue's scope or acceptance criteria are ambiguous

**Who should act:**
- Reporter (provide information)
- Then: Maintainer (re-evaluate once info arrives)

### `ready-for-agent`

**Use this when:**
- The issue is fully specified (problem, acceptance criteria, approach are clear)
- An AFK agent can implement it with no human context
- The solution is straightforward code work (not requiring design judgment)

**Who should act:**
- AFK agent (via `yolo` skill)

**Examples:**
- "Implement the dataframe-store extension with these specific methods: [list]"
- "Add type safety to `image-renderer.ts` by filling in the TODO stubs"
- "Write unit tests for the adversarial verification loop"

### `ready-for-human`

**Use this when:**
- The issue is fully specified
- But it requires human judgment, design, creative problem-solving, or architectural decisions
- Or it involves integration with external systems (APIs, etc.) where human oversight is valuable

**Who should act:**
- Human developer

**Examples:**
- "Design the session merge UI"
- "Research terminal image protocol support and recommend best approach"
- "Evaluate performance of different Parquet serialization strategies"

### `wontfix`

**Use this when:**
- The issue is a duplicate of another issue
- The feature is out of scope
- It's a design decision (e.g., "We've decided not to support X")
- It's blocked indefinitely on external factors
- The issue describes a non-issue

**Who should act:**
- No one (close the issue after explaining why)

## Workflow Example

1. **New issue arrives** (no label)
2. **Maintainer reviews** → applies `needs-triage`
3. **Maintainer asks a question** → changes to `needs-info`
4. **Reporter responds** → maintainer re-evaluates
5. **Maintainer finds it's clear and AFK-friendly** → changes to `ready-for-agent`
6. **Agent picks it up** → removes label, starts work
7. **Agent finishes** → PR created, referenced with `Fixes #123`, merged, issue auto-closes

## For Skills

Skills that read this file:
- `triage` — applies these labels during triage workflow
- `to-issues` — assigns issues to `ready-for-agent` or `ready-for-human` based on scope
- `yolo` — picks up issues labeled `ready-for-agent`

Skills respect these labels and never create duplicates or mis-assign.
