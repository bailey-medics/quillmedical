/**
 * touch-targets.css sizes controls through Mantine's static class names,
 * such as `.mantine-CloseButton-root`. jsdom cannot apply its media query
 * or measure a size, so these tests guard the other half: that the
 * controls the rule is meant to reach still carry the class it selects.
 * If Mantine renamed a class, or a modal stopped using CloseButton, the
 * rule would silently match nothing and these would fail.
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Modal } from "@mantine/core";
import { renderWithMantine } from "@test/test-utils";
import FormStatus from "@/components/form/Form/FormStatus";

describe("touch-targets.css selectors", () => {
  it("reaches the modal close button", () => {
    renderWithMantine(
      <Modal opened onClose={vi.fn()} title="Example">
        Body
      </Modal>,
    );
    const close = screen.getByRole("button", { name: "Close dialog" });
    expect(close).toHaveClass("mantine-CloseButton-root");
  });

  it("reaches the FormStatus dismiss button", () => {
    renderWithMantine(
      <FormStatus variant="success" title="Saved" onDismiss={vi.fn()} />,
    );
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(dismiss).toHaveClass("mantine-CloseButton-root");
  });
});
