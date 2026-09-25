import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import LoadingSpinner from "./LoadingSpinner";

describe("LoadingSpinner", () => {
  it("tells screen readers it is loading", () => {
    renderWithMantine(<LoadingSpinner />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("can say what is loading", () => {
    renderWithMantine(<LoadingSpinner label="Loading messages" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading messages");
  });

  it("hides the spinner graphic itself from assistive technology", () => {
    const { container } = renderWithMantine(<LoadingSpinner />);
    expect(container.querySelector(".mantine-Loader-root")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
