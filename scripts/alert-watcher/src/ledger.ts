// What the watcher has already done with each alert, kept on disk so a
// restart neither repeats an investigation nor forgets the day's count.
//
// One JSON file in the state folder. It holds fingerprints and outcomes,
// never alert text: the Slack thread already has that.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Outcome = "run" | "capped" | "incident";

export interface Entry {
  fingerprint: string;
  outcome: Outcome;
  at: string;
}

const KEEP_DAYS = 30;

export class Ledger {
  private entries: Entry[];
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.entries = Ledger.load(path);
  }

  private static load(path: string): Entry[] {
    let raw: string;

    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
    } catch {
      return [];
    }
  }

  seen(fingerprint: string): boolean {
    return this.entries.some((entry) => entry.fingerprint === fingerprint);
  }

  // Investigations started on the UTC day of `now`.
  runsOn(now: Date): number {
    const day = now.toISOString().slice(0, 10);

    return this.entries.filter(
      (entry) => entry.outcome === "run" && entry.at.startsWith(day),
    ).length;
  }

  record(fingerprint: string, outcome: Outcome, now: Date): void {
    const oldest = now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000;

    this.entries = this.entries.filter((entry) => Date.parse(entry.at) >= oldest);
    this.entries.push({ fingerprint, outcome, at: now.toISOString() });
    this.save();
  }

  // Written to a file beside it and renamed, so a crash mid-write leaves the
  // old ledger rather than half a new one.
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });

    const temporary = `${this.path}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    renameSync(temporary, this.path);
  }
}

const OUTCOMES: ReadonlySet<unknown> = new Set<Outcome>(["run", "capped", "incident"]);

function isEntry(value: unknown): value is Entry {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return (
    "fingerprint" in value &&
    typeof value.fingerprint === "string" &&
    "at" in value &&
    typeof value.at === "string" &&
    "outcome" in value &&
    OUTCOMES.has(value.outcome)
  );
}
