/**
 * Theme component defaults that carry accessibility, checked by rendering
 * the component with the app theme rather than by reading the config.
 */

import { Badge, Modal } from "@mantine/core";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithMantine } from "@test/test-utils";

describe("theme component defaults", () => {
  it("names every modal's close button", () => {
    renderWithMantine(
      <Modal opened onClose={() => {}} title="Send feedback">
        Body
      </Modal>,
    );

    expect(
      screen.getByRole("button", { name: "Close dialog" }),
    ).toBeInTheDocument();
  });

  it("never truncates a badge's text", () => {
    renderWithMantine(<Badge>Awaiting supervisor sign-off</Badge>);

    const label = screen.getByText("Awaiting supervisor sign-off");
    expect(label).toHaveClass("mantine-Badge-label");
    expect(label).toHaveStyle({
      whiteSpace: "nowrap",
      overflow: "visible",
      textOverflow: "clip",
    });

    // The pill keeps its full width however little room it is given.
    const root = label.closest(".mantine-Badge-root");
    expect(root).toHaveStyle({
      minWidth: "max-content",
      flexShrink: "0",
      overflow: "visible",
    });
  });
});
