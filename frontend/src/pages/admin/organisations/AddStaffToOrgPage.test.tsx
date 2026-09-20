/**
 * AddStaffToOrgPage Component Tests
 *
 * The listing is no longer filtered to staff — `?permission_level=staff`
 * went with the column, and no replacement filter was right, because
 * every candidate hid the patient becoming a healthcare assistant.
 *
 * So the mocks here carry `competencies`, and the page's behaviour
 * divides on them: somebody already staff is added as before, and
 * somebody holding nothing staff-like is asked about first and can be
 * granted a profession in the same act.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddStaffToOrgPage from "./AddStaffToOrgPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();
const mockReload = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ reload: mockReload }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

/** Already staff somewhere: no grant needed, no question asked. */
const A_NURSE = {
  id: 1,
  username: "drsmith",
  email: "dr@test.com",
  full_name: "Dr Smith",
  competencies: ["access_patient_records"],
};

/** Holds only their own record — the case the page now asks about. */
const A_PATIENT = {
  id: 2,
  username: "janesmith",
  email: "jane@test.com",
  full_name: "Jane Smith",
  competencies: ["access_own_patient_records"],
};

function renderPage() {
  return renderWithRouter(<AddStaffToOrgPage />, {
    routePath: "/admin/organisations/:id/add-staff",
    initialRoute: "/admin/organisations/1/add-staff",
  });
}

async function selectUser(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  const selectInput = await screen.findByPlaceholderText("Search for a user");
  await user.click(selectInput);
  const option = await screen.findByRole("option", { name: label });
  await user.click(option);
}

describe("AddStaffToOrgPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    mockReload.mockClear();
  });

  it("renders page title", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Add staff member" }),
    ).toBeInTheDocument();
  });

  it("loads users excluding current org members", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({
      users: [A_NURSE, A_PATIENT],
    });

    renderPage();

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalledWith("/users?exclude_org=1");
    });
  });

  it("disables submit button when no user selected", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("submit-button")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
  });

  it("navigates back on cancel", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [] });

    renderPage();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1");
  });

  it("shows error on API failure", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_NURSE] });
    vi.spyOn(apiLib.api, "post").mockRejectedValue(
      new Error("User is already a staff member of this organisation"),
    );

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    await selectUser(user, "drsmith (dr@test.com)");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(
        screen.getByText("User is already a staff member of this organisation"),
      ).toBeInTheDocument();
    });
  });

  it("navigates to organisation on successful submission", async () => {
    vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_NURSE] });
    vi.spyOn(apiLib.api, "post").mockResolvedValue({
      organisation_id: 1,
      user_id: 1,
      username: "drsmith",
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(apiLib.api.get).toHaveBeenCalled();
    });

    await selectUser(user, "drsmith (dr@test.com)");
    await user.click(screen.getByTestId("submit-button"));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1", {
        state: {
          flash: {
            variant: "success",
            title: "Staff member added",
            description: "drsmith has been added to this organisation",
          },
        },
      });
    });

    expect(mockReload).toHaveBeenCalledOnce();
  });

  it("shows error when user loading fails", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(
      new Error("Failed to load users"),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load users")).toBeInTheDocument();
    });
  });

  describe("Somebody already staff", () => {
    it("is added without being asked about", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_NURSE] });
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ organisation_id: 1, user_id: 1 });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "drsmith (dr@test.com)");

      // No question, and nothing to grant.
      expect(
        screen.queryByText(/holds nothing a member of staff would/),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith("/org-units/1/members", {
          user_id: 1,
          // The old address assumed this; the new one asks, because a
          // place takes trainees and external assessors too.
          capacity: "staff",
        });
      });
    });
  });

  describe("Somebody holding nothing staff-like", () => {
    it("brings up the grant fields on selection", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_PATIENT] });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "janesmith (jane@test.com)");

      expect(
        await screen.findByText(/holds nothing a member of staff would/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: /Base profession/ }),
      ).toBeInTheDocument();
    });

    it("asks for confirmation before submitting", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_PATIENT] });
      const post = vi.spyOn(apiLib.api, "post").mockResolvedValue({});

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "janesmith (jane@test.com)");
      await user.click(screen.getByTestId("submit-button"));

      expect(
        await screen.findByText("Add as a staff member?"),
      ).toBeInTheDocument();
      // Nothing is sent until the question is answered.
      expect(post).not.toHaveBeenCalled();
    });

    it("sends nothing if the confirmation is cancelled", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_PATIENT] });
      const post = vi.spyOn(apiLib.api, "post").mockResolvedValue({});

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "janesmith (jane@test.com)");
      await user.click(screen.getByTestId("submit-button"));

      await screen.findByText("Add as a staff member?");
      const modal = screen.getByRole("dialog");
      await user.click(
        within(modal).getByRole("button", { name: /Cancel|Back/ }),
      );

      expect(post).not.toHaveBeenCalled();
    });

    it("grants the chosen profession in the same request", async () => {
      vi.spyOn(apiLib.api, "get").mockResolvedValue({ users: [A_PATIENT] });
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ organisation_id: 1, user_id: 2 });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "janesmith (jane@test.com)");

      const professionSelect = await screen.findByRole("combobox", {
        name: /Base profession/,
      });
      await user.click(professionSelect);
      await user.click(
        await screen.findByRole("option", {
          name: "Healthcare Assistant (HCA)",
        }),
      );

      await user.click(screen.getByTestId("submit-button"));
      await screen.findByText("Add as a staff member?");
      const modal = screen.getByRole("dialog");
      await user.click(
        within(modal).getByRole("button", { name: "Add as staff" }),
      );

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith("/org-units/1/members", {
          user_id: 2,
          capacity: "staff",
          base_profession: "healthcare_assistant",
        });
      });
    });
  });
});
