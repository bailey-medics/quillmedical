/**
 * Member practice page tests.
 *
 * The page is a loader around `MemberPracticePanel`, so these cover what
 * it adds: reading the member for the route, the button to their user
 * account, calling the right endpoint for each change and reading again
 * afterwards, and a 404 when the member cannot be read.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { orgUnits, type MemberPractice } from "@/domains/orgUnit";
import MemberPracticePage from "./MemberPracticePage";

const practice: MemberPractice = {
  user_id: 4,
  username: "a.patel",
  full_name: "Anita Patel",
  org_unit_id: 3,
  org_unit_name: "Ward A",
  qualified: ["perform_venepuncture", "certify_death"],
  authorised: [
    {
      competency: "perform_venepuncture",
      authorised_at: "2026-09-01T09:00:00Z",
      authorised_by: "Admin User",
    },
  ],
  may_grant: true,
};

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage(section: "organisations" | "sites" = "organisations") {
  return renderWithRouter(<MemberPracticePage />, {
    routePath: `/admin/${section}/:id/members/:userId`,
    initialRoute: `/admin/${section}/3/members/4`,
  });
}

describe("MemberPracticePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("reads the member named by the route and shows them", async () => {
    const read = vi
      .spyOn(orgUnits, "memberPractice")
      .mockResolvedValue(practice);

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Anita Patel", level: 1 }),
    ).toBeInTheDocument();
    expect(read).toHaveBeenCalledWith(3, 4);
    expect(screen.getByText("At Ward A")).toBeInTheDocument();
    expect(screen.queryByText(/Back to/)).not.toBeInTheDocument();
  });

  it.each(["organisations", "sites"] as const)(
    "opens their user account from the button, under %s",
    async (section) => {
      const user = userEvent.setup();
      vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);

      renderPage(section);
      await user.click(
        await screen.findByRole("button", { name: "Their user account" }),
      );

      expect(mockNavigate).toHaveBeenCalledWith("/admin/users/4");
    },
  );

  it("authorises through the org_unit and reads again", async () => {
    const user = userEvent.setup();
    const read = vi
      .spyOn(orgUnits, "memberPractice")
      .mockResolvedValue(practice);
    const authorise = vi
      .spyOn(orgUnits, "authorisePractising")
      .mockResolvedValue({ status: "authorised" });

    renderPage();
    await user.click(
      await screen.findByRole("switch", {
        name: "Certify Death: may practise here",
      }),
    );

    expect(authorise).toHaveBeenCalledWith(3, {
      user_id: 4,
      competency: "certify_death",
    });
    // The switch shows its own new state, so no message repeats it.
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Authorised")).not.toBeInTheDocument();
  });

  it("withdraws through the org_unit once confirmed", async () => {
    const user = userEvent.setup();
    const read = vi
      .spyOn(orgUnits, "memberPractice")
      .mockResolvedValue(practice);
    const withdraw = vi
      .spyOn(orgUnits, "withdrawPractising")
      .mockResolvedValue({ status: "withdrawn" });

    renderPage();
    await user.click(
      await screen.findByRole("switch", {
        name: "Perform Venepuncture: may practise here",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(withdraw).toHaveBeenCalledWith(3, 4, "perform_venepuncture");
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Withdrawn")).not.toBeInTheDocument();
  });

  it("grants and authorises through the member endpoint", async () => {
    const user = userEvent.setup();
    vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);
    const grant = vi
      .spyOn(orgUnits, "grantAndAuthorise")
      .mockResolvedValue({ status: "granted_and_authorised" });

    renderPage();
    await user.click(
      await screen.findByRole("button", { name: "Grant competency" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Manage User Accounts" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Grant and authorise" }),
    );

    expect(grant).toHaveBeenCalledWith(3, 4, "manage_users");
    // The competency appearing in the table says it worked.
    expect(
      screen.queryByText("Granted and authorised"),
    ).not.toBeInTheDocument();
  });

  it("says so when a change fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);
    vi.spyOn(orgUnits, "authorisePractising").mockRejectedValue(
      new Error("nope"),
    );

    renderPage();
    await user.click(
      await screen.findByRole("switch", {
        name: "Certify Death: may practise here",
      }),
    );

    expect(
      await screen.findByText("Could not authorise that"),
    ).toBeInTheDocument();
  });

  it("shows not found when the member cannot be read", async () => {
    vi.spyOn(orgUnits, "memberPractice").mockRejectedValue(
      new Error("Member not found"),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "404 – Page not found" }),
    ).toBeInTheDocument();
  });
});
