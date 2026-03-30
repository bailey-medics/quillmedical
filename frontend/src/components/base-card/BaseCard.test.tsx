/**
 * BaseCard Component Tests
 *
 * Tests for the standardised card wrapper:
 * - Renders children
 * - Renders as a Mantine Card (section element)
 * - Forwards extra props
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import BaseCard from "./BaseCard";

describe("BaseCard", () => {
  it("renders children", () => {
    renderWithMantine(<BaseCard>Hello world</BaseCard>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders with fixed styling without error", () => {
    renderWithMantine(<BaseCard data-testid="default">Content</BaseCard>);
    expect(screen.getByTestId("default")).toBeInTheDocument();
  });

  it("forwards data-testid", () => {
    renderWithMantine(<BaseCard data-testid="my-card">Content</BaseCard>);
    expect(screen.getByTestId("my-card")).toBeInTheDocument();
  });

  it("forwards onClick handler", () => {
    let clicked = false;
    renderWithMantine(
      <BaseCard data-testid="clickable" onClick={() => (clicked = true)}>
        Content
      </BaseCard>,
    );
    screen.getByTestId("clickable").click();
    expect(clicked).toBe(true);
  });
});
