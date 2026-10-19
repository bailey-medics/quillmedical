/**
 * The security.txt in public/ is served at /.well-known/security.txt.
 *
 * RFC 9116 makes two fields mandatory and treats a file whose Expires has
 * passed as absent, so these pin that the file stays valid: a lapsed
 * Expires fails the build a month before the date rather than leaving a
 * dead file at the address a researcher is told to look.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const FILE = path.join(
  __dirname,
  "..",
  "public",
  ".well-known",
  "security.txt",
);

const DAY = 24 * 60 * 60 * 1000;

function fields(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const lines = fs.readFileSync(FILE, "utf8").split("\n");

  for (const line of lines) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const colon = line.indexOf(":");
    const name = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    found.set(name, [...(found.get(name) ?? []), value]);
  }

  return found;
}

describe("security.txt", () => {
  it("names a contact", () => {
    const contact = fields().get("Contact");

    expect(contact).toBeDefined();
    expect(contact?.[0]).toMatch(/^mailto:[^@\s]+@quill-medical\.com$/);
  });

  it("expires once, in the future, and not within the next month", () => {
    const expires = fields().get("Expires");

    expect(expires).toHaveLength(1);
    const when = new Date(expires?.[0] ?? "");
    expect(Number.isNaN(when.getTime())).toBe(false);
    expect(when.getTime()).toBeGreaterThan(Date.now() + 30 * DAY);
  });

  it("points at its own address", () => {
    expect(fields().get("Canonical")).toEqual([
      "https://app.quill-medical.com/.well-known/security.txt",
    ]);
  });
});
