/**
 * Gender Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import Gender from "./Gender";

describe("Gender Component", () => {
  describe("Full format", () => {
    it("renders male gender", () => {
      renderWithMantine(<Gender gender="male" />);
      expect(screen.getByText("Male")).toBeInTheDocument();
    });

    it("renders female gender", () => {
      renderWithMantine(<Gender gender="female" />);
      expect(screen.getByText("Female")).toBeInTheDocument();
    });

    it("renders unspecified for unknown value", () => {
      renderWithMantine(<Gender gender="unspecified" />);
      expect(screen.getByText("Unspecified")).toBeInTheDocument();
    });

    it("renders unspecified for null", () => {
      renderWithMantine(<Gender gender={null} />);
      expect(screen.getByText("Unspecified")).toBeInTheDocument();
    });

    it("renders unspecified for undefined", () => {
      renderWithMantine(<Gender gender={undefined} />);
      expect(screen.getByText("Unspecified")).toBeInTheDocument();
    });

    it("renders unspecified for empty string", () => {
      renderWithMantine(<Gender gender="" />);
      expect(screen.getByText("Unspecified")).toBeInTheDocument();
    });
  });

  describe("Abbreviated format", () => {
    it("renders M for male", () => {
      renderWithMantine(<Gender gender="male" format="abbreviated" />);
      expect(screen.getByText("M")).toBeInTheDocument();
    });

    it("renders F for female", () => {
      renderWithMantine(<Gender gender="female" format="abbreviated" />);
      expect(screen.getByText("F")).toBeInTheDocument();
    });

    it("renders Unspecified for unspecified (not abbreviated)", () => {
      renderWithMantine(<Gender gender="unspecified" format="abbreviated" />);
      expect(screen.getByText("Unspecified")).toBeInTheDocument();
    });

    it("renders Unspecified for null (not abbreviated)", () => {
      renderWithMantine(<Gender gender={null} format="abbreviated" />);
      expect(screen.getByText("Unspecified")).toBeInTheDocument();
    });
  });

  describe("Case insensitivity", () => {
    it("handles uppercase MALE", () => {
      renderWithMantine(<Gender gender="MALE" />);
      expect(screen.getByText("Male")).toBeInTheDocument();
    });

    it("handles mixed case FeMaLe", () => {
      renderWithMantine(<Gender gender="FeMaLe" />);
      expect(screen.getByText("Female")).toBeInTheDocument();
    });

    it("handles uppercase in abbreviated format", () => {
      renderWithMantine(<Gender gender="MALE" format="abbreviated" />);
      expect(screen.getByText("M")).toBeInTheDocument();
    });
  });

  describe("Text props", () => {
    it("accepts and applies Mantine Text props", () => {
      const { container } = renderWithMantine(
        <Gender gender="male" size="xl" fw={700} c="blue" />,
      );
      const text = container.querySelector("p");
      expect(text).toBeInTheDocument();
    });

    it("renders as span when span prop is true", () => {
      const { container } = renderWithMantine(<Gender gender="male" span />);
      const span = container.querySelector("span");
      expect(span).toBeInTheDocument();
      expect(span).toHaveTextContent("Male");
    });
  });
});
