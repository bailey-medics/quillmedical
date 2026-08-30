# Rapid-push ordering retest

Same three-push burst as PR #446, now with the 20s settle restored on the
migration gate.

Watching for:
  - comments in commit order
  - the wait log's new counts: how many runs listed, how many ancestors
  - whether a push gets coalesced again (GitHub's doing, not ours)

Delete with the branch. It must never reach main.
