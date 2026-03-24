import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import PageHeader from "./PageHeader";

describe("PageHeader", () => {
  it("renders title", () => {
    renderWithMantine(<PageHeader title="Test Page" />);
    expect(screen.getByText("Test Page")).toBeInTheDocument();
  });

  it("renders as an h1 element", () => {
    renderWithMantine(<PageHeader title="Test" />);
    expect(screen.getByText("Test").tagName).toBe("H1");
  });
});
