import { describe, expect, it } from "vitest";
import { fieldErrorMessage } from "./fieldErrors";

describe("fieldErrorMessage", () => {
  it("names the field and gives the server's words", () => {
    const detail = [
      {
        type: "string_too_long",
        loc: ["body", "email"],
        msg: "String should have at most 255 characters",
        input: "a".repeat(300),
      },
    ];

    expect(fieldErrorMessage(detail)).toBe(
      "Email: String should have at most 255 characters",
    );
  });

  it("writes a field's name as words", () => {
    const detail = [{ loc: ["body", "new_password"], msg: "Field required" }];

    expect(fieldErrorMessage(detail)).toBe("New password: Field required");
  });

  it("names the field itself where it is inside another", () => {
    const detail = [
      { loc: ["body", "practising", 0, "org_unit_id"], msg: "Field required" },
    ];

    expect(fieldErrorMessage(detail)).toBe("Org unit id: Field required");
  });

  it("shows the first of several", () => {
    const detail = [
      { loc: ["body", "username"], msg: "Field required" },
      { loc: ["body", "password"], msg: "Field required" },
    ];

    expect(fieldErrorMessage(detail)).toBe("Username: Field required");
  });

  it("drops what the server puts before a message of its own", () => {
    const detail = [
      {
        loc: ["body", "registration_authority"],
        msg: "Value error, That registering body is not one Quill recognises.",
      },
    ];

    expect(fieldErrorMessage(detail)).toBe(
      "Registration authority: That registering body is not one Quill recognises.",
    );
  });

  it("gives the message alone where no field is named", () => {
    const detail = [
      { loc: ["body"], msg: "Input should be a valid dictionary" },
    ];

    expect(fieldErrorMessage(detail)).toBe(
      "Input should be a valid dictionary",
    );
  });

  it("names a field in the address as well as one in the body", () => {
    const detail = [{ loc: ["query", "bank_id"], msg: "Field required" }];

    expect(fieldErrorMessage(detail)).toBe("Bank id: Field required");
  });

  it.each([
    ["a string", "Not found"],
    ["an object", { message: "No", error_code: "nope" }],
    ["nothing", undefined],
    ["null", null],
    ["an empty list", []],
    ["a list of something else", ["oops"]],
    ["an entry with no message", [{ loc: ["body", "email"] }]],
  ])("is null for %s, so the caller falls back", (_name, detail) => {
    expect(fieldErrorMessage(detail)).toBeNull();
  });

  it("never shows what was typed", () => {
    const detail = [
      {
        loc: ["body", "password"],
        msg: "String should have at most 128 characters",
        input: "the-password-somebody-typed",
      },
    ];

    expect(fieldErrorMessage(detail)).not.toContain("the-password");
  });
});
