/**
 * Passport Sign-offs Page Tests
 *
 * The page lists every sign-off, one row each, grouped by status. What
 * is worth testing is the grouping: that a sign-off lands under the
 * right heading, that one competency asked about twice is two rows, that
 * empty groups stay out of the way, and that a passport with nothing in
 * it explains itself rather than showing blanks.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportSignOffsPage } from "./PassportSignOffsPage";
import { requested as requestedFixture } from "@/components/passport/fixtures";
import type { CompetencyState, SignOff, SignOffStatus } from "@lib/passport";

const fetchMyPassport = vi.fn();
const fetchSignOffs = vi.fn();
const navigate = vi.fn();
const requestSignOff = vi.fn();
const searchAssessors = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchSignOffs: (...args: unknown[]) => fetchSignOffs(...args),
  requestSignOff: (...args: unknown[]) => requestSignOff(...args),
  searchAssessors: (...args: unknown[]) => searchAssessors(...args),
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

// The page asks for users directly to fill the assessor list, since
// there is no passport endpoint that lists them.
vi.mock("@/lib/api", () => ({
  api: { get: () => Promise.resolve({ users: [] }) },
}));

// The pages read the signed-in holder's address so the form can refuse
// it: naming yourself is not a sign-off. Mocked the way every other
// page test that reads auth does, rather than wrapping in a provider.
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { username: "holder", email: "holder@example.nhs.uk" },
    },
  }),
}));

function competency(
  id: string,
  name: string,
  status: SignOffStatus,
): CompetencyState {
  return {
    id,
    name,
    status,
    level: null,
    signed_on: null,
    signed_off_by: null,
    expires_on: null,
    sign_off: null,
    previous_sign_offs: [],
    logbook_entries: 0,
    certificates: [],
  };
}

/** One sign-off, named for its competency so rows can be found by it. */
function signOff(
  name: string,
  competencyName: string,
  status: SignOffStatus,
): SignOff {
  return {
    ...requestedFixture,
    name,
    competency: { id: name, name: competencyName },
    status,
  };
}

function detailWith(
  competencies: CompetencyState[],
  entitlement?: { can_write?: boolean },
) {
  return {
    passport: {
      passport_id: "3f2a8c1e",
      holder_user_id: "42",
      holder_name: "Dr Mark Bailey",
      registrations: [],
      // The picker lists the competencies in these and no others.
      frameworks: [
        { id: "clinical", name: "General clinical skills" },
        { id: "oncology", name: "Oncology (proof of concept)" },
      ],
      created_at: "2026-09-10",
      head_commit: null,
    },
    competencies,
    ...(entitlement ? { entitlement } : {}),
  };
}

