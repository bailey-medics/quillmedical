/**
 * CPD Date Ranges Page Tests
 *
 * The page's own job is the wiring: every add, correction and removal
 * saves the whole list, and a refusal from the server reaches the form.
 * `AppraisalPeriodForm` is replaced with a stand-in that submits a fixed
 * range, because choosing dates in a calendar is the form's test, not
 * this one's.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import type { AppraisalPeriod } from "@lib/passport";
import { Component as CpdDateRangesPage } from "./CpdDateRangesPage";

const fetchMyPassport = vi.fn();
const fetchAppraisalPeriods = vi.fn();
const saveAppraisalPeriods = vi.fn();

vi.mock("@lib/passport", async () => {
  const actual =
    await vi.importActual<typeof import("@lib/passport")>("@lib/passport");
  return {
    ...actual,
    fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
    fetchAppraisalPeriods: (...args: unknown[]) =>
      fetchAppraisalPeriods(...args),
    saveAppraisalPeriods: (...args: unknown[]) => saveAppraisalPeriods(...args),
  };
});

/** What the stand-in form submits: a new range, or the edited one moved. */
const NEW_RANGE = { starts_on: "2026-12-01", ends_on: "2027-11-30" };

vi.mock("@/components/passport/AppraisalPeriodForm", () => ({
  default: ({
    initial,
    onSubmit,
    error,
  }: {
    initial?: AppraisalPeriod;
    onSubmit: (period: AppraisalPeriod) => void;
    error?: string | null;
  }) => (
    <div>
      <span>{initial ? "Editing form" : "Adding form"}</span>
      {error && <span>{error}</span>}
      <button
        type="button"
        onClick={() =>
          onSubmit(initial ? { ...initial, ends_on: "2026-12-31" } : NEW_RANGE)
        }
      >
        Submit the form
      </button>
    </div>
  ),
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
  competencies: [],
};

const fullYear = { starts_on: "2025-08-01", ends_on: "2026-07-31" };
const shortRange = { starts_on: "2026-08-01", ends_on: "2026-11-30" };

async function openMenuItem(rowStart: string, item: string) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: `Actions for the date range from ${rowStart}`,
    }),
  );
  await user.click(await screen.findByText(item));
}

describe("CpdDateRangesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("says CPD is totalled June to June until a range is added", async () => {
    fetchAppraisalPeriods.mockResolvedValue([]);
    renderWithRouter(<CpdDateRangesPage />);

    expect(await screen.findByText("No date ranges yet")).toBeInTheDocument();
    expect(screen.getByText(/totalled June to June/)).toBeInTheDocument();
    expect(fetchAppraisalPeriods).toHaveBeenCalledWith("3f2a8c1e");
  });

  it("says nothing is here only once the list has arrived", async () => {
    fetchAppraisalPeriods.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<CpdDateRangesPage />);

    await waitFor(() => expect(fetchAppraisalPeriods).toHaveBeenCalled());
    expect(screen.queryByText("No date ranges yet")).not.toBeInTheDocument();
  });

  it("lists the ranges newest first", async () => {
    fetchAppraisalPeriods.mockResolvedValue([fullYear, shortRange]);
    renderWithRouter(<CpdDateRangesPage />);

    await screen.findByText("4 months");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("4 months");
    expect(rows[1]).toHaveTextContent("12 months");
  });

  it("adds a range by saving the whole list", async () => {
    const user = userEvent.setup();
    fetchAppraisalPeriods.mockResolvedValue([fullYear]);
    saveAppraisalPeriods.mockResolvedValue([fullYear, NEW_RANGE]);
    renderWithRouter(<CpdDateRangesPage />);

    await user.click(
      await screen.findByRole("button", { name: /Add a date range/ }),
    );
    await user.click(screen.getByRole("button", { name: "Submit the form" }));

    expect(saveAppraisalPeriods).toHaveBeenCalledWith("3f2a8c1e", [
      fullYear,
      NEW_RANGE,
    ]);
    await waitFor(() =>
      expect(screen.queryByText("Adding form")).not.toBeInTheDocument(),
    );
  });

  it("corrects a range in place of the old one", async () => {
    const user = userEvent.setup();
    fetchAppraisalPeriods.mockResolvedValue([fullYear, shortRange]);
    const corrected = { ...shortRange, ends_on: "2026-12-31" };
    saveAppraisalPeriods.mockResolvedValue([fullYear, corrected]);
    renderWithRouter(<CpdDateRangesPage />);

    await openMenuItem("1 August 2026", "Edit");
    expect(screen.getByText("Editing form")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit the form" }));

    expect(saveAppraisalPeriods).toHaveBeenCalledWith("3f2a8c1e", [
      fullYear,
      corrected,
    ]);
  });

  it("removes a range once confirmed", async () => {
    const user = userEvent.setup();
    fetchAppraisalPeriods.mockResolvedValue([fullYear, shortRange]);
    saveAppraisalPeriods.mockResolvedValue([fullYear]);
    renderWithRouter(<CpdDateRangesPage />);

    await openMenuItem("1 August 2026", "Remove");
    expect(saveAppraisalPeriods).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(saveAppraisalPeriods).toHaveBeenCalledWith("3f2a8c1e", [fullYear]),
    );
  });

  it("shows the server's refusal of an overlap in the form", async () => {
    const user = userEvent.setup();
    fetchAppraisalPeriods.mockResolvedValue([fullYear]);
    saveAppraisalPeriods.mockRejectedValue(
      new Error("The date range starting 2026-12-01 overlaps the one."),
    );
    renderWithRouter(<CpdDateRangesPage />);

    await user.click(
      await screen.findByRole("button", { name: /Add a date range/ }),
    );
    await user.click(screen.getByRole("button", { name: "Submit the form" }));

    expect(
      await screen.findByText(
        "The date range starting 2026-12-01 overlaps the one.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Adding form")).toBeInTheDocument();
  });

  it("offers nothing to change on a read-only passport", async () => {
    fetchMyPassport.mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    fetchAppraisalPeriods.mockResolvedValue([fullYear]);
    renderWithRouter(<CpdDateRangesPage />);

    await screen.findByText("12 months");
    expect(
      screen.getByRole("button", { name: /Add a date range/ }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchAppraisalPeriods.mockRejectedValue(new Error("network"));
    renderWithRouter(<CpdDateRangesPage />);

    expect(
      await screen.findByText(/Your date ranges could not be loaded/),
    ).toBeInTheDocument();
  });
});
