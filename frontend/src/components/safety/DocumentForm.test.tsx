/**
 * DocumentForm Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import DocumentForm from "./DocumentForm";

describe("DocumentForm", () => {
  it("starts from the markdown given, placeholders untouched", () => {
    renderWithMantine(
      <DocumentForm
        initial="Hello {{ product_name }}"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Document/)).toHaveValue(
      "Hello {{ product_name }}",
    );
  });

  it("saves what was typed", async () => {
    const onSave = vi.fn();
    renderWithMantine(
      <DocumentForm initial="Old" onSave={onSave} onCancel={vi.fn()} />,
    );
    const field = screen.getByLabelText(/Document/);
    await userEvent.clear(field);
    await userEvent.type(field, "New text");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith("New text");
  });

  it("will not save an empty document, and cancels without saving", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    renderWithMantine(
      <DocumentForm initial="Old" onSave={onSave} onCancel={onCancel} />,
    );
    await userEvent.clear(screen.getByLabelText(/Document/));
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
