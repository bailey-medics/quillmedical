/**
 * Example Test - Verifying Test Infrastructure
 *
 * This test file demonstrates the test infrastructure setup and
 * verifies that all testing utilities work correctly.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  renderWithMantine,
  renderWithRouter,
  createMockResponse,
} from "./test-utils";

// Simple test component
function TestButton({ onClick }: { onClick?: () => void }) {
  return <button onClick={onClick}>Click me</button>;
}

// Component using Mantine
function MantineComponent() {
  return (
    <div>
      <h1>Test Component</h1>
      <p>This uses Mantine</p>
    </div>
  );
}

describe("Test Infrastructure", () => {
  describe("jest-dom matchers", () => {
    it("provides toBeInTheDocument matcher", () => {
      renderWithMantine(<TestButton />);
      expect(screen.getByText("Click me")).toBeInTheDocument();
    });

    it("provides toBeDisabled matcher", () => {
      renderWithMantine(<button disabled>Disabled</button>);
      expect(screen.getByText("Disabled")).toBeDisabled();
    });

    it("provides toHaveTextContent matcher", () => {
      renderWithMantine(<div>Hello World</div>);
      expect(screen.getByText("Hello World")).toHaveTextContent("Hello World");
    });
  });

  describe("renderWithMantine utility", () => {
    it("renders component with Mantine provider", () => {
      renderWithMantine(<MantineComponent />);
      expect(screen.getByText("Test Component")).toBeInTheDocument();
      expect(screen.getByText("This uses Mantine")).toBeInTheDocument();
    });
  });

  describe("renderWithRouter utility", () => {
    it("renders component with Router and Mantine", () => {
      renderWithRouter(<TestButton />);
      expect(screen.getByText("Click me")).toBeInTheDocument();
    });
  });

  describe("user-event integration", () => {
    it("handles user interactions", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      renderWithMantine(<TestButton onClick={handleClick} />);

      await user.click(screen.getByText("Click me"));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("createMockResponse utility", () => {
    it("creates successful response", () => {
      const response = createMockResponse({ data: "test" });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });

    it("creates error response", () => {
      const response = createMockResponse(
        { error: "Not found" },
        { status: 404, ok: false },
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    it("response can be parsed as JSON", async () => {
      const response = createMockResponse({ data: "test" });
      const json = await response.json();

      expect(json).toEqual({ data: "test" });
    });
  });
});
