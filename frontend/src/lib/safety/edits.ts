/**
 * Session edits to the safety fixtures.
 *
 * The mock-up has nothing to save to, so an edit made on a page lives
 * here, in memory, until the tab is reloaded. Pages read through the
 * hooks below so an edit shows wherever the value is used: an officer's
 * new name on the officers page, a placeholder's new value in every
 * document that names it. Lost on reload by design, and the pages say
 * so. See docs/docs/plans/2026-10-02-safety-feature-mock-up-plan.md.
 */

import { useSyncExternalStore } from "react";
import { safetyCaseById } from "./fixtures";
import type { Officer, Placeholder } from "./types";

interface CaseEdits {
  /** Officer overrides, keyed by role */
  officers: Record<string, Officer>;
  /** Placeholder values, keyed by placeholder key */
  placeholders: Record<string, string>;
}

/**
 * One shared "no edits" value, so a case nobody has touched has a stable
 * identity: the snapshots below compare by reference.
 */
const NO_EDITS: CaseEdits = Object.freeze({ officers: {}, placeholders: {} });

let edits: Record<string, CaseEdits> = {};
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function editsFor(caseId: string): CaseEdits {
  return edits[caseId] ?? NO_EDITS;
}

/** Replace one officer on a case, matched by role. */
export function setOfficer(caseId: string, officer: Officer): void {
  const current = editsFor(caseId);
  edits = {
    ...edits,
    [caseId]: {
      ...current,
      officers: { ...current.officers, [officer.role]: officer },
    },
  };
  emit();
}

/** Set one placeholder's value on a case. */
export function setPlaceholderValue(
  caseId: string,
  key: string,
  value: string,
): void {
  const current = editsFor(caseId);
  edits = {
    ...edits,
    [caseId]: {
      ...current,
      placeholders: { ...current.placeholders, [key]: value },
    },
  };
  emit();
}

/** Forget every edit. For tests, and nothing else calls it. */
export function resetEdits(): void {
  edits = {};
  emit();
}

/** The case's officers, with any session edits applied. */
export function officersOf(caseId: string): Officer[] {
  const safetyCase = safetyCaseById(caseId);
  if (!safetyCase) return [];
  const overrides = editsFor(caseId).officers;
  return safetyCase.officers.map(
    (officer) => overrides[officer.role] ?? officer,
  );
}

/** The case's placeholders, with any session edits applied. */
export function placeholdersOf(caseId: string): Placeholder[] {
  const safetyCase = safetyCaseById(caseId);
  if (!safetyCase) return [];
  const overrides = editsFor(caseId).placeholders;
  return safetyCase.placeholders.map((placeholder) =>
    placeholder.key in overrides
      ? { ...placeholder, value: overrides[placeholder.key] }
      : placeholder,
  );
}

// `useSyncExternalStore` compares snapshots by reference, so the hooks
// return the same array until an edit lands rather than a fresh map on
// every render, which would loop.
const officerSnapshots = new Map<
  string,
  { edits: CaseEdits; value: Officer[] }
>();
const placeholderSnapshots = new Map<
  string,
  { edits: CaseEdits; value: Placeholder[] }
>();

function officersSnapshot(caseId: string): Officer[] {
  const current = editsFor(caseId);
  const cached = officerSnapshots.get(caseId);
  if (cached && cached.edits === current) return cached.value;
  const value = officersOf(caseId);
  officerSnapshots.set(caseId, { edits: current, value });
  return value;
}

function placeholdersSnapshot(caseId: string): Placeholder[] {
  const current = editsFor(caseId);
  const cached = placeholderSnapshots.get(caseId);
  if (cached && cached.edits === current) return cached.value;
  const value = placeholdersOf(caseId);
  placeholderSnapshots.set(caseId, { edits: current, value });
  return value;
}

/** The case's officers, re-rendering when one is edited. */
export function useOfficers(caseId: string): Officer[] {
  return useSyncExternalStore(subscribe, () => officersSnapshot(caseId));
}

/** The case's placeholders, re-rendering when one is edited. */
export function usePlaceholders(caseId: string): Placeholder[] {
  return useSyncExternalStore(subscribe, () => placeholdersSnapshot(caseId));
}
