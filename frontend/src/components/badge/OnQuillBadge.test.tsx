/**
 * OnQuillBadge Component Tests
 *
 * Tests for the OnQuillBadge component covering:
 * - Rendering badge text
 * - Different size variants
 * - Loading skeleton state
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import OnQuillBadge from "./OnQuillBadge";

describe("OnQuillBadge", () => {
  it("renders 'on Quill' text", () => {
    renderWithMantine(<OnQuillBadge />);
    expect(screen.getByText("on Quill")).toBeInTheDocument();
  });

  it("renders with default lg size", () => {
    renderWithMantine(<OnQuillBadge />);
    expect(screen.getByText("on Quill")).toBeInTheDocument();
  });

  it("renders with sm size", () => {
    renderWithMantine(<OnQuillBadge size="sm" />);
    expect(screen.getByText("on Quill")).toBeInTheDocument();
  });

  it("renders with xl size", () => {
    renderWithMantine(<OnQuillBadge size="xl" />);
    expect(screen.getByText("on Quill")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(<OnQuillBadge isLoading />);
    expect(screen.queryByText("on Quill")).not.toBeInTheDocument();
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
  });
});
