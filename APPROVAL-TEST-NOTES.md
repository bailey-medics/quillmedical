# Approval path test — scratch notes

Throwaway file for PR #444. Exists only to make a commit that changes nothing
either gate cares about, so a fresh approval is requested without altering the
finding itself.

Delete with the branch. It must never reach main.

- Commit 1: destructive migration with its marker — gate fired, then REJECTED
- Commit 2: this file — gate should re-request approval, to be APPROVED
