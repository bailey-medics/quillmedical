/**
 * SignOffRequestForm Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SignOffRequestForm from "./SignOffRequestForm";
import { requestedCompetency } from "./fixtures";

const searchAssessors = vi.fn();

vi.mock("@lib/passport", () => ({
  searchAssessors: (...args: unknown[]) => searchAssessors(...args),
}));

const levels = [
  { id: "supervised", name: "Can perform with supervision available" },
  { id: "unsupervised", name: "Can perform independently" },
];

function renderForm(
  props: Partial<React.ComponentProps<typeof SignOffRequestForm>> = {},
) {
  return renderWithMantine(
    <SignOffRequestForm
      competency={requestedCompetency}
      onSubmit={vi.fn()}
      {...props}
    />,
  );
}

/** The assessor's address, which is required before the form submits. */
async function typeAssessorEmail(
  user: ReturnType<typeof userEvent.setup>,
  address = "amara.okonkwo@example.nhs.uk",
) {
  await user.type(
    screen.getByRole("textbox", { name: /Who should assess this/ }),
    address,
  );
}

describe("SignOffRequestForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchAssessors.mockResolvedValue({ matches: [] });
  });

  it("names the competency being requested", () => {
    renderForm();
    expect(
      screen.getByText(/Request sign-off for Perform thoracic ultrasound/),
    ).toBeInTheDocument();
  });

  it("names the act on the button rather than saying 'Save'", () => {
    renderForm();
    expect(
      screen.getByRole("button", { name: "Request sign-off" }),
    ).toBeInTheDocument();
  });

  describe("Naming an assessor", () => {
    it("asks for an email address, not a name from a list", async () => {
      // The assessor who observed the work is often at another trust,
      // or not on Quill at all. A list of existing users had no row for
      // them, so the holder could not ask.
      renderForm();

      expect(
        screen.getByRole("textbox", { name: /Who should assess this/ }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });

    it("says an account is not needed, so a holder does not assume one is", () => {
      renderForm();

      expect(
        screen.getByText(/They do not need a Quill account/),
      ).toBeInTheDocument();
    });

    it("sends the address, folded to lower case and trimmed", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      renderForm({ onSubmit });

      await typeAssessorEmail(user, "  Amara.Okonkwo@Example.NHS.uk  ");
      await user.type(
        screen.getByRole("textbox", { name: /Observed on/ }),
        "14/03/2026",
      );
      await user.click(
        screen.getByRole("button", { name: "Request sign-off" }),
      );

      // The form confirms before sending, so nothing has gone yet.
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(
        await screen.findByRole("button", { name: "Send request" }),
      );

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          assessor_email: "amara.okonkwo@example.nhs.uk",
        }),
      );
    });

    it("refuses a name that matches nobody, but not an empty field", async () => {
      // Somebody on Quill may be named any way the holder knows them.
      // Somebody who is not must be given as an address, because an
      // address is the only thing that can be emailed. An empty field
      // is a form not filled in yet, not a mistake.
      const user = userEvent.setup();
      renderForm();

      expect(
        screen.queryByText(/Type their email address instead/),
      ).not.toBeInTheDocument();

      await typeAssessorEmail(user, "Doctor Nobody");

      expect(
        await screen.findByText(/Type their email address instead/),
      ).toBeInTheDocument();
    });

    it("accepts a colleague named any way the holder knows them", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      searchAssessors.mockResolvedValue({
        matches: [
          {
            user_id: 42,
            username: "okonkwo",
            full_name: "Dr Amara Okonkwo",
            email: "amara.okonkwo@example.nhs.uk",
            registrations: [],
          },
        ],
      });
      renderForm({ onSubmit });

      await typeAssessorEmail(user, "Okonkwo");
      await user.type(
        screen.getByRole("textbox", { name: /Observed on/ }),
        "14/03/2026",
      );

      // The form cannot be sent until the lookup has answered — a name
      // that has found nobody yet is not somebody to ask.
      await screen.findByText(/Dr Amara Okonkwo already uses Quill/);

      await user.click(
        screen.getByRole("button", { name: "Request sign-off" }),
      );
      await user.click(
        await screen.findByRole("button", { name: "Send request" }),
      );

      // Their address, not the name that was typed: posting
      // "Okonkwo" as an email address would fail at the server.
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          assessor_email: "amara.okonkwo@example.nhs.uk",
        }),
      );
    });
  });

  describe("Saying what will happen to the address", () => {
    it("names somebody who already uses Quill", async () => {
      // A holder should not have to guess whether the person they named
      // will be signing in or registering.
      const user = userEvent.setup();
      searchAssessors.mockResolvedValue({
        matches: [
          {
            user_id: 42,
            username: "okonkwo",
            full_name: "Dr Amara Okonkwo",
            email: "amara.okonkwo@example.nhs.uk",
            registrations: [],
          },
        ],
      });
      renderForm();

      await typeAssessorEmail(user, "amara.okonkwo@example.nhs.uk");

      expect(
        await screen.findByText(/Dr Amara Okonkwo already uses Quill/),
      ).toBeInTheDocument();
    });

    it("says an unknown address will be invited", async () => {
      // The case the whole flow exists for: an assessor at another
      // trust who has never used Quill.
      const user = userEvent.setup();
      renderForm();

      await typeAssessorEmail(user, "stranger@other-trust.nhs.uk");

      expect(
        await screen.findByText(/Nobody on Quill uses that address/),
      ).toBeInTheDocument();
    });

    it("claims nothing while the address is half typed", async () => {
      // "They will be invited" is wrong more often than right when
      // somebody is midway through a colleague's address.
      const user = userEvent.setup();
      renderForm();

      await typeAssessorEmail(user, "amara");

      expect(
        screen.queryByText(/already uses Quill|Nobody on Quill/),
      ).not.toBeInTheDocument();
    });

    it("does not pick one of several people answering to a name", async () => {
      // Two consultants answering to "Okonkwo" is not an answer, and
      // taking the first would name whichever the database happened to
      // return — the mistake this whole step exists to prevent.
      const user = userEvent.setup();
      searchAssessors.mockResolvedValue({
        matches: [
          {
            user_id: 42,
            username: "okonkwo",
            full_name: "Dr Amara Okonkwo",
            email: "amara.okonkwo@example.nhs.uk",
            registrations: [],
          },
          {
            user_id: 43,
            username: "okonkwo2",
            full_name: "Dr Ravi Okonkwo",
            email: "ravi.okonkwo@example.nhs.uk",
            registrations: [],
          },
        ],
      });
      renderForm();

      await typeAssessorEmail(user, "Okonkwo");

      // Wait for the debounced lookup to have actually run, or the
      // assertion below passes before anything was searched.
      await waitFor(() => expect(searchAssessors).toHaveBeenCalled());

      expect(
        await screen.findByText(/Type their email address instead/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/already uses Quill/)).not.toBeInTheDocument();
    });
  });

  describe("Confirming before it is sent", () => {
    const knownAssessor = {
      user_id: 42,
      username: "okonkwo",
      full_name: "Dr Amara Okonkwo",
      email: "amara.okonkwo@example.nhs.uk",
      registrations: [{ body: "GMC", number: "7654321", verified: false }],
    };

    async function fillAndSend(
      user: ReturnType<typeof userEvent.setup>,
      address = "amara.okonkwo@example.nhs.uk",
    ) {
      await typeAssessorEmail(user, address);
      await user.type(
        screen.getByRole("textbox", { name: /Observed on/ }),
        "14/03/2026",
      );
      await user.click(
        screen.getByRole("button", { name: "Request sign-off" }),
      );
    }

    it("shows the registration number, which is the hard evidence", async () => {
      // Two consultants may share a name, and an address says only that
      // somebody controls a mailbox. The number says which registered
      // professional this is.
      const user = userEvent.setup();
      searchAssessors.mockResolvedValue({ matches: [knownAssessor] });
      renderForm();

      await fillAndSend(user);

      expect(await screen.findByText(/GMC 7654321/)).toBeInTheDocument();
      expect(
        screen.getByText(/Dr Amara Okonkwo will be asked/),
      ).toBeInTheDocument();
    });

    it("does not imply Quill checked the registration", async () => {
      // Quill verifies no register; an admin does that by hand. A
      // number beside a name reads as confirmation unless it says so.
      const user = userEvent.setup();
      searchAssessors.mockResolvedValue({ matches: [knownAssessor] });
      renderForm();

      await fillAndSend(user);

      expect(
        await screen.findByText(/stated by them, not checked by Quill/),
      ).toBeInTheDocument();
    });

    it("shows only the address for somebody Quill does not know", async () => {
      // It is genuinely all Quill knows about them, and claiming more
      // would be inventing it.
      const user = userEvent.setup();
      renderForm();

      await fillAndSend(user, "stranger@other-trust.nhs.uk");

      expect(
        await screen.findByText(/stranger@other-trust.nhs.uk will be asked/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/GMC/)).not.toBeInTheDocument();
    });

    it("sends nothing when the holder backs out", async () => {
      // The whole point of stopping here is that it can be stopped.
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      searchAssessors.mockResolvedValue({ matches: [knownAssessor] });
      renderForm({ onSubmit });

      await fillAndSend(user);
      await user.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("Submission is refused until the required fields are given", () => {
    it("is disabled before anything is filled in", () => {
      renderForm();
      expect(
        screen.getByRole("button", { name: "Request sign-off" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("stays disabled with an assessor but no observed date", async () => {
      const user = userEvent.setup();
      renderForm();

      await typeAssessorEmail(user);

      expect(
        screen.getByRole("button", { name: "Request sign-off" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("Levels", () => {
    it("offers a level picker only when the competency declares levels", () => {
      renderForm({ levels });
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
    });

    it("shows no picker at all when there are no levels", () => {
      // The assessor is a plain email field now, so a combobox on this
      // form can only be the level picker.
      renderForm();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    });
  });

  describe("The observed date", () => {
    it("is labelled as when the work happened, not when asking", () => {
      renderForm();
      expect(
        screen.getByText(
          /The day the work happened, not the day you are asking/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Anonymisation", () => {
    it("reminds the holder not to write about a patient", () => {
      // Reflections are one of only two places patient data could enter
      // a passport.
      renderForm();
      expect(
        screen.getByText(/Write about the work, not about a patient/),
      ).toBeInTheDocument();
    });
  });

  describe("In flight", () => {
    it("disables submission while a request is running", () => {
      renderForm({ isSubmitting: true });
      expect(
        screen.getByRole("button", { name: "Request sign-off" }),
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  it("calls onCancel when the holder backs out", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderForm({ onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
