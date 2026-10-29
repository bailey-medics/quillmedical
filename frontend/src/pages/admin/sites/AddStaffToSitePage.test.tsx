/**
 * AddStaffToSitePage Component Tests
 *
 * The card itself, what each lookup answer brings up and the question
 * asked about somebody holding nothing staff-like, is tested in
 * `AddStaffForm.test.tsx`. These are about what the page does with it:
 * the site it asks about, the request it sends for each role, and where
 * it goes afterwards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddStaffToSitePage from "./AddStaffToSitePage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { may_grant: null, may_assign_professions: null },
    },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/** Already staff somewhere, so nothing is asked before adding them. */
const A_NURSE = {
  id: 9,
  username: "a.patel",
  full_name: "Anita Patel",
  competencies: ["access_patient_records"],
};

/** Nobody here yet, and the clinical lead post is vacant. */
const SITE = { name: "Oncology", members: [], clinical_lead_id: null };

function mockSite(site: object = SITE) {
  return vi.spyOn(apiLib.api, "get").mockResolvedValue(site);
}

/** Answer the lookup with `answer`, and any other post with success. */
function mockPost(answer: object) {
  return vi
    .spyOn(apiLib.api, "post")
    .mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith("/member-lookup") ? answer : { status: "added" },
      ),
    );
}

function renderPage() {
  return renderWithRouter(<AddStaffToSitePage />, {
    routePath: "/admin/sites/:id/add-staff",
    initialRoute: "/admin/sites/1/add-staff",
  });
}

async function findAndChooseRole(
  user: ReturnType<typeof userEvent.setup>,
  role: string,
) {
  await user.type(
    await screen.findByLabelText(/username or email address/i),
    "a.patel@example.org",
  );
  await user.click(screen.getByRole("button", { name: "Find" }));
  await user.click(await screen.findByPlaceholderText("Select a role"));
  await user.click(await screen.findByRole("option", { name: role }));
}

describe("AddStaffToSitePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("renders the page title", async () => {
    mockSite();

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Add staff to site" }),
    ).toBeInTheDocument();
  });

  it("shows an error when the site cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("Network error"));

    renderPage();

    expect(await screen.findByText("Network error")).toBeInTheDocument();
  });

  it("asks about this site, and names it in the answer", async () => {
    mockSite();
    const post = mockPost({ status: "found", user: A_NURSE });

    const user = userEvent.setup();
    renderPage();
    await user.type(
      await screen.findByLabelText(/username or email address/i),
      "a.patel@example.org",
    );
    await user.click(screen.getByRole("button", { name: "Find" }));

    expect(post).toHaveBeenCalledWith("/org-units/1/member-lookup", {
      term: "a.patel@example.org",
    });
    expect(
      await screen.findByText(/ready to add to Oncology/),
    ).toBeInTheDocument();
  });

  it("adds somebody found with the role chosen, and goes back to the site", async () => {
    mockSite();
    const post = mockPost({ status: "found", user: A_NURSE });

    const user = userEvent.setup();
    renderPage();
    await findAndChooseRole(user, "Trainee");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/org-units/1/members", {
        user_id: 9,
        capacity: "trainee",
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/admin/sites/1", {
      state: {
        flash: {
          title: "Staff member added",
          description: "a.patel has been added to this site",
        },
      },
    });
  });

  it("adds a clinical lead as staff, then appoints them to the post", async () => {
    mockSite();
    const post = mockPost({ status: "found", user: A_NURSE });
    const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({});

    const user = userEvent.setup();
    renderPage();
    await findAndChooseRole(user, "Clinical lead");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      // What somebody is here, not what post they hold: those were one
      // word on the old address and are two facts now.
      expect(post).toHaveBeenCalledWith("/org-units/1/members", {
        user_id: 9,
        capacity: "staff",
      });
    });
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/org-units/1/clinical-lead", {
        user_id: 9,
      }),
    );
  });

  describe("While somebody else is clinical lead", () => {
    /** Dr Ada Lead holds the post. */
    const LED = {
      ...SITE,
      members: [{ id: 4, username: "dr.lead", full_name: "Dr Ada Lead" }],
      clinical_lead_id: 4,
    };

    it("asks before replacing them, naming both", async () => {
      mockSite(LED);
      const post = mockPost({ status: "found", user: A_NURSE });

      const user = userEvent.setup();
      renderPage();
      await findAndChooseRole(user, "Clinical lead");
      await user.click(screen.getByTestId("submit-button"));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(
        "dr.lead is the clinical lead of Oncology. Make a.patel the clinical lead instead? dr.lead stays at the site, but is no longer its lead.",
      );
      expect(post).not.toHaveBeenCalledWith(
        "/org-units/1/members",
        expect.anything(),
      );
    });

    it("adds nobody when the question is cancelled", async () => {
      mockSite(LED);
      const post = mockPost({ status: "found", user: A_NURSE });
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({});

      const user = userEvent.setup();
      renderPage();
      await findAndChooseRole(user, "Clinical lead");
      await user.click(screen.getByTestId("submit-button"));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Cancel",
        }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(post).not.toHaveBeenCalledWith(
        "/org-units/1/members",
        expect.anything(),
      );
      expect(put).not.toHaveBeenCalled();
    });

    it("adds and appoints them once the question is answered", async () => {
      mockSite(LED);
      const post = mockPost({ status: "found", user: A_NURSE });
      const put = vi.spyOn(apiLib.api, "put").mockResolvedValue({});

      const user = userEvent.setup();
      renderPage();
      await findAndChooseRole(user, "Clinical lead");
      await user.click(screen.getByTestId("submit-button"));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Replace lead",
        }),
      );

      // The API stands the old lead down; the page only names the new.
      await waitFor(() =>
        expect(put).toHaveBeenCalledWith("/org-units/1/clinical-lead", {
          user_id: 9,
        }),
      );
      expect(post).toHaveBeenCalledWith("/org-units/1/members", {
        user_id: 9,
        capacity: "staff",
      });
    });

    it("asks nothing for any other role", async () => {
      mockSite(LED);
      const post = mockPost({ status: "found", user: A_NURSE });

      const user = userEvent.setup();
      renderPage();
      await findAndChooseRole(user, "Staff");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() =>
        expect(post).toHaveBeenCalledWith("/org-units/1/members", {
          user_id: 9,
          capacity: "staff",
        }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("opens the new user form, filled in, when nobody has the address", async () => {
    mockSite();
    mockPost({ status: "not_found", user: null });

    const user = userEvent.setup();
    renderPage();
    await user.type(
      await screen.findByLabelText(/username or email address/i),
      "new.person@example.org",
    );
    await user.click(screen.getByRole("button", { name: "Find" }));
    await user.click(
      await screen.findByRole("button", { name: "Create new user" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/users/new?email=new.person%40example.org&org_unit=1",
    );
  });
});
