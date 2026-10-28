/**
 * AddStaffToSitePage: leaving through "Create new user".
 *
 * Apart from the page's other tests because those replace `useNavigate`,
 * and this is about the real navigation: the form blocks leaving while a
 * choice is unsaved, and the button that sends somebody to the new user
 * form must not be asked whether they are sure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddStaffToSitePage from "./AddStaffToSitePage";
import * as apiLib from "@/lib/api";

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { may_grant: null, may_assign_professions: null },
    },
  }),
}));

describe("AddStaffToSitePage, leaving to create a user", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not ask about unsaved changes", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      name: "Oncology",
      members: [],
      clinical_lead_id: null,
    });
    vi.spyOn(apiLib.api, "post")
      .mockResolvedValueOnce({
        status: "found",
        user: {
          id: 9,
          username: "a.patel",
          full_name: "Anita Patel",
          competencies: ["access_patient_records"],
        },
      })
      .mockResolvedValueOnce({ status: "not_found", user: null });

    const user = userEvent.setup();
    renderWithRouter(<AddStaffToSitePage />, {
      routePath: "/admin/sites/:id/add-staff",
      initialRoute: "/admin/sites/1/add-staff",
    });

    // Somebody found and a role chosen, so the form has something
    // unsaved; then somebody else looked up, whom nobody is.
    const box = screen.getByLabelText(/username or email address/i);
    await user.type(box, "a.patel@example.org");
    await user.click(screen.getByRole("button", { name: "Find" }));
    await user.click(await screen.findByPlaceholderText("Select a role"));
    await user.click(await screen.findByRole("option", { name: "Trainee" }));

    await user.clear(box);
    await user.type(box, "new.person@example.org");
    await user.click(screen.getByRole("button", { name: "Find" }));
    await user.click(
      await screen.findByRole("button", { name: "Create new user" }),
    );

    // Gone to the new user form, with nothing asked on the way.
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Add staff to site" }),
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });
});
