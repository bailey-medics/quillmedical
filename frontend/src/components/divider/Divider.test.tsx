import { describe, it, expect } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import Divider from "./Divider";

describe("Divider", () => {
  it("renders a horizontal divider by default", () => {
    const { container } = renderWithMantine(<Divider />);
    const divider = container.querySelector('[role="separator"]');
    expect(divider).toBeInTheDocument();
  });

  it("renders with vertical orientation", () => {
    const { container } = renderWithMantine(<Divider orientation="vertical" />);
    const divider = container.querySelector('[role="separator"]');
    expect(divider).toBeInTheDocument();
    expect(divider).toHaveAttribute("data-orientation", "vertical");
  });

  it("renders a label when provided", () => {
    const { container } = renderWithMantine(
      <Divider label="Section" labelPosition="center" />,
    );
    expect(container).toHaveTextContent("Section");
  });

  it("renders without a label by default", () => {
    const { container } = renderWithMantine(<Divider />);
    const label = container.querySelector(".mantine-Divider-label");
    expect(label).not.toBeInTheDocument();
  });
});
