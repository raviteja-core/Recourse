# AGENTS.md

The complete, authoritative specification for this project is located at:
[`docs/RECOURSE_SPEC.md`](docs/RECOURSE_SPEC.md)

Read all of `docs/RECOURSE_SPEC.md` before doing anything else.

## Core Rules for AI Agents

1. **Secrets & Credentials (Rule 3):**
   - PayPal sandbox credentials belong in a local `.env` file created manually by the user.
   - **Never print, log, commit, or echo any secret or credential.**
   - Ensure `.env`, `.env.local`, and key files are in `.gitignore` before any commit.
   - Use `.env.example` as the canonical template for required environment variables.

2. **Deterministic Financial Control (Rule 4):**
   - **LLMs propose, deterministic code disposes.**
   - No LLM call may move money directly. The Mandate Guard, rubric scoring, and PayPal payment API executions must be deterministic code.
   - Every LLM output that feeds application logic must be validated against a strict schema (e.g., Zod).

3. **Priority & Runnable Golden Path (Rule 5):**
   - Strictly follow the priority order: **P0 > P1 > P2**.
   - Keep `npm run demo` runnable and passing from Phase 2 onward.
   - If time is short, cut P2 first, then P1 from the bottom up. Explicitly inform the user of any cuts.

