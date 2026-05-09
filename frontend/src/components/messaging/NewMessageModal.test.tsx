/**
 * NewMessageModal Component Tests
 *
 * Tests for the new conversation modal covering:
 * - Rendering when opened/closed
 * - Form field presence
 * - Cancel behaviour
 * - Pre-filled patient
 * - Patient view mode
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import type { FormSubmitResult } from "@/components/form/Form";
import NewMessageModal from "./NewMessageModal";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ patients: [], users: [] }),
  },
}));

const mockAuthState = {
  status: "authenticated" as const,
  user: {
    id: 1,
    username: "staffuser",
    email: "staff@example.com",
    system_permissions: "staff",
  },
  loading: false,
};

vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({
    state: mockAuthState,
    login: vi.fn(),
    logout: vi.fn(),
    reload: vi.fn(),
  }),
}));

const mockSubmit = vi.fn<
  () => Promise<FormSubmitResult>
>().mockResolvedValue({
  state: "success",
  message: { title: "Created" },
});

describe("NewMessageModal", () => {
  const defaultProps = {
    opened: true,
    onClose: vi.fn(),
    onSubmit: mockSubmit,
  };

  describe("Rendering", () => {
    it("renders modal with title when opened", () => {
      renderWithRouter(<NewMessageModal {...defaultProps} />);
      expect(screen.getByText("New message")).toBeInTheDocument();
    });

    it("does not render content when closed", () => {
      renderWithRouter(<NewMessageModal {...defaultProps} opened={false} />);
      expect(screen.queryByText("New message")).not.toBeInTheDocument();
    });

    it("renders all form fields", () => {
      renderWithRouter(<NewMessageModal {...defaultProps} />);
      expect(screen.getByText("Patient")).toBeInTheDocument();
      expect(screen.getByText("Participants")).toBeInTheDocument();
      expect(screen.getByText("Subject")).toBeInTheDocument();
      expect(screen.getByText("Message")).toBeInTheDocument();
    });

    it("renders action buttons", () => {
      renderWithRouter(<NewMessageModal {...defaultProps} />);
      expect(
        screen.getByRole("button", { name: /cancel/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /start conversation/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Interactions", () => {
    it("calls onClose when cancel is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderWithRouter(<NewMessageModal {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("allows typing in subject field", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewMessageModal {...defaultProps} />);

      const subjectInput = screen.getByPlaceholderText(
        "e.g. Prescription renewal",
      );
      await user.type(subjectInput, "Test subject");
      expect(subjectInput).toHaveValue("Test subject");
    });

    it("allows typing in message field", async () => {
      const user = userEvent.setup();
      renderWithRouter(<NewMessageModal {...defaultProps} />);

      const messageInput = screen.getByPlaceholderText(
        "Type your message\u2026",
      );
      await user.type(messageInput, "Hello there");
      expect(messageInput).toHaveValue("Hello there");
    });
  });

  describe("Pre-filled patient", () => {
    it("shows patient name when patientId prop is provided", () => {
      renderWithRouter(
        <NewMessageModal
          {...defaultProps}
          patientId="patient-123"
          patientName="James Green"
        />,
      );
      expect(screen.getByText("Patient: James Green")).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Select a patient"),
      ).not.toBeInTheDocument();
    });

    it("shows patient selector when no patientId prop", () => {
      renderWithRouter(<NewMessageModal {...defaultProps} />);
      expect(screen.getByText("Patient")).toBeInTheDocument();
    });
  });

  describe("Patient as participant toggle", () => {
    it("renders switch for staff users", () => {
      renderWithRouter(<NewMessageModal {...defaultProps} />);
      expect(screen.getByText("Patient as participant")).toBeInTheDocument();
    });

    it("hides switch in patient view", () => {
      renderWithRouter(
        <NewMessageModal {...defaultProps} isPatientView={true} />,
      );
      expect(
        screen.queryByText("Patient as participant"),
      ).not.toBeInTheDocument();
    });

    it("hides patient selector in patient view", () => {
      renderWithRouter(
        <NewMessageModal {...defaultProps} isPatientView={true} />,
      );
      expect(screen.queryByText("Patient")).not.toBeInTheDocument();
    });
  });
});
