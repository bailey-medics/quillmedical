/**
 * SignOffRow Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SignOffRow from "./SignOffRow";
import { declined, requested, signedOff } from "./fixtures";

describe("SignOffRow", () => {
  it("names the competency and the status", () => {
    renderWithMantine(<SignOffRow signOff={signedOff} />);
    expect(screen.getByText("Perform bronchoscopy")).toBeInTheDocument();
    expect(screen.getByText("Signed off")).toBeInTheDocument();
  });

  it("shows the level signed, who signed it and the review date", () => {
    renderWithMantine(<SignOffRow signOff={signedOff} />);
    expect(screen.getByText("Can perform independently")).toBeInTheDocument();
    expect(
      screen.getByText(/Signed off by Dr Amara Okonkwo/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Review due/)).toBeInTheDocument();
  });

  it("says what was asked for while it is awaiting the assessor", () => {
    renderWithMantine(
      <SignOffRow
        signOff={{
          ...requested,
          requested_level: { id: "supervised", name: "Under supervision" },
        }}
      />,
    );
    expect(
      screen.getByText("Asked for: Under supervision"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Signed off by/)).not.toBeInTheDocument();
  });

  it("says what was asked for where the assessor signed a different level", () => {
    renderWithMantine(
      <SignOffRow
        signOff={{
          ...signedOff,
          requested_level: { id: "teach", name: "Can teach others" },
        }}
      />,
    );
    expect(
      screen.getByText("You asked for: Can teach others"),
    ).toBeInTheDocument();
  });

  it("says nothing extra where the level signed is the one asked for", () => {
    renderWithMantine(
      <SignOffRow
        signOff={{ ...signedOff, requested_level: signedOff.level }}
      />,
    );
    expect(screen.queryByText(/asked for/i)).not.toBeInTheDocument();
  });

  it("shows a declined sign-off as declined", () => {
    renderWithMantine(<SignOffRow signOff={declined} />);
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  it("is inert without onSelect", () => {
    renderWithMantine(<SignOffRow signOff={signedOff} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reports its name when chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(<SignOffRow signOff={signedOff} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Perform bronchoscopy" }),
    );

    expect(onSelect).toHaveBeenCalledWith(signedOff.name);
  });
});
