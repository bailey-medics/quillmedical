import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import NoAccessLayout from "./NoAccessLayout";

describe("NoAccessLayout Component", () => {
  describe("Basic rendering", () => {
    it("renders welcome heading", () => {
      renderWithMantine(<NoAccessLayout feature="teaching" />);
      expect(screen.getByText("Welcome to Quill")).toBeInTheDocument();
    });

    it("displays no-access state message", () => {
      renderWithMantine(<NoAccessLayout feature="teaching" />);
      expect(screen.getByText("No access")).toBeInTheDocument();
    });

    it("displays the feature name in the description", () => {
      renderWithMantine(<NoAccessLayout feature="teaching" />);
      expect(screen.getByText("teaching")).toBeInTheDocument();
    });

    it("displays guidance to contact administrator with email link", () => {
      renderWithMantine(<NoAccessLayout feature="teaching" />);
      const link = screen.getByRole("link", {
        name: "info@quill-medical.com",
      });
      expect(link).toHaveAttribute("href", "mailto:info@quill-medical.com");
    });

    it("uses heading level 1 for page header", () => {
      renderWithMantine(<NoAccessLayout feature="teaching" />);
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Welcome to Quill");
    });
  });
});
