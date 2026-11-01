/**
 * Passport Reflections Page Tests
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportReflectionsPage } from "./PassportReflectionsPage";
import type * as passportLib from "@lib/passport";

const { fetchMyPassport, fetchReflections, addReflection } = vi.hoisted(() => ({
  fetchMyPassport: vi.fn<typeof passportLib.fetchMyPassport>(),
  fetchReflections: vi.fn<typeof passportLib.fetchReflections>(),
  addReflection: vi.fn<typeof passportLib.addReflection>(),
}));

vi.mock("@lib/passport", () => ({
  fetchMyPassport,
  fetchReflections,
  addReflection,
}));

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useNavigate: () => navigate };
});

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies: [],
};

const reflection = {
  name: "2026-03-14-difficult-airway",
  title: "Difficult airway",
  written_on: "2026-03-14",
  body: "What I took from it.",
  competencies: [],
  attachments: [],
};

describe("PassportReflectionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("lists the holder's reflections", async () => {
    fetchReflections.mockResolvedValue([reflection]);
    renderWithRouter(<PassportReflectionsPage />);

    expect(await screen.findByText("Difficult airway")).toBeInTheDocument();
  });

  it("opens a reflection on its own page", async () => {
    const user = userEvent.setup();
    fetchReflections.mockResolvedValue([reflection]);
    renderWithRouter(<PassportReflectionsPage />);

    await user.click(await screen.findByText("Difficult airway"));

    expect(navigate).toHaveBeenCalledWith(
      `/passport/reflections/${reflection.name}`,
    );
  });

  it("says nothing is here only once the list has arrived", async () => {
    // The page starts with an empty list, so it used to flash its empty
    // message over a full record while the fetch was still out.
    fetchReflections.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportReflectionsPage />);

    await waitFor(() => expect(fetchReflections).toHaveBeenCalled());
    expect(screen.queryByText("Nothing written yet")).not.toBeInTheDocument();
  });

  it("shows a loading table while the list is on its way", async () => {
    fetchReflections.mockReturnValue(new Promise(() => {}));
    renderWithRouter(<PassportReflectionsPage />);

    await waitFor(() => expect(fetchReflections).toHaveBeenCalled());
    expect(screen.getByTestId("reflection-table")).toBeInTheDocument();
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("takes the loading table away once an empty list arrives", async () => {
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionsPage />);

    await screen.findByText(/^Nothing .* yet$/);
    expect(screen.queryByTestId("reflection-table")).not.toBeInTheDocument();
  });

  it("shows no loading table over a failed load", async () => {
    fetchReflections.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportReflectionsPage />);

    await screen.findByText(/could not be loaded/);
    expect(screen.queryByTestId("reflection-table")).not.toBeInTheDocument();
  });

  it("puts the add button above the message on an empty page", async () => {
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionsPage />);

    const message = await screen.findByText("Nothing written yet");
    const add = screen.getByRole("button", { name: "Write a reflection" });
    expect(
      add.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says what reflections are for when there are none", async () => {
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionsPage />);

    expect(
      await screen.findByText(/a case, a complaint or a significant event/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no assessor or administrator can read them/),
    ).not.toBeInTheDocument();
  });

  it("opens the editor on request", async () => {
    const user = userEvent.setup();
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Write a reflection/ }),
    );

    expect(screen.getByTestId("reflection-editor")).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchReflections.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportReflectionsPage />);

    expect(
      await screen.findByText(/Your reflections could not be loaded/),
    ).toBeInTheDocument();
  });
  it('keeps "Write a reflection" shut until the passport has loaded', async () => {
    // A save made before the passport was known had nowhere to go, and
    // did nothing, which a slow connection turned into a lost entry.
    // AddButton disables through aria-disabled, and ignores a click.
    let arrive: (value: typeof detail) => void = () => {};
    fetchMyPassport.mockReturnValue(
      new Promise((resolve) => {
        arrive = resolve;
      }),
    );
    renderWithRouter(<PassportReflectionsPage />);

    expect(
      screen.getByRole("button", { name: "Write a reflection" }),
    ).toHaveAttribute("aria-disabled", "true");

    arrive(detail);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Write a reflection" }),
      ).not.toHaveAttribute("aria-disabled"),
    );
  });
});
