/**
 * Tests for registrationError.
 *
 * The cases differ in whose problem the failure is, and each test pins
 * one of them. The 502 matters most: the backend sends the verification
 * email before it commits, so a failed send means no account was
 * created, and the message has to say that rather than leave somebody
 * checking an email address that was never wrong.
 */

import { describe, expect, it } from "vitest";

import { registrationError } from "./registrationError";

/** An error shaped as `api.ts` throws one. */
function apiError(status: number, message = ""): Error {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

describe("registrationError", () => {
  describe("when the verification email could not be sent", () => {
    it("says no account was created", () => {
      const message = registrationError(apiError(502));

      expect(message.description).toMatch(/not been created/i);
    });

    it("does not blame the person's details", () => {
      const message = registrationError(apiError(502));

      expect(message.title).not.toMatch(/validation|invalid|check your/i);
    });

    it("names the email as the thing that failed", () => {
      const message = registrationError(apiError(502));

      expect(message.title).toMatch(/email/i);
    });
  });

  describe("when the address has been tried too often", () => {
    it("asks them to wait rather than to change anything", () => {
      const message = registrationError(apiError(429));

      expect(message.title).toMatch(/too many/i);
      expect(message.description).toMatch(/wait/i);
    });
  });

  describe("when the details were refused", () => {
    it("shows what the backend said, because it names the field", () => {
      const message = registrationError(
        apiError(400, "Username or email already in use"),
      );

      expect(message.title).toBe("Username or email already in use");
    });

    it("falls back to a general title when the backend said nothing", () => {
      const message = registrationError(apiError(400));

      expect(message.title).toMatch(/check your details/i);
    });
  });

  describe("when the request never arrived", () => {
    it("blames the connection, not the person", () => {
      const message = registrationError(new Error("Failed to fetch"));

      expect(message.title).toMatch(/could not reach/i);
      expect(message.description).toMatch(/connection/i);
    });

    it("still says no account was created", () => {
      const message = registrationError(new Error("No network connection"));

      expect(message.description).toMatch(/not been created/i);
    });
  });

  describe("when the server broke some other way", () => {
    it("says so without guessing", () => {
      const message = registrationError(apiError(500));

      expect(message.title).toMatch(/something went wrong/i);
      expect(message.description).toMatch(/not been created/i);
    });
  });

  describe("whatever is thrown", () => {
    it("never returns an empty title", () => {
      const thrown: unknown[] = [
        apiError(502),
        apiError(429),
        apiError(400, "taken"),
        apiError(500),
        new Error("Failed to fetch"),
        "a bare string",
        null,
        undefined,
        { nothing: "useful" },
      ];

      for (const error of thrown) {
        expect(registrationError(error).title.trim()).not.toBe("");
      }
    });

    it("never shows a raw object, which the old handler could", () => {
      const message = registrationError({ detail: "internal", code: 7 });

      expect(message.title).not.toMatch(/[{}]/);
    });
  });
});
