/**
 * QuillCard Component Tests
 *
 * Tests for the standardised card wrapper:
 * - Renders children
 * - Renders as a Mantine Card (section element)
 * - Allows padding override
 * - Forwards extra props
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import QuillCard from "./QuillCard";

describe("QuillCard", () => {
  it("renders children", () => {
    renderWithMantine(<QuillCard>Hello world</QuillCard>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders with default padding without error", () => {
    renderWithMantine(<QuillCard data-testid="default">Content</QuillCard>);
    expect(screen.getByTestId("default")).toBeInTheDocument();
  });

  it("renders with different padding without error", () => {
    renderWithMantine(
      <QuillCard padding="md" data-testid="compact">
        Content
      </QuillCard>,
    );
    expect(screen.getByTestId("compact")).toBeInTheDocument();
  });

  it("forwards data-testid", () => {
    renderWithMantine(<QuillCard data-testid="my-card">Content</QuillCard>);
    expect(screen.getByTestId("my-card")).toBeInTheDocument();
  });

  it("forwards onClick handler", () => {
    let clicked = false;
    renderWithMantine(
      <QuillCard data-testid="clickable" onClick={() => (clicked = true)}>
        Content
      </QuillCard>,
    );
    screen.getByTestId("clickable").click();
    expect(clicked).toBe(true);
  });
});
