import { describe, expect, it } from "vitest";
import { emailIds, renderedEmail } from "./renderedEmails";

describe("renderedEmail", () => {
  it("finds every committed render, in both themes", () => {
    expect(emailIds.length).toBeGreaterThan(0);
    for (const id of emailIds) {
      for (const theme of ["quill", "ldd"] as const) {
        const email = renderedEmail(id, theme);
        expect(email.html).toContain('lang="en-GB"');
        expect(email.subject).not.toBe("");
      }
    }
  });

  it("leaves dark mode to the mail client unless forced", () => {
    const light = renderedEmail("password-reset", "quill").html;
    const dark = renderedEmail("password-reset", "quill", true).html;

    expect(light).toContain("@media (prefers-color-scheme: dark)");
    expect(dark).not.toContain("@media (prefers-color-scheme: dark)");
    expect(dark).toContain("@media all");
  });

  it("carries the sender and reply-to of an email sent for a partner", () => {
    const certificate = renderedEmail("certificate", "quill");

    expect(certificate.fromName).toBe("EoEETA via Quill Medical");
    expect(certificate.replyTo).toBe("coordinator@eoeeta.example");
    expect(certificate.html).toContain("/email/partners/eoeeta-email.png");
  });

  it("refuses an id it has no render for", () => {
    expect(() => renderedEmail("no-such-email", "quill")).toThrow(
      /just email-preview/,
    );
  });
});
