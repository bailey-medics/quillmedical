/**
 * ReflectionTable Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ReflectionTable from "./ReflectionTable";
import { reflections } from "./fixtures";

describe("ReflectionTable", () => {
  it("lists every reflection, newest first", () => {
    renderWithMantine(<ReflectionTable reflections={reflections} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Breaking bad news");
    expect(rows[1]).toHaveTextContent("Difficult airway");
  });

  it("shows titles and dates, never the writing", () => {
    renderWithMantine(<ReflectionTable reflections={reflections} />);
    expect(
      screen.queryByText(/what I would do differently/),
    ).not.toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderWithMantine(<ReflectionTable reflections={[]} />);
    expect(screen.getByText("No reflections written")).toBeInTheDocument();
  });

  it("reports the reflection chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <ReflectionTable reflections={reflections} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByText("Difficult airway"));

    expect(onSelect).toHaveBeenCalledWith(reflections[0]);
  });
});
