/**
 * AddStaffForm tests.
 *
 * The card opens with the lookup alone, and what follows depends on its
 * answer. The answers come from the `onLookUp` prop, so each test hands
 * back the one it is about rather than stubbing a request.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import type { MemberLookup as Result } from "@/domains/orgUnit";
import AddStaffForm from "./AddStaffForm";
import type { AddStaffFormProps } from "./AddStaffForm";

// The grant fields offer only what the viewer may give, read from here.
// Null lists mean no limit, as for a holder of `manage_users`.
const viewer = vi.hoisted(() => ({
  may_grant: null as string[] | null,
  may_assign_professions: null as string[] | null,
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ state: { status: "authenticated", user: viewer } }),
}));

/** Already staff somewhere: no grant needed, no question asked. */
const A_NURSE = {
  id: 1,
  username: "drsmith",
  full_name: "Dr Smith",
  competencies: ["access_patient_records"],
};

/** Holds only their own record. */
const A_PATIENT = {
  id: 2,
  username: "janesmith",
  full_name: "Jane Smith",
  competencies: ["access_own_patient_records"],
};

const ROLES = [
  { value: "clinical_lead", label: "Clinical lead" },
  { value: "staff", label: "Staff" },
  { value: "trainee", label: "Trainee" },
];

/** As a site page offers them while somebody else holds the post. */
const ROLES_WITH_LEAD = ROLES.map((role) =>
  role.value === "clinical_lead"
    ? {
        ...role,
        confirm: (user: { username: string }) => ({
          title: "Replace the clinical lead?",
          acceptLabel: "Replace lead",
          children: `Make ${user.username} the clinical lead instead?`,
        }),
      }
    : role,
);

function renderForm(
  answers: Result[],
  overrides: Partial<AddStaffFormProps> = {},
) {
  const onLookUp = vi.fn<AddStaffFormProps["onLookUp"]>();
  answers.forEach((answer) => onLookUp.mockResolvedValueOnce(answer));

  const props = {
    placeName: "Oncology",
    placeKind: "site" as const,
    onLookUp,
    onCreate: vi.fn<AddStaffFormProps["onCreate"]>(),
    roleOptions: ROLES,
    onSubmit: vi.fn<AddStaffFormProps["onSubmit"]>().mockResolvedValue({
      state: "success",
      message: { title: "Staff member added" },
    }),
    onCancel: vi.fn<AddStaffFormProps["onCancel"]>(),
    ...overrides,
  };
  renderWithRouter(<AddStaffForm {...props} />);

  return props;
}

async function find(user: ReturnType<typeof userEvent.setup>, term: string) {
  const box = screen.getByLabelText(/username or email address/i);
  await user.clear(box);
  await user.type(box, term);
  await user.click(screen.getByRole("button", { name: "Find" }));
}

async function chooseRole(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(await screen.findByPlaceholderText("Select a role"));
  await user.click(await screen.findByRole("option", { name: label }));
}

