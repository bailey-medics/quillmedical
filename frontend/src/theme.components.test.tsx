/**
 * Theme component defaults that carry accessibility, checked by rendering
 * the component with the app theme rather than by reading the config.
 */

import { Modal } from "@mantine/core";
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
});
