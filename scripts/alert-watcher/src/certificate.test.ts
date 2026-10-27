// Tests for the client certificate reminder.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CertificateReminder, type Expiry, readExpiry, reminderText } from "./certificate.ts";

// A throwaway self-signed certificate, made for this test with openssl. Its
// key was deleted, and it signs nothing.
const FIXTURE = `-----BEGIN CERTIFICATE-----
MIIBnzCCAUWgAwIBAgIUVT1TNaj0mDIrXJ6pO/GnHBLsbZcwCgYIKoZIzj0EAwIw
JTEjMCEGA1UEAwwaYWxlcnQtd2F0Y2hlci10ZXN0LWZpeHR1cmUwHhcNMjYxMDI3
MTkxMTE4WhcNMzYxMDI0MTkxMTE4WjAlMSMwIQYDVQQDDBphbGVydC13YXRjaGVy
LXRlc3QtZml4dHVyZTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABPz5LEOmATZB
9GPZEjoXtxWR8rCnWsjJjTDbMW2gInd58wbO/50pDxGGJJdMQFzXIWleH4g15zQG
6bii0SNXcKijUzBRMB0GA1UdDgQWBBQMzxOp8x+RfTbrO+guTJH03UOY6jAfBgNV
HSMEGDAWgBQMzxOp8x+RfTbrO+guTJH03UOY6jAPBgNVHRMBAf8EBTADAQH/MAoG
CCqGSM49BAMCA0gAMEUCIQCX1AyDawOmaEdw9Ka/7B2FtBIUtVA27DXai0tPZzKi
MgIgIDQwQbtW7xWY+xZwCyaGtyQ1L2Ic/T5uptuRstqL4ZA=
-----END CERTIFICATE-----
`;

const PATH = "/home/watcher/.config/quill-alert-watcher/pki/watcher.crt";
const EXPIRES = new Date("2027-10-27T12:00:00Z");

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "alert-watcher-"));
}

function expiring(expires: Date): () => Expiry {
  return () => ({ readable: true, expires });
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("readExpiry", () => {
  it("reads the date a certificate runs out", () => {
    const path = join(temporaryDirectory(), "watcher.crt");
    writeFileSync(path, FIXTURE);

    assert.deepEqual(readExpiry(path), { readable: true, expires: new Date("2036-10-24T19:11:18Z") });
  });

  it("says a missing certificate is unreadable", () => {
    assert.deepEqual(readExpiry(join(temporaryDirectory(), "missing.crt")), { readable: false });
  });

  it("says a file that is not a certificate is unreadable", () => {
    const path = join(temporaryDirectory(), "watcher.crt");
    writeFileSync(path, "not a certificate");

    assert.deepEqual(readExpiry(path), { readable: false });
  });
});

describe("reminderText", () => {
  it("says nothing with more than 30 days left", () => {
    assert.equal(reminderText({ readable: true, expires: EXPIRES }, daysBefore(EXPIRES, 31), PATH), undefined);
  });

  it("gives the days left and the renewal command from 30 days before", () => {
    const text = reminderText({ readable: true, expires: EXPIRES }, daysBefore(EXPIRES, 30), PATH);

    assert.match(text ?? "", /runs out in 30 days, on 2027-10-27/);
    assert.match(text ?? "", /-extensions leaf_exts -out watcher\.crt/);
  });

  it("says one day, not one days", () => {
    const text = reminderText({ readable: true, expires: EXPIRES }, daysBefore(EXPIRES, 1), PATH);

    assert.match(text ?? "", /runs out in 1 day, on/);
  });

  it("says when the certificate has already run out", () => {
    const text = reminderText({ readable: true, expires: EXPIRES }, daysBefore(EXPIRES, -2), PATH);

    assert.match(text ?? "", /ran out on 2027-10-27, so investigations cannot read/);
  });

  it("names the path of a certificate it cannot read", () => {
    const text = reminderText({ readable: false }, EXPIRES, PATH);

    assert.match(text ?? "", /cannot read its client certificate at `\/home\/watcher\/\.config/);
  });
});

describe("CertificateReminder", () => {
  it("is due once inside the 30 days, then quiet for a week", () => {
    const state = join(temporaryDirectory(), "certificate-reminder.json");
    const reminder = new CertificateReminder(PATH, state, expiring(EXPIRES));
    const first = daysBefore(EXPIRES, 20);

    assert.notEqual(reminder.due(first), undefined);
    reminder.sent(first);

    assert.equal(reminder.due(daysBefore(EXPIRES, 14)), undefined);
    assert.notEqual(reminder.due(daysBefore(EXPIRES, 13)), undefined);
  });

  it("remembers the last reminder across a restart", () => {
    const state = join(temporaryDirectory(), "certificate-reminder.json");
    const now = daysBefore(EXPIRES, 10);

    new CertificateReminder(PATH, state, expiring(EXPIRES)).sent(now);

    assert.equal(new CertificateReminder(PATH, state, expiring(EXPIRES)).due(now), undefined);
  });

  it("is not due for a renewed certificate", () => {
    const state = join(temporaryDirectory(), "certificate-reminder.json");
    const renewed = new Date("2028-10-27T12:00:00Z");

    assert.equal(new CertificateReminder(PATH, state, expiring(renewed)).due(daysBefore(EXPIRES, 5)), undefined);
  });

  it("treats a damaged state file as no reminder sent", () => {
    const state = join(temporaryDirectory(), "certificate-reminder.json");
    writeFileSync(state, "{not json");

    assert.notEqual(new CertificateReminder(PATH, state, expiring(EXPIRES)).due(daysBefore(EXPIRES, 5)), undefined);
  });
});
