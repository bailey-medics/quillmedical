# Rapid-push ordering test

Throwaway. Three separate pushes in quick succession, deliberately not paced:

- push 1: migration A       -> hash changes, comment expected
- push 2: migration B added -> hash changes, comment expected
- push 3: both removed      -> all-clear expected

The point is contention. wait-for-ancestor-decisions.sh has never run with an
ancestor still deciding, because every walkthrough push so far has been slow
enough that nothing was ever in flight. Expect the comments to read A, B, C in
that order, with the wait step logging later commits waiting on earlier ones.

Delete with the branch. It must never reach main.
