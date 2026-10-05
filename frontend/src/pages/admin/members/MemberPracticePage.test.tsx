/**
 * Member practice page tests.
 *
 * The page is a loader around `MemberPracticePanel`, so these cover what
 * it adds: reading the member for the route, the button to their user
 * account, saving the switches only once confirmed, calling the right
 * endpoint for each change and reading again afterwards, and a 404 when
 * the member cannot be read.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { orgUnits, type MemberPractice } from "@/domains/orgUnit";
import { teachingDoor } from "@/domains/teachingDoor";
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

  it("changes nothing until the switches are saved and confirmed", async () => {
    const user = userEvent.setup();
    const read = vi
      .spyOn(orgUnits, "memberPractice")
      .mockResolvedValue(practice);
    const authorise = vi
      .spyOn(orgUnits, "authorisePractising")
      .mockResolvedValue({ status: "authorised" });
    const withdraw = vi
      .spyOn(orgUnits, "withdrawPractising")
      .mockResolvedValue({ status: "withdrawn" });

    renderPage();
    await user.click(
      await screen.findByRole("switch", {
        name: "Certify Death: may practise here",
      }),
    );
    await user.click(
      screen.getByRole("switch", {
        name: "Perform Venepuncture: may practise here",
      }),
    );
    expect(authorise).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/authorise$/)).toHaveTextContent(
      "Certify Death – authorise",
    );
    expect(within(dialog).getByText(/withdraw$/)).toHaveTextContent(
      "Perform Venepuncture – withdraw",
    );
    expect(authorise).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(authorise).toHaveBeenCalledWith(3, {
        user_id: 4,
        competency: "certify_death",
      }),
    );
    expect(withdraw).toHaveBeenCalledWith(3, 4, "perform_venepuncture");
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Practice updated")).toBeInTheDocument();
  });

  it("goes back without saving when the confirmation is declined", async () => {
    const user = userEvent.setup();
    vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);
    const authorise = vi.spyOn(orgUnits, "authorisePractising");

    renderPage();
    await user.click(
      await screen.findByRole("switch", {
        name: "Certify Death: may practise here",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));

    expect(authorise).not.toHaveBeenCalled();
    expect(
      screen.getByRole("switch", { name: "Certify Death: may practise here" }),
    ).toBeChecked();
  });

  it("keeps Save changes disabled until a switch moves", async () => {
    vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);

    renderPage();

    expect(
      await screen.findByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("cancels back to the organisation or site", async () => {
    const user = userEvent.setup();
    vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(mockNavigate).toHaveBeenCalledWith("../..", { relative: "path" });
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

  it("says so when a save fails", async () => {
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
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Failed to update practice"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("None of the changes could be saved. Please try again."),
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

  describe("teaching", () => {
    const served = {
      organisation_id: 1,
      organisation_name: "Academy",
      modules: [
        { question_bank_id: "colonoscopy", title: "Colonoscopy" },
        { question_bank_id: "chest-xray", title: "Chest X-ray" },
      ],
    };
    const access = {
      modules: [
        {
          question_bank_id: "colonoscopy",
          title: "Colonoscopy",
          may_enter: true,
          missing: [],
          enrolment_ends_on: null,
        },
        {
          question_bank_id: "chest-xray",
          title: "Chest X-ray",
          may_enter: false,
          missing: ["enrolment" as const],
          enrolment_ends_on: null,
        },
      ],
    };

    function serve() {
      vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);
      vi.spyOn(teachingDoor, "modules").mockResolvedValue(served);
      vi.spyOn(teachingDoor, "access").mockResolvedValue(access);
    }

    it("shows the module card where the organisation serves modules", async () => {
      serve();

      renderPage("sites");

      const box = await screen.findByRole("checkbox", {
        name: "Colonoscopy at Academy",
      });
      expect(box).toBeChecked();
      expect(teachingDoor.modules).toHaveBeenCalledWith(3);
      expect(teachingDoor.access).toHaveBeenCalledWith(3, 4);
    });

    it("shows no card where the viewer is refused or nothing is served", async () => {
      vi.spyOn(orgUnits, "memberPractice").mockResolvedValue(practice);
      vi.spyOn(teachingDoor, "modules").mockRejectedValue(new Error("403"));
      const read = vi.spyOn(teachingDoor, "access");

      renderPage();

      await screen.findByRole("heading", { name: "Anita Patel", level: 1 });
      expect(screen.queryByText("Teaching")).toBeNull();
      expect(read).not.toHaveBeenCalled();
    });

    it("admits to a module ticked, at this org unit, on save", async () => {
      serve();
      const admit = vi
        .spyOn(teachingDoor, "admit")
        .mockResolvedValue({ competencies: [], place: false, enrolled: [] });
      renderPage("sites");

      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Chest X-ray at Academy" }),
      );
      // Held until its own save is pressed.
      expect(admit).not.toHaveBeenCalled();
      await userEvent.click(
        screen.getByRole("button", { name: "Save enrolment" }),
      );

      await waitFor(() =>
        expect(admit).toHaveBeenCalledWith(3, 4, ["chest-xray"], null),
      );
    });

    it("ends the enrolment of a module unticked, on save", async () => {
      serve();
      const unenrol = vi
        .spyOn(teachingDoor, "unenrol")
        .mockResolvedValue({ withdrawn: 1 });
      renderPage("sites");

      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Colonoscopy at Academy" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save enrolment" }),
      );

      await waitFor(() =>
        expect(unenrol).toHaveBeenCalledWith(3, 4, "colonoscopy"),
      );
    });

    it("names the module that could not be saved", async () => {
      serve();
      vi.spyOn(teachingDoor, "admit").mockRejectedValue(new Error("500"));
      renderPage("sites");

      await userEvent.click(
        await screen.findByRole("checkbox", { name: "Chest X-ray at Academy" }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Save enrolment" }),
      );

      expect(
        await screen.findByText(
          "Could not save: Chest X-ray. Please try again.",
        ),
      ).toBeInTheDocument();
    });
  });
});
