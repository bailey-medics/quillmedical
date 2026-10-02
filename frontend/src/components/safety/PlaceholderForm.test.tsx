/**
 * PlaceholderForm Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PlaceholderForm from "./PlaceholderForm";
import { SAFETY_CASES } from "@lib/safety";

const placeholders = SAFETY_CASES[0].placeholders;

describe("PlaceholderForm", () => {
  it("shows one field per placeholder, labelled by key and prefilled", () => {
    renderWithMantine(
      <PlaceholderForm
        placeholders={placeholders}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/^product_name\b/)).toHaveValue(
      "MedScribe EPMA",
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(placeholders.length);
    expect(
      screen.getByText("Used in Clinical safety case report."),
    ).toBeInTheDocument();
  });

  it("saves every value, with the edit applied", async () => {
    const onSave = vi.fn();
    renderWithMantine(
      <PlaceholderForm
        placeholders={placeholders}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    const version = screen.getByLabelText(/^product_version\b/);
    await userEvent.clear(version);
    await userEvent.type(version, "4.3");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        product_name: "MedScribe EPMA",
        product_version: "4.3",
      }),
    );
  });

  it("will not save an empty value, and cancels without saving", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithMantine(
      <PlaceholderForm
        placeholders={placeholders}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/^supplier_name\b/));
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
