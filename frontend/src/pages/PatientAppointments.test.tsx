/**
 * Patient Appointments Page Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import PatientAppointments from "./PatientAppointments";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return {
    ...actual,
    useOutletContext: () => ({
      patient: {
        id: "test-patient",
        name: "James Green",
        givenName: "James",
        familyName: "Green",
      },
      setPatient: vi.fn(),
      setPatientNav: vi.fn(),
    }),
  };
});

describe("PatientAppointments", () => {
  it("renders appointments heading", () => {
    renderWithRouter(<PatientAppointments />, {
      routePath: "/patients/:id/appointments",
      initialRoute: "/patients/test-patient/appointments",
    });

    expect(screen.getByText("Appointments")).toBeInTheDocument();
  });

  it("renders upcoming section", () => {
    renderWithRouter(<PatientAppointments />, {
      routePath: "/patients/:id/appointments",
      initialRoute: "/patients/test-patient/appointments",
    });

    expect(
      screen.getByRole("heading", { name: "Upcoming" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Gastro clinic follow-up review"),
    ).toBeInTheDocument();
  });

  it("renders past appointments section", () => {
    renderWithRouter(<PatientAppointments />, {
      routePath: "/patients/:id/appointments",
      initialRoute: "/patients/test-patient/appointments",
    });

    expect(screen.getByText("Past appointments")).toBeInTheDocument();
    expect(
      screen.getByText("Gastro clinic — initial assessment"),
    ).toBeInTheDocument();
  });

  it("renders status badges", () => {
    renderWithRouter(<PatientAppointments />, {
      routePath: "/patients/:id/appointments",
      initialRoute: "/patients/test-patient/appointments",
    });

    // "Upcoming" appears twice: once as section heading, once as badge
    expect(screen.getAllByText("Upcoming")).toHaveLength(2);
    const completedBadges = screen.getAllByText("Completed");
    expect(completedBadges.length).toBe(4);
  });

  it("renders appointment locations", () => {
    renderWithRouter(<PatientAppointments />, {
      routePath: "/patients/:id/appointments",
      initialRoute: "/patients/test-patient/appointments",
    });

    expect(
      screen.getAllByText(/Riverside Health Centre/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Meadowbrook Surgery/).length).toBeGreaterThan(
      0,
    );
  });
});
