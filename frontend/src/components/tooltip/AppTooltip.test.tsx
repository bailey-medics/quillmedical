import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import AppTooltip from "./AppTooltip";

describe("AppTooltip", () => {
  it("renders children", () => {
    renderWithMantine(
      <AppTooltip label="Hello">
        <button>Target</button>
      </AppTooltip>,
    );
    expect(screen.getByRole("button", { name: "Target" })).toBeInTheDocument();
  });

  it("shows tooltip on hover", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <AppTooltip label="Dr Smith" openDelay={0}>
        <button>Hover me</button>
      </AppTooltip>,
    );

    await user.hover(screen.getByRole("button", { name: "Hover me" }));
    expect(await screen.findByText("Dr Smith")).toBeInTheDocument();
  });

  it("hides tooltip when not hovering", () => {
    renderWithMantine(
      <AppTooltip label="Hidden text">
        <button>Target</button>
      </AppTooltip>,
    );
    expect(screen.queryByText("Hidden text")).not.toBeInTheDocument();
  });
});
