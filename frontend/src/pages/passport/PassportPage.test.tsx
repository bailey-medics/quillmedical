/**
 * Passport Page Tests
 *
 * The page is a thin composition, so these cover what only the page can
 * get wrong: the fetch, the loading state, and the error path.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import type { FrameworkOption } from "@lib/passport/frameworks";
import { Component as PassportPage } from "./PassportPage";
import {
  certificates,
  competencies,
  cpdEntries,
  logbook,
  reflections,
  signOffs,
} from "@/components/passport/fixtures";

const fetchMyPassport = vi.fn();
const createPassport = vi.fn();
const fetchInbox = vi.fn();
const fetchSignOffs = vi.fn();
const fetchWholeLogbook = vi.fn();
const fetchAllCpd = vi.fn();
const fetchCertificates = vi.fn();
const fetchReflections = vi.fn();

// The framework order comes from the API through this hook; each test
// sets what it returns.
const frameworkChoices = vi.fn();

vi.mock("@lib/passport/useFrameworkChoices", () => ({
  useFrameworkChoices: (enabled: boolean) => frameworkChoices(enabled),
}));

vi.mock("@lib/passport", async () => {
  const actual =
    await vi.importActual<typeof import("@lib/passport")>("@lib/passport");
  return {
    ...actual,
    fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
    createPassport: (...args: unknown[]) => createPassport(...args),
    fetchInbox: (...args: unknown[]) => fetchInbox(...args),
    fetchSignOffs: (...args: unknown[]) => fetchSignOffs(...args),
    fetchWholeLogbook: (...args: unknown[]) => fetchWholeLogbook(...args),
    fetchAllCpd: (...args: unknown[]) => fetchAllCpd(...args),
    fetchCertificates: (...args: unknown[]) => fetchCertificates(...args),
    fetchReflections: (...args: unknown[]) => fetchReflections(...args),
  };
});

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

const FRAMEWORKS: FrameworkOption[] = [
  {
    id: "clinical",
    name: "General clinical skills",
    publisher: "Quill Medical",
    version: "2026",
    specialties: [],
  },
  {
    id: "oncology",
    name: "Oncology (proof of concept)",
    publisher: "Quill Medical",
    version: "2026",
    specialties: ["oncology"],
  },
];

/** A lead framework first, as an oncology department would have it. */
const ONCOLOGY_FIRST: FrameworkOption[] = [FRAMEWORKS[1], FRAMEWORKS[0]];

const ONCOLOGY_LABEL = "Oncology (proof of concept) (Quill Medical, 2026)";
const GENERAL_LABEL = "General clinical skills (Quill Medical, 2026)";

/** The field the frameworks are chosen in, on the create step. */
function frameworksField(): HTMLElement {
  return screen.getByRole("combobox", { name: /Frameworks you work to/ });
}

beforeEach(() => {
  frameworkChoices.mockReturnValue(FRAMEWORKS);
  fetchSignOffs.mockResolvedValue([]);
  fetchWholeLogbook.mockResolvedValue({ competencies: [], count: 0 });
  fetchAllCpd.mockResolvedValue([]);
  fetchCertificates.mockResolvedValue([]);
  fetchReflections.mockResolvedValue([]);
});

/** Every fixture record, served by the five routes the page asks. */
function serveRecords() {
  fetchSignOffs.mockResolvedValue(signOffs);
  fetchWholeLogbook.mockResolvedValue({
    competencies: [logbook],
    count: logbook.count,
  });
  fetchAllCpd.mockResolvedValue(cpdEntries);
  fetchCertificates.mockResolvedValue(certificates);
  fetchReflections.mockResolvedValue(reflections);
}

/** What the framework options read, top to bottom, once open. */
function optionLabels(): string[] {
  return screen.getAllByRole("option").map((o) => o.textContent ?? "");
}

