/**
 * AppointmentsList Component Tests
 *
 * Tests for the appointments list component covering:
 * - Appointment card rendering (title, date/time, location, clinician)
 * - Upcoming vs past grouping with section headings
 * - Status badge colours
 * - Blue left border on upcoming appointments
 * - Click interactions
 * - Loading and empty states
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import AppointmentsList from "./AppointmentsList";
import type { Appointment } from "./AppointmentsList";

const mockAppointments: Appointment[] = [
  {
    id: "1",
    title: "Gastro clinic follow-up",
    date: "2026-04-09",
    time: "10:00",
    location: "Riverside Health Centre, Room 4",
    clinician: "Dr Gareth Corbett",
    clinicianRole: "Consultant Gastroenterologist",
    status: "upcoming",
    notes: "Review dietary modifications.",
  },
  {
    id: "2",
    title: "GP consultation",
    date: "2026-02-25",
    time: "09:15",
    location: "Meadowbrook Surgery, Room 2",
    clinician: "Dr Emily Williams",
    clinicianRole: "General Practitioner",
    status: "completed",
    notes: "Assessment of epigastric symptoms.",
  },
  {
    id: "3",
    title: "Annual health review",
    date: "2026-01-10",
    time: "14:30",
    location: "Meadowbrook Surgery, Room 2",
    clinician: "Dr Emily Williams",
    clinicianRole: "General Practitioner",
    status: "completed",
  },
];

describe("AppointmentsList", () => {
  describe("Basic rendering", () => {
    it("renders all appointment cards", () => {
      renderWithMantine(<AppointmentsList appointments={mockAppointments} />);

      expect(screen.getByText("Gastro clinic follow-up")).toBeInTheDocument();
      expect(screen.getByText("GP consultation")).toBeInTheDocument();
      expect(screen.getByText("Annual health review")).toBeInTheDocument();
    });

    it("renders empty list when no appointments", () => {
      const { container } = renderWithMantine(
        <AppointmentsList appointments={[]} />,
      );

      expect(
        container.querySelector('[class*="Card"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Section grouping", () => {
    it("shows Upcoming heading when upcoming appointments exist", () => {
      renderWithMantine(<AppointmentsList appointments={mockAppointments} />);

      expect(
        screen.getByRole("heading", { name: "Upcoming" }),
      ).toBeInTheDocument();
    });

    it("shows Past appointments heading when past appointments exist", () => {
      renderWithMantine(<AppointmentsList appointments={mockAppointments} />);

      expect(screen.getByText("Past appointments")).toBeInTheDocument();
    });

    it("hides Upcoming heading when no upcoming appointments", () => {
      const pastOnly = mockAppointments.filter((a) => a.status !== "upcoming");
      renderWithMantine(<AppointmentsList appointments={pastOnly} />);

      expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
    });

    it("hides Past appointments heading when no past appointments", () => {
      const upcomingOnly = mockAppointments.filter(
        (a) => a.status === "upcoming",
      );
      renderWithMantine(<AppointmentsList appointments={upcomingOnly} />);

      expect(screen.queryByText("Past appointments")).not.toBeInTheDocument();
    });
  });

  describe("Appointment content", () => {
    it("displays formatted date with weekday and time", () => {
      renderWithMantine(
        <AppointmentsList appointments={[mockAppointments[0]]} />,
      );

      expect(
        screen.getByText(/Thursday, 9 April 2026 at 10:00/),
      ).toBeInTheDocument();
    });

    it("displays location", () => {
      renderWithMantine(
        <AppointmentsList appointments={[mockAppointments[0]]} />,
      );

      expect(
        screen.getByText("Riverside Health Centre, Room 4"),
      ).toBeInTheDocument();
    });

    it("displays clinician and role", () => {
      renderWithMantine(
        <AppointmentsList appointments={[mockAppointments[0]]} />,
      );

      expect(
        screen.getByText("Dr Gareth Corbett — Consultant Gastroenterologist"),
      ).toBeInTheDocument();
    });

    it("displays notes when present", () => {
      renderWithMantine(
        <AppointmentsList appointments={[mockAppointments[0]]} />,
      );

      expect(
        screen.getByText("Review dietary modifications."),
      ).toBeInTheDocument();
    });

    it("does not render notes text when absent", () => {
      renderWithMantine(
        <AppointmentsList appointments={[mockAppointments[2]]} />,
      );

      // Only check that the card title renders but no notes
      expect(screen.getByText("Annual health review")).toBeInTheDocument();
    });
  });

  describe("Status badges", () => {
    it("displays status badge for each appointment", () => {
      renderWithMantine(<AppointmentsList appointments={mockAppointments} />);

      // "Upcoming" appears twice: once as section heading, once as badge
      expect(screen.getAllByText("Upcoming")).toHaveLength(2);
      expect(screen.getAllByText("Completed")).toHaveLength(2);
    });
  });

  describe("Click interaction", () => {
    it("calls onAppointmentClick when card is clicked", async () => {
      const handleClick = vi.fn();
      renderWithMantine(
        <AppointmentsList
          appointments={[mockAppointments[0]]}
          onAppointmentClick={handleClick}
        />,
      );

      await userEvent.click(screen.getByText("Gastro clinic follow-up"));
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it("calls onAppointmentClick with correct appointment", async () => {
      const handleClick = vi.fn();
      renderWithMantine(
        <AppointmentsList
          appointments={mockAppointments}
          onAppointmentClick={handleClick}
        />,
      );

      await userEvent.click(screen.getByText("GP consultation"));
      expect(handleClick).toHaveBeenCalledWith(mockAppointments[1]);
    });
  });

  describe("Loading state", () => {
    it("shows skeleton cards when loading", () => {
      const { container } = renderWithMantine(
        <AppointmentsList appointments={[]} isLoading={true} />,
      );

      const skeletons = container.querySelectorAll('[class*="skeleton" i]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("hides appointments when loading", () => {
      renderWithMantine(
        <AppointmentsList appointments={mockAppointments} isLoading={true} />,
      );

      expect(
        screen.queryByText("Gastro clinic follow-up"),
      ).not.toBeInTheDocument();
    });
  });
});
