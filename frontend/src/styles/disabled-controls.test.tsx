/**
 * disabled-controls.css gives a disabled button the ordinary pointer, in
 * place of Mantine's "not allowed" sign. It selects Mantine's static class
 * names, and jsdom does not load the stylesheet, so these tests guard the
 * other half: that the buttons the rule is meant to reach still carry the
 * class and the state it selects, and that the app's own buttons no longer
 * ask for the sign themselves.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
// eslint-disable-next-line no-restricted-imports -- the bare Mantine control is what the rule selects
import { ActionIcon } from "@mantine/core";
import { renderWithMantine } from "@test/test-utils";
import ActionCardButton from "@/components/button/ActionCardButton";
import IconTextButton from "@/components/button/IconTextButton";

describe("disabled-controls.css selectors", () => {
  it("reaches a disabled action card button", () => {
    renderWithMantine(
      <ActionCardButton label="Sending…" onClick={vi.fn()} disabled />,
    );

    const button = screen.getByRole("button", { name: "Sending…" });
    expect(button).toHaveClass("mantine-Button-root");
    expect(button).toBeDisabled();
  });

  it("reaches a disabled icon button", () => {
    renderWithMantine(
      <ActionIcon aria-label="Refresh" disabled>
        R
      </ActionIcon>,
    );

    const button = screen.getByRole("button", { name: "Refresh" });
    expect(button).toHaveClass("mantine-ActionIcon-root");
    expect(button).toBeDisabled();
  });
});

describe("the app's own buttons", () => {
  it("keep the ordinary pointer when disabled", () => {
    renderWithMantine(
      <IconTextButton icon="refresh" label="Sync all" disabled />,
    );

    const button = screen.getByRole("button", { name: "Sync all" });
    expect(button.style.cursor).toBe("default");
  });
});
