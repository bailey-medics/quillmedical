---
agent: "agent"
name: follow-the-plan-document
description: Follow the plan document
---

# Follow the plan document

A plan document has been attached to this prompt. Follow it to complete the task.

## Working through the plan

- Before beginning each step, re-read that section of the plan document.
- Do not proceed to the next step until the current one is complete.
- If a step is unclear or blocked, stop and ask for clarification rather than improvising.
- Use markdown checkboxes to track progress through the plan document, checking off each step as it is completed.

## Human review before committing

All code must be reviewed by a human before it enters git history. Work in discrete, self-contained units and gate each one:

1. Implement a single discrete change (e.g. a feature implemented, a refactor complete, a test passing, normally a sub-heading in the plan document). Do not batch unrelated changes together.
2. Ensure the change ships with matching tests — new or updated tests that actually exercise the new/changed behaviour (per the repo's testing requirements) — then run the relevant suite so the change is presented green (e.g. `just ub` / `just uf` for backend/frontend, targeted where possible).
3. **Stop and hand over for review.** Present a short review packet: what changed, why, which plan step it maps to, and any risks or assumptions. The packet is a brief written summary posted directly in the chat conversation.
4. Wait for the human to review the actual diff in the VS Code Source Control / diff view and give explicit approval. If they request changes, apply them and return to step 2.
5. Only after explicit approval, commit with a short descriptive message, then proceed to the next unit.

Do not commit or push without explicit human approval of that unit's diff.

## Committing mechanics

- One discrete change per commit; do not batch unrelated changes into a single commit.
- Stay on the current branch. Do not start a new one.
- However, if you are on main branch, then you are free to start an appropriate feature branch for the work you are doing.
- The reviewed commits roll up into the branch's pull request, which serves as the durable, attributable sign-off record.

## Staying on track

- If at any point your approach diverges from the plan, stop and reconcile with the human before continuing.
- If you discover important information whilst building, add this to the plan document.
