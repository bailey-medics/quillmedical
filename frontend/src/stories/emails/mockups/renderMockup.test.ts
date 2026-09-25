import { describe, expect, it } from "vitest";
import { emailMockups, type EmailMockupName } from "./content";
import { renderMockup } from "./renderMockup";
import { emailThemes, type EmailThemeName } from "./themes";

const THEMES = Object.keys(emailThemes) as EmailThemeName[];
const EMAILS = Object.keys(emailMockups) as EmailMockupName[];

describe("renderMockup", () => {
  for (const theme of THEMES) {
    for (const email of EMAILS) {
      it(`fills every placeholder for ${email} in the ${theme} theme`, () => {
        const { html } = renderMockup(theme, email);

        expect(html).not.toMatch(/\{\{\w+\}\}/);
        expect(html).toContain('lang="en-GB"');
      });
    }
  }

  it("carries the theme's header colour and font", () => {
    const quill = renderMockup("quill", "passwordReset").html;
    const ldd = renderMockup("ldd", "passwordReset").html;

    expect(quill).toContain(emailThemes.quill.header);
    expect(quill).toContain("Atkinson Hyperlegible Next");
    expect(ldd).toContain("/email/ldd-logo.png");
    expect(ldd).toContain("Source Sans 3");
  });

  it("puts the preheader in a hidden block and the subject in the title", () => {
    const rendered = renderMockup("quill", "passportInvite");

    expect(rendered.html).toContain(`<title>${rendered.subject}</title>`);
    expect(rendered.html).toContain("display: none");
    expect(rendered.html).toContain(rendered.preheader);
  });

  it("leaves dark mode to the mail client unless forced", () => {
    const light = renderMockup("quill", "newsletter").html;
    const dark = renderMockup("quill", "newsletter", { dark: true }).html;

    expect(light).toContain("@media (prefers-color-scheme: dark)");
    expect(dark).not.toContain("@media (prefers-color-scheme: dark)");
    expect(dark).toContain("@media all");
  });

  it("sends the newsletter from Mark, and transactional mail from the brand", () => {
    expect(renderMockup("ldd", "newsletter").senderName).toBe(
      "Mark at Let's Do Digital",
    );
    expect(renderMockup("quill", "passwordReset").senderName).toBe(
      "Quill Medical",
    );
  });

  it("offers an unsubscribe link only in the newsletter", () => {
    expect(renderMockup("quill", "newsletter").html).toContain("Unsubscribe");
    expect(renderMockup("quill", "passwordReset").html).not.toContain(
      "Unsubscribe",
    );
  });
});
