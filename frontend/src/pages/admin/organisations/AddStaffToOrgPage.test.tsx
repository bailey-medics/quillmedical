/**
 * AddStaffToOrgPage Component Tests
 *
 * The card itself, what each lookup answer brings up and the question
 * asked about somebody holding nothing staff-like, is tested in
 * `AddStaffForm.test.tsx`. These are about what the page does with it:
 * the organisation it asks about, the request it sends, and where it
 * goes afterwards.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddStaffToOrgPage from "./AddStaffToOrgPage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();
const mockReload = vi.fn().mockResolvedValue(undefined);

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    reload: mockReload,
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

/**
 * Answer the lookup with `answer`, and any other post with what `other`
 * returns. A function, so a rejection is made only when the add is sent:
 * made up front, nothing would be awaiting it yet and Vitest would fail
 * the run on an unhandled rejection.
 */
function mockPost(
  answer: object,
  other: () => Promise<unknown> = () => Promise.resolve({ status: "added" }),
) {
  return vi
    .spyOn(apiLib.api, "post")
    .mockImplementation((path: string) =>
      path.endsWith("/member-lookup") ? Promise.resolve(answer) : other(),
    );
}

function renderPage() {
  return renderWithRouter(<AddStaffToOrgPage />, {
    routePath: "/admin/organisations/:id/add-staff",
    initialRoute: "/admin/organisations/1/add-staff",
  });
}

async function find(user: ReturnType<typeof userEvent.setup>, term: string) {
  await user.type(
    await screen.findByLabelText(/username or email address/i),
    term,
  );
  await user.click(screen.getByRole("button", { name: "Find" }));
}

describe("AddStaffToOrgPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
    mockReload.mockClear();
  });

  it("renders the page title", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Add staff member" }),
    ).toBeInTheDocument();
  });

  it("offers no role: everybody added here is staff", async () => {
    mockPost({ status: "found", user: A_NURSE });

    const user = userEvent.setup();
    renderPage();
    await find(user, "a.patel@example.org");

    expect(await screen.findByTestId("submit-button")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Select a role")).toBeNull();
  });

  it("adds somebody found as staff, and goes back to the organisation", async () => {
    const post = mockPost({ status: "found", user: A_NURSE });

    const user = userEvent.setup();
    renderPage();
    await find(user, "a.patel@example.org");
    await user.click(await screen.findByTestId("submit-button"));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith("/org-units/1/members", {
        user_id: 9,
        capacity: "staff",
      });
    });
    expect(post).toHaveBeenCalledWith("/org-units/1/member-lookup", {
      term: "a.patel@example.org",
    });
    // Their own access may have changed with the membership.
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith("/admin/organisations/1", {
      state: {
        flash: {
          variant: "success",
          title: "Staff member added",
          description: "a.patel has been added to this organisation",
        },
      },
    });
  });

  it("says so when adding fails, and stays on the page", async () => {
    mockPost({ status: "found", user: A_NURSE }, () =>
      Promise.reject(new Error("Server error")),
    );

    const user = userEvent.setup();
    renderPage();
    await find(user, "a.patel@example.org");
    await user.click(await screen.findByTestId("submit-button"));

    expect(await screen.findByText("Server error")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("opens the new user form, filled in, when nobody has the address", async () => {
    mockPost({ status: "not_found", user: null });

    const user = userEvent.setup();
    renderPage();
    await find(user, "new.person@example.org");
    await user.click(
      await screen.findByRole("button", { name: "Create new user" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith(
      "/admin/users/new?email=new.person%40example.org&org_unit=1",
    );
  });
});
