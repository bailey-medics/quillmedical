/**
 * UserInfoUpdatePage Component Tests
 *
 * Tests multi-step user creation form:
 * - Step navigation
 * - Form validation
 * - Data persistence across steps
 * - API submission
 */
import { describe, it, expect, vi, beforeEach, onTestFinished } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiModule from "@/lib/api";
import UserInfoUpdatePage from "./UserInfoUpdatePage";

/**
 * A trust, a building inside it, and a ward inside the building.
 *
 * The ward is two levels down on purpose: it is still that trust's ward,
 * and the form has to say so without being told.
 */
const PLACES = [
  {
    id: 1,
    name: "Test Org",
    type: "hospital_team",
    type_display_name: "Hospital team",
    is_root: true,
    parent_id: null,
    location: "",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 9,
    name: "Main building",
    type: "building",
    type_display_name: "Building",
    is_root: false,
    parent_id: 1,
    location: "",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: 10,
    name: "Test Site",
    type: "ward",
    type_display_name: "Ward",
    is_root: false,
    parent_id: 9,
    location: "",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn().mockImplementation((url: string) => {
      if (url === "/org-units") {
        return Promise.resolve({ org_units: PLACES });
      }
      return Promise.resolve({});
    }),
    patch: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useBlocker: () => ({ state: "unblocked" }),
  };
});

// What the viewer may grant. Null means no limit, as for a holder of
// `manage_users`; a test signing in a teaching admin sets it first.
const scope = vi.hoisted(() => ({
  may_assign_professions: null as string[] | null,
  // What the viewer holds. Empty by default, so the Practice step, which
  // asks for `manage_practising_competencies`, is not offered and the
  // rest of these tests walk the form as it was before the step.
  competencies: [] as string[],
  // Whether the viewer operates Quill. An operator by default, so these
  // tests walk every step the form has: the Platform role step is shown
  // to an operator only. A test of what anybody else sees sets
  // `standard` first.
  platform_role: "superadmin" as "superadmin" | "standard",
  // The features switched on where the viewer belongs. None by default;
  // the link to the page's guide is shown only where teaching is on.
  enabled_features: [] as string[],
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        platform_role: scope.platform_role,
        may_assign_professions: scope.may_assign_professions,
        competencies: scope.competencies,
        enabled_features: scope.enabled_features,
      },
    },
  }),
}));

