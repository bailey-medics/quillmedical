/**
 * OfficerEditModal Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import OfficerEditModal from "./OfficerEditModal";
import { SAFETY_CASES } from "@lib/safety";

const officer = SAFETY_CASES[0].officers[0];

describe("OfficerEditModal", () => {
  it("starts from the officer and shows the role read-only", () => {
    renderWithMantine(
      <OfficerEditModal officer={officer} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText(/Name/)).toHaveValue("Dr Hannah Okafor");
    expect(screen.getByLabelText(/Email/)).toHaveValue(
      "hannah.okafor@example.org",
    );
    expect(screen.getByText("Clinical safety officer")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Role/)).not.toBeInTheDocument();
  });

  it("saves the edited name and email with the role unchanged, then closes", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderWithMantine(
      <OfficerEditModal officer={officer} onClose={onClose} onSave={onSave} />,
    );
    const name = screen.getByLabelText(/Name/);
    await userEvent.clear(name);
    await userEvent.type(name, "Dr Hannah Okafor-Reid");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith({
      role: "Clinical safety officer",
      name: "Dr Hannah Okafor-Reid",
      email: "hannah.okafor@example.org",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("will not save an empty name or a malformed email", async () => {
    renderWithMantine(
      <OfficerEditModal officer={officer} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    // ButtonPair marks a blocked button with aria-disabled rather than
    // the attribute, so it stays focusable and announces why.
    const save = () => screen.getByRole("button", { name: "Save changes" });
    await userEvent.clear(screen.getByLabelText(/Name/));
    expect(save()).toHaveAttribute("aria-disabled", "true");
    await userEvent.type(screen.getByLabelText(/Name/), "Somebody");
    expect(save()).not.toHaveAttribute("aria-disabled", "true");
    const email = screen.getByLabelText(/Email/);
    await userEvent.clear(email);
    await userEvent.type(email, "not-an-email");
    expect(save()).toHaveAttribute("aria-disabled", "true");
  });

  it("renders nothing when no officer is being edited", () => {
    renderWithMantine(
      <OfficerEditModal officer={null} onClose={vi.fn()} onSave={vi.fn()} />,
    );
    expect(screen.queryByText("Edit officer")).not.toBeInTheDocument();
  });
});
