---
name: cloud-start
description: Start a new Claude Code cloud session for a task, so it keeps running on Anthropic's infrastructure after you disconnect or close this session.
disable-model-invocation: true
allowed-tools: Bash(claude --cloud *), Bash(git status *), Bash(git log *), Bash(git push *)
argument-hint: "[task description]"
---

The cloud VM clones the GitHub remote at the current branch, not the local working tree — anything uncommitted or unpushed here is invisible to it.

## Current branch state
!`git status --short && echo "---unpushed commits---" && git log @{u}..HEAD --oneline 2>&1`

## Instructions

1. If the status above shows uncommitted changes, tell the user and ask whether to commit first. Do not commit on their behalf.
2. If it shows unpushed commits, warn the user the cloud session won't see them until pushed. Ask before pushing on their behalf.
3. Once the branch is clean and pushed, run: `claude --cloud "$ARGUMENTS"`
4. Report back the session ID and claude.ai URL from the command's output.
5. Remind the user: send follow-ups with `claude -p "message" --cloud <session-id>`; pull the session down locally later with `/cloud-teleport <session-id>`.
