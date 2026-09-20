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

  it("removes border when bg is set", () => {
    renderWithMantine(
      <BaseCard data-testid="bg-card" bg="var(--success-color)">
        Content
      </BaseCard>,
    );
    const card = screen.getByTestId("bg-card");
    expect(card).not.toHaveStyle({
      borderColor: "var(--mantine-color-gray-2)",
    });
  });

  it("defaults to white text on a coloured background", () => {
    renderWithMantine(
      <BaseCard data-testid="bg-card" bg="var(--success-color)">
        Content
      </BaseCard>,
    );
    expect(screen.getByTestId("bg-card")).toHaveStyle({
      color: "var(--mantine-color-white)",
    });
  });

  it("lets an explicit text colour override that default", () => {
    // White was forced on any coloured card, which made a pale
    // background unreadable — the text vanished into it. The default
    // stays for saturated fills; a caller that knows better wins.
    renderWithMantine(
      <BaseCard
        data-testid="bg-card"
        bg="var(--update-color)"
        c="var(--status-text-dark)"
      >
        Content
      </BaseCard>,
    );
    expect(screen.getByTestId("bg-card")).toHaveStyle({
      color: "var(--status-text-dark)",
    });
  });
});
