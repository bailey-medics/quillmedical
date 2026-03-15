/**
 * Patient Messages List Page Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import PatientMessages from "./PatientMessages";
import { fetchConversations, createConversation } from "@lib/messaging";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue({ patients: [], users: [] }) },
}));

vi.mock("@lib/messaging", () => ({
  fetchConversations: vi.fn(),
  createConversation: vi.fn(),
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

const mockConversations = [
  {
    id: 1,
    patient_id: "test-patient",
    subject: "Prescription renewal",
    status: "active",
    participants: [
      { user_id: 1, username: "mark.bailey", display_name: "Mark Bailey" },
    ],
    last_message_at: "2025-01-01T00:00:00Z",
    last_message_preview: "Your repeat prescription has been sent",
    created_at: "2025-01-01T00:00:00Z",
  },
];

beforeEach(() => {
  vi.mocked(fetchConversations).mockResolvedValue({
    conversations: mockConversations,
    total: 1,
  });
  vi.mocked(createConversation).mockResolvedValue({
    id: 99,
    patient_id: "test-patient",
    subject: "New",
    status: "active",
    participants: [],
    last_message_at: null,
    last_message_preview: null,
    created_at: "2025-01-01T00:00:00Z",
  });
});

describe("PatientMessages", () => {
  it("renders conversation list from API", async () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    await waitFor(() => {
      expect(
        screen.getByText(/repeat prescription has been sent/),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state when no conversations", async () => {
    vi.mocked(fetchConversations).mockResolvedValue({
      conversations: [],
      total: 0,
    });

    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    await waitFor(() => {
      expect(screen.getByText("No conversations yet")).toBeInTheDocument();
    });
  });

  it("renders new message button", async () => {
    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new message/i }),
      ).toBeInTheDocument();
    });
  });

  it("opens new conversation modal on button click", async () => {
    const user = userEvent.setup();

    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new message/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new message/i }));

    // Modal title + button label both say "New message"
    expect(screen.getAllByText("New message").length).toBeGreaterThanOrEqual(2);
  });

  it("shows patient name instead of selector in modal when patient is pre-filled", async () => {
    const user = userEvent.setup();

    renderWithRouter(<PatientMessages />, {
      routePath: "/patients/:id/messages",
      initialRoute: "/patients/test-patient/messages",
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new message/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /new message/i }));

    expect(screen.getByText("Patient: James Green")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Select a patient"),
    ).not.toBeInTheDocument();
  });
});
