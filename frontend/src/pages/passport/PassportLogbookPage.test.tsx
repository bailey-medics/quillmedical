/**
 * Passport Logbook Page Tests
 *
 * Two controls that were once one: a filter for narrowing the view, and
 * a picker for saying what a new entry counts towards. They were split
 * because narrowing is reading and choosing is writing, so a read-only
 * holder must keep the first and lose the second.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportLogbookPage } from "./PassportLogbookPage";
import type * as passportLib from "@lib/passport";

import type { LogbookEntry } from "@lib/passport";
const { fetchMyPassport, fetchWholeLogbook, addLogbookEntry } = vi.hoisted(
  () => ({
    fetchMyPassport: vi.fn<typeof passportLib.fetchMyPassport>(),
    fetchWholeLogbook: vi.fn<typeof passportLib.fetchWholeLogbook>(),
    addLogbookEntry: vi.fn<typeof passportLib.addLogbookEntry>(),
  }),
);

vi.mock("@lib/passport", () => ({
  fetchMyPassport,
  fetchWholeLogbook,
  addLogbookEntry,
}));

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    frameworks: [
      { id: "clinical", name: "General clinical skills" },
      { id: "oncology", name: "Oncology (proof of concept)" },
    ],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies: [],
};

/** One logged procedure, with nothing said beyond what names it. */
function entry(
  filename: string,
  competency: string,
  performed_on: string,
): LogbookEntry {
  return {
    filename,
    competency,
    performed_on,
    setting: null,
    supervision: null,
    supervisor: null,
    indication: null,
    outcome: null,
    notes: null,
    also_counts_towards: [],
    attachments: [],
  };
}

describe("PassportLogbookPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
    fetchWholeLogbook.mockResolvedValue({ competencies: [], count: 0 });
  });

  it("shows every competency's entries without being asked", async () => {
    // A holder opening their logbook wants to see what is in it. It
    // used to show nothing at all until a competency was picked, so
    // the page was blank for anybody who did not already know what
    // they were looking for.
    fetchWholeLogbook.mockResolvedValue({
      count: 2,
      competencies: [
        {
          competency: "perform_venepuncture",
          count: 1,
          entries: [entry("a", "perform_venepuncture", "2026-03-01")],
        },
        {
          competency: "certify_death",
          count: 1,
          entries: [entry("b", "certify_death", "2026-03-02")],
        },
      ],
    });
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText(/venepuncture/i)).toBeInTheDocument();
    expect(screen.getByText(/certify death/i)).toBeInTheDocument();
  });

  it("says so when nothing has been logged", async () => {
    renderWithRouter(<PassportLogbookPage />);

    expect(await screen.findByText("Nothing logged yet")).toBeInTheDocument();
  });

  it("opens an entry on its own page when it is chosen", async () => {
    const user = userEvent.setup();
    fetchWholeLogbook.mockResolvedValue({
      count: 1,
      competencies: [
        {
          competency: "certify_death",
          count: 1,
          entries: [entry("20260302T0900", "certify_death", "2026-03-02")],
        },
      ],
    });
    renderWithRouter(<PassportLogbookPage />);

    await user.click(await screen.findByText(/2 Mar 2026/));

    expect(navigate).toHaveBeenCalledWith(
      "/passport/logbook/certify_death/20260302T0900",
    );
  });

  it("says nothing is here only once the list has arrived", async () => {
    // The page starts with an empty list, so it used to flash its empty
    // message over a full logbook while the fetch was still out.
    fetchWholeLogbook.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportLogbookPage />);

    await waitFor(() => expect(fetchWholeLogbook).toHaveBeenCalled());
    expect(screen.queryByText("Nothing logged yet")).not.toBeInTheDocument();
  });

  it("shows a loading table while the list is on its way", async () => {
    fetchWholeLogbook.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportLogbookPage />);

    await waitFor(() => expect(fetchWholeLogbook).toHaveBeenCalled());
    expect(screen.getByTestId("logbook-table")).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("takes the loading table away once an empty list arrives", async () => {
    fetchWholeLogbook.mockResolvedValue({ competencies: [], count: 0 });
    renderWithRouter(<PassportLogbookPage />);

    await screen.findByText(/^Nothing .* yet$/);
    expect(screen.queryByTestId("logbook-table")).not.toBeInTheDocument();
  });

  it("shows no loading table over a failed load", async () => {
    fetchWholeLogbook.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportLogbookPage />);

    await screen.findByText(/could not be loaded/);
    expect(screen.queryByTestId("logbook-table")).not.toBeInTheDocument();
  });

  it("puts the add button above the message on an empty logbook", async () => {
    renderWithRouter(<PassportLogbookPage />);

    const message = await screen.findByText("Nothing logged yet");
    const add = screen.getByRole("button", { name: "Add an entry" });
    expect(
      add.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the picker out of the way until an entry is being added", async () => {
    // It answers one question, asked at one moment. On the page it read
    // as a second filter beside the real one.
    renderWithRouter(<PassportLogbookPage />);

    await screen.findByRole("button", { name: "Add an entry" });

    expect(screen.queryByText("Which competency?")).not.toBeInTheDocument();
  });

  it("asks which competency once an entry is being added", async () => {
    renderWithRouter(<PassportLogbookPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Add an entry" }),
    );

    expect(await screen.findByText("Which competency?")).toBeInTheDocument();
  });

  it("disables adding where the passport is read-only", async () => {
    // Adding goes through `_require_writer`, so the button would answer
    // 403. The filter below is untouched: narrowing the view is
    // reading, which a read-only holder keeps.
    fetchMyPassport.mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    renderWithRouter(<PassportLogbookPage />);

    // The button is drawn before the passport has loaded, enabled until
    // the entitlement arrives. Waiting only for the button found it in
    // that gap on a slow CI runner, so wait for the disabled state itself.
    const add = await screen.findByRole("button", { name: "Add an entry" });
    await waitFor(() => expect(add).toHaveAttribute("aria-disabled", "true"));
  });

  it("leaves the filter usable where the passport is read-only", async () => {
    // The point of splitting the two controls. A holder whose
    // entitlement has ended keeps every read, and narrowing a long
    // logbook is reading.
    fetchMyPassport.mockResolvedValue({
      ...detail,
      entitlement: { can_write: false },
    });
    fetchWholeLogbook.mockResolvedValue({
      count: 2,
      competencies: [
        {
          competency: "perform_venepuncture",
          count: 1,
          entries: [entry("a", "perform_venepuncture", "2026-03-01")],
        },
        {
          competency: "certify_death",
          count: 1,
          entries: [entry("b", "certify_death", "2026-03-02")],
        },
      ],
    });
    renderWithRouter(<PassportLogbookPage />);

    // Both entries are shown, and the filter is there to narrow them.
    // `FilterSelect` takes no `disabled` prop, so the thing worth
    // asserting is that the page still offers it and still renders
    // what it would narrow.
    expect(await screen.findByText("Perform Venepuncture")).toBeInTheDocument();
    expect(screen.getByText("Certify Death")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Filter the logbook by competency",
      }),
    ).toBeInTheDocument();
  });

  it("explains a failed passport load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportLogbookPage />);

    expect(
      await screen.findByText(/Your logbook could not be loaded/),
    ).toBeInTheDocument();
  });
});
