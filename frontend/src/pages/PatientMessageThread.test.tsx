/**
 * Patient Message Thread Page Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import PatientMessageThread from "./PatientMessageThread";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: { id: "mark-bailey", name: "Mark Bailey" },
    },
  }),
}));

vi.mock("@/components/profile-pic/ProfilePic", () => ({
  default: ({ givenName }: { givenName?: string }) => (
    <div data-testid="profile-pic">{givenName}</div>
  ),
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

describe("PatientMessageThread", () => {
  it("renders messages with patient name", () => {
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/gastro-clinic",
    });

    expect(
      screen.getByText(/I'd like to book in for Dr Corbett/),
    ).toBeInTheDocument();
  });

  it("renders Dr Corbett messages", () => {
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/gastro-clinic",
    });

    expect(screen.getByText(/personalised dietary guide/)).toBeInTheDocument();
  });

  it("renders action buttons on system message", () => {
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/gastro-clinic",
    });

    expect(
      screen.getByRole("button", { name: "I'll attend" }),
    ).toBeInTheDocument();
  });

  it("allows sending a new message", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PatientMessageThread />, {
      routePath: "/patients/:id/messages/:conversationId",
      initialRoute: "/patients/test-patient/messages/gastro-clinic",
    });

    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Test message");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Test message")).toBeInTheDocument();
  });
});
