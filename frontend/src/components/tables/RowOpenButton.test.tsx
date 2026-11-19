import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import RowOpenButton from "./RowOpenButton";

describe("RowOpenButton", () => {
  it("is a button named by the text it wraps", () => {
    renderWithMantine(
      <RowOpenButton onOpen={() => {}}>Jane Smith</RowOpenButton>,
    );

    expect(
      screen.getByRole("button", { name: "Jane Smith" }),
    ).toBeInTheDocument();
  });

  it("opens the row from the keyboard", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithMantine(
      <RowOpenButton onOpen={onOpen}>Jane Smith</RowOpenButton>,
    );

    await user.tab();
    await user.keyboard("{Enter}");

    expect(onOpen).toHaveBeenCalledOnce();
  });
});
