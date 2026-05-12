import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import OfflineModal from "./OfflineModal";

describe("OfflineModal Component", () => {
  describe("Rendering", () => {
    it("renders the heading when opened", () => {
      renderWithMantine(<OfflineModal opened={true} onClose={vi.fn()} />);
      expect(screen.getByText("You are offline")).toBeInTheDocument();
    });

    it("renders the description text", () => {
      renderWithMantine(<OfflineModal opened={true} onClose={vi.fn()} />);
      expect(
        screen.getByText(
          "Quill is offline. Your text is preserved in this form. Reconnect to save.",
        ),
      ).toBeInTheDocument();
    });

    it("renders the OK button", () => {
      renderWithMantine(<OfflineModal opened={true} onClose={vi.fn()} />);
      expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
    });

    it("renders the wifi-off icon", () => {
      const { container } = renderWithMantine(
        <OfflineModal opened={true} onClose={vi.fn()} />,
      );
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("does not render content when closed", () => {
      renderWithMantine(<OfflineModal opened={false} onClose={vi.fn()} />);
      expect(screen.queryByText("You are offline")).not.toBeInTheDocument();
    });
  });

  describe("Interaction", () => {
    it("calls onClose when OK button is clicked", async () => {
      const onClose = vi.fn();
      renderWithMantine(<OfflineModal opened={true} onClose={onClose} />);

      const button = screen.getByRole("button", { name: "OK" });
      await userEvent.click(button);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
