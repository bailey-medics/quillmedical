---
name: update-docs-docs
description: Review and update documentation to match the codebase, and propose the documents it is missing
argument-hint: "[folder or file under docs/docs, e.g. backend] (default: everything in scope)"
disable-model-invocation: true
---

# Review and update documentation to match the codebase

Area to review: `$ARGUMENTS`

That names a folder or file under `docs/docs/` (`backend`, `frontend/storybook`,
`getting-started.md`). If it is empty, review everything in scope.

There are two passes. The first checks the documents that exist against the
code. The second reads the code itself and works out which documents are
missing.

## Scope

Everything under `docs/docs/` except:

- `plans/` and `learnings/` – records of what was decided and found at the
  time. They are meant to differ from today's code, so "correcting" one
  destroys the history it exists to keep.
- `code/`, `safety/` and `llm/` – kept up to date by other means, not by this
  skill.

If the area named is one of those, say so and stop rather than reviewing it.

## Pass one: check each document against the code

Work from each document to the code it describes. A document already says
which code matters: it names files, endpoints, commands, components, settings
and environment variables.

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

## Pass two: read the code and find what is missing

This pass starts from the code, not the documents. Its question is: what
would a person or a model new to this area need written down to understand
the code or the reasoning behind it, that nothing gives them today?

The codebase is well over a thousand source files, so survey it area by area
rather than line by line:

- `backend/app/` – each package and each large module
- `frontend/src/` – pages, domains, `lib/`, `auth/`, and the component groups
- `shared/` – the YAML that both sides are generated from
- `infra/`, `.github/workflows/`, the compose files and the `Justfile`

When an area was named, survey only the code that area documents (`backend`
means `backend/`, `infrastructure` means `infra/` and the compose files).

For each area, read enough to understand it: the entry points, the module
docstrings, the largest files, and how it connects to its neighbours. Then
look for what already covers it, in `docs/docs/` (including `plans/`, `code/`
and `safety/`, which are out of scope to edit but still count as cover),
`CLAUDE.md` and `.claude/rules/`.

A document is worth proposing when the code alone leaves a reader stuck:

- **Reasoning.** Why it is built this way and not the obvious other way. Code
  shows what was chosen, never what was rejected.
- **A flow that crosses files.** A request, a login, a sync, a deploy: no
  single file shows the whole path.
- **A rule kept by convention.** An invariant the code relies on and nothing
  enforces, so the next change can break it without a test failing.
- **A domain concept.** A clinical, regulatory or organisational idea the
  names assume the reader already has.
- **Setup or operation.** What somebody has to do, in order, that no file
  spells out.

Do not propose a document for code that explains itself, for a reference the
generated pages in `code/` already give (API routes, Storybook), or to repeat
what `CLAUDE.md` or a rule already says. One page per module is not the aim;
a short list of documents somebody would actually open is.

Where the reasoning is not in the code, look in the comments, the plans and
`git log` for it. If it is nowhere, say so in the proposal. Never make up a
reason: a confident wrong "why" is worse than a gap.

## Rules

- **Code is the canonical truth.** Where a document contradicts the code, fix
  the document.
- **A feature the code does not have stays as written.** It may be a future
  feature. A rename is not this case: if the thing exists under another name
  or path, the document is wrong and gets fixed. If it is unclear whether
  something was removed or is still planned, ask.
- **Make the smallest edit that makes the document true.** Keep the author's
  wording, structure and tone. Do not restyle, reorder or tighten prose that
  is already correct.
- **Propose new documents; do not write them until they are chosen.** Which
  documents are worth keeping up to date is the user's call.
- **Never edit code**, and do not commit.

## Fanning out

For a single file or a small folder, do the work directly.

For anything wider, use subagents, launched together:

- **Pass one**: one per top-level docs folder (`backend`, `frontend`,
  `infrastructure` and so on), with the small folders batched into one.
- **Pass two**: one per code area in the list above.

Each starts with none of this context, so give it its folder or area, the
method for its pass and the rules above. Subagents check and report; they do
not edit or write.

Ask each pass one subagent to return, per finding:

- the document and line
- what the document says
- what the code says, with the file that shows it
- the proposed correction
- how sure it is

Ask each pass two subagent to return, per candidate, the fields listed under
"Finishing", plus what it found that already covers the area.

Before editing, open the code behind each reported contradiction and confirm
it. A subagent's mistake arrives sounding as certain as its findings, and a
wrong "correction" makes a true document false. Check each candidate from
pass two the same way: confirm nothing already covers it, and merge
candidates from different subagents that describe the same thing.

## Finishing

Apply the corrections that were confirmed. Then report:

- each file changed, with one line on what was wrong
- features left as written because the code does not have them yet
- anything unresolved, as a numbered list of questions, each with a
  recommendation

Then the proposed new documents, as a numbered list, most useful first. For
each:

- the path it would have under `docs/docs/`
- what it would cover, in two or three lines
- who it helps, and what they cannot work out from the code today
- the code it would be written from
- whether the reasoning was found, and where, or has to come from the user

Keep the list to the strongest handful. Stop there and wait for the user to
choose.

For each document chosen, write it from the code, in the style of the
documents beside it, and add it to `nav` in `docs/mkdocs.yml`. Where the
reasoning has to come from the user, ask for it before writing.
