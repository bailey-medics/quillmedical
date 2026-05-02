/**
 * Patient Notes Page Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import PatientNotes from "./PatientNotes";

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

describe("PatientNotes", () => {
  it("renders clinical notes heading", () => {
    renderWithRouter(<PatientNotes />, {
      routePath: "/patients/:id/notes",
      initialRoute: "/patients/test-patient/notes",
    });

    expect(screen.getByText("Clinical notes")).toBeInTheDocument();
  });

  it("renders note cards with titles", () => {
    renderWithRouter(<PatientNotes />, {
      routePath: "/patients/:id/notes",
      initialRoute: "/patients/test-patient/notes",
    });

    expect(screen.getByText("Gastro clinic consultation")).toBeInTheDocument();
    expect(
      screen.getByText("Telephone consultation — dietary guidance follow-up"),
    ).toBeInTheDocument();
    expect(screen.getByText("Annual health review")).toBeInTheDocument();
  });

  it("renders category badges", () => {
    renderWithRouter(<PatientNotes />, {
      routePath: "/patients/:id/notes",
      initialRoute: "/patients/test-patient/notes",
    });

    const consultationBadges = screen.getAllByText("Consultation");
    expect(consultationBadges.length).toBe(3);
    expect(screen.getByText("Telephone")).toBeInTheDocument();
    expect(screen.getByText("Observation")).toBeInTheDocument();
  });

  it("renders note content with SOAP format", () => {
    renderWithRouter(<PatientNotes />, {
      routePath: "/patients/:id/notes",
      initialRoute: "/patients/test-patient/notes",
    });

    expect(
      screen.getByText(/Patient attends for initial gastro assessment/),
    ).toBeInTheDocument();
  });
});
