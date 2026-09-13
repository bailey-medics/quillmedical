/**
 * RegistrationBadge Component Tests
 *
 * The verified/declared distinction is the whole point of the component,
 * so most of these guard it.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import RegistrationBadge from "./RegistrationBadge";
import { declaredRegistration, verifiedRegistration } from "./fixtures";

describe("RegistrationBadge", () => {
  it("renders the body and number", () => {
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );
    expect(screen.getByText("GMC 1234567")).toBeInTheDocument();
  });

  it("says 'Declared' when nobody has checked the register", () => {
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );
    expect(screen.getByText("Declared")).toBeInTheDocument();
  });

  it("says 'Verified' once an admin has checked by hand", () => {
    renderWithMantine(
      <RegistrationBadge registration={verifiedRegistration} />,
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("never claims verification for a declared registration", () => {
    // The false-certainty case: a reader must be able to tell that Quill
    // checked nothing.
    renderWithMantine(
      <RegistrationBadge registration={declaredRegistration} />,
    );
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });

  it("does not label a verified registration as merely declared", () => {
    renderWithMantine(
      <RegistrationBadge registration={verifiedRegistration} />,
    );
    expect(screen.queryByText("Declared")).not.toBeInTheDocument();
  });
});
