/**
 * disabled-controls.css gives every disabled Mantine control the ordinary
 * pointer, in place of Mantine's "not allowed" sign. It selects by
 * Mantine's static `mantine-…` class names and by state, and jsdom does
 * not load the stylesheet, so these tests guard the other half: that the
 * controls the rule is meant to reach still carry a class and a state it
 * selects, and that the app's own components no longer ask for the sign
 * themselves. What the pointer actually is was checked in a real browser
 * against the running app when the rule was written.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
// eslint-disable-next-line no-restricted-imports -- the bare Mantine control is what the rule selects
import { ActionIcon } from "@mantine/core";
import { renderWithMantine } from "@test/test-utils";
import ActionCardButton from "@/components/button/ActionCardButton";
import AddButton from "@/components/button/AddButton";
import CheckboxField from "@/components/form/CheckboxField";
import SolidSwitch from "@/components/form/SolidSwitch";
import TextField from "@/components/form/TextField";
import ButtonPair from "@/components/button/ButtonPair";
import ButtonPairRed from "@/components/button/ButtonPairRed";
import IconTextButton from "@/components/button/IconTextButton";
import PreviousNextButton from "@/components/button/PreviousNextButton";
import PublicButton from "@/components/button/PublicButton";

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

describe("disabled-controls.css reaches the other controls", () => {
  it("a disabled checkbox", () => {
    renderWithMantine(<CheckboxField label="Agree" disabled />);

    const input = screen.getByRole("checkbox", { name: "Agree" });
    expect(input.className).toMatch(/mantine-/);
    expect(input).toBeDisabled();
  });

  it("a disabled switch", () => {
    renderWithMantine(<SolidSwitch aria-label="Notify me" disabled />);

    const input = screen.getByRole("switch", { name: "Notify me" });
    expect(input.className).toMatch(/mantine-/);
    expect(input).toBeDisabled();
  });

  it("a disabled text field", () => {
    renderWithMantine(<TextField label="Name" disabled />);

    const input = screen.getByLabelText("Name");
    expect(input.className).toMatch(/mantine-/);
    expect(input).toBeDisabled();
  });
});

describe("the app's own buttons keep the ordinary pointer when disabled", () => {
  // Each of these styles its own disabled state, so each could bring the
  // "no entry" sign back by itself. One case apiece.
  it("IconTextButton", () => {
    renderWithMantine(
      <IconTextButton icon="refresh" label="Sync all" disabled />,
    );

    expect(screen.getByRole("button", { name: "Sync all" }).style.cursor).toBe(
      "default",
    );
  });

  it("AddButton", () => {
    renderWithMantine(
      <AddButton label="Add user" onClick={vi.fn()} disabled />,
    );

    expect(screen.getByRole("button", { name: "Add user" }).style.cursor).toBe(
      "default",
    );
  });

  it("PublicButton", () => {
    renderWithMantine(
      <PublicButton onClick={vi.fn()} disabled>
        Send
      </PublicButton>,
    );

    expect(screen.getByRole("button", { name: "Send" }).style.cursor).toBe(
      "default",
    );
  });

  it("ButtonPair", () => {
    renderWithMantine(
      <ButtonPair onAccept={vi.fn()} onCancel={vi.fn()} acceptDisabled />,
    );

    const disabled = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-disabled") === "true");
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach((button) => expect(button.style.cursor).toBe("default"));
  });

  it("ButtonPairRed", () => {
    renderWithMantine(
      <ButtonPairRed onAccept={vi.fn()} onCancel={vi.fn()} acceptDisabled />,
    );

    const disabled = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-disabled") === "true");
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach((button) => expect(button.style.cursor).toBe("default"));
  });

  it("PreviousNextButton", () => {
    renderWithMantine(
      <PreviousNextButton onPrevious={vi.fn()} onNext={vi.fn()} nextDisabled />,
    );

    const disabled = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-disabled") === "true");
    expect(disabled.length).toBeGreaterThan(0);
    disabled.forEach((button) => expect(button.style.cursor).toBe("default"));
  });
});
