/**
 * Tests for who a message is shown as from.
 */

import { describe, it, expect } from "vitest";
import { senderNames } from "./messaging";

describe("senderNames", () => {
  it("splits a name into the parts initials are drawn from", () => {
    expect(senderNames({ sender_display_name: "Sarah Jane Johnson" })).toEqual({
      senderName: "Sarah Jane Johnson",
      givenName: "Sarah",
      familyName: "Jane Johnson",
    });
  });

  it("gives a single name as the given name alone", () => {
    expect(senderNames({ sender_display_name: "sarah.johnson" })).toEqual({
      senderName: "sarah.johnson",
      givenName: "sarah.johnson",
      familyName: "",
    });
  });

  it("gives a deleted account its label and no initials", () => {
    expect(
      senderNames({
        sender_display_name: "Deleted account",
        sender_deleted: true,
      }),
    ).toEqual({
      senderName: "Deleted account",
      givenName: "",
      familyName: "",
    });
  });

  it("treats a missing flag as an ordinary sender", () => {
    expect(senderNames({ sender_display_name: "Mark Bailey" }).familyName).toBe(
      "Bailey",
    );
  });
});
