/**
 * HeaderText Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import HeaderText from "./HeaderText";

describe("HeaderText", () => {
  it("renders children", () => {
    renderWithMantine(<HeaderText>Hello world</HeaderText>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders as an h2 element", () => {
    renderWithMantine(<HeaderText>Heading</HeaderText>);
    expect(screen.getByText("Heading").tagName).toBe("H2");
  });
});
