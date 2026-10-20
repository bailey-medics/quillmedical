---
paths:
  - "docs/docs/incidents/**"
  - "docs/mkdocs.yml"
---

# Incident reports

Each time App production or EHR production stops working as it should, it
gets a report in `docs/docs/incidents/`, whether the cause was ours or a
supplier's. The point is the actions at the end: each report should leave
outages less likely, quicker to notice, or quicker to handle.

## When to write one

- **Anything a user would have noticed, or would have if there were users**:
  failed requests, failed scheduled actions, a failed deploy that left
  production behind, lost or delayed email.
- **A supplier outage that cost us time**, even when production was fine:
  GitHub Actions holding a deploy, say.
- **Not** a red CI run, a failed pull request check, or trouble confined to
  the dev stack or a worktree.
- **Write it once recovered**, while the logs are still to hand. An
  incident still running gets a report with `Status: open`, updated later.

## While it is happening

Two checks come before any fix, because both past incidents would have been
understood in minutes with them:

- **Look at the supplier's status page first**:
  <https://status.cloud.google.com> for Google Cloud (and the project's
  Personalized Service Health page), <https://www.githubstatus.com> for
  GitHub. A fault that starts with no change on our side is most likely
  theirs.
- **Check the real system, not the report of it.** A deploy shown as stuck
  may already be live: the Cloud Run revision and its creation time say
  what is serving. A health check saying "available" may not have opened
  a connection. Believe the logs of the thing itself.

## The file

- **Start from the template below** and keep its headings and their order.
- **Filename**: `YYYY-MM-DD-<kebab-case-slug>.md`, dated the day the
  incident began, the slug naming what broke and where (e.g.
  `2026-10-20-europe-west2-power-outage.md`). No `-incident` suffix: the
  folder says that.
- **Title**: a single `#` heading in sentence case saying what broke.
- **All times in UTC**, including any taken from Slack, which shows local
  time (BST is UTC+1).
- **Facts from logs, not memory.** Each timeline entry should be something a
  log, a workflow run, an audit log or a status page shows. Say plainly
  where something is inferred, with "about" on a time that is.
- **Session transcripts are evidence too.** What a Claude Code session saw
  and did during the incident is in its transcript under
  `~/.claude/projects/`, timestamped; quote what happened, never the
  transcript itself.
- **No blame section.** Say what happened, not who did it.

## Public, so leave things out

The repository and the docs site are public, so every report is too. Leave
out:

- internal IP addresses and subnet ranges
- Cloud Run execution IDs, instance IDs and service account emails
- secrets, tokens and anything that looks like one
- anything about a patient or a user, including counts small enough to
  identify somebody

Link GitHub runs, pull requests and a supplier's public incident page
freely. A supplier's incident ID used as link text fails the spelling
check; link it as "its incident" instead.

## Actions

- **Every action is a checkbox** that links to the plan or pull request
  carrying it once one exists.
- **An action decided against stays in the list**, ticked, with the reason,
  so the next incident can see it was considered.
- **A decision that is Mark's is worded as one** ("Decide whether to ...")
  rather than presented as settled.
- **Follow-up work goes into a plan**, as `.claude/rules/plans.md` says; the
  report links to it rather than holding the steps itself.

## Registering it

When adding a report, also:

1. Add one line to `docs/docs/incidents/index.md`, newest first:
   date, title, and a short clause on the impact.
2. Add it under `Incidents` in the `nav` of `docs/mkdocs.yml`, in date
   order, newest last.

## Template

```markdown
# What broke, in sentence case

- **Began**: YYYY-MM-DD HH:MM UTC
- **Recovered**: YYYY-MM-DD HH:MM UTC, or "not yet"
- **Environment**: App production, EHR production, CI, or more than one
- **Cause owner**: Quill, or the supplier's name
- **Status**: open, recovered, or closed

## Summary

What broke and why, in two sentences.

## Impact

Who or what was affected, and for how long. Say plainly if nobody was.

## Timeline

All times UTC, from the first sign to recovery.

- **HH:MM** - what happened

## Cause

What went wrong. For a supplier's fault, link their own report.

## Detection

How we found out, and how long after it began.

## What helped and what got in the way

- **Helped**: ...
- **Got in the way**: ...

## Actions

Each one links to the plan or pull request that carries it, or says why it
was decided against.

- [ ] ...
```
