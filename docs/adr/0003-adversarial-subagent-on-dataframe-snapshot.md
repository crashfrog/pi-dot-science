# ADR 0003: Adversarial Subagent Runs on Dataframe Snapshot in Temp CWD

## Status
Accepted

## Context
The adversarial subagent needs to re-run Python code against real data to find genuine methodological problems. But giving it bash access in the real project cwd risks mutating the dataframe store — even if TypeScript write tools are restricted, Python code can write arbitrary files.

## Decision
Before spawning the adversarial subagent, copy the current dataframe store (Parquet files + metadata.json) to a temp directory. Set the subagent's `cwd` to that temp directory. Give the subagent full bash + read + write tools. Discard the temp directory after the verdict is returned.

## Consequences
- The adversarial subagent has full analytical freedom: it can run Python, write intermediate files, explore the data in any direction.
- The real dataframe store is never at risk — all subagent writes go into the throwaway temp dir.
- Snapshot cost is proportional to the size of the relevant dataframes. For large datasets this may be slow; acceptable given verification is only triggered for causal/predictive claims, not every turn.
- The subagent's Python environment sees the same data the main agent used, ensuring genuine adversarial comparison rather than a stale or partial view.