describe("AddStaffForm", () => {
  afterEach(() => {
    viewer.may_grant = null;
    viewer.may_assign_professions = null;
  });

  it("opens with the lookup alone, in one card", () => {
    renderForm([]);

    expect(
      screen.getByRole("heading", {
        name: "Find somebody by username or email",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Select a role")).toBeNull();
    expect(screen.queryByTestId("submit-button")).toBeNull();
    expect(screen.queryByText(/Search for a user/)).toBeNull();
  });

  describe("Somebody already staff", () => {
    it("is offered a role and the button, and no grant", async () => {
      renderForm([{ status: "found", user: A_NURSE }]);
      const user = userEvent.setup();

      await find(user, "drsmith");

      expect(
        await screen.findByPlaceholderText("Select a role"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("submit-button")).toBeInTheDocument();
      expect(
        screen.queryByText(/holds nothing a member of staff would/),
      ).toBeNull();
    });

    it("is handed to the page with the role, without being asked about", async () => {
      const { onSubmit } = renderForm([{ status: "found", user: A_NURSE }]);
      const user = userEvent.setup();

      await find(user, "drsmith");
      await chooseRole(user, "Trainee");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          user: A_NURSE,
          role: "trainee",
          baseProfession: null,
          additionalCompetencies: [],
        }),
      );
      expect(screen.queryByText("Add as a staff member?")).toBeNull();
    });

    it("cannot be added until a role is chosen", async () => {
      renderForm([{ status: "found", user: A_NURSE }]);
      const user = userEvent.setup();

      await find(user, "drsmith");

      await waitFor(() =>
        expect(screen.getByTestId("submit-button")).toHaveAttribute(
          "aria-disabled",
          "true",
        ),
      );

      await chooseRole(user, "Staff");

      await waitFor(() =>
        expect(screen.getByTestId("submit-button")).not.toHaveAttribute(
          "aria-disabled",
          "true",
        ),
      );
    });

    it("is asked the role's own question before being added", async () => {
      const { onSubmit } = renderForm([{ status: "found", user: A_NURSE }], {
        roleOptions: ROLES_WITH_LEAD,
      });
      const user = userEvent.setup();

      await find(user, "drsmith");
      await chooseRole(user, "Clinical lead");
      await user.click(screen.getByTestId("submit-button"));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent(
        "Make drsmith the clinical lead instead?",
      );
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(
        within(dialog).getByRole("button", { name: "Replace lead" }),
      );
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ role: "clinical_lead" }),
        ),
      );
    });

    it("is not asked the role's question for another role", async () => {
      const { onSubmit } = renderForm([{ status: "found", user: A_NURSE }], {
        roleOptions: ROLES_WITH_LEAD,
      });
      const user = userEvent.setup();

      await find(user, "drsmith");
      await chooseRole(user, "Staff");
      await user.click(screen.getByTestId("submit-button"));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ role: "staff" }),
        ),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("Somebody holding nothing staff-like", () => {
    it("brings up the grant fields", async () => {
      renderForm([{ status: "found", user: A_PATIENT }]);
      const user = userEvent.setup();

      await find(user, "janesmith");

      expect(
        await screen.findByText(/holds nothing a member of staff would/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: /Base profession/ }),
      ).toBeInTheDocument();
    });

    it("is asked about before being added, naming the kind of place", async () => {
      const { onSubmit } = renderForm([{ status: "found", user: A_PATIENT }], {
        placeKind: "organisation",
        roleOptions: undefined,
      });
      const user = userEvent.setup();

      await find(user, "janesmith");
      await user.click(await screen.findByTestId("submit-button"));

      expect(
        await screen.findByText(/makes them staff of this organisation/),
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("is handed over with the grant once the question is answered", async () => {
      const { onSubmit } = renderForm([{ status: "found", user: A_PATIENT }]);
      const user = userEvent.setup();

      await find(user, "janesmith");
      await chooseRole(user, "Staff");
      await user.click(
        screen.getByRole("combobox", { name: /Base profession/ }),
      );
      await user.click(
        await screen.findByRole("option", {
          name: "Healthcare Assistant (HCA)",
        }),
      );
      await user.click(screen.getByTestId("submit-button"));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Add as staff",
        }),
      );

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          user: A_PATIENT,
          role: "staff",
          baseProfession: "healthcare_assistant",
          additionalCompetencies: [],
        }),
      );
    });

    it("is asked both questions in one, the role's first", async () => {
      renderForm([{ status: "found", user: A_PATIENT }], {
        roleOptions: ROLES_WITH_LEAD,
      });
      const user = userEvent.setup();

      await find(user, "janesmith");
      await chooseRole(user, "Clinical lead");
      await user.click(screen.getByTestId("submit-button"));

      const modals = await screen.findAllByRole("dialog");
      expect(modals).toHaveLength(1);
      expect(modals[0]).toHaveTextContent(
        /^.*Replace the clinical lead\?.*Make janesmith the clinical lead instead\? janesmith holds nothing a member of staff would/,
      );
    });

    it("is offered only what a teaching admin may give", async () => {
      viewer.may_grant = ["take_teaching_modules"];
      viewer.may_assign_professions = ["teaching_delegate", "teaching_admin"];
      renderForm([{ status: "found", user: A_PATIENT }]);
      const user = userEvent.setup();

      await find(user, "janesmith");
      await user.click(
        await screen.findByRole("combobox", { name: /Base profession/ }),
      );

      expect(
        await screen.findByRole("option", { name: "Teaching delegate" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Healthcare Assistant (HCA)" }),
      ).toBeNull();
    });
  });

  describe("Nobody uses the address", () => {
    it("offers to create them, and nothing else", async () => {
      const { onCreate } = renderForm([{ status: "not_found", user: null }]);
      const user = userEvent.setup();

      await find(user, "new.person@example.org");
      await user.click(
        await screen.findByRole("button", { name: "Create new user" }),
      );

      expect(onCreate).toHaveBeenCalledWith("new.person@example.org");
      expect(screen.queryByPlaceholderText("Select a role")).toBeNull();
      expect(screen.queryByTestId("submit-button")).toBeNull();
    });
  });

  it("offers nothing to somebody already here", async () => {
    renderForm([{ status: "already_member", user: A_NURSE }]);
    const user = userEvent.setup();

    await find(user, "drsmith");

    expect(
      await screen.findByText(/is already at Oncology/),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Select a role")).toBeNull();
    expect(screen.queryByTestId("submit-button")).toBeNull();
  });

  it("offers no role where the page has none", async () => {
    const { onSubmit } = renderForm([{ status: "found", user: A_NURSE }], {
      roleOptions: undefined,
    });
    const user = userEvent.setup();

    await find(user, "drsmith");
    await user.click(await screen.findByTestId("submit-button"));

    expect(screen.queryByPlaceholderText("Select a role")).toBeNull();
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ user: A_NURSE, role: null }),
      ),
    );
  });

  it("puts the fields away for a new lookup, and lets go of the role", async () => {
    renderForm([
      { status: "found", user: A_NURSE },
      { status: "not_found", user: null },
      { status: "found", user: A_PATIENT },
    ]);
    const user = userEvent.setup();

    await find(user, "drsmith");
    await chooseRole(user, "Trainee");
    await find(user, "nobody@example.org");

    expect(
      await screen.findByRole("button", { name: "Create new user" }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Select a role")).toBeNull();
    expect(screen.queryByTestId("submit-button")).toBeNull();

    await find(user, "janesmith");

    expect(await screen.findByPlaceholderText("Select a role")).toHaveValue("");
  });

  it("leaves through Cancel", async () => {
    const { onCancel } = renderForm([{ status: "found", user: A_NURSE }]);
    const user = userEvent.setup();

    await find(user, "drsmith");
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });
});
