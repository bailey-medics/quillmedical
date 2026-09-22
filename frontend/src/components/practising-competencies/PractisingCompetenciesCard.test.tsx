/**
 * Practising competencies card tests.
 *
 * The card shows the second half of the model: not what somebody is
 * qualified for, which lives on them, but where they may exercise it.
 * These cover who sees the card at all, what it lists, and that
 * withdrawal asks before it acts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import { orgUnits } from "@/domains/orgUnit";
import type { OrgUnitMember, PractisingCompetency } from "@/domains/orgUnit";
import PractisingCompetenciesCard from "./PractisingCompetenciesCard";

const members: OrgUnitMember[] = [
  {
    id: 1,
    username: "a.patel",
    email: "a.patel@example.nhs.uk",
    full_name: "Anita Patel",
    capacity: "staff",
  },
];

const rows: PractisingCompetency[] = [
  {
    user_id: 1,
    username: "a.patel",
    full_name: "Anita Patel",
    competency: "perform_venepuncture",
    authorised_at: "2026-09-01T09:00:00Z",
    authorised_by: 9,
  },
];

/** Sign somebody in, holding the competencies given. */
function signedIn(competencies: string[]) {
  const user = {
    id: "9",
    username: "admin.user",
    email: "admin@example.com",
    competencies,
  } as unknown as User;

  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: { status: "authenticated", user },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

describe("PractisingCompetenciesCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    signedIn(["manage_practising_competencies"]);
  });

  describe("Who sees it", () => {
    it("shows nothing without the competency to manage these", () => {
      signedIn([]);
      const list = vi
        .spyOn(orgUnits, "practisingCompetencies")
        .mockResolvedValue([]);

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      // Not `toBeEmptyDOMElement`: Mantine injects its theme styles into
      // the container, so it is never empty even when nothing rendered.
      expect(
        screen.queryByText("Who may practise here"),
      ).not.toBeInTheDocument();
      expect(list).not.toHaveBeenCalled();
    });

    it("shows the card to somebody who may manage them", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue(rows);

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      expect(
        await screen.findByText("Who may practise here"),
      ).toBeInTheDocument();
    });
  });

  describe("What it lists", () => {
    it("names the person and what they may practise", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue(rows);

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      expect(await screen.findByText("Anita Patel")).toBeInTheDocument();
      // Named rather than found by text: the same label is also one of
      // the options in the competency field.
      expect(
        screen.getByRole("button", {
          name: /Withdraw Perform Venepuncture from Anita Patel/,
        }),
      ).toBeInTheDocument();
    });

    it("says so when nothing is authorised here", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue([]);

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      expect(
        await screen.findByText("Nobody is authorised to practise here yet"),
      ).toBeInTheDocument();
    });

    it("asks only about this org_unit", async () => {
      const list = vi
        .spyOn(orgUnits, "practisingCompetencies")
        .mockResolvedValue([]);

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={7} members={members} />,
      );

      await waitFor(() => expect(list).toHaveBeenCalledWith(7));
    });
  });

  describe("Withdrawing", () => {
    it("asks before it withdraws", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue(rows);
      const withdraw = vi
        .spyOn(orgUnits, "withdrawPractising")
        .mockResolvedValue({ status: "withdrawn" });

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      await screen.findByText("Anita Patel");
      await userEvent.click(
        screen.getByRole("button", {
          name: /Withdraw Perform Venepuncture from Anita Patel/,
        }),
      );

      expect(
        await screen.findByText("Withdraw authorisation"),
      ).toBeInTheDocument();
      expect(withdraw).not.toHaveBeenCalled();
    });

    it("says the person stays qualified elsewhere", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue(rows);
      vi.spyOn(orgUnits, "withdrawPractising").mockResolvedValue({
        status: "withdrawn",
      });

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      await screen.findByText("Anita Patel");
      await userEvent.click(
        screen.getByRole("button", {
          name: /Withdraw Perform Venepuncture from Anita Patel/,
        }),
      );

      expect(
        await screen.findByText(/stay authorised anywhere else/),
      ).toBeInTheDocument();
    });

    it("withdraws that one competency at that one org_unit", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue(rows);
      const withdraw = vi
        .spyOn(orgUnits, "withdrawPractising")
        .mockResolvedValue({ status: "withdrawn" });

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      await screen.findByText("Anita Patel");
      await userEvent.click(
        screen.getByRole("button", {
          name: /Withdraw Perform Venepuncture from Anita Patel/,
        }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Withdraw" }),
      );

      await waitFor(() =>
        expect(withdraw).toHaveBeenCalledWith(1, 1, "perform_venepuncture"),
      );
    });
  });

  describe("Authorising", () => {
    it("cannot be submitted until both are chosen", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue([]);

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      // `aria-disabled`, which is how AddButton refuses a click while
      // staying reachable by a screen reader.
      expect(
        await screen.findByRole("button", { name: "Authorise" }),
      ).toHaveAttribute("aria-disabled", "true");
    });

    it("sends the person and the competency", async () => {
      vi.spyOn(orgUnits, "practisingCompetencies").mockResolvedValue([]);
      const authorise = vi
        .spyOn(orgUnits, "authorisePractising")
        .mockResolvedValue({ status: "authorised" });

      renderWithRouter(
        <PractisingCompetenciesCard orgUnitId={1} members={members} />,
      );

      const [personField, competencyField] =
        await screen.findAllByRole("combobox");

      await userEvent.click(personField);
      await userEvent.click(await screen.findByText("Anita Patel"));

      await userEvent.click(competencyField);
      await userEvent.click(await screen.findByText("Perform Venepuncture"));

      await userEvent.click(screen.getByRole("button", { name: "Authorise" }));

      await waitFor(() =>
        expect(authorise).toHaveBeenCalledWith(1, {
          user_id: 1,
          competency: "perform_venepuncture",
        }),
      );
    });
  });

  describe("How often it loads", () => {
    it("reads the rows once, though the caller passes new callbacks", async () => {
      // The pages render this card with inline arrows, so `onError` and
      // `onChanged` are new functions on every render. Nothing about the
      // org_unit has changed, so nothing should be read again: a
      // callback's identity is not a reason to ask the server anything.
      //
      // When the load effect depended on those props, each answer set
      // state, each render made new arrows, and the effect ran again:
      // hundreds of requests for one page view, which is what this pins.
      const list = vi
        .spyOn(orgUnits, "practisingCompetencies")
        .mockResolvedValue(rows);

      const Host = () => (
        <PractisingCompetenciesCard
          orgUnitId={1}
          members={members}
          onChanged={() => {}}
          onError={() => {}}
        />
      );

      const { rerender } = renderWithRouter(<Host />);
      expect(await screen.findByText("Anita Patel")).toBeInTheDocument();

      rerender(<Host />);
      rerender(<Host />);

      await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    });

    it("reads again when the org_unit changes", async () => {
      // The other half of the same rule: identity of the callbacks is
      // not a reason to re-read, but a different place certainly is.
      const list = vi
        .spyOn(orgUnits, "practisingCompetencies")
        .mockResolvedValue(rows);

      const { rerender } = renderWithRouter(
        <PractisingCompetenciesCard
          orgUnitId={1}
          members={members}
          onError={() => {}}
        />,
      );
      await waitFor(() => expect(list).toHaveBeenCalledWith(1));

      rerender(
        <PractisingCompetenciesCard
          orgUnitId={2}
          members={members}
          onError={() => {}}
        />,
      );

      await waitFor(() => expect(list).toHaveBeenCalledWith(2));
      expect(list).toHaveBeenCalledTimes(2);
    });
  });
});
