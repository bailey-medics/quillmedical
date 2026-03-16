import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SolidSwitch from "./SolidSwitch";

describe("SolidSwitch", () => {
  describe("Rendering", () => {
    it("renders with a label", () => {
      renderWithMantine(<SolidSwitch label="Toggle me" />);
      expect(screen.getByText("Toggle me")).toBeInTheDocument();
    });

    it("renders with a description", () => {
      renderWithMantine(
        <SolidSwitch label="Feature" description="Enable this feature" />,
      );
      expect(screen.getByText("Enable this feature")).toBeInTheDocument();
    });

    it("renders unchecked by default", () => {
      renderWithMantine(<SolidSwitch label="Toggle" />);
      expect(screen.getByRole("switch")).not.toBeChecked();
    });

    it("renders checked when checked prop is true", () => {
      renderWithMantine(<SolidSwitch label="Toggle" checked readOnly />);
      expect(screen.getByRole("switch")).toBeChecked();
    });
  });

  describe("Solid thumb style", () => {
    it("applies the solid thumb class to remove inner ring", () => {
      const { container } = renderWithMantine(<SolidSwitch label="Toggle" />);
      const thumb = container.querySelector("[class*='thumb']");
      expect(thumb).toBeInTheDocument();
    });

    it("preserves custom classNames alongside solid thumb", () => {
      const { container } = renderWithMantine(
        <SolidSwitch label="Toggle" classNames={{ root: "custom-root" }} />,
      );
      const root = container.querySelector(".custom-root");
      expect(root).toBeInTheDocument();
    });
  });

  describe("Interaction", () => {
    it("calls onChange when clicked", async () => {
      const user = userEvent.setup();
      let checked = false;
      renderWithMantine(
        <SolidSwitch
          label="Toggle"
          checked={checked}
          onChange={(e) => {
            checked = e.currentTarget.checked;
          }}
        />,
      );
      await user.click(screen.getByRole("switch"));
      expect(checked).toBe(true);
    });

    it("does not fire onChange when disabled", async () => {
      const user = userEvent.setup();
      let changed = false;
      renderWithMantine(
        <SolidSwitch
          label="Toggle"
          disabled
          onChange={() => {
            changed = true;
          }}
        />,
      );
      await user.click(screen.getByRole("switch"));
      expect(changed).toBe(false);
    });
  });

  describe("Size variants", () => {
    it.each(["xs", "sm", "md", "lg", "xl"] as const)(
      "renders with %s size",
      (size) => {
        renderWithMantine(<SolidSwitch label="Toggle" size={size} />);
        expect(screen.getByRole("switch")).toBeInTheDocument();
      },
    );
  });
});
