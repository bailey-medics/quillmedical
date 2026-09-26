/**
 * Passport Sign-offs Page Tests
 *
 * The page groups what the passport already knows, so what is worth
 * testing is the grouping: that a competency lands under the right
 * heading, that empty groups stay out of the way, and that a passport
 * with nothing in it explains itself rather than showing three blanks.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportSignOffsPage } from "./PassportSignOffsPage";
import type { CompetencyState, SignOffStatus } from "@lib/passport";

const fetchMyPassport = vi.fn();
const requestSignOff = vi.fn();
const searchAssessors = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  requestSignOff: (...args: unknown[]) => requestSignOff(...args),
  searchAssessors: (...args: unknown[]) => searchAssessors(...args),
}));

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
      specialties: [],
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
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText("Perform bronchoscopy");

    expect(
      screen.getByRole("button", { name: /ask for a sign-off/i }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("puts each competency under the heading for its status", async () => {
    fetchMyPassport.mockResolvedValue(
      detailWith([
        competency("a", "Perform bronchoscopy", "signed_off"),
        competency("b", "Insert a chest drain", "requested"),
        competency("c", "Prescribe chemotherapy", "declined"),
      ]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    // Wait on a competency name, not a heading. Every heading is drawn
    // during the loading render too, so waiting on one can return while
    // the page is still skeletons. A name only ever appears once the
    // passport has arrived.
    expect(await screen.findByText("Perform bronchoscopy")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: "Awaiting sign-off" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Signed off" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Declined" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Insert a chest drain")).toBeInTheDocument();
  });

  it("leaves out a group with nothing in it", async () => {
    // Three headings above three empty cards would say nothing while
    // taking up the whole page.
    fetchMyPassport.mockResolvedValue(
      detailWith([competency("a", "Perform bronchoscopy", "signed_off")]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    // The loading render draws all three headings, so waiting on
    // "Signed off" can return before the passport has arrived and leave
    // the other two still on the page. A competency name only shows once
    // it has.
    await screen.findByText("Perform bronchoscopy");

    expect(
      screen.queryByRole("heading", { name: "Declined" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Awaiting sign-off" }),
    ).not.toBeInTheDocument();
  });

  it("hides a superseded sign-off", async () => {
    // It has been replaced by a newer one, so listing it would show the
    // same competency twice and invite reading the stale half.
    fetchMyPassport.mockResolvedValue(
      detailWith([competency("a", "Perform bronchoscopy", "superseded")]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText(/No sign-offs yet/);

    expect(screen.queryByText("Perform bronchoscopy")).not.toBeInTheDocument();
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

  it("does not count logbook entries beside a sign-off", async () => {
    // A logbook entry is evidence towards a competency, not something
    // an assessor signs. Counting them here read as though they were
    // part of the sign-off.
    fetchMyPassport.mockResolvedValue(
      detailWith([
        {
          ...competency("a", "Assess toxicity", "requested"),
          logbook_entries: 1,
        },
      ]),
    );
    renderWithRouter(<PassportSignOffsPage />);

    await screen.findByText("Assess toxicity");

    expect(screen.queryByText(/logbook/)).not.toBeInTheDocument();
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
