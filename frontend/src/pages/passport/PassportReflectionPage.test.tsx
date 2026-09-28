/**
 * Passport Reflection Page Tests
 *
 * Laid out as every passport record page is, so these pin the same
 * things the logbook entry and CPD activity pages' tests do: the title
 * names the section, the record is shown, and editing sends back what
 * the form does not show.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { reflections } from "@/components/passport/fixtures";
import { Component as PassportReflectionPage } from "./PassportReflectionPage";

const fetchMyPassport = vi.fn();
const fetchReflections = vi.fn();
const amendReflection = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchReflections: (...args: unknown[]) => fetchReflections(...args),
  amendReflection: (...args: unknown[]) => amendReflection(...args),
}));

// The record the page is opened on: the second fixture, which carries a
// competency the form does not show.
const opened = reflections[1];

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useParams: () => ({ name: opened.name }) };
});

function detail(canWrite = true) {
  return {
    passport: { passport_id: "3f2a8c1e" },
    competencies: [],
    entitlement: { can_write: canWrite },
  };
}

describe("PassportReflectionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail());
    fetchReflections.mockResolvedValue(reflections);
  });

  it("names the section, then the reflection, in the title", async () => {
    renderWithRouter(<PassportReflectionPage />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Reflections: Breaking bad news",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("passport-record-card")).toBeInTheDocument();
  });

  it("says so when the reflection is not there", async () => {
    fetchReflections.mockResolvedValue([]);
    renderWithRouter(<PassportReflectionPage />);

    expect(
      await screen.findByText("That reflection is not here"),
    ).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportReflectionPage />);

    expect(
      await screen.findByText(/That reflection could not be loaded/),
    ).toBeInTheDocument();
  });

  it("opens the form filled in from the reflection", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PassportReflectionPage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit reflection" }),
    );

    expect(screen.getByRole("textbox", { name: /Title/ })).toHaveValue(
      "Breaking bad news",
    );
    expect(
      screen.queryByTestId("passport-record-card"),
    ).not.toBeInTheDocument();
  });

  it("disables editing where the passport is read-only", async () => {
    fetchMyPassport.mockResolvedValue(detail(false));
    renderWithRouter(<PassportReflectionPage />);

    expect(
      await screen.findByRole("button", { name: "Edit reflection" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("asks for the anonymisation declaration again before saving", async () => {
    const user = userEvent.setup();
    amendReflection.mockResolvedValue({ name: opened.name, commit: "abc" });
    renderWithRouter(<PassportReflectionPage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit reflection" }),
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toHaveAttribute("aria-disabled", "true");

    await user.click(
      screen.getByRole("checkbox", {
        name: /I confirm this reflection is anonymised/,
      }),
    );
    await user.click(save);

    await waitFor(() => expect(amendReflection).toHaveBeenCalled());
    const [, name, sent] = amendReflection.mock.calls[0];
    expect(name).toBe(opened.name);
    expect(sent.anonymised_confirmed).toBe(true);
    expect(sent.body).toBe(opened.body);
    expect(sent.competencies).toEqual([]);
  });
});