describe("PassportSignOffsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Nobody on Quill by default, which is the ordinary case: the
    // request form then accepts the address as typed.
    searchAssessors.mockResolvedValue({ matches: [] });
    fetchSignOffs.mockResolvedValue([]);
  });

  it("says nothing is here only once the passport has arrived", async () => {
    // The page starts with no competencies, so it used to flash "No
    // sign-offs yet" over a passport that had some while the fetch was
    // still out.
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportSignOffsPage />);

    await waitFor(() => expect(fetchMyPassport).toHaveBeenCalled());
    expect(screen.queryByText("No sign-offs yet")).not.toBeInTheDocument();
  });

  it("shows placeholder rows while the sign-offs are on their way", async () => {
    fetchMyPassport.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportSignOffsPage />);

    await waitFor(() => expect(fetchMyPassport).toHaveBeenCalled());
    expect(screen.getByTestId("sign-off-list-loading")).toBeInTheDocument();
  });

  it("takes the placeholders away once the sign-offs arrive", async () => {
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText("No sign-offs yet");
    expect(
      screen.queryByTestId("sign-off-list-loading"),
    ).not.toBeInTheDocument();
  });

  it("puts the add button above the message on an empty page", async () => {
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    const message = await screen.findByText("No sign-offs yet");
    const add = screen.getByRole("button", { name: "Ask for a sign-off" });
    expect(
      add.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("disables asking for a sign-off where the passport is read-only", async () => {
    // Requesting one goes through `_require_writer` on the server, the
    // same gate as adding a logbook entry, so a read-only holder was
    // being offered a button that answered 403.
    fetchMyPassport.mockResolvedValue(
      detailWith([competency("a", "Perform bronchoscopy", "requested")], {
        can_write: false,
      }),
    );
    fetchSignOffs.mockResolvedValue([
      signOff("a", "Perform bronchoscopy", "requested"),
    ]);
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText("Perform bronchoscopy");

    expect(
      screen.getByRole("button", { name: /ask for a sign-off/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves it enabled for a holder who may write", async () => {
    fetchMyPassport.mockResolvedValue(
      detailWith([competency("a", "Perform bronchoscopy", "requested")], {
        can_write: true,
      }),
    );
    fetchSignOffs.mockResolvedValue([
      signOff("a", "Perform bronchoscopy", "requested"),
    ]);
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText("Perform bronchoscopy");

    expect(
      screen.getByRole("button", { name: /ask for a sign-off/i }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("puts each sign-off under the heading for its status", async () => {
    fetchMyPassport.mockResolvedValue(detailWith([]));
    fetchSignOffs.mockResolvedValue([
      signOff("a", "Perform bronchoscopy", "signed_off"),
      signOff("b", "Insert a chest drain", "requested"),
      signOff("c", "Prescribe chemotherapy", "declined"),
      signOff("d", "Assess toxicity", "superseded"),
    ]);
    renderWithRouter(<PassportSignOffsPage />);

    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();

    for (const [heading, name] of [
      ["Awaiting sign-off", "Insert a chest drain"],
      ["Signed off", "Perform bronchoscopy"],
      ["Declined", "Prescribe chemotherapy"],
      ["Replaced by a correction", "Assess toxicity"],
    ]) {
      const card = screen
        .getByRole("heading", { name: heading })
        .closest("[data-testid='sign-off-list']");
      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText(name)).toBeInTheDocument();
    }
  });

  it("lists one competency twice when it was asked about twice", async () => {
    // The page used to list competencies, carrying only the latest
    // sign-off each, so the declined request here was never shown.
    fetchMyPassport.mockResolvedValue(detailWith([]));
    fetchSignOffs.mockResolvedValue([
      signOff("second", "Perform bronchoscopy", "signed_off"),
      signOff("first", "Perform bronchoscopy", "declined"),
    ]);
    renderWithRouter(<PassportSignOffsPage />);

    expect(await screen.findAllByText("Perform bronchoscopy")).toHaveLength(2);
  });

  it("leaves out a group with nothing in it", async () => {
    fetchMyPassport.mockResolvedValue(detailWith([]));
    fetchSignOffs.mockResolvedValue([
      signOff("a", "Perform bronchoscopy", "signed_off"),
    ]);
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText("Perform bronchoscopy");

    expect(
      screen.queryByRole("heading", { name: "Declined" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Awaiting sign-off" }),
    ).not.toBeInTheDocument();
  });

  it("does not list a competency that has only logbook entries", async () => {
    // The passport reports such a competency as "requested", the nearest
    // of its statuses to "evidence and no assessment". Listed here, it
    // sat under "Awaiting sign-off" when nobody had been asked.
    fetchMyPassport.mockResolvedValue(
      detailWith([
        {
          ...competency("a", "Assess toxicity", "requested"),
          logbook_entries: 1,
        },
      ]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    expect(await screen.findByText(/No sign-offs yet/)).toBeInTheDocument();
    expect(screen.queryByText("Assess toxicity")).not.toBeInTheDocument();
  });

  it("opens a sign-off on its own page", async () => {
    const user = userEvent.setup();
    fetchMyPassport.mockResolvedValue(detailWith([]));
    fetchSignOffs.mockResolvedValue([
      signOff("2026-03-14-bronchoscopy", "Perform bronchoscopy", "signed_off"),
    ]);
    renderWithRouter(<PassportSignOffsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Perform bronchoscopy" }),
    );

    expect(navigate).toHaveBeenCalledWith(
      "/passport/sign-offs/2026-03-14-bronchoscopy",
    );
  });

  it("says how a sign-off comes about when there is nothing yet", async () => {
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    expect(await screen.findByText(/No sign-offs yet/)).toBeInTheDocument();
    expect(screen.getByText(/Start a sign-off request/)).toBeInTheDocument();
  });

  it("offers a way to ask for a sign-off", async () => {
    // The page listed what had been signed and gave no way to ask for
    // anything, which is most of why somebody opens it.
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    expect(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    ).toBeInTheDocument();
  });

  it("asks which competency before showing the form", async () => {
    // The form names the competency in its heading and cannot be
    // filled in without one, so the picker comes first.
    const user = userEvent.setup();
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    );

    expect(await screen.findByText("Which competency?")).toBeInTheDocument();
    expect(screen.queryByText(/Request sign-off for/)).not.toBeInTheDocument();
  });

  it("lists only the competencies in the holder's frameworks", async () => {
    const user = userEvent.setup();
    const detail = detailWith([]);
    fetchMyPassport.mockResolvedValue({
      ...detail,
      passport: {
        ...detail.passport,
        frameworks: [{ id: "clinical", name: "General clinical skills" }],
      },
    });
    renderWithRouter(<PassportSignOffsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    );
    await user.click(await screen.findByRole("combobox"));

    // The framework's own heading, and nothing from one not chosen.
    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByText("General clinical skills"),
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByText("Oncology (proof of concept)"),
    ).not.toBeInTheDocument();
  });

  it("lists nothing, and says where to go, with no framework chosen", async () => {
    const user = userEvent.setup();
    const detail = detailWith([]);
    fetchMyPassport.mockResolvedValue({
      ...detail,
      passport: { ...detail.passport, frameworks: [] },
    });
    renderWithRouter(<PassportSignOffsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    );

    expect(
      await screen.findByText(/Choose the frameworks you work to in Settings/),
    ).toBeInTheDocument();
  });

  it("refuses the holder's own address before anything is sent", async () => {
    // The form carries this check, but only if the page tells it who
    // the holder is. Without that the form offered to email an
    // invitation to the holder themselves, which is nonsense the
    // server would then refuse.
    const user = userEvent.setup();
    fetchMyPassport.mockResolvedValue(detailWith([]));
    renderWithRouter(<PassportSignOffsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    );
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByText("Insert Intravenous Cannula"));

    await user.type(
      await screen.findByRole("textbox", { name: /Who should assess this/ }),
      "holder@example.nhs.uk",
    );

    expect(
      await screen.findByText(/You cannot sign off yourself/),
    ).toBeInTheDocument();
    expect(requestSignOff).not.toHaveBeenCalled();
  });

  it("says why the server refused, rather than 'try again'", async () => {
    // Asking yourself is refused, and so are several other things a
    // holder can act on. "Please try again" hides the reason and
    // invites retrying something that will never work.
    const user = userEvent.setup();
    fetchMyPassport.mockResolvedValue(detailWith([]));
    requestSignOff.mockRejectedValue(
      new Error("You cannot ask yourself to sign off your own competency."),
    );
    renderWithRouter(<PassportSignOffsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Ask for a sign-off" }),
    );
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByText("Insert Intravenous Cannula"));

    await user.type(
      await screen.findByRole("textbox", { name: /Who should assess this/ }),
      "assessor@other-trust.nhs.uk",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Observed on/ }),
      "14/03/2026",
    );
    // The form will not submit until the lookup has answered for the
    // address that is in the box now.
    await screen.findByText(/Nobody on Quill uses that address/);

    await user.click(screen.getByRole("button", { name: "Request sign-off" }));

    await user.click(
      await screen.findByRole("button", { name: "Send request" }),
    );

    expect(await screen.findByText(/cannot ask yourself/)).toBeInTheDocument();

    // The form is still there, holding what was typed. A refusal means
    // one field needs changing, so replacing the page would throw away
    // the competency already chosen and everything filled in.
    expect(
      screen.getByRole("textbox", { name: /Who should assess this/ }),
    ).toHaveValue("assessor@other-trust.nhs.uk");

    // And it is not dressed as a crash: the rule worked exactly as
    // intended.
    expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
  });

  it("explains a failed load rather than showing an empty record", async () => {
    // An empty passport and an unreachable one look identical without
    // this, and they mean very different things to a holder.
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportSignOffsPage />);

    expect(
      await screen.findByText(/Your sign-offs could not be loaded/),
    ).toBeInTheDocument();
  });
});
