/**
 * RegistrationBadge Component Tests
 *
 * Quill checks no register, so the badge must never read as confirmation.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import RegistrationBadge from "./RegistrationBadge";
import { declaredRegistration } from "./fixtures";

describe("RegistrationBadge", () => {
  it("renders the body and number", () => {
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );
    expect(screen.getByText("GMC 1234567")).toBeInTheDocument();
  });

  it("says 'Declared'", () => {
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );
    expect(screen.getByText("Declared")).toBeInTheDocument();
  });

  it("never claims verification", () => {
    // The false-certainty case: a reader must be able to tell that Quill
    // checked nothing.
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it("tells the reader where to check it", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );

    await user.hover(screen.getByTestId("registration-badge"));

    expect(
      await screen.findByText(
        "As declared. Quill does not check the GMC register, so look it up there before relying on it.",
      ),
    ).toBeInTheDocument();
  });
});
