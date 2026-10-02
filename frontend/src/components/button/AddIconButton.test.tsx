/**
 * AddIconButton Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import AddIconButton from "./AddIconButton";

describe("AddIconButton", () => {
  it("is a button named by its label, with an icon and no text", () => {
    const { container } = renderWithMantine(
      <AddIconButton aria-label="Add hazard" />,
    );
    const button = screen.getByRole("button", { name: "Add hazard" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("");
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("reports a click", async () => {
    const onClick = vi.fn();
    renderWithMantine(
      <AddIconButton aria-label="Add hazard" onClick={onClick} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add hazard" }));
    expect(onClick).toHaveBeenCalled();
  });

  it("can be disabled", () => {
    renderWithMantine(<AddIconButton aria-label="Add hazard" disabled />);
    expect(screen.getByRole("button", { name: "Add hazard" })).toBeDisabled();
  });
});
