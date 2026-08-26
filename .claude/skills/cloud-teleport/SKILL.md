---
name: cloud-teleport
description: Get the exact command to pull a Claude Code cloud session down into a local terminal to keep working on it interactively.
disable-model-invocation: true
argument-hint: "[session-id]"
---

## Instructions

Do not run this command yourself. Teleporting switches the working directory's git branch and needs an interactive terminal (a TTY) to prompt for stashing — this chat session doesn't have one and could leave the repo in a confusing state if driven headlessly.

Instead, tell the user to open a real terminal in this repository and run:

```
claude --teleport $ARGUMENTS
```

If no session ID was given, tell them to run `claude --teleport` alone for an interactive picker over their cloud sessions.

Mention the requirements before they run it:
- Clean git working directory (uncommitted changes get offered a stash, not blocked)
- Run from a checkout of the same repository the cloud session used
- Signed in to the same claude.ai account that owns the session
