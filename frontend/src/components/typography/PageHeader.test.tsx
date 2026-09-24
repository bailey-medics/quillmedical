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

  it("can keep the h1 for screen readers without showing it", () => {
    renderWithMantine(<PageHeader title="Patient record" visuallyHidden />);
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Patient record",
    });
    expect(heading.closest(".mantine-VisuallyHidden-root")).not.toBeNull();
  });
});
