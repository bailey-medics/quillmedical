/**
 * Passport Accept Invite Page Tests
 *
 * Opened by somebody who may have no Quill account at all, so the token
 * in the URL is the only thing authenticating them.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

    expect(
      await screen.findByText(/Dr Mark Bailey has asked you to assess them/),
    ).toBeInTheDocument();
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

    await screen.findByText(/has asked you to assess them/);

    expect(
      screen.queryByLabelText(/Choose a username/),
    ).not.toBeInTheDocument();
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
