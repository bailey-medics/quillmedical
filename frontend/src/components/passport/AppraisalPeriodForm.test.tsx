/**
 * AppraisalPeriodForm Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import AppraisalPeriodForm from "./AppraisalPeriodForm";

function renderForm(
  props: Partial<React.ComponentProps<typeof AppraisalPeriodForm>> = {},
) {
  return renderWithMantine(
    <AppraisalPeriodForm onSubmit={vi.fn()} {...props} />,
  );
}

describe("AppraisalPeriodForm", () => {
  it("asks for a from and a to date", () => {
    renderForm();
    expect(screen.getByText("Add a date range")).toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
  });

  it("cannot be sent until both dates are in", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Add date range" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("sends the range it was given, as ISO dates", async () => {
    const onSubmit = vi.fn();
    renderForm({
      initial: { starts_on: "2025-10-01", ends_on: "2026-09-30" },
      onSubmit,
    });

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSubmit).toHaveBeenCalledWith({
      starts_on: "2025-10-01",
      ends_on: "2026-09-30",
    });
  });

  it("says it is editing when given a range", () => {
    renderForm({ initial: { starts_on: "2025-10-01", ends_on: "2026-09-30" } });
    expect(screen.getByText("Edit this date range")).toBeInTheDocument();
  });

  it("refuses an end before the start without sending it", async () => {
    const onSubmit = vi.fn();
    renderForm({
      initial: { starts_on: "2026-10-01", ends_on: "2026-09-30" },
      onSubmit,
    });

    expect(
      screen.getByText("A date range cannot end before it starts."),
    ).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Save changes" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the server's reason for refusing it", () => {
    renderForm({ error: "The date range starting 2026-06-01 overlaps." });
    expect(
      screen.getByText("The date range starting 2026-06-01 overlaps."),
    ).toBeInTheDocument();
  });

  it("reports backing out", async () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
