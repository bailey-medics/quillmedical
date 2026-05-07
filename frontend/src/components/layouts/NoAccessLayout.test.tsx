import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import NoAccessLayout from "./NoAccessLayout";

describe("NoAccessLayout Component", () => {
  describe("Basic rendering", () => {
    it("renders welcome heading", () => {
      renderWithMantine(<NoAccessLayout />);
      expect(screen.getByText("Welcome to Quill")).toBeInTheDocument();
    });

    it("displays no-access message", () => {
      renderWithMantine(<NoAccessLayout />);
      expect(
        screen.getByText(
          "Your account doesn't have access to this feature yet. Please contact your organisation administrator for assistance.",
        ),
      ).toBeInTheDocument();
    });

    it("uses heading level 2 for title", () => {
      renderWithMantine(<NoAccessLayout />);
      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toHaveTextContent("Welcome to Quill");
    });

    it("renders shield icon", () => {
      renderWithMantine(<NoAccessLayout />);
      const icon = document.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });
});