describe("UserInfoUpdatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Step 1: Basic details", () => {
    it("offers a teaching admin only the teaching professions", async () => {
      scope.may_assign_professions = ["teaching_delegate", "teaching_admin"];
      try {
        const user = userEvent.setup();
        renderWithRouter(<UserInfoUpdatePage />);

        await user.click(
          screen.getByRole("combobox", { name: /base profession/i }),
        );

        expect(
          await screen.findByRole("option", { name: "Teaching delegate" }),
        ).toBeInTheDocument();
        expect(
          screen.queryByRole("option", { name: "Consultant" }),
        ).not.toBeInTheDocument();
      } finally {
        scope.may_assign_professions = null;
      }
    });

    it("links to the guide to adding a delegate, where teaching is on", () => {
      scope.enabled_features = ["teaching"];
      try {
        renderWithRouter(<UserInfoUpdatePage />);

        expect(
          screen.getByRole("link", { name: "Guide: Add a delegate by hand" }),
        ).toHaveAttribute("href", "/guides/add-a-delegate-by-hand");
      } finally {
        scope.enabled_features = [];
      }
    });

    it("offers no guide where teaching is off", () => {
      renderWithRouter(<UserInfoUpdatePage />);

      expect(
        screen.queryByRole("link", { name: /^Guide:/ }),
      ).not.toBeInTheDocument();
    });

    it("renders step 1 with all required fields", () => {
      renderWithRouter(<UserInfoUpdatePage />);

      expect(screen.getByText("Create new user")).toBeInTheDocument();
      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/initial password/i)).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: /base profession/i }),
      ).toBeInTheDocument();
    });

    it("shows validation errors when trying to proceed with empty fields", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Name is required")).toBeInTheDocument();
      });
      expect(screen.getByText("Email is required")).toBeInTheDocument();
      expect(screen.getByText("Username is required")).toBeInTheDocument();
      expect(screen.getByText("Password is required")).toBeInTheDocument();
      expect(
        screen.getByText("Base profession is required"),
      ).toBeInTheDocument();
    });

    it("validates email format", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, "invalid-email");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid email format")).toBeInTheDocument();
      });
    }, 30000);

    it("validates password length", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      const passwordInput = screen.getByLabelText(/initial password/i);
      await user.type(passwordInput, "short");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Password must be at least 8 characters"),
        ).toBeInTheDocument();
      });
    }, 30000);

    it("proceeds to step 2 when validation passes", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      // Fill all required fields
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      // Select base profession
      const professionSelect = screen.getByRole("combobox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });
    }, 30000);
  });

  describe("Step 3: Competencies", () => {
    async function fillStep1AndProceed(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("combobox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      // Step 1 → Step 2 (Organisation/site)
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });

      // Step 2 → Step 3 (Competencies)
      await user.click(screen.getByRole("button", { name: /next/i }));
    }

    it("renders competency configuration fields", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });
      expect(
        screen.getAllByLabelText(/held beyond the profession/i)[0],
      ).toBeInTheDocument();
      expect(
        screen.getAllByLabelText(/in the profession, not held/i)[0],
      ).toBeInTheDocument();
    }, 30000);

    it("shows base profession information", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(screen.getByText(/base profession:/i)).toBeInTheDocument();
      });
      // The profession seeds a new user once; it is not what they hold.
      expect(screen.getByText(/what it gives a new user/i)).toBeInTheDocument();
    }, 30000);

    it("navigates back to organisation step", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /back/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });
    }, 30000);

    it("proceeds to step 4 permissions", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await fillStep1AndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Platform role" }),
        ).toBeInTheDocument();
      });
    }, 30000);
  });

  describe("Where the person belongs", () => {
    /** Walk to step 2, where the two org_unit controls are. */
    async function toThePlacesStep(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );
      await user.click(
        screen.getByRole("combobox", { name: /base profession/i }),
      );
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });
    }

    it("offers the organisations it was given", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);
      await toThePlacesStep(user);

      await user.click(
        screen.getByRole("combobox", { name: /^organisation/i }),
      );

      expect(
        await screen.findByRole("option", { name: "Test Org" }),
      ).toBeInTheDocument();
    }, 30000);

    it("sends the org_units chosen, in org_unit ids", async () => {
      // One list, whichever control they came from: an organisation and
      // the org_units inside it are rows in the same table.
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      renderWithRouter(<UserInfoUpdatePage />);
      await toThePlacesStep(user);

      await user.click(
        screen.getByRole("combobox", { name: /^organisation/i }),
      );
      await user.click(await screen.findByRole("option", { name: "Test Org" }));
      await user.click(screen.getByRole("combobox", { name: /^site/i }));
      await user.click(
        await screen.findByRole("option", { name: "Test Org - Test Site" }),
      );

      // Step 2 → 3 → 4 → review
      for (let step = 0; step < 3; step += 1) {
        await user.click(screen.getByRole("button", { name: /next/i }));
      }
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Review" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/users",
          expect.objectContaining({ org_unit_ids: [1, 10] }),
        );
      });
    }, 30000);

    it("lists a ward under the trust it is inside, however deep", async () => {
      // The ward sits in a building, which sits in the trust. It is
      // still the trust's ward, and the form works that out by walking
      // rather than by reading the parent and hoping.
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);
      await toThePlacesStep(user);

      await user.click(screen.getByRole("combobox", { name: /^site/i }));

      expect(
        await screen.findByRole("option", { name: "Test Org - Test Site" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Test Org - Main building" }),
      ).toBeInTheDocument();
    }, 30000);

    it("opens with the address and org_unit it was sent, for a new user", async () => {
      // The add-staff page sends somebody here when a lookup finds no
      // account, with the address and the site they were being added to.
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      // `renderWithRouter` leaves the address on the window, where the
      // next test's page would read it and open filled in too.
      onTestFinished(() => window.history.pushState({}, "", "/"));

      renderWithRouter(<UserInfoUpdatePage />, {
        initialRoute:
          "/admin/users/new?email=new.person%40example.org&org_unit=10",
      });

      expect(screen.getByLabelText(/email/i)).toHaveValue(
        "new.person@example.org",
      );

      await user.type(screen.getByLabelText(/full name/i), "New Person");
      await user.type(screen.getByLabelText(/username/i), "new.person");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );
      await user.click(
        screen.getByRole("combobox", { name: /base profession/i }),
      );
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      // Step 1 → 2 → 3 → 4 → review, choosing nothing on the way
      for (let step = 0; step < 4; step += 1) {
        await user.click(screen.getByRole("button", { name: /next/i }));
      }
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Review" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/users",
          expect.objectContaining({
            email: "new.person@example.org",
            org_unit_ids: [10],
          }),
        );
      });
    }, 30000);

    it("opens with the username it was sent, for a new user", () => {
      onTestFinished(() => window.history.pushState({}, "", "/"));

      renderWithRouter(<UserInfoUpdatePage />, {
        initialRoute: "/admin/users/new?username=new.person&org_unit=10",
      });

      expect(screen.getByLabelText(/username/i)).toHaveValue("new.person");
      expect(screen.getByLabelText(/email/i)).toHaveValue("");
    });

    it("offers a site whose organisation the viewer cannot see", async () => {
      // Somebody who runs one site and not its trust is answered with
      // the site alone. It is still theirs to put people in.
      const get = vi.mocked(apiModule.api.get);
      const usual = get.getMockImplementation();
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === "/org-units"
            ? { org_units: [{ ...PLACES[2], id: 4, name: "Oncology" }] }
            : {},
        ),
      );

      try {
        const user = userEvent.setup();
        renderWithRouter(<UserInfoUpdatePage />);
        await toThePlacesStep(user);

        await user.click(screen.getByRole("combobox", { name: /^site/i }));
        expect(
          await screen.findByRole("option", { name: "Oncology" }),
        ).toBeInTheDocument();

        // No organisation is offered: the unseen one is not a choice.
        await user.click(
          screen.getByRole("combobox", { name: /^organisation/i }),
        );
        expect(screen.queryByRole("option", { name: "" })).toBeNull();
      } finally {
        get.mockImplementation(usual!);
      }
    }, 30000);
  });

  describe("Step 4: Permissions & Review", () => {
    async function fillStepsAndProceed(
      user: ReturnType<typeof userEvent.setup>,
    ) {
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("combobox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      // Step 1 → Step 2 (Organisation/site)
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });

      // Step 2 → Step 3 (Competencies)
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });

      // Step 3 → Step 4 (Permissions)
      await user.click(screen.getByRole("button", { name: /next/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Platform role" }),
        ).toBeInTheDocument();
      });

      // Step 4 → Step 5 (Review)
      await user.click(screen.getByRole("button", { name: /next/i }));
    }

    it("renders permissions selection and review", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await fillStepsAndProceed(user);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Review" }),
        ).toBeInTheDocument();
      });
      // Check for review section by looking for unique review field labels
      expect(screen.getByText("Name:")).toBeInTheDocument();
      expect(screen.getByText("Email:")).toBeInTheDocument();
    }, 30000);

    it("displays review information correctly", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await fillStepsAndProceed(user);

      await waitFor(() => {
        expect(screen.getByText("Dr Jane Smith")).toBeInTheDocument();
      });
      expect(screen.getByText("jane.smith@example.com")).toBeInTheDocument();
      expect(screen.getByText("janesmith")).toBeInTheDocument();
    }, 30000);
  });

  describe("Form submission", () => {
    it("submits form data to API when create user is clicked", async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      // Fill step 1
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("combobox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 2 - Organisation/site
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 3 - Competencies
      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 4 - permissions
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Platform role" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));

      // Step 5 - review and submit
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Review" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(mockPost).toHaveBeenCalledWith(
          "/users",
          expect.objectContaining({
            name: "Dr Jane Smith",
            email: "jane.smith@example.com",
            username: "janesmith",
            password: "password123",
          }),
        );
      });
    }, 30000);

    it("shows success confirmation after successful submission", async () => {
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      // Fill and submit
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("combobox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Platform role" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Review" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith("/admin/users", {
          state: {
            flash: expect.objectContaining({
              variant: "success",
              title: "User created",
            }),
          },
        });
      });
    }, 30000);
  });

  describe("Navigation", () => {
    it("navigates back to admin when cancel is clicked", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(mockNavigate).toHaveBeenCalledWith("/admin/users");
    });

    it("stays on Review and says why when the save fails", async () => {
      const mockPost = vi
        .fn()
        .mockRejectedValue(new Error("Something went wrong on the server"));
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;

      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);

      // Complete form
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );

      const professionSelect = screen.getByRole("combobox", {
        name: /base profession/i,
      });
      await user.click(professionSelect);
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Organisation/site" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByText("Competency configuration"),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Platform role" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /next/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Review" }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong on the server"),
        ).toBeInTheDocument();
      });
      expect(screen.getByText("User not created")).toBeInTheDocument();
      // Still on Review, with the button there to try again, and no
      // step after it.
      expect(
        screen.getByRole("heading", { name: "Review" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create user/i }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Confirmation")).not.toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    }, 30000);
  });

  describe("Page header", () => {
    /** Answer the user fetch with this account, and put it back after. */
    function serveUser(account: Record<string, unknown>) {
      onTestFinished(() => window.history.pushState({}, "", "/"));
      const get = vi.mocked(apiModule.api.get);
      const usual = get.getMockImplementation();
      onTestFinished(() => {
        get.mockImplementation(usual!);
      });
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === "/org-units"
            ? { org_units: PLACES }
            : url === "/users/7"
              ? account
              : {},
        ),
      );
    }

    it("says create new user when there is nobody to name", () => {
      renderWithRouter(<UserInfoUpdatePage />);

      expect(
        screen.getByRole("heading", { name: "Create new user" }),
      ).toBeInTheDocument();
    });

    it("names the user being edited", async () => {
      serveUser({ name: "Dr Jane Smith", username: "janesmith" });

      renderWithRouter(<UserInfoUpdatePage />, {
        routePath: "/admin/users/:id/edit",
        initialRoute: "/admin/users/7/edit",
      });

      expect(
        await screen.findByRole("heading", { name: "Edit user: janesmith" }),
      ).toBeInTheDocument();
    });

    it("keeps the saved username while the field is retyped", async () => {
      serveUser({ name: "Dr Jane Smith", username: "janesmith" });
      const user = userEvent.setup();

      renderWithRouter(<UserInfoUpdatePage />, {
        routePath: "/admin/users/:id/edit",
        initialRoute: "/admin/users/7/edit",
      });

      const field = await screen.findByLabelText(/username/i);
      await user.clear(field);
      await user.type(field, "other");

      expect(
        screen.getByRole("heading", { name: "Edit user: janesmith" }),
      ).toBeInTheDocument();
    });

    it("falls back to the plain title when no username comes back", async () => {
      serveUser({ name: "Dr Jane Smith" });

      renderWithRouter(<UserInfoUpdatePage />, {
        routePath: "/admin/users/:id/edit",
        initialRoute: "/admin/users/7/edit",
      });

      await screen.findByLabelText(/full name/i);
      expect(
        screen.getByRole("heading", { name: "Edit user" }),
      ).toBeInTheDocument();
    });
  });

  describe("Practice", () => {
    // Offered to somebody who may set where a competency is used.
    //
    // "Next" is matched whole throughout: the Practice step's tables
    // page their rows, and their "next page" button would match too.
    beforeEach(() => {
      scope.competencies = ["manage_users", "manage_practising_competencies"];
      onTestFinished(() => {
        scope.competencies = [];
      });
    });

    /** Fill in step 1, choose Test Org in step 2, and stop on step 3. */
    async function toCompetencies(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
      await user.type(
        screen.getByLabelText(/email/i),
        "jane.smith@example.com",
      );
      await user.type(screen.getByLabelText(/username/i), "janesmith");
      await user.type(
        screen.getByLabelText(/initial password/i),
        "password123",
      );
      await user.click(
        screen.getByRole("combobox", { name: /base profession/i }),
      );
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");
      await user.click(screen.getByRole("button", { name: /^next$/i }));

      await user.click(
        await screen.findByRole("combobox", { name: /^organisation/i }),
      );
      await user.click(await screen.findByRole("option", { name: "Test Org" }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "Competency configuration" }),
        ).toBeInTheDocument();
      });
    }

    it("is not offered to somebody who may not set practice", async () => {
      scope.competencies = ["manage_users"];
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);
      await toCompetencies(user);

      await user.click(screen.getByRole("button", { name: /^next$/i }));

      // Straight on to the platform role, as before the step existed.
      expect(
        await screen.findByRole("heading", { name: "Platform role" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    }, 30000);

    it("follows Competencies, with everything switched off for a new user", async () => {
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);
      await toCompetencies(user);

      await user.click(screen.getByRole("button", { name: /^next$/i }));

      // The step is its cards: one for the org_unit chosen.
      expect(
        await screen.findByRole("heading", { name: "Test Org" }),
      ).toBeVisible();
      const switches = screen.getAllByRole("switch");
      expect(switches.length).toBeGreaterThan(0);
      for (const input of switches) {
        expect(input).not.toBeChecked();
      }
    }, 30000);

    it("sends what was switched on, and shows it in the review", async () => {
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;
      renderWithRouter(<UserInfoUpdatePage />);
      await toCompetencies(user);
      await user.click(screen.getByRole("button", { name: /^next$/i }));

      const first = (await screen.findAllByRole("switch"))[0];
      const competency = first
        .getAttribute("aria-label")!
        .replace(" at Test Org: may practise here", "");
      await user.click(first);

      // Practice → Permissions → Review
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      expect(
        await screen.findByText(`May practise: ${competency}`),
      ).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /create user/i }));

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      const sent = mockPost.mock.calls[0][1] as {
        practising: { org_unit_id: number; competencies: string[] }[];
      };
      expect(sent.practising).toHaveLength(1);
      expect(sent.practising[0].org_unit_id).toBe(1);
      expect(sent.practising[0].competencies).toHaveLength(1);
    }, 30000);

    it("drops the practice at an org_unit that is taken away again", async () => {
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;
      renderWithRouter(<UserInfoUpdatePage />);
      await toCompetencies(user);
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.click((await screen.findAllByRole("switch"))[0]);

      // Back to Organisation/site, and take Test Org off.
      await user.click(screen.getByRole("button", { name: /back|previous/i }));
      await user.click(screen.getByRole("button", { name: /back|previous/i }));
      await user.click(
        await screen.findByRole("combobox", { name: /^organisation/i }),
      );
      await user.click(await screen.findByRole("option", { name: "Test Org" }));

      // Organisation/site → Competencies → Practice → Permissions → Review
      for (let step = 0; step < 4; step += 1) {
        await user.click(screen.getByRole("button", { name: /^next$/i }));
      }
      await user.click(
        await screen.findByRole("button", { name: /create user/i }),
      );

      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith(
        "/users",
        expect.objectContaining({ org_unit_ids: [], practising: [] }),
      );
    }, 30000);

    it("opens an edit as saved, and names what it will withdraw", async () => {
      onTestFinished(() => window.history.pushState({}, "", "/"));
      const get = vi.mocked(apiModule.api.get);
      const usual = get.getMockImplementation();
      onTestFinished(() => {
        get.mockImplementation(usual!);
      });
      get.mockImplementation((url: string) =>
        Promise.resolve(
          url === "/org-units"
            ? { org_units: PLACES }
            : url === "/users/7"
              ? {
                  name: "Dr Jane Smith",
                  email: "jane.smith@example.com",
                  username: "janesmith",
                  base_profession: "consultant",
                  additional_competencies: [],
                  removed_competencies: [],
                  platform_role: "standard",
                  org_unit_ids: [1],
                  practising: [
                    { org_unit_id: 1, competencies: ["certify_death"] },
                  ],
                }
              : {},
        ),
      );
      const mockPatch = vi.fn().mockResolvedValue({});
      (apiModule.api.patch as ReturnType<typeof vi.fn>) = mockPatch;
      const user = userEvent.setup();

      renderWithRouter(<UserInfoUpdatePage />, {
        routePath: "/admin/users/:id/edit",
        initialRoute: "/admin/users/7/edit",
      });

      // Basic details → Organisation/site → Competencies → Practice
      await screen.findByLabelText(/full name/i);
      for (let step = 0; step < 3; step += 1) {
        await user.click(screen.getByRole("button", { name: /^next$/i }));
      }
      const saved = await screen.findByRole("switch", {
        // On the table's first page: a consultant holds more than one
        // page of competencies.
        name: "Certify Death at Test Org: may practise here",
      });
      expect(saved).toBeChecked();
      await user.click(saved);

      // Practice → Permissions → Review
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      expect(
        await screen.findByText("Withdrawn: Certify Death"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/stops them practising it there straight away/),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /update user/i }));

      await waitFor(() => {
        expect(mockPatch).toHaveBeenCalledWith(
          "/users/7",
          expect.objectContaining({
            practising: [{ org_unit_id: 1, competencies: [] }],
          }),
        );
      });
    }, 30000);
  });

  /** Fill Basic details, choose Test Org, and stop on Competencies. */
  async function walkToCompetencies(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/full name/i), "Dr Jane Smith");
    await user.type(screen.getByLabelText(/email/i), "jane.smith@example.com");
    await user.type(screen.getByLabelText(/username/i), "janesmith");
    await user.type(screen.getByLabelText(/initial password/i), "password123");
    await user.click(
      screen.getByRole("combobox", { name: /base profession/i }),
    );
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await user.click(
      await screen.findByRole("combobox", { name: /^organisation/i }),
    );
    await user.click(await screen.findByRole("option", { name: "Test Org" }));
    await user.click(screen.getByRole("button", { name: /^next$/i }));
    await screen.findByRole("heading", { name: "Competency configuration" });
  }

  /** Sign the viewer in as somebody else for one test. */
  function viewAs(
    platformRole: "superadmin" | "standard",
    competencies: string[],
  ) {
    const before = {
      platform_role: scope.platform_role,
      competencies: scope.competencies,
    };
    scope.platform_role = platformRole;
    scope.competencies = competencies;
    onTestFinished(() => {
      scope.platform_role = before.platform_role;
      scope.competencies = before.competencies;
    });
  }

  /** Make Test Org serve one teaching module, for one test. */
  function serveAModule(user?: Record<string, unknown>) {
    const get = vi.mocked(apiModule.api.get);
    const usual = get.getMockImplementation();
    onTestFinished(() => {
      get.mockImplementation(usual!);
    });
    get.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/org-units"
          ? { org_units: PLACES }
          : url === "/teaching/admin/org-units/1/modules"
            ? {
                organisation_id: 1,
                organisation_name: "Test Org",
                modules: [
                  { question_bank_id: "colonoscopy", title: "Colonoscopy" },
                  { question_bank_id: "chest-xray", title: "Chest X-ray" },
                ],
              }
            : url === "/users/7" && user
              ? user
              : {},
      ),
    );
  }

  describe("Platform role", () => {
    it("is not offered to somebody who is not an operator", async () => {
      viewAs("standard", ["manage_users"]);
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;
      renderWithRouter(<UserInfoUpdatePage />);
      await walkToCompetencies(user);

      // Competencies → Review: there is nothing for them to choose.
      await user.click(screen.getByRole("button", { name: /^next$/i }));

      expect(
        await screen.findByRole("heading", { name: "Review" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Platform role")).toBeNull();
      // Nor a line in the review about a choice they were not shown.
      expect(screen.queryByText("Platform role:")).toBeNull();

      await user.click(screen.getByRole("button", { name: /create user/i }));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith(
        "/users",
        expect.objectContaining({ platform_role: "standard" }),
      );
    }, 30000);

    it("is offered to an operator, under that name", async () => {
      viewAs("superadmin", []);
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);
      await walkToCompetencies(user);

      await user.click(screen.getByRole("button", { name: /^next$/i }));

      expect(
        await screen.findByRole("heading", { name: "Platform role" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Permissions")).toBeNull();
    }, 30000);

    it("leaves an operator's role as it was when the step is hidden", async () => {
      onTestFinished(() => window.history.pushState({}, "", "/"));
      viewAs("standard", ["manage_users"]);
      serveAModule({
        name: "An Operator",
        email: "operator@example.com",
        username: "operator",
        base_profession: "consultant",
        additional_competencies: [],
        removed_competencies: [],
        platform_role: "superadmin",
        org_unit_ids: [1],
        practising: [],
      });
      const mockPatch = vi.fn().mockResolvedValue({});
      (apiModule.api.patch as ReturnType<typeof vi.fn>) = mockPatch;
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />, {
        routePath: "/admin/users/:id/edit",
        initialRoute: "/admin/users/7/edit",
      });

      // Basic details → Organisation/site → Competencies → Review
      await screen.findByLabelText(/full name/i);
      for (let step = 0; step < 3; step += 1) {
        await user.click(screen.getByRole("button", { name: /^next$/i }));
      }
      await user.click(
        await screen.findByRole("button", { name: /update user/i }),
      );

      await waitFor(() => expect(mockPatch).toHaveBeenCalled());
      expect(mockPatch).toHaveBeenCalledWith(
        "/users/7",
        expect.objectContaining({ platform_role: "superadmin" }),
      );
    }, 30000);
  });

  describe("Enrolment", () => {
    it("is offered to a teaching admin where the organisation serves modules", async () => {
      viewAs("standard", ["manage_teaching"]);
      serveAModule();
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;
      renderWithRouter(<UserInfoUpdatePage />);
      await walkToCompetencies(user);

      // Competencies → Practice (a scoped manager sets it) → Enrolment
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));

      const box = await screen.findByRole("checkbox", {
        name: "Colonoscopy at Test Org",
      });
      expect(box).not.toBeChecked();
      await user.click(box);

      // Enrolment → Review: no Platform role step for them.
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      expect(
        await screen.findByText("Enrolled on: Colonoscopy"),
      ).toBeInTheDocument();
      // The profession chosen holds neither learner competency, so the
      // review says the save will give them.
      expect(
        screen.getByText(
          "Enrolling also gives them: View Own Teaching Results, Take Teaching Modules",
        ),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /create user/i }));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      expect(mockPost).toHaveBeenCalledWith(
        "/users",
        expect.objectContaining({
          teaching_enrolments: [
            {
              org_unit_id: 1,
              modules: [{ module_id: "colonoscopy", ends_on: null }],
            },
          ],
        }),
      );
    }, 30000);

    it("is not offered where the organisation serves nothing", async () => {
      viewAs("standard", ["manage_teaching"]);
      const user = userEvent.setup();
      const mockPost = vi.fn().mockResolvedValue({ data: { id: 1 } });
      (apiModule.api.post as ReturnType<typeof vi.fn>) = mockPost;
      renderWithRouter(<UserInfoUpdatePage />);
      await walkToCompetencies(user);

      // Competencies → Practice → Review
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));

      expect(
        await screen.findByRole("heading", { name: "Review" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Enrolment")).toBeNull();
      await user.click(screen.getByRole("button", { name: /create user/i }));
      await waitFor(() => expect(mockPost).toHaveBeenCalled());
      // Nothing is said about enrolments, so the server leaves them.
      expect(mockPost.mock.calls[0][1]).not.toHaveProperty(
        "teaching_enrolments",
      );
    }, 30000);

    it("is not offered to a user manager who does not run teaching", async () => {
      viewAs("standard", ["manage_users"]);
      serveAModule();
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />);
      await walkToCompetencies(user);

      await user.click(screen.getByRole("button", { name: /^next$/i }));

      expect(
        await screen.findByRole("heading", { name: "Review" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Enrolment")).toBeNull();
      expect(apiModule.api.get).not.toHaveBeenCalledWith(
        "/teaching/admin/org-units/1/modules",
      );
    }, 30000);

    it("opens an edit as saved, and names what it will take them off", async () => {
      onTestFinished(() => window.history.pushState({}, "", "/"));
      viewAs("superadmin", []);
      serveAModule({
        name: "Dr Jane Smith",
        email: "jane.smith@example.com",
        username: "janesmith",
        base_profession: "teaching_delegate",
        additional_competencies: [],
        removed_competencies: [],
        platform_role: "standard",
        org_unit_ids: [1],
        practising: [],
        teaching_enrolments: [
          {
            org_unit_id: 1,
            modules: [
              { module_id: "colonoscopy", ends_on: null },
              { module_id: "chest-xray", ends_on: "2027-03-01T23:59:59Z" },
            ],
          },
        ],
      });
      const mockPatch = vi.fn().mockResolvedValue({});
      (apiModule.api.patch as ReturnType<typeof vi.fn>) = mockPatch;
      const user = userEvent.setup();
      renderWithRouter(<UserInfoUpdatePage />, {
        routePath: "/admin/users/:id/edit",
        initialRoute: "/admin/users/7/edit",
      });

      // Basic details → Organisation/site → Competencies → Enrolment
      await screen.findByLabelText(/full name/i);
      for (let step = 0; step < 3; step += 1) {
        await user.click(screen.getByRole("button", { name: /^next$/i }));
      }
      const colonoscopy = await screen.findByRole("checkbox", {
        name: "Colonoscopy at Test Org",
      });
      expect(colonoscopy).toBeChecked();
      expect(
        screen.getByRole("checkbox", { name: "Chest X-ray at Test Org" }),
      ).toBeChecked();
      await user.click(colonoscopy);

      // Enrolment → Platform role → Review
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      await user.click(screen.getByRole("button", { name: /^next$/i }));
      expect(
        await screen.findByText("Taken off: Colonoscopy"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Enrolled on: Chest X-ray (until 1 March 2027)"),
      ).toBeInTheDocument();
      // A delegate holds both learner competencies already.
      expect(screen.queryByText(/Enrolling also gives them/)).toBeNull();

      await user.click(screen.getByRole("button", { name: /update user/i }));
      await waitFor(() => expect(mockPatch).toHaveBeenCalled());
      expect(mockPatch).toHaveBeenCalledWith(
        "/users/7",
        expect.objectContaining({
          teaching_enrolments: [
            {
              org_unit_id: 1,
              modules: [
                { module_id: "chest-xray", ends_on: "2027-03-01T23:59:59Z" },
              ],
            },
          ],
        }),
      );
    }, 30000);
  });
});