/** The shape `api.ts` throws: an Error carrying the HTTP status. */
function httpError(status: number): Error & { status: number } {
  const err = new Error(`HTTP ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    frameworks: [{ id: "clinical", name: "General clinical skills" }],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies,
};

describe("PassportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchInbox.mockResolvedValue([]);
  });

  describe("The entitlement warning", () => {
    it("warns on the way in when the end is close", async () => {
      // Shown here rather than at the point of refusal: finding out
      // half way through typing a reflection is the worst moment.
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { ends_on: "2026-10-05T00:00:00Z", days_remaining: 14 },
      });
      renderWithRouter(<PassportPage />);

      expect(
        await screen.findByText(/becomes read-only in 14 days/),
      ).toBeInTheDocument();
    });

    it("says the record can still be read and downloaded", async () => {
      // The guarantee that matters: a lapse never locks somebody out
      // of their own professional record.
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { ends_on: "2026-09-22T00:00:00Z", days_remaining: 0 },
      });
      renderWithRouter(<PassportPage />);

      expect(
        await screen.findByText(/read your record and download it/),
      ).toBeInTheDocument();
    });

    it("stays quiet while the end is far off", async () => {
      fetchMyPassport.mockResolvedValue({
        ...detail,
        entitlement: { ends_on: "2027-09-01T00:00:00Z", days_remaining: 344 },
      });
      renderWithRouter(<PassportPage />);

      await screen.findByText("Records");
      expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
    });

    it("stays quiet when the response carries no entitlement", async () => {
      // An older backend, or a reader who is not the holder.
      fetchMyPassport.mockResolvedValue(detail);
      renderWithRouter(<PassportPage />);

      await screen.findByText("Records");
      expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
    });
  });

  it("lists every record, newest first, of every kind", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    serveRecords();
    renderWithRouter(<PassportPage />);

    await screen.findByText("Breaking bad news");
    const rows = screen.getAllByRole("row");
    // The newest fixture record is the reflection of 3 June 2026.
    expect(rows[1]).toHaveTextContent("Breaking bad news");
    for (const type of ["Sign-off", "Logbook", "CPD", "Certificate"]) {
      expect(screen.getAllByText(type).length).toBeGreaterThan(0);
    }
    expect(fetchSignOffs).toHaveBeenCalledWith("3f2a8c1e");
    expect(fetchReflections).toHaveBeenCalledWith("3f2a8c1e");
  });

  it("opens a record's own page from its row", async () => {
    const user = userEvent.setup();
    fetchMyPassport.mockResolvedValue(detail);
    serveRecords();
    renderWithRouter(<PassportPage />);

    await user.click(await screen.findByText("Breaking bad news"));

    expect(navigate).toHaveBeenCalledWith(
      "/passport/reflections/2026-06-03-breaking-bad-news",
    );
  });

  it("names a logbook entry by its competency", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    serveRecords();
    renderWithRouter(<PassportPage />);

    await screen.findByText("Breaking bad news");
    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes("Logbook"));
    expect(row).toHaveTextContent("Perform bronchoscopy");
  });

  it("no longer groups the record by competency", async () => {
    // The list of competencies was replaced by the records table.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    await screen.findByText("Records");
    expect(
      screen.queryByRole("button", { name: competencies[0].name }),
    ).not.toBeInTheDocument();
  });

  it("says so when the records cannot be loaded", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    fetchAllCpd.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/Your records could not be loaded/),
    ).toBeInTheDocument();
  });

  it("shows the page heading before the fetch resolves", () => {
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportPage />);

    expect(screen.getByText("My passport")).toBeInTheDocument();
  });

  it("shows neither the record nor the empty state while loading", async () => {
    // The bug this pins: with no loading state the page fell through
    // to the ordinary layout, drew the action cards, and swapped them
    // for "you do not have a passport yet" once the 404 arrived. A
    // holder saw somebody else's page flash past on the way to their
    // own.
    let resolve: (value: unknown) => void = () => {};
    fetchMyPassport.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderWithRouter(<PassportPage />);

    // The ways in belong to a passport that is known to exist.
    expect(screen.queryByText("Open logbook")).not.toBeInTheDocument();
    // And so does the offer to start one, to a passport known not to.
    expect(
      screen.queryByText("You do not have a passport yet"),
    ).not.toBeInTheDocument();

    resolve(detail);

    expect(await screen.findByText("Open logbook")).toBeInTheDocument();
  });

  it("stands the action cards in with skeletons while loading", () => {
    // Shaped like what replaces them, so the page settles rather than
    // changing shape. A skeleton swapped for something of a different
    // size is a flicker of its own.
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    const { container } = renderWithRouter(<PassportPage />);

    expect(
      container.querySelectorAll(".mantine-Skeleton-root").length,
    ).toBeGreaterThan(0);
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

  it("leads to the rest of the passport", async () => {
    // The side navigation has one Passport entry and it points here, so
    // these cards are the only route to every other passport page.
    // Without them those pages are addressable only by typing the URL,
    // which is how they sat for a fortnight.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    for (const name of [
      "Sign-offs",
      "Logbook",
      "CPD",
      "Certificates",
      "Reflections",
      "Download",
    ]) {
      expect(await screen.findByText(name)).toBeInTheDocument();
    }
  });

  it("offers a way into each section", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    for (const label of [
      "Open sign-offs",
      "Open logbook",
      "Open CPD",
      "Open certificates",
      "Open reflections",
      "Open download",
    ]) {
      expect(
        await screen.findByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("has no envelope of its own, now that the ribbon carries one", async () => {
    // The way into the assessor's queue used to sit beside the title.
    // The envelope in the top ribbon counts sign-off requests with
    // everything else waiting, and two in view would count them twice.
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    expect(await screen.findByText("Records")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign-off requests for me/i }),
    ).not.toBeInTheDocument();
    expect(fetchInbox).not.toHaveBeenCalled();
  });

  it("makes no claim on the card about who can read reflections", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/a case, a complaint or a significant event/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no assessor or administrator can read them/),
    ).not.toBeInTheDocument();
  });

  it("offers to create one when the holder has no passport yet", async () => {
    // 404 is the ordinary state of everybody who has never pressed the
    // button, not a fault. It was reported as a failed load until
    // somebody opened the page on a fresh account and was told to try
    // again - advice that could never have worked.
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText("You do not have a passport yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create my passport" }),
    ).toBeInTheDocument();
  });

  it("does not call a missing passport an error", async () => {
    // The distinction this page got wrong. Guards against a regression
    // that reverts to one catch-all branch.
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    await screen.findByText("You do not have a passport yet");

    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
  });

  it("still reports a genuine failure as an error", async () => {
    // The counterpart: a 500 must not be mistaken for an empty
    // passport and silently offer to create a second one.
    fetchMyPassport.mockRejectedValue(httpError(500));
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText(/Your passport could not be loaded/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create my passport" }),
    ).not.toBeInTheDocument();
  });

  it("creates the passport and shows it", async () => {
    const user = userEvent.setup();
    fetchMyPassport.mockRejectedValueOnce(httpError(404));
    createPassport.mockResolvedValue(detail.passport);
    fetchMyPassport.mockResolvedValueOnce(detail);

    renderWithRouter(<PassportPage />);

    await screen.findByText("You do not have a passport yet");
    await user.click(frameworksField());
    await user.click(await screen.findByText(ONCOLOGY_LABEL));
    await user.click(
      await screen.findByRole("button", { name: "Create my passport" }),
    );

    expect(createPassport).toHaveBeenCalledWith(["oncology"]);
    expect(await screen.findByText("Records")).toBeInTheDocument();
  });

  it("offers the frameworks in the order the API gives", async () => {
    const user = userEvent.setup();
    frameworkChoices.mockReturnValue(ONCOLOGY_FIRST);
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    await screen.findByText("You do not have a passport yet");
    expect(frameworkChoices).toHaveBeenLastCalledWith(true);
    await user.click(frameworksField());

    expect(optionLabels()).toEqual([ONCOLOGY_LABEL, GENERAL_LABEL]);
  });

  it("asks for a framework before the passport can be created", async () => {
    // A passport offers the competencies in its holder's frameworks and
    // no others, so one made with none could record nothing.
    const user = userEvent.setup();
    fetchMyPassport.mockRejectedValue(httpError(404));
    renderWithRouter(<PassportPage />);

    const create = await screen.findByRole("button", {
      name: "Create my passport",
    });

    // AddButton stays focusable when disabled, so it says so with
    // aria-disabled rather than the disabled attribute.
    expect(create).toHaveAttribute("aria-disabled", "true");
    await user.click(create);
    expect(createPassport).not.toHaveBeenCalled();
    expect(frameworksField()).toBeInTheDocument();
    expect(screen.getByText(/Choose one or more/)).toBeInTheDocument();
  });

  it("tells a holder with no frameworks where to choose them", async () => {
    // Every passport made before frameworks existed has none.
    fetchMyPassport.mockResolvedValue({
      ...detail,
      passport: { ...detail.passport, frameworks: [] },
    });
    renderWithRouter(<PassportPage />);

    expect(
      await screen.findByText("Choose the frameworks you work to"),
    ).toBeInTheDocument();
  });

  it("says nothing about frameworks to a holder who has chosen some", async () => {
    fetchMyPassport.mockResolvedValue(detail);
    renderWithRouter(<PassportPage />);

    await screen.findByText("Records");
    expect(
      screen.queryByText("Choose the frameworks you work to"),
    ).not.toBeInTheDocument();
  });

  it("explains a failed creation rather than leaving the button silent", async () => {
    const user = userEvent.setup();
    fetchMyPassport.mockRejectedValue(httpError(404));
    createPassport.mockRejectedValue(new Error("network"));

    renderWithRouter(<PassportPage />);

    await screen.findByText("You do not have a passport yet");
    await user.click(frameworksField());
    await user.click(await screen.findByText(ONCOLOGY_LABEL));
    await user.click(
      await screen.findByRole("button", { name: "Create my passport" }),
    );

    expect(await screen.findByText(/could not be created/)).toBeInTheDocument();
  });

  it("does not render the records when the load failed", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Your passport could not be loaded/),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Records")).not.toBeInTheDocument();
    expect(fetchSignOffs).not.toHaveBeenCalled();
  });
});
