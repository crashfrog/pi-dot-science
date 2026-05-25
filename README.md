# pi.science

A terminal-based data science agent that acts as a **statistician's research assistant**, not an oracle. pi.science helps you explore data, acquire sources, and validate statistical claims—all from the terminal with full provenance tracking.

Built as a lightweight fork of the [Pi coding agent](https://github.com/earendil-works/pi), reoriented toward agentic exploratory data analysis with hard guardrails against unfounded inference.

## Philosophy

**pi.science assumes users are skeptical of AI in data science.** The agent doesn't answer questions; it helps you answer them yourself by:

- Writing **auditable, executable Python code** for every claim
- Explicitly naming **data sources, uncertainties, and assumptions**
- Acquiring missing data from the internet via code (not black-box APIs)
- Persisting a **complete lineage** of every dataframe—what code transformed it, where it came from, when
- Running **adversarial verification**: a skeptical subagent tries to disprove each claim before it's reported

The goal: inference you can defend, not just inference that sounds plausible.

## Key Design Decisions

### Provenance & Reproducibility

Every dataframe in a session carries a **complete audit trail**:
- Source (URL, file path, or inline code)
- Acquisition timestamp and method
- All transformations (cleaning, filtering, feature engineering) with exact code
- Data snapshots at each step (so sources that disappear can still be audited)

This record is itself **reproducible**—you can replay a session's data workflow to restore it or verify it months later.

### Projects & Versioning

Projects live in **directories** (like git repos). Each directory is a single pi.science project:

- Multiple sessions can run concurrently in the same project
- Each session has its own **isolated dataframe namespace** (e.g., `df_users@session-42`)
- On session exit, you can **merge back to "main"** (canonical project state)
- Merges are explicit and conflict-aware; no silent overwrites
- The dataframe store is **git-tracked** (Parquet data + versioning metadata)

### Verification & Guardrails

The agent follows a **two-phase verification loop**:

1. **Main agent**: "The data shows X" (with supporting Python code)
2. **Adversarial subagent** (2-3 turns): Tries to find confounds, methodological flaws, or contradictions
   - If successful → main agent revises or retracts
   - If unsuccessful → conclusion stands (higher confidence)

This applies to **causal and predictive claims** only. Descriptive statistics don't need verification (code is self-evident).

### Data Acquisition

If a question can't be answered from the project's datastore, the agent treats it as a **data engineering challenge**:

- Identify accessible sources (APIs, public datasets, etc.)
- Fetch data with explicit quality assessment and flagged provenance
- User can approve or reject before using the data
- All acquisition code is persisted and auditable

### Terminal Rendering

- **Primary target**: Windows Terminal on WSL2 (Debian) with Sixel support
- **Matplotlib/seaborn plots** render inline:
  - **Sixel** (Windows Terminal, native Linux, most compatible)
  - **Kitty graphics protocol** (alternative for Kitty users)
  - **Fallback**: Clickable file links (Windows path + HTTP server on WSL, file:// URLs on native Linux/macOS)
- **Dataframe previews** show schema, sample rows, and source info
- **Capability detection**: Auto-detects terminal support and caches results per session
- All output is logged to session history for reproducibility

## Architecture

```
pi-dot-science/
  src/
    extensions/
      dataframe-store.ts      # Provenance DAG + versioning
      image-renderer.ts       # Terminal image protocols
    prompts/
      system.md               # Hard guardrails on inference
  index.ts                    # Entrypoint (pi-coding-agent integration)
  package.json
  tsconfig.json
```

## Development

```bash
bun install
bun run dev                   # Run directly
bun run type-check            # TypeScript validation
bun run build                 # Compile to standalone binary
```

Output: `./pi-sci` (executable, ~10MB)

## Next Steps

1. **System prompt** (`src/prompts/system.md`): Encode inference guardrails, verification workflow, and data acquisition strategy
2. **Dataframe store** (`src/extensions/dataframe-store.ts`): Provenance DAG, Parquet serialization, git integration
3. **Image renderer** (`src/extensions/image-renderer.ts`): Terminal protocol detection and inline rendering
4. **Adversarial agent**: Subagent loop for claim verification
5. **Data acquisition tools**: Internet data fetching with quality assessment

## Distribution

Targets PyPI as platform wheels wrapping the compiled binary—seamless installation and environment isolation.

## Status

Early-stage prototype. System prompt and architecture locked; extensions and verification loop under development.
