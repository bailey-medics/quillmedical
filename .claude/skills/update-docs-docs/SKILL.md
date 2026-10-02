---
name: update-docs-docs
description: Review and update documentation to match the codebase
argument-hint: "[folder or file under docs/docs, e.g. backend] (default: everything in scope)"
disable-model-invocation: true
---

# Review and update documentation to match the codebase

Area to review: `$ARGUMENTS`

That names a folder or file under `docs/docs/` (`backend`, `frontend/storybook`,
`getting-started.md`). If it is empty, review everything in scope.

## Scope

Everything under `docs/docs/` except:

- `plans/` and `learnings/` – records of what was decided and found at the
  time. They are meant to differ from today's code, so "correcting" one
  destroys the history it exists to keep.
- `code/`, `safety/` and `llm/` – kept up to date by other means, not by this
  skill.

If the area named is one of those, say so and stop rather than reviewing it.

## Method: from the docs to the code

Work from each document to the code it describes, never the other way round.
The codebase is well over a thousand source files, far too much to read whole,
and reading it first leaves no room to compare anything. A document already
says which code matters: it names files, endpoints, commands, components,
settings and environment variables.

For each document:

1. Read it whole.
2. Pick out every claim the code can confirm or refute: paths, names of
   functions, classes, components and routes, `just` recipes, configuration
   keys, versions, and described behaviour.
3. Open the code and check each one. Check the files themselves; do not rely
   on `CLAUDE.md`, the rules or memory, which can be stale in the same way the
   document is.
4. Sort each claim: it matches, it contradicts the code, it describes
   something the code does not have, or it cannot be settled.

## Rules

- **Code is the canonical truth.** Where a document contradicts the code, fix
  the document.
- **A feature the code does not have stays as written.** It may be a future
  feature. A rename is not this case: if the thing exists under another name
  or path, the document is wrong and gets fixed. If it is unclear whether
  something was removed or is still planned, ask.
- **Correct what is there; do not write new documentation.** Significant code
  with no document is a gap to report at the end, not to fill.
- **Make the smallest edit that makes the document true.** Keep the author's
  wording, structure and tone. Do not restyle, reorder or tighten prose that
  is already correct.
- **Never edit code**, and do not commit.

## Fanning out

For a single file or a small folder, do the work directly.

For anything wider, use one subagent per top-level folder (`backend`,
`frontend`, `infrastructure` and so on), launched together, with the small
folders batched into one. Each starts with none of this context, so give it
its folder, the method and the rules above. Subagents check and report; they
do not edit. Ask each to return, per finding:

- the document and line
- what the document says
- what the code says, with the file that shows it
- the proposed correction
- how sure it is

Before editing, open the code behind each reported contradiction and confirm
it. A subagent's mistake arrives sounding as certain as its findings, and a
wrong "correction" makes a true document false.

## Finishing

Apply the corrections that were confirmed. Then report:

- each file changed, with one line on what was wrong
- features left as written because the code does not have them yet
- gaps: significant code with no document
- anything unresolved, as a numbered list of questions, each with a
  recommendation
