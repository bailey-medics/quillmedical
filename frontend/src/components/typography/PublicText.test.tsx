import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PublicText from "./PublicText";

describe("PublicText", () => {
  describe("Basic rendering", () => {
    it("renders children", () => {
      renderWithMantine(<PublicText>Hello world</PublicText>);
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("renders as a paragraph element", () => {
      renderWithMantine(<PublicText>Paragraph</PublicText>);
      expect(screen.getByText("Paragraph").tagName).toBe("P");
    });
  });

  describe("Size variants", () => {
    it("renders with default md size", () => {
      renderWithMantine(<PublicText>Medium</PublicText>);
      expect(screen.getByText("Medium")).toBeInTheDocument();
    });

    it("renders with sm size", () => {
      renderWithMantine(<PublicText size="sm">Small</PublicText>);
      expect(screen.getByText("Small")).toBeInTheDocument();
    });

    it("renders with lg size", () => {
      renderWithMantine(<PublicText size="lg">Large</PublicText>);
      expect(screen.getByText("Large")).toBeInTheDocument();
    });
  });

  describe("Dimmed variant", () => {
    it("renders dimmed text", () => {
      renderWithMantine(<PublicText dimmed>Dimmed text</PublicText>);
      expect(screen.getByText("Dimmed text")).toBeInTheDocument();
    });
  });

  describe("Alignment", () => {
    it("defaults to center alignment", () => {
      renderWithMantine(<PublicText>Centred</PublicText>);
      expect(screen.getByText("Centred")).toBeInTheDocument();
    });

    it("supports left alignment", () => {
      renderWithMantine(<PublicText ta="left">Left</PublicText>);
      expect(screen.getByText("Left")).toBeInTheDocument();
    });

    it("supports right alignment", () => {
      renderWithMantine(<PublicText ta="right">Right</PublicText>);
      expect(screen.getByText("Right")).toBeInTheDocument();
    });
  });
});
