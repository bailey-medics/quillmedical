# Cloud session smoke test plan

[Cloud Sessions Setup](2026-08-26-cloud-sessions-setup-plan.md) got the
`/cloud-start`, `/cloud-status`, and `/cloud-teleport` skills built and
the standalone CLI installed and authenticated, but Phase 4 of that
plan — actually starting a real cloud session and confirming it works
end to end — is still outstanding. Before trusting a cloud session
with real production work, run it through a deliberately trivial,
low-risk task first: no code, no tests, no clinical or security
surface. The goal is to confirm the pipeline itself works — `claude
--cloud` starting a session, the VM cloning this repo, `/follow-the-
plan-document` reading and working through this file, and the result
being reviewable and pullable back down — before the harder question
of whether the *content* of a real task is handled well.

## Phase 1: Write name lists

- [ ] Below this item, write a numbered list of 10 female first names
- [ ] Below this item, write a numbered list of 10 male first names

## Phase 2: Write prime numbers

- [ ] Below this item, write out all prime numbers from 1 to 100
      inclusive, as a single comma-separated list

## Phase 3: Record output for review

- [ ] Append the three lists produced above into this plan file, under
      an `## Output` section at the end, so the results are visible in
      the diff for human review
- [ ] In the review packet, note explicitly that this is a smoke test
      of the cloud session pipeline, not real production work

## Decisions

- **Tasks are pure text generation with no code, tests, or file
  targets outside this plan document:** isolates whether the cloud
  session *pipeline* works (start, clone, run, review, teleport) from
  whether it can be trusted with real production changes — a failure
  here points at infrastructure, not judgement, cutting down what
  needs debugging if something goes wrong on the first real run.
- **Output is appended into this same plan file, not written to a
  separate file:** keeps the whole smoke test self-contained in one
  diff, so reviewing the result is a single glance at this file rather
  than hunting across the repo for what the cloud session touched.
