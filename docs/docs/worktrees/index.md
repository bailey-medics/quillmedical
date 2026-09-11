# Git worktrees

A worktree is a second checkout of the same repository, in its own
directory, on its own branch. One clone, several working directories.

```bash
just wc feature/my-next-thing
```

That creates a sibling directory, puts it on the branch you named, copies
the `.env` files across and builds the backend virtual environment.

## Why they matter for LLM work

An agent takes minutes to work through a task, and during that time the
working directory belongs to it. Every file it edits is a file you cannot
edit, and a `git checkout` you run underneath it will make it act on a
tree it has not read. Worktrees remove the conflict: the agent works in
one directory, you work in another, and neither can disturb the other.

Three things this makes possible.

- **Waiting without idling.** A long review, a slow test run or a CI wait
  no longer blocks you. Pick up the next thing in another worktree.
- **Parallel agents.** Two agents on two branches genuinely do not
  interfere, because they are not sharing a working directory at all.
- **Reading the previous branch while the next is in flight.** Comparing
  two versions of a file usually means stashing, switching and switching
  back. With a worktree both are on disk at once.

The habit worth forming is one worktree per line of work, rather than one
per day. A worktree is cheap to make and cheap to remove.

## What the recipe does

`just wc <branch>` — aliased from `just worktree-create`:

- **Refuses a branch name the repository will reject.** Branch protection
  allows only `feature/`, `hotfix/`, `copilot/` and `renovate/` prefixes,
  and finding that out after the worktree exists means unpicking it by
  hand.
- **Names the directory for you.** `quillmedical-2`, `quillmedical-3` and
  so on, walking up until a free name appears — so a directory removed by
  hand does not make the next number collide.
- **Creates the branch, or resumes it.** A name that already exists — here
  or on `origin` — is checked out with its history intact. Only a genuinely
  new name branches from `origin/main`, so a fresh worktree never inherits
  half-finished work from wherever you happened to be standing.
- **Leaves the upstream unset on a new branch.** A branch created against
  `origin/main` otherwise tracks `main` itself, and a bare `git push` would
  aim at the protected branch. Your first push needs
  `git push -u origin <branch>`. A resumed branch already tracks its own
  remote, so it pushes normally.
- **Copies the `.env` files.** They are gitignored, so a new worktree
  starts without any and the stack will not come up. Copied rather than
  symlinked, because a branch may legitimately need a different value and
  a symlink would edit the original from inside the worktree.
- **Builds a separate backend virtual environment**, which is the part
  that used to be manual. See below for why it is fiddlier than it looks.

Afterwards, run `just initialise-repo` in the new directory for the
pre-commit hooks and the yarn packages.

## Why the virtual environment needs forcing

Poetry keys its cached environments on the project name. Every worktree's
backend is called `backend`, so left alone they all share a single
environment — and installing a dependency on one branch silently changes
the others, which is the precise thing a worktree exists to prevent.

Two settings are needed together, and the second is easy to miss:

- `POETRY_VIRTUALENVS_IN_PROJECT=1` puts the environment in the worktree.
- `env -u VIRTUAL_ENV` clears any environment already active in the
  calling shell. Poetry honours an active virtualenv above everything
  else, so running the recipe from a worktree you have been working in
  would otherwise install straight into that worktree's environment.

The recipe does both. Worth knowing if you ever run `poetry install` by
hand in a new worktree and wonder why the dependencies appeared somewhere
else.

## Removing one

```bash
git worktree remove ../quillmedical-2
```

Add `--force` if it has uncommitted changes. The branch survives the
removal; delete it separately, or let `just pb` clear it once merged.

## Docker, and the one thing to watch

The dev stack uses fixed container names, so **only one worktree can run
it at a time**. Starting `just st` in a second worktree will either fail
on the name or, worse, attach to the containers already serving the
first — and the tests you then run will exercise the other worktree's
code while appearing to pass.

If you are running the stack in one worktree, treat the others as
edit-and-review space, or bring the stack down first.
