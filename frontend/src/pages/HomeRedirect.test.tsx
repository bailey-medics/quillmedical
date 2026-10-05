/**
 * HomeRedirect Tests
 *
 * Where somebody lands at `/`: the first link in their side navigation,
 * or the no-access notice when that link would be Settings.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import * as authContext from "@/auth/AuthContext";
import type { User } from "@/auth/AuthContext";
import HomeRedirect from "./HomeRedirect";

vi.mock("./Home", () => ({
  default: () => <div>Patient list</div>,
}));

function signInAs(user: Partial<User>): void {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    state: {
      status: "authenticated",
      user: {
        id: "1",
        username: "someone",
        email: "someone@example.com",
        ...user,
      },
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  });
}

describe("HomeRedirect", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, "Test page", "/");
  });

  it("renders the patient list when clinical services are enabled", () => {
    signInAs({ clinical_services_enabled: true });

    renderWithRouter(<HomeRedirect />);

    expect(screen.getByText("Patient list")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("renders the patient list when clinical_services_enabled is undefined", () => {
    signInAs({ enabled_features: ["teaching"] });

    renderWithRouter(<HomeRedirect />);

    expect(screen.getByText("Patient list")).toBeInTheDocument();
  });

  it("lands on teaching when it is the first feature", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["teaching", "passport"],
      competencies: [
        "view_teaching_results",
        "assess_clinician_passport",
        "passport_write",
      ],
    });

    renderWithRouter(<HomeRedirect />);

    expect(window.location.pathname).toBe("/teaching");
  });

  it("lands on the passport when teaching is not available", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["passport"],
      competencies: ["assess_clinician_passport", "passport_write"],
    });

    renderWithRouter(<HomeRedirect />);

    expect(window.location.pathname).toBe("/passport");
  });

  it("lands an assessor without a passport on their inbox", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["passport"],
      competencies: ["assess_clinician_passport"],
    });

    renderWithRouter(<HomeRedirect />);

    // The requests naming them are listed there, with everything else
    // waiting on them.
    expect(window.location.pathname).toBe("/inbox");
  });

  it("shows the no-access notice when no feature is available", () => {
    signInAs({ clinical_services_enabled: false, enabled_features: [] });

    renderWithRouter(<HomeRedirect />);

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(
      screen.getByText(/does not have access to any of Quill Medical's/),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("lands an administrator with no feature on the admin page", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: [],
      competencies: ["manage_users"],
    });

    renderWithRouter(<HomeRedirect />);

    expect(screen.queryByText("No access")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
  });

  it("lands a scoped manager with no feature on the admin page", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: [],
      competencies: ["manage_teaching"],
    });

    renderWithRouter(<HomeRedirect />);

    expect(window.location.pathname).toBe("/admin");
  });

  // Guides sit before Admin in the menu, and describe the features: they
  // are never where somebody starts.
  it("passes over the guides when choosing where to land", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["teaching"],
      competencies: ["manage_teaching"],
    });

    renderWithRouter(<HomeRedirect />);

    expect(window.location.pathname).toBe("/admin");
  });

  it("lands an administrator with teaching on teaching, not admin", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["teaching"],
      competencies: ["manage_users", "view_teaching_results"],
    });

    renderWithRouter(<HomeRedirect />);

    expect(window.location.pathname).toBe("/teaching");
  });

  it("shows the no-access notice when teaching is on but the competency is missing", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["teaching"],
      competencies: [],
    });

    renderWithRouter(<HomeRedirect />);

    expect(screen.getByText("No access")).toBeInTheDocument();
  });

  it("shows the no-access notice when the passport feature is on but the competency is missing", () => {
    signInAs({
      clinical_services_enabled: false,
      enabled_features: ["passport"],
      competencies: [],
    });

    renderWithRouter(<HomeRedirect />);

    expect(screen.getByText("No access")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });
});
