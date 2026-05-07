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

    it("displays no-access state message", () => {
      renderWithMantine(<NoAccessLayout />);
      expect(screen.getByText("No access yet")).toBeInTheDocument();
    });

    it("displays guidance to contact administrator", () => {
      renderWithMantine(<NoAccessLayout />);
      expect(
        screen.getByText(
          "Your account doesn't have access to this feature yet. Please contact your administrator or email info@quill-medical.com for assistance.",
        ),
      ).toBeInTheDocument();
    });

    it("uses heading level 1 for page header", () => {
      renderWithMantine(<NoAccessLayout />);
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Welcome to Quill");
    });
  });
});
