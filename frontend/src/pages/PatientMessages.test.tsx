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
      setPatientNav: vi.fn(),
    }),
  };
});

describe("PatientMessages", () => {
  it("renders conversation cards", () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    expect(
      screen.getByText("Dr Gareth Corbett, Gemma Corbett"),
    ).toBeInTheDocument();
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

  it("renders unread count badge when messages are unread", () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
