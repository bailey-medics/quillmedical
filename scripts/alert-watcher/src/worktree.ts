// Whether worktree 5 is free for an alert run.
//
// A person may be working there, so the watcher never resets or cleans it.
// It is free only when the tree is clean and sits on origin/main, or on a
// branch an earlier alert run left behind. Anything else means somebody is
// using it, and the alert waits.

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

  // A failed fetch leaves the last known origin/main, which is still a fair
  // test of whether the checkout has moved on to other work.
  try {
    await git("fetch", "origin", "main", "--quiet");
  } catch {
    // Carried on deliberately: see above.
  }

  const head = await git("rev-parse", "HEAD");
  const main = await git("rev-parse", "origin/main");
  const branch = await git("rev-parse", "--abbrev-ref", "HEAD");

  if (head === main || branch.startsWith("feature/alert-")) {
    return { free: true };
  }

  return { free: false, reason: `it is on ${branch === "HEAD" ? "a detached commit" : branch}` };
}
