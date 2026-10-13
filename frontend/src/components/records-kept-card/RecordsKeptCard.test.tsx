/**
 * RecordsKeptCard Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import RecordsKeptCard from "./RecordsKeptCard";

describe("RecordsKeptCard", () => {
  it("shows the period that is set", () => {
    renderWithMantine(<RecordsKeptCard months={42} onEdit={vi.fn()} />);

    expect(screen.getByText("42 months")).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing is deleted without one/),
    ).toBeInTheDocument();
  });

  it("says one month, not one months", () => {
    renderWithMantine(<RecordsKeptCard months={1} onEdit={vi.fn()} />);

    expect(screen.getByText("1 month")).toBeInTheDocument();
  });

  it("says when no period is set, and what that means", () => {
    renderWithMantine(<RecordsKeptCard months={null} onEdit={vi.fn()} />);

    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText(/never listed for deletion/)).toBeInTheDocument();
  });

  it("opens the edit page from the pencil", async () => {
    const onEdit = vi.fn();
    renderWithMantine(<RecordsKeptCard months={42} onEdit={onEdit} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Edit record retention" }),
    );

    expect(onEdit).toHaveBeenCalledOnce();
  });
});
