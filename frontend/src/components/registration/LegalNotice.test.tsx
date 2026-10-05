import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { PRIVACY_POLICY_URL, TERMS_OF_SERVICE_URL } from "@lib/legal/links";
import LegalNotice from "./LegalNotice";

describe("LegalNotice", () => {
  it("says what creating an account means", () => {
    const { container } = renderWithMantine(<LegalNotice />);
    expect(container).toHaveTextContent(
      "By creating an account you agree to our terms of service (opens in a new tab) and have read our privacy policy (opens in a new tab).",
    );
  });

  it("links to the terms of service", () => {
    renderWithMantine(<LegalNotice />);
    expect(
      screen.getByRole("link", { name: /terms of service/ }),
    ).toHaveAttribute("href", TERMS_OF_SERVICE_URL);
  });

  it("links to the privacy policy", () => {
    renderWithMantine(<LegalNotice />);
    expect(
      screen.getByRole("link", { name: /privacy policy/ }),
    ).toHaveAttribute("href", PRIVACY_POLICY_URL);
  });

  it("asks for nothing: there is no box to tick", () => {
    renderWithMantine(<LegalNotice />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
