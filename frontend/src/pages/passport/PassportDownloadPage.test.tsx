/**
 * Passport Download Page Tests
 *
 * The page is a thin wrapper around `PassportExportButtons`, which has
 * its own tests. What only this page can get wrong is the fetch, and
 * whether it offers a download before there is anything to download.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportDownloadPage } from "./PassportDownloadPage";

const fetchMyPassport = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  exportMarkdown: vi.fn(),
  exportPdf: vi.fn(),
  exportBundle: vi.fn(),
}));

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    specialties: [],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies: [],
};

describe("PassportDownloadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers all three ways to take the record away", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportDownloadPage />);

    expect(
      await screen.findByRole("button", { name: /Markdown/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PDF/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Full bundle/ }),
    ).toBeInTheDocument();
  });

  it("shows the heading before the fetch resolves", () => {
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportDownloadPage />);

    expect(screen.getByText("Download")).toBeInTheDocument();
  });

  it("offers no download until there is a passport to export", () => {
    // A download button before the passport has loaded would hand
    // somebody an empty file and call it their record.
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportDownloadPage />);

    expect(
      screen.queryByRole("button", { name: /Full bundle/ }),
    ).not.toBeInTheDocument();
  });

  it("explains a failed load rather than showing nothing", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportDownloadPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
  });
});
