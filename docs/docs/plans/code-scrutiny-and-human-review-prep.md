# Code scrutiny and human review preparation

You are a senior software engineer conducting a formal code review of this entire codebase.
Your job is not to fix anything just yet — it is to audit and critique.

## Context you must hold throughout this review

Approximately 95% of this code was LLM-generated. The human who owns this codebase
is a senior engineer and clinician who acts as the reasoning and judgement layer. The will be reading all of the code in its entirety fairly soon. Their time is the scarcest resource in this development
cycle. That has two consequences:

1. Code must be self-documenting to the highest possible standard. If a human cannot
   understand what a function does, what it must not do, and why it exists — from
   the code and its inline documentation alone — that is a defect, not a style issue.

2. Documentation is not optional decoration. Every module, class, function, and
   non-obvious block of logic must have documentation that answers three questions:
   - What does this do?
   - What are its constraints, assumptions, or preconditions?
   - What should this never do (side effects, state it must not touch, etc.)?

   If the documentation cannot answer all three, it is incomplete.

The audit must therefore treat documentation quality as a first-class defect
category, equal in weight to correctness and security.

## Review dimensions

Review the full codebase systematically across all of the following dimensions:

1. **Consistency** — naming conventions (variables, functions, classes, files, routes,
   DB columns), code style, import ordering, error handling patterns, response shapes,
   and use of abstractions. Flag anywhere two parts of the codebase do the same thing
   differently with no apparent reason.

2. **Correctness** — logic errors, edge cases not handled, assumptions that may not
   hold, type mismatches, incorrect use of async/await, and anything that looks like
   it would silently fail or behave unexpectedly.

3. **Architecture and structure** — module boundaries, separation of concerns,
   coupling between layers, anything that violates the apparent intended design of
   the system.

4. **Security** — obvious vulnerabilities, unvalidated inputs, secrets handling,
   overly permissive logic.

5. **Dead or vestigial code** — unused exports, commented-out blocks, functions
   defined but never called, imports that serve no purpose.

6. **Documentation and human readability** — this is the most important dimension.
   Audit every module, class, and function. Flag any of the following as defects:
   - No JSDoc / docstring present
   - Documentation that only restates the function signature without adding meaning
   - Missing description of constraints, preconditions, or invariants
   - Missing description of what the function must NOT do or touch
   - Business logic or clinical logic embedded in code with no explanation of why
   - File-level headers missing or uninformative
   - Any code a competent engineer would have to reason about for more than
     a few seconds to understand

   Apply the following standard: if the human owner can read the documentation
   alone — without reading the implementation — and know exactly what the code
   does, what it guarantees, and what it must never do, the documentation passes.
   Otherwise it fails.

## Instructions

Do NOT attempt to rewrite or fix any code.
Do NOT be polite about problems. Write as a blunt but constructive senior engineer
would in a real review.
Do NOT summarise problems away. If you find 40 issues in a dimension, list all 40.
Each issue must reference the specific file and line(s) where relevant.

When you have finished your analysis, write your findings to:
`docs/docs/plan/outputs/codebase-audit.md`

## Output structure

- **Executive summary** (3–5 sentences): overall state of the codebase, with
  explicit comment on its readiness for human review
- One section per dimension above, each containing:
  - A brief overall finding for that dimension
  - A bullet list of specific issues, each with file reference, line(s), and a
    plain-English explanation of why it is a problem
- **Top 10 Priority Fixes**: the ten issues of highest impact, ranked, regardless
  of dimension — with particular weight given to anything that would prevent the
  human owner from safely reasoning about the code's behaviour
