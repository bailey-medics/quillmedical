# Phase 7 walkthrough — scratch notes

Throwaway file for the gate walkthrough on this branch. It exists so a step
can make a commit that touches no migration and no API surface, proving the
gates stay silent while still re-blocking.

Delete with the rest of this branch. It must never reach main.

- Step 1: migration A without its marker
- Step 2: marker added to A
- Step 3: migration B added
- Step 4: this file — a commit that changes nothing either gate cares about

## Finding: the two gates fail differently

- Missing migration marker (step 1): detection still runs, the finding is
  recorded on the PR, the gate blocks, the reviewer is asked to approve.
- Missing API decision file (step 5): detection FAILS, so the decide job that
  needs it is skipped and NOTHING appears on the PR timeline. Only a
  "validation failed" Slack message goes out.

Both leave the PR blocked, so neither is unsafe. But the API path leaves no
record of what the break was - a reader months later sees no trace. Worth
carrying into the plan as a deliberate decision or a thing to change.
