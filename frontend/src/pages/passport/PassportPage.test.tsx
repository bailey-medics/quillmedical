/**
 * Passport Page Tests
 *
 * The page is a thin composition, so these cover what only the page can
 * get wrong: the fetch, the loading state, and the error path.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportPage } from "./PassportPage";
import { competencies } from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
}));

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies,
};

describe("PassportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the holder's competencies once loaded", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();
  });

  it("shows the page heading before the fetch resolves", () => {
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportPage />);

    expect(screen.getByText("My passport")).toBeInTheDocument();
  });

  it("explains a failed load rather than rendering an empty passport", async () => {
    // An empty passport and an unreachable one look identical without
    // this, and they mean very different things to a holder.
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
  });

  it("does not render the competency list when the load failed", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Your passport could not be loaded/),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Perform bronchoscopy")).not.toBeInTheDocument();
  });
});
