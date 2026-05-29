# pi.science Domain Model

## Problem

Users assume AI in data science is a falsehood machine. pi.science builds trust by making every inference auditable, reproducible, and explicitly grounded in data.

## Core Concepts

### Claim
A statement made by the main agent about the data. Claims have three subtypes:

- **Descriptive claim** — states a fact directly computable from the data (mean, count, correlation). Self-evident from code; no verification required.
- **Causal claim** — asserts that one variable causes another. Requires adversarial verification before reporting.
- **Predictive claim** — asserts a future state or trend. Requires adversarial verification before reporting.

The main agent marks causal and predictive claims with a structured tag: `<claim type="causal|predictive">...</claim>`. The verification tool fires when this tag is present.

### Claim Marker
The structured XML-like tag the main agent wraps causal/predictive claims in before calling `verify_claim`. Format: `<claim type="causal|predictive">claim text</claim>`. Stripped from final output before the user sees it.

### Verification Loop
The full workflow for a causal or predictive claim: main agent produces claim + code → calls `verify_claim` tool → adversarial subagent attempts disproof → verdict returned → main agent revises or reports. Only applies to causal and predictive claims.

### Adversarial Subagent
A separate `AgentSession` spawned by the `verify_claim` tool with an adversarial system prompt. Has 3 autonomous turns to find confounds, methodological flaws, Simpson's paradox, or misspecification. Runs against a dataframe snapshot in a temp cwd. Returns a verdict in its final response.

### Turn Budget
The maximum number of autonomous agent turns the adversarial subagent is allowed. Fixed at 3. The adversarial system prompt informs the subagent of this limit and instructs it to put its verdict in its final response.

### Dataframe Snapshot
A copy of the current dataframe store (Parquet files + metadata.json) written to a temp directory before the adversarial subagent is spawned. The subagent's cwd is set to this directory. Discarded after the verdict is returned. Prevents the adversarial subagent from mutating the real store while giving it full bash/Python access to explore the data.

### Verdict
The structured result returned by the `verify_claim` tool after the adversarial subagent completes its turns. Shape: `{ verdict: "issues-found" | "claim-survives", reasoning: string, issues?: string[] }`. "issues-found" causes the main agent to revise; "claim-survives" allows reporting with a confidence note.

### verify_claim Tool
A custom tool registered with the main agent session. Accepts `claim` (string) and `code` (string — the Python code supporting the claim). Snapshots the dataframe store, spawns the adversarial subagent, enforces the turn budget, and returns a Verdict.

### Dataframe Store
A versioned registry of named dataframes with complete lineage (source, code, timestamps). Entries are keyed as `name@namespace`. Persists to `.pi-science/dataframe-store/metadata.json` and is git-tracked for audit history.

### Session
A single interactive run of the pi.science agent. Identified by a UUID. Dataframes registered during a session are namespaced as `name@session-id`. On exit, the user explicitly merges or discards session changes.

### Provenance
The complete lineage of a dataframe: source URL or file path, acquisition timestamp, transformation code (verbatim), and immutability flag. Stored in DataframeEntry alongside the schema metadata.

## Constraints

- Every causal or predictive claim must pass adversarial verification before the user sees it.
- Every dataframe transformation must be expressed as executable code stored in provenance.
- The adversarial subagent never modifies the real dataframe store — it operates on a snapshot.
- Claim markers are never shown to the user — they are internal orchestration signals.
- Descriptive statistics do not trigger verification.

## Non-Goals

- pi.science does not silently decide to trust data sources — user approval is always required.
- pi.science does not make causal claims without code-backed evidence.
- pi.science does not merge session dataframes automatically — conflicts require explicit user decisions.
