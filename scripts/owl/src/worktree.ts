// Whether worktree 5 is free for an alert run.
//
// A person may be working there, so the watcher never resets or cleans it.
// Each run starts by moving the checkout to the latest main, so the only
// question is whether that move would lose somebody's work. It would with
// uncommitted changes, or with commits on a detached checkout that no
// branch holds and main does not contain. A clean checkout on any branch,
// or behind main, is free: the branch stays where it is.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

export type Run = (command: string, args: readonly string[]) => Promise<string>;

export type WorktreeState = { free: true } | { free: false; reason: string };

const execFileAsync = promisify(execFile);

export const runCommand: Run = async (command, args) => {
  const { stdout } = await execFileAsync(command, [...args], { timeout: 60_000 });

  return stdout.trim();
};

export async function checkWorktree(directory: string, run: Run = runCommand): Promise<WorktreeState> {
  const git = (...args: string[]): Promise<string> => run("git", ["-C", directory, ...args]);

  let status: string;

  try {
    status = await git("status", "--porcelain");
  } catch {
    return { free: false, reason: "git could not read the worktree" };
  }

  if (status !== "") {
    return { free: false, reason: "it has uncommitted changes" };
  }

  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");

  if (branch !== "HEAD") {
    return { free: true };
  }

  // A failed fetch leaves the last known origin/main, which can only make a
  // detached commit look newer than main, so the answer errs towards in use.
  try {
    await git("fetch", "origin", "main", "--quiet");
  } catch {
    // Carried on deliberately: see above.
  }

  // Exits 0 when main already contains the commit, and 1 when it does not,
  // which the runner reports as an error.
  try {
    await git("merge-base", "--is-ancestor", "HEAD", "origin/main");
  } catch {
    return { free: false, reason: "it is on a detached commit that main does not contain" };
  }

  return { free: true };
}
