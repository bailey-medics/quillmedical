/**
 * SortHeader Component Tests
 *
 * Tests for the SortHeader component covering:
 * - Rendering the label text
 * - Showing correct icon for each sort state
 * - Click callback firing
 * - Accessibility label
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SortHeader from "./SortHeader";

describe("SortHeader", () => {
  it("renders the label text", () => {
    renderWithMantine(
      <SortHeader label="Name" direction={null} onClick={() => {}} />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    renderWithMantine(
      <SortHeader label="Status" direction={null} onClick={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Sort by Status" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithMantine(
      <SortHeader label="Name" direction={null} onClick={onClick} />,
    );
    await user.click(screen.getByRole("button", { name: "Sort by Name" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows unsorted icon when direction is null", () => {
    const { container } = renderWithMantine(
      <SortHeader label="Name" direction={null} onClick={() => {}} />,
    );
    expect(
      container.querySelector(".tabler-icon-arrows-sort"),
    ).toBeInTheDocument();
  });

  it("shows ascending icon when direction is asc", () => {
    const { container } = renderWithMantine(
      <SortHeader label="Name" direction="asc" onClick={() => {}} />,
    );
    expect(
      container.querySelector(".tabler-icon-arrow-up"),
    ).toBeInTheDocument();
  });

  it("shows descending icon when direction is desc", () => {
    const { container } = renderWithMantine(
      <SortHeader label="Name" direction="desc" onClick={() => {}} />,
    );
    expect(
      container.querySelector(".tabler-icon-arrow-down"),
    ).toBeInTheDocument();
  });
});
