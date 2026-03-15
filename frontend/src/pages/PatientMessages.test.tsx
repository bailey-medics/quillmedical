/**
 * Patient Messages List Page Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import PatientMessages from "./PatientMessages";
import { fetchPatientConversations, createConversation } from "@lib/messaging";

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn().mockResolvedValue({ patients: [], users: [] }) },
}));

vi.mock("@lib/messaging", () => ({
  fetchPatientConversations: vi.fn(),
  createConversation: vi.fn(),
}));

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: {
      status: "authenticated",
      user: {
        id: 1,
        username: "staffuser",
        email: "staff@example.com",
        system_permissions: "staff",
      },
      loading: false,
    },
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  }),
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
    fhir_conversation_id: "conv-uuid-1",
    patient_id: "test-patient",
    subject: "Prescription renewal",
    status: "active",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    participants: [
      {
        user_id: 1,
        username: "mark.bailey",
        display_name: "Mark Bailey",
        role: "initiator",
        joined_at: "2025-01-01T00:00:00Z",
      },
    ],
    last_message_preview: "Your repeat prescription has been sent",
    last_message_time: "2025-01-01T00:00:00Z",
    unread_count: 0,
    is_participant: true,
    can_write: true,
    include_patient_as_participant: false,
  },
];

beforeEach(() => {
  vi.mocked(fetchPatientConversations).mockResolvedValue({
    conversations: mockConversations,
  });
  vi.mocked(createConversation).mockResolvedValue({
    id: 99,
    fhir_conversation_id: "conv-uuid-99",
    patient_id: "test-patient",
    subject: "New",
    status: "active",
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    participants: [],
    messages: [],
    is_participant: true,
    can_write: true,
    include_patient_as_participant: false,
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
    vi.mocked(fetchPatientConversations).mockResolvedValue({
      conversations: [],
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
