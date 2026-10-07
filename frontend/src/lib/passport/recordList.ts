/**
 * Every record in a passport as one list, newest first.
 *
 * The passport page lists sign-offs, logbook entries, CPD activities,
 * certificates and reflections together, so a holder can show somebody
 * how busy they have been and open any record from one place. Each kind
 * keeps its own page and API; this only flattens what those return.
 */

import type {
  Certificate,
  CpdEntry,
  IsoDate,
  Reflection,
  SignOff,
  SignOffStatus,
  WholeLogbook,
} from "./types";
import { nameWithScope } from "./scopes";

export type PassportRecordKind =
  "sign_off" | "logbook" | "cpd" | "certificate" | "reflection";

/** How each kind is named in the Type column. */
export const RECORD_KIND_LABELS: Record<PassportRecordKind, string> = {
  sign_off: "Sign-off",
  logbook: "Logbook",
  cpd: "CPD",
  certificate: "Certificate",
  reflection: "Reflection",
};

/** One row of the list. */
export interface PassportRecord {
  /** Unique across every kind, for a React key */
  key: string;
  kind: PassportRecordKind;
  /** The record's own date: observed, performed, activity, awarded or written */
  on: IsoDate;
  /** What it is about: the competency, or the record's own title */
  title: string;
  /** A sign-off's state; null for records nobody countersigns */
  status: SignOffStatus | null;
  /** The page that shows this record in full */
  href: string;
}

export interface RecordSources {
  signOffs: SignOff[];
  logbook: WholeLogbook;
  cpd: CpdEntry[];
  certificates: Certificate[];
  reflections: Reflection[];
  /** A competency's name from its id, for logbook entries */
  competencyName: (id: string) => string;
}

const enc = encodeURIComponent;

/** Every record, newest first; records on one day keep a stable order. */
export function collectRecords(sources: RecordSources): PassportRecord[] {
  const records: PassportRecord[] = [];

  for (const signOff of sources.signOffs) {
    records.push({
      key: `sign_off:${signOff.name}`,
      kind: "sign_off",
      on: signOff.observed_on,
      title: nameWithScope(signOff.competency.name, signOff.scope),
      status: signOff.status,
      href: `/passport/sign-offs/${enc(signOff.name)}`,
    });
  }

  // An entry that also counts towards other competencies is listed under
  // each of them. It is one procedure, so it is one row, under the
  // competency it was logged against.
  const seen = new Set<string>();
  for (const group of sources.logbook.competencies) {
    for (const entry of group.entries) {
      const home = entry.competency || group.competency;
      const key = `logbook:${home}:${entry.filename}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({
        key,
        kind: "logbook",
        on: entry.performed_on,
        title: sources.competencyName(home),
        status: null,
        href: `/passport/logbook/${enc(home)}/${enc(entry.filename)}`,
      });
    }
  }

  for (const entry of sources.cpd) {
    records.push({
      key: `cpd:${entry.year}:${entry.filename}`,
      kind: "cpd",
      on: entry.activity_on,
      title: entry.title,
      status: null,
      href: `/passport/cpd/${enc(String(entry.year))}/${enc(entry.filename)}`,
    });
  }

  for (const certificate of sources.certificates) {
    records.push({
      key: `certificate:${certificate.name}`,
      kind: "certificate",
      on: certificate.awarded_on,
      title: certificate.title,
      status: null,
      href: `/passport/certificates/${enc(certificate.name)}`,
    });
  }

  for (const reflection of sources.reflections) {
    records.push({
      key: `reflection:${reflection.name}`,
      kind: "reflection",
      on: reflection.written_on,
      title: reflection.title,
      status: null,
      href: `/passport/reflections/${enc(reflection.name)}`,
    });
  }

  return records.sort(
    (a, b) => b.on.localeCompare(a.on) || a.key.localeCompare(b.key),
  );
}
