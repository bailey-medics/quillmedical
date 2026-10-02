---
agent: "agent"
name: update-docs-docs
description: Review and update documentation to match the codebase
---

# Review and update documentation to match the codebase

If the request names a folder or file under `docs/docs/` (`backend`,
`frontend/storybook`, `getting-started.md`), review only that. Otherwise
review everything in scope.

## Scope

Everything under `docs/docs/` except:

- `plans/` and `learnings/` – records of what was decided and found at the
  time. They are meant to differ from today's code, so "correcting" one
  destroys the history it exists to keep.
- `code/`, `safety/` and `llm/` – kept up to date by other means, not by this
  prompt.

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
   on `copilot-instructions.md` or the instruction files, which can be stale
   in the same way the document is.
4. Sort each claim: it matches, it contradicts the code, it describes
   something the code does not have, or it cannot be settled.

For a review of everything in scope, work through one top-level folder at a
time (`backend`, `frontend`, `infrastructure` and so on) and finish each before
starting the next.

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

## Finishing

Apply the corrections. Then report:

- each file changed, with one line on what was wrong
- features left as written because the code does not have them yet
- gaps: significant code with no document
- anything unresolved, as a numbered list of questions, each with a
  recommendation
