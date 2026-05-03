/**
 * HeaderText Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import Heading from "./HeaderText";

describe("HeaderText", () => {
  it("renders children", () => {
    renderWithMantine(<Heading>Hello world</Heading>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders as an h2 element", () => {
    renderWithMantine(<Heading>Heading</Heading>);
    expect(screen.getByText("Heading").tagName).toBe("H2");
  });
});
