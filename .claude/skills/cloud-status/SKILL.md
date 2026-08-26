---
name: cloud-status
description: Check status of local and cloud Claude Code sessions running against this repo.
disable-model-invocation: true
allowed-tools: Bash(claude agents *)
---

## Local sessions (interactive + local background)
!`claude agents --json --all`

## Instructions

Summarize the local sessions listed above: name, kind (interactive/background), and how long each has been running.

This command cannot see cloud sessions — those run on Anthropic's infrastructure, not as local processes. Tell the user cloud session status is only visible in one of two places:

- Inside an interactive terminal `claude` session (not this one, if this is a VS Code extension or web session): run `/tasks`
- At [claude.ai/code](https://claude.ai/code), or the Claude mobile app
