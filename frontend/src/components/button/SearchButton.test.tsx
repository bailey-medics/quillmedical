import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SearchButton from "./SearchButton";

describe("SearchButton", () => {
  it("renders with accessible label", () => {
    renderWithMantine(<SearchButton onClick={() => {}} />);
    expect(
      screen.getByRole("button", { name: "Open search" }),
    ).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    renderWithMantine(<SearchButton onClick={handleClick} />);
    await user.click(screen.getByRole("button", { name: "Open search" }));
    expect(handleClick).toHaveBeenCalledOnce();
  });
});
