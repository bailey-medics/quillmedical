# Phase 7 walkthrough — scratch notes

Throwaway file for the gate walkthrough on this branch. It exists so a step
can make a commit that touches no migration and no API surface, proving the
gates stay silent while still re-blocking.

Delete with the rest of this branch. It must never reach main.

- Step 1: migration A without its marker
- Step 2: marker added to A
- Step 3: migration B added
- Step 4: this file — a commit that changes nothing either gate cares about
