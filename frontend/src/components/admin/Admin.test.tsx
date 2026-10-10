/**
 * Admin Component Tests
 *
 * Tests for the administration dashboard: its title, the mark shown to
 * an operator, and the three counts. Adding and editing users and
 * patients live on pages of their own, with their own tests.
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "@/test/test-utils";
import Admin from "./Admin";

const mockUsers = [
  { id: "1", username: "johndoe", email: "john.doe@hospital.com" },
  { id: "2", username: "janedoe", email: "jane.doe@hospital.com" },
  { id: "3", username: "drsmith", email: "dr.smith@hospital.com" },
];

const mockPatients = [
  { id: "p1", name: "Alice Johnson" },
  { id: "p2", name: "Bob Williams" },
  { id: "p3", name: "Carol Davis" },
];

describe("Admin", () => {
  describe("Basic rendering", () => {
    it("renders administration title", () => {
      renderWithRouter(<Admin platformRole="superadmin" />);
      expect(screen.getByText("Administration")).toBeInTheDocument();
    });

    it("marks an operator", () => {
      renderWithRouter(<Admin platformRole="superadmin" />);
      expect(screen.getByText("SUPERADMIN")).toBeInTheDocument();
    });

    it("marks nobody else", () => {
      renderWithRouter(<Admin platformRole="standard" />);
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
    });

    it("says nothing when the role is unknown", () => {
      renderWithRouter(<Admin platformRole={undefined} />);
      expect(screen.queryByText("SUPERADMIN")).not.toBeInTheDocument();
    });
  });

  describe("Statistics display", () => {
    it("displays total users count", () => {
      renderWithRouter(
        <Admin platformRole="superadmin" existingUsers={mockUsers} />,
      );
      expect(screen.getByText("Total users")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("displays total patients count", () => {
      renderWithRouter(
        <Admin platformRole="superadmin" existingPatients={mockPatients} />,
      );
      expect(screen.getByText("Total patients")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("leaves out the patient count for somebody without patient pages", () => {
      renderWithRouter(
        <Admin
          platformRole="standard"
          showPatients={false}
          existingPatients={mockPatients}
        />,
      );
      expect(screen.queryByText("Total patients")).not.toBeInTheDocument();
      expect(screen.getByText("Total users")).toBeInTheDocument();
    });

    it("displays total organisations count", () => {
      renderWithRouter(
        <Admin platformRole="superadmin" organisationCount={5} />,
      );
      expect(screen.getByText("Total organisations")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("displays zero counts when no data", () => {
      renderWithRouter(<Admin platformRole="superadmin" />);
      expect(screen.getAllByText("0")).toHaveLength(3);
    });

    it("shows skeleton loaders when loading", () => {
      renderWithRouter(
        <Admin
          platformRole="superadmin"
          usersLoading={true}
          patientsLoading={true}
          existingUsers={mockUsers}
        />,
      );
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("shows skeleton loader only for patients when FHIR is initializing", () => {
      renderWithRouter(
        <Admin
          platformRole="superadmin"
          usersLoading={false}
          patientsLoading={true}
          existingUsers={mockUsers}
          existingPatients={[]}
        />,
      );
      // Should show Total Users value (3) but Total Patients as loading
      expect(screen.getByText("3")).toBeInTheDocument();
      const skeletons = document.querySelectorAll(".mantine-Skeleton-root");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Edge cases", () => {
    it("handles empty users array", () => {
      renderWithRouter(<Admin platformRole="superadmin" existingUsers={[]} />);
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });

    it("handles empty patients array", () => {
      renderWithRouter(
        <Admin platformRole="superadmin" existingPatients={[]} />,
      );
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThan(0);
    });
    it("renders for a standard account", () => {
      renderWithRouter(<Admin platformRole="standard" />);
      expect(screen.getByText("Administration")).toBeInTheDocument();
    });
  });
});
