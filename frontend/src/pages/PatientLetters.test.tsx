/**
 * Patient Letters Page Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import PatientLetters from "./PatientLetters";

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

describe("PatientLetters", () => {
  it("renders clinical letters heading", () => {
    renderWithRouter(<PatientLetters />, {
      routePath: "/patients/:id/letters",
      initialRoute: "/patients/test-patient/letters",
    });

    expect(screen.getByText("Clinical letters — James")).toBeInTheDocument();
  });

  it("renders letter cards with titles", () => {
    renderWithRouter(<PatientLetters />, {
      routePath: "/patients/:id/letters",
      initialRoute: "/patients/test-patient/letters",
    });

    expect(
      screen.getByText("Gastroenterology outpatient clinic letter"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("GP referral letter — gastroenterology"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Routine health review letter"),
    ).toBeInTheDocument();
  });

  it("renders letter authors and roles", () => {
    renderWithRouter(<PatientLetters />, {
      routePath: "/patients/:id/letters",
      initialRoute: "/patients/test-patient/letters",
    });

    expect(
      screen.getByText("Dr Gareth Corbett — Consultant Gastroenterologist"),
    ).toBeInTheDocument();
  });

  it("renders status badges", () => {
    renderWithRouter(<PatientLetters />, {
      routePath: "/patients/:id/letters",
      initialRoute: "/patients/test-patient/letters",
    });

    const badges = screen.getAllByText("final");
    expect(badges.length).toBe(3);
  });
});
