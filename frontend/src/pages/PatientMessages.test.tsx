/**
 * Patient Messages List Page Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@test/test-utils";
import PatientMessages from "./PatientMessages";

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
        gradientIndex: 8,
      },
      setPatient: vi.fn(),
    }),
  };
});

describe("PatientMessages", () => {
  it("renders messages heading with patient name", () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    expect(screen.getByText("Messages — James")).toBeInTheDocument();
  });

  it("renders conversation list", () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    expect(
      screen.getByText(/referral to the gastroenterology clinic/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/repeat prescription has been sent/),
    ).toBeInTheDocument();
  });

  it("renders conversation status badges", () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();
    expect(screen.getByText("closed")).toBeInTheDocument();
  });
});
