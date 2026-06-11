# ADR 0001: Claim Detection via Agent Self-Tagging

## Status
Accepted

## Context
The verification loop must fire for causal and predictive claims but not for descriptive ones. We need a way to identify which claims require adversarial verification.

Three approaches were considered: LLM-based classification of every response, keyword heuristics ("causes", "predicts", etc.), and agent self-tagging via structured markers.

## Decision
The main agent is instructed via the system prompt to wrap causal and predictive claims in `<claim type="causal|predictive">...</claim>` before calling `verify_claim`. The `verify_claim` tool receives the claim text and code as explicit arguments; the marker is the signal that triggers the tool call.

## Consequences
- Claim detection is crisp and testable — no NLP ambiguity.
- The agent can reason about claim type (it already distinguishes them per the system prompt), so the extra tagging is a small additional ask.
- If the agent fails to tag a claim, verification is skipped — the system prompt is the enforcement mechanism, not code. Adversarial testing of the prompt is required.
- Markers must never appear in user-visible output; the main agent is instructed to strip them before reporting.
