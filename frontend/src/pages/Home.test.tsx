/**
 * Home page — error state
 *
 * Home rendered its error as a bare `<div>` with an inline colour, showing
 * whatever the backend returned. It was the worst of the twenty-nine
 * hand-rolled error displays, and the first converted to `ErrorState`.
 *
 * These cover the failure path only. The rest of Home — the patient list, the
 * FHIR readiness handling — is untested here and was before this change too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import { api } from "@/lib/api";
import Home from "./Home";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

/**
 * Fail /patients while letting /health succeed.
 *
 * Home calls both. Rejecting everything made the health check fail too, which
 * is a different failure path and not the one under test.
 */
function failPatientsWith(error: Error): void {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/health") {
      return Promise.resolve({
        status: "ok",
        services: { fhir: { available: true } },
      }) as never;
    }
    return Promise.reject(error) as never;
  });
}

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { username: "testuser" } },
  }),
}));

describe("Home error state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the message the backend authored", async () => {
    // Every detail the backend sends is now written by us, so it is worth
    // showing rather than replacing with something vaguer.
    failPatientsWith(
      Object.assign(new Error("Could not load the patient list."), {
        error_code: "patient_list_failed",
      }),
    );

    renderWithRouter(<Home />);

    await waitFor(() => {
      expect(
        screen.getByText("Could not load the patient list."),
      ).toBeInTheDocument();
    });
  });

  it("shows the error code, so a support call can be traced", async () => {
    failPatientsWith(
      Object.assign(new Error("Could not load the patient list."), {
        error_code: "patient_list_failed",
      }),
    );

    renderWithRouter(<Home />);

    await waitFor(() => {
      expect(screen.getByText(/patient_list_failed/)).toBeInTheDocument();
    });
  });

  it("falls back to a written message when there is no detail", async () => {
    // A dropped connection produces no detail at all, so the page needs
    // something of its own to say.
    failPatientsWith(new Error(""));

    renderWithRouter(<Home />);

    await waitFor(() => {
      expect(
        screen.getByText("Could not load the patient list."),
      ).toBeInTheDocument();
    });
  });

  it("uses the shared error component rather than a bare div", async () => {
    failPatientsWith(new Error("boom"));

    renderWithRouter(<Home />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
