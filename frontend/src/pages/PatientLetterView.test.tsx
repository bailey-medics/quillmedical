/**
 * Patient Letter View Page Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import PatientLetterView from "./PatientLetterView";

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

describe("PatientLetterView", () => {
  it("renders letter content for a valid letter ID", () => {
    renderWithRouter(<PatientLetterView />, {
      routePath: "/patients/:id/letters/:letterId",
      initialRoute: "/patients/test-patient/letters/letter-1",
    });

    expect(
      screen.getByText("Gastroenterology outpatient clinic letter"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Dr Gareth Corbett/).length).toBeGreaterThan(0);
  });

  it("renders the full letter body", () => {
    renderWithRouter(<PatientLetterView />, {
      routePath: "/patients/:id/letters/:letterId",
      initialRoute: "/patients/test-patient/letters/letter-1",
    });

    expect(
      screen.getByText(/Commence omeprazole 20mg once daily/),
    ).toBeInTheDocument();
  });

  it("renders nothing for an unknown letter ID", () => {
    const { container } = renderWithRouter(<PatientLetterView />, {
      routePath: "/patients/:id/letters/:letterId",
      initialRoute: "/patients/test-patient/letters/nonexistent",
    });

    expect(
      screen.queryByText("Gastroenterology outpatient clinic letter"),
    ).not.toBeInTheDocument();
    // LetterView returns null when letter is null
    expect(
      container.querySelector("[aria-label='Back']"),
    ).not.toBeInTheDocument();
  });

  it("renders back button", () => {
    renderWithRouter(<PatientLetterView />, {
      routePath: "/patients/:id/letters/:letterId",
      initialRoute: "/patients/test-patient/letters/letter-2",
    });

    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("renders GP referral letter content", () => {
    renderWithRouter(<PatientLetterView />, {
      routePath: "/patients/:id/letters/:letterId",
      initialRoute: "/patients/test-patient/letters/letter-2",
    });

    expect(
      screen.getByText("GP referral letter — gastroenterology"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/grateful if you could see this patient/),
    ).toBeInTheDocument();
  });
});
