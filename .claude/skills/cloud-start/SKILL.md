---
name: cloud-start
description: Get the exact command to start a new Claude Code cloud session for a task, so it keeps running on Anthropic's infrastructure after you disconnect or close this session.
disable-model-invocation: true
allowed-tools: Bash(git status *), Bash(git log *), Bash(git push *)
argument-hint: "[task description]"
---

`claude --cloud` refuses to run without a real interactive terminal (a
TTY) — confirmed directly: it errors with `--cloud requires an
interactive terminal` when run via a tool that isn't attached to one,
even with a faked pseudo-TTY it then blocks on the CLI's first-run
onboarding wizard (theme selection), which also needs real keystrokes.
There is no way to run this command on the user's behalf from inside a
skill. Do not attempt workarounds (`script`, `expect`, piping fake
input) — hand the command back instead.

The cloud VM clones the GitHub remote at the current branch, not the
local working tree — anything uncommitted or unpushed here is
invisible to it.

## Current branch state
!`git status --short && echo "---unpushed commits---" && (git log @{u}..HEAD --oneline 2>&1 || echo "(no upstream tracking branch set — this branch has never been pushed with -u, or was pushed without setting tracking)")`

## Instructions

1. If the status above shows uncommitted changes, tell the user and ask whether to commit first. Do not commit on their behalf.
2. If it shows unpushed commits, or no upstream tracking branch, warn the user the cloud session won't see local-only work until it's pushed. Ask before pushing on their behalf (use `git push -u origin <branch>` to set tracking on first push).
3. Once the branch is clean and pushed, give the user this exact command to run themselves in a real terminal (not this chat):

   ```
   claude --cloud "$ARGUMENTS"
   ```

4. Tell them: after it starts, it prints the session ID and a
   claude.ai URL. From there, send follow-ups with `claude -p
   "message" --cloud <session-id>`, or pull the session down locally
   later with `/cloud-teleport <session-id>`.
