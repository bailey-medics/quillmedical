/**
 * Tests for AdminPage's patient count fetching.
 *
 * The retry loop exists because FHIR takes time to come up, so a failed
 * request normally means "not ready yet". In a teaching deployment
 * there is no FHIR at all and `/patients/count` answers 503 permanently
 * - and the catch cannot tell those apart, so one tab left open polled
 * every five seconds until it was closed.
 *
 * It asks for the count, never the list: the page shows a number, and
 * the list carries every patient's name and identifiers.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

// What the signed-in user holds. The patient count is fetched only for
// `manage_users`, so the default holds it; a test signing in a teaching
// admin swaps it before rendering.
const signedIn = vi.hoisted(() => ({
  competencies: ["manage_users"] as string[],
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        username: "admin-user",
        platform_role: "superadmin",
        competencies: signedIn.competencies,
      },
    },
  }),
}));

import { api } from "@/lib/api";
import AdminPage from "./AdminPage";

describe("AdminPage patient fetching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    signedIn.competencies = ["manage_users"];
    vi.mocked(api.get).mockResolvedValue({ fhir_ready: true, total: 0 });
  });

  it("asks for the count, never the list", async () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "true");
    renderWithRouter(<AdminPage />);

    await waitFor(() => {
      const paths = vi.mocked(api.get).mock.calls.map((c) => c[0]);
      expect(paths).toContain("/patients/count");
    });
    const paths = vi.mocked(api.get).mock.calls.map((c) => c[0]);
    expect(paths).not.toContain("/patients");
  });

  it("does not ask for patients where there is no FHIR", async () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "false");
    renderWithRouter(<AdminPage />);

    // Other effects on this page legitimately call the API, so the
    // assertion is on the path rather than on the call count.
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    const paths = vi.mocked(api.get).mock.calls.map((c) => c[0]);
    expect(paths).not.toContain("/patients/count");
  });

  it("asks for the count where FHIR is present", async () => {
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "true");
    renderWithRouter(<AdminPage />);

    await waitFor(() => {
      const paths = vi.mocked(api.get).mock.calls.map((c) => c[0]);
      expect(paths).toContain("/patients/count");
    });
  });

  it("does not ask for patients for a teaching admin", async () => {
    // They reach Admin through `manage_teaching` and have no patient
    // pages, so their patients are neither fetched nor counted.
    vi.stubEnv("VITE_CLINICAL_SERVICES_ENABLED", "true");
    signedIn.competencies = ["manage_teaching"];
    renderWithRouter(<AdminPage />);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    const paths = vi.mocked(api.get).mock.calls.map((c) => c[0]);
    expect(paths).not.toContain("/patients/count");
  });
});
