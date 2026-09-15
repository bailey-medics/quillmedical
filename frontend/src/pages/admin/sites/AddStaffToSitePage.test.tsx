/**
 * AddStaffToSitePage Component Tests
 *
 * The site picker carries the same question as the organisation one:
 * the list is unfiltered, so somebody holding nothing a member of staff
 * would can be selected, and is asked about rather than refused.
 *
 * The page had no tests before this. They start here rather than
 * covering everything it has ever done, so they are about the selection
 * and the grant; the role field appears only where it interacts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import AddStaffToSitePage from "./AddStaffToSitePage";
import * as apiLib from "@/lib/api";

const mockNavigate = vi.fn();

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
  competencies: ["access_patient_records"],
};

/** Holds only their own record — the case the page now asks about. */
const A_PATIENT = {
  id: 2,
  username: "janesmith",
  email: "jane@test.com",
  competencies: ["access_own_patient_records"],
};

/** No staff yet, and the clinical lead post is vacant. */
const EMPTY_SITE = { staff: [], clinical_lead_id: null };

function mockLoad(users: object[], site = EMPTY_SITE) {
  return vi.spyOn(apiLib.api, "get").mockImplementation((path: string) => {
    if (path === "/users") return Promise.resolve({ users });
    return Promise.resolve(site);
  });
}

function renderPage() {
  return renderWithRouter(<AddStaffToSitePage />, {
    routePath: "/admin/sites/:id/add-staff",
    initialRoute: "/admin/sites/1/add-staff",
  });
}

async function selectUser(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  const selectInput = await screen.findByPlaceholderText("Search for a user");
  await user.click(selectInput);
  await user.click(await screen.findByRole("option", { name: label }));
}

async function selectRole(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(screen.getByPlaceholderText("Select a role"));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("AddStaffToSitePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockClear();
  });

  it("renders the page title", async () => {
    mockLoad([]);

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Add staff to site" }),
    ).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(
      new Error("Failed to load data"),
    );

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Failed to load data")).toBeInTheDocument();
    });
  });

  describe("Somebody already staff", () => {
    it("is added without being asked about", async () => {
      mockLoad([A_NURSE]);
      const post = vi
        .spyOn(apiLib.api, "post")
        .mockResolvedValue({ status: "added" });

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "drsmith (dr@test.com)");
      await selectRole(user, "Staff");

      expect(
        screen.queryByText(/holds nothing a member of staff would/),
      ).not.toBeInTheDocument();

      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() => {
        expect(post).toHaveBeenCalledWith("/sites/1/staff", {
          user_id: 1,
          role: "staff",
        });
      });
    });
  });

  describe("Somebody holding nothing staff-like", () => {
    it("brings up the grant fields on selection", async () => {
      mockLoad([A_PATIENT]);

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
      mockLoad([A_PATIENT]);
      const post = vi.spyOn(apiLib.api, "post").mockResolvedValue({});

      const user = userEvent.setup();
      renderPage();

      await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
      await selectUser(user, "janesmith (jane@test.com)");
      await selectRole(user, "Trainee");
      await user.click(screen.getByTestId("submit-button"));

      expect(
        await screen.findByText("Add as a staff member?"),
      ).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    // The longest path in the file: two dropdowns, the profession picker
    // over a catalogue of every profession, then the modal. It fits well
    // inside the default alone, and only overruns when the whole suite
    // is competing for the machine.
    it(
      "grants the chosen profession in the same request",
      { timeout: 15000 },
      async () => {
        mockLoad([A_PATIENT]);
        const post = vi
          .spyOn(apiLib.api, "post")
          .mockResolvedValue({ status: "added" });

        const user = userEvent.setup();
        renderPage();

        await waitFor(() => expect(apiLib.api.get).toHaveBeenCalled());
        await selectUser(user, "janesmith (jane@test.com)");
        await selectRole(user, "Staff");

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
          expect(post).toHaveBeenCalledWith("/sites/1/staff", {
            user_id: 2,
            role: "staff",
            base_profession: "healthcare_assistant",
          });
        });
      },
    );
  });
});
