# ADR 0002: Verification Loop as Custom Tool, Not Response Interception

## Status
Accepted

## Context
The adversarial verification loop needs an integration point with the main agent session. Two realistic options existed: intercept agent responses before they reach the user (extension event hook), or register a custom tool the main agent calls explicitly.

## Decision
Implement verification as a `verify_claim(claim, code)` custom tool registered with the main agent session via `createAgentSession({ customTools: [...] })`. The main agent calls it before reporting any causal or predictive claim.

## Consequences
- The tool call is a clear input/output contract — testable without running a full agent session.
- The main agent receives and can reason about the verdict, producing a more coherent revision than silent output mutation would allow.
- Requires the agent to cooperate — if it forgets to call the tool, verification is skipped. System prompt discipline and adversarial prompt testing mitigate this.
- Response interception (alternative) would be fragile: it requires parsing streaming output, mutating it mid-flight, and potentially injecting a follow-up prompt into a live session — higher coupling, harder to test, worse failure modes.
