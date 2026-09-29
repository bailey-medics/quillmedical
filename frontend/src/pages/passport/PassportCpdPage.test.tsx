/**
 * Passport CPD Page Tests
 *
 * Today is fixed at 29 September 2026, so which range the page opens on
 * does not depend on when the suite runs. Only `Date` is faked; timers
 * stay real for the user events.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportCpdPage } from "./PassportCpdPage";
import { cpdEntries } from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();
const fetchAllCpd = vi.fn();
const fetchAppraisalPeriods = vi.fn();
const addCpdEntry = vi.fn();

vi.mock("@lib/passport", async () => {
  const actual =
    await vi.importActual<typeof import("@lib/passport")>("@lib/passport");
  return {
    ...actual,
    fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
    fetchAllCpd: (...args: unknown[]) => fetchAllCpd(...args),
    fetchAppraisalPeriods: (...args: unknown[]) =>
      fetchAppraisalPeriods(...args),
    addCpdEntry: (...args: unknown[]) => addCpdEntry(...args),
  };
});

vi.mock("@/components/passport/CpdEntryForm", () => ({
  default: ({
    onSubmit,
  }: {
    onSubmit: (data: {
      activity_on: string;
      title: string;
      activity_type: string;
      points: number | null;
      notes: string | null;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSubmit({
          activity_on: "2024-03-01",
          title: "Old course",
          activity_type: "course",
          points: 2,
          notes: null,
        })
      }
    >
      Submit the activity
    </button>
  ),
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

/**
 * `cpdEntries` fall on 4 September 2025, 20 January, 11 February and 2
 * March 2026. This range holds the three from 2026 and not the first.
 */
const calendar2026 = { starts_on: "2026-01-01", ends_on: "2026-12-31" };
const octoberYear = { starts_on: "2024-10-01", ends_on: "2025-08-31" };

function dateRangeField() {
  return screen.getByRole("combobox", { name: "Date range" });
}

async function optionLabels(user: ReturnType<typeof userEvent.setup>) {
  await user.click(dateRangeField());
  const listbox = await screen.findByRole("listbox");
  return within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("PassportCpdPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T12:00:00"));
    fetchMyPassport.mockResolvedValue(detail);
    fetchAppraisalPeriods.mockResolvedValue([]);
    fetchAllCpd.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers a way to record an activity", async () => {
    renderWithRouter(<PassportCpdPage />);

    expect(
      await screen.findByRole("button", { name: "Add an activity" }),
    ).toBeInTheDocument();
  });

  it("asks for the passport, then its ranges and every activity", async () => {
    renderWithRouter(<PassportCpdPage />);

    await screen.findByText(/Nothing recorded for this period/);

    expect(fetchAppraisalPeriods).toHaveBeenCalledWith("3f2a8c1e");
    expect(fetchAllCpd).toHaveBeenCalledWith("3f2a8c1e");
  });

  describe("With no ranges set", () => {
    it("chooses from June to June years, labelled by month", async () => {
      const user = userEvent.setup();
      fetchAllCpd.mockResolvedValue(cpdEntries);
      renderWithRouter(<PassportCpdPage />);

      await screen.findByText(/by convention/);
      expect(dateRangeField()).toHaveValue("Jun 2026 – May 2027");
      const labels = await optionLabels(user);
      expect(labels[0]).toBe("Jun 2026 – May 2027");
      expect(labels[1]).toBe("Jun 2025 – May 2026");
    });

    it("totals the chosen June to June year", async () => {
      const user = userEvent.setup();
      fetchAllCpd.mockResolvedValue(cpdEntries);
      renderWithRouter(<PassportCpdPage />);

      await screen.findByText(/by convention/);
      await user.click(dateRangeField());
      await user.click(
        await screen.findByRole("option", {
          name: "Jun 2025 – May 2026",
        }),
      );

      // All four fall between June 2025 and May 2026.
      expect(await screen.findByText("11.5 points")).toBeInTheDocument();
      expect(screen.getByText("Regional study day")).toBeInTheDocument();
    });
  });

  describe("With ranges set", () => {
    it("labels the field Date range and lists them newest first", async () => {
      const user = userEvent.setup();
      fetchAppraisalPeriods.mockResolvedValue([octoberYear, calendar2026]);
      renderWithRouter(<PassportCpdPage />);

      await waitFor(() =>
        expect(dateRangeField()).toHaveValue("Jan 2026 – Dec 2026"),
      );
      expect(await optionLabels(user)).toEqual([
        "Jan 2026 – Dec 2026",
        "Oct 2024 – Aug 2025",
      ]);
    });

    it("shows only the activities inside the chosen range", async () => {
      fetchAppraisalPeriods.mockResolvedValue([calendar2026]);
      fetchAllCpd.mockResolvedValue(cpdEntries);
      renderWithRouter(<PassportCpdPage />);

      expect(await screen.findByText("Regional study day")).toBeInTheDocument();
      expect(
        screen.queryByText("Thoracic oncology conference"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/by convention/)).not.toBeInTheDocument();
    });

    it("keeps activities outside every range reachable", async () => {
      const user = userEvent.setup();
      fetchAppraisalPeriods.mockResolvedValue([calendar2026]);
      fetchAllCpd.mockResolvedValue(cpdEntries);
      renderWithRouter(<PassportCpdPage />);

      await screen.findByText("Regional study day");
      await user.click(dateRangeField());
      await user.click(
        await screen.findByRole("option", { name: "Outside your date ranges" }),
      );

      expect(
        await screen.findByText("Thoracic oncology conference"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Regional study day")).not.toBeInTheDocument();
    });

    it("offers no outside option when every activity is in a range", async () => {
      const user = userEvent.setup();
      fetchAppraisalPeriods.mockResolvedValue([
        { starts_on: "2025-01-01", ends_on: "2026-12-31" },
      ]);
      fetchAllCpd.mockResolvedValue(cpdEntries);
      renderWithRouter(<PassportCpdPage />);

      await screen.findByText("Regional study day");
      expect(await optionLabels(user)).not.toContain(
        "Outside your date ranges",
      );
    });

    it("shows the range a new activity falls in", async () => {
      const user = userEvent.setup();
      fetchAppraisalPeriods.mockResolvedValue([calendar2026]);
      fetchAllCpd.mockResolvedValue(cpdEntries);
      addCpdEntry.mockResolvedValue({ name: "x", commit: "y" });
      renderWithRouter(<PassportCpdPage />);

      await screen.findByText("Regional study day");
      fetchAllCpd.mockResolvedValue([
        ...cpdEntries,
        {
          ...cpdEntries[0],
          filename: "2024-03-01-120000",
          year: 2024,
          activity_on: "2024-03-01",
          title: "Old course",
        },
      ]);
      await user.click(screen.getByRole("button", { name: "Add an activity" }));
      await user.click(
        screen.getByRole("button", { name: "Submit the activity" }),
      );

      // 1 March 2024 is in no range, so the page moves to those.
      expect(await screen.findByText("Old course")).toBeInTheDocument();
      expect(dateRangeField()).toHaveValue("Outside your date ranges");
    });
  });

  it("explains a failed load", async () => {
    fetchAllCpd.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCpdPage />);

    expect(
      await screen.findByText(/Your CPD could not be loaded/),
    ).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCpdPage />);

    expect(
      await screen.findByText(/Your CPD could not be loaded/),
    ).toBeInTheDocument();
  });
});
