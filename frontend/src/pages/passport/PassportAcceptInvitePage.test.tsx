/**
 * Passport Accept Invite Page Tests
 *
 * Opened by somebody who may have no Quill account at all, so the token
 * in the URL is the only thing authenticating them.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportAcceptInvitePage } from "./PassportAcceptInvitePage";

const previewAssessorInvite = vi.fn();
const acceptAssessorInvite = vi.fn();

vi.mock("@lib/passport", () => ({
  previewAssessorInvite: (...args: unknown[]) => previewAssessorInvite(...args),
  acceptAssessorInvite: (...args: unknown[]) => acceptAssessorInvite(...args),
}));

const preview = {
  holder_name: "Dr Mark Bailey",
  assessor_name: "Dr Amara Okonkwo",
  email: "consultant@example.nhs.uk",
  expires_at: "2026-09-28T00:00:00.000Z",
  needs_account: false,
  already_accepted: false,
};

function renderWithToken(token = "tok123") {
  return renderWithRouter(<PassportAcceptInvitePage />, {
    initialRoute: `/passport/assessors/accept?token=${token}`,
    routePath: "/passport/assessors/accept",
  });
}

describe("PassportAcceptInvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names who is asking, since the recipient may not know Quill", async () => {
    previewAssessorInvite.mockResolvedValue(preview);
    renderWithToken();

    // The name is emphasised, so it is its own element and the
    // surrounding sentence no longer matches as one string.
    expect(await screen.findByText("Dr Mark Bailey")).toBeInTheDocument();
    expect(screen.getByText(/You have been asked by/)).toBeInTheDocument();
  });

  it("asks for a username and password only when an account is needed", async () => {
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      needs_account: true,
    });
    renderWithToken();

    expect(
      await screen.findByLabelText(/Choose a username/),
    ).toBeInTheDocument();
  });

  it("offers no account fields to somebody who already uses Quill", async () => {
    previewAssessorInvite.mockResolvedValue(preview);
    renderWithToken();

    await screen.findByText(/You have been asked by/);

    expect(
      screen.queryByLabelText(/Choose a username/),
    ).not.toBeInTheDocument();
  });

  it("names the competency they were asked to sign off", async () => {
    // Somebody deciding whether to register at all needs to know what
    // they are being asked to judge.
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      competency_name: "Perform thoracic ultrasound",
    });
    renderWithToken();

    expect(
      await screen.findByText("Perform thoracic ultrasound"),
    ).toBeInTheDocument();
  });

  it("still reads sensibly when no competency is named", async () => {
    // An invitation can be raised without a request behind it, and one
    // written before invitations carried a competency has none.
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      competency_name: null,
    });
    renderWithToken();

    expect(await screen.findByText(/a competency\./)).toBeInTheDocument();
  });

  it("says why an account is needed", async () => {
    // Somebody arriving from an email has not asked for an account and
    // will reasonably wonder why they are being made to create one.
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      needs_account: true,
    });
    renderWithToken();

    expect(
      await screen.findByText(/For governance, you first need to register/),
    ).toBeInTheDocument();
  });

  it("does not ask an existing user to set anything up", async () => {
    previewAssessorInvite.mockResolvedValue(preview);
    renderWithToken();

    expect(await screen.findByText(/nothing to set up/)).toBeInTheDocument();
    expect(
      screen.queryByText(/For governance, you first need to register/),
    ).not.toBeInTheDocument();
  });

  it("asks a new assessor who they are, not just for a login", async () => {
    // The holder gave an address and nothing else, so nobody has told
    // Quill this person's name or registration. Taking it from them is
    // also the better source: a number is worth more from its holder
    // than from somebody who half-remembered it.
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      needs_account: true,
    });
    renderWithToken();

    expect(await screen.findByLabelText(/Your full name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Registering body/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Registration number/)).toBeInTheDocument();
  });

  it("will not register somebody without their registration", async () => {
    // A sign-off records who signed and on what standing, so an
    // assessor with no registration recorded could sign one that says
    // nothing about their authority to do so.
    const user = userEvent.setup();
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      needs_account: true,
    });
    renderWithToken();

    await user.type(await screen.findByLabelText(/Your full name/), "Dr A O");
    await user.type(screen.getByLabelText(/Choose a username/), "okonkwo");
    await user.type(
      screen.getByLabelText(/Choose a password/),
      "correct horse battery",
    );

    expect(
      screen.getByRole("button", { name: "Accept invitation" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("sends what the assessor stated about themselves", async () => {
    const user = userEvent.setup();
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      needs_account: true,
    });
    acceptAssessorInvite.mockResolvedValue({ status: "registered" });
    renderWithToken();

    await user.type(
      await screen.findByLabelText(/Your full name/),
      "Dr Amara Okonkwo",
    );
    await user.type(screen.getByLabelText(/Registering body/), "GMC");
    await user.type(screen.getByLabelText(/Registration number/), "7654321");
    await user.type(screen.getByLabelText(/Choose a username/), "okonkwo");
    await user.type(
      screen.getByLabelText(/Choose a password/),
      "correct horse battery",
    );
    await user.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(acceptAssessorInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: "Dr Amara Okonkwo",
          registration_authority: "GMC",
          registration_number: "7654321",
        }),
      ),
    );
  });

  it("offers the way on to sign in once accepted", async () => {
    // Registering creates an account but not a session, so the inbox
    // would bounce off RequireAuth to the login page anyway. Going
    // there directly says what happened and what to do next at once.
    const user = userEvent.setup();
    previewAssessorInvite.mockResolvedValue(preview);
    acceptAssessorInvite.mockResolvedValue({ status: "linked" });
    renderWithToken();

    await user.click(
      await screen.findByRole("button", { name: "Accept invitation" }),
    );

    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
  });

  it("says the link is incomplete when it carries no token", () => {
    renderWithRouter(<PassportAcceptInvitePage />, {
      initialRoute: "/passport/assessors/accept",
      routePath: "/passport/assessors/accept",
    });

    expect(
      screen.getByText(/This link is missing its invitation code/),
    ).toBeInTheDocument();
  });

  it("sends somebody back to sign in when the invitation is already used", async () => {
    // Scolding a person for reusing their own link would be the software
    // blaming them for its own model.
    previewAssessorInvite.mockResolvedValue({
      ...preview,
      already_accepted: true,
    });
    renderWithToken();

    expect(await screen.findByText("Already accepted")).toBeInTheDocument();
  });

  it("explains an invitation that cannot be opened", async () => {
    previewAssessorInvite.mockRejectedValue(new Error("gone"));
    renderWithToken();

    expect(await screen.findByText(/It may have expired/)).toBeInTheDocument();
  });
});
