/**
 * NotesList Component Tests
 *
 * Tests for the clinical notes list component covering:
 * - Note card rendering (title, date, author, content)
 * - Category badge colours
 * - Pre-wrapped content display
 * - Click interactions
 * - Loading and empty states
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import NotesList from "./NotesList";
import type { ClinicalNote } from "./NotesList";

const mockNotes: ClinicalNote[] = [
  {
    id: "1",
    title: "Gastro clinic consultation",
    date: "2026-03-19",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    category: "consultation",
    content: "Patient attended for assessment.\n\nPlan: Review in 3 weeks.",
  },
  {
    id: "2",
    title: "Telephone follow-up",
    date: "2026-03-20",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    category: "telephone",
    content: "Dietary guidance provided via messaging.",
  },
  {
    id: "3",
    title: "BP and weight check",
    date: "2025-10-15",
    author: "Nurse Sarah Mitchell",
    authorRole: "Practice Nurse",
    category: "observation",
    content: "BP: 126/80. Weight: 82.4kg. No action required.",
  },
];

describe("NotesList", () => {
  describe("Basic rendering", () => {
    it("renders all note cards", () => {
      renderWithMantine(<NotesList notes={mockNotes} />);

      expect(
        screen.getByText("Gastro clinic consultation"),
      ).toBeInTheDocument();
      expect(screen.getByText("Telephone follow-up")).toBeInTheDocument();
      expect(screen.getByText("BP and weight check")).toBeInTheDocument();
    });

    it("renders empty list when no notes", () => {
      const { container } = renderWithMantine(<NotesList notes={[]} />);

      expect(
        container.querySelector('[class*="Card"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Note content", () => {
    it("displays formatted date", () => {
      renderWithMantine(<NotesList notes={[mockNotes[0]]} />);

      expect(screen.getByText("19 March 2026")).toBeInTheDocument();
    });

    it("displays author and role", () => {
      renderWithMantine(<NotesList notes={[mockNotes[0]]} />);

      expect(
        screen.getByText("Dr Gareth Corbett — Consultant Gastroenterologist"),
      ).toBeInTheDocument();
    });

    it("displays note content", () => {
      renderWithMantine(<NotesList notes={[mockNotes[1]]} />);

      expect(
        screen.getByText("Dietary guidance provided via messaging."),
      ).toBeInTheDocument();
    });

    it("preserves whitespace in content", () => {
      renderWithMantine(<NotesList notes={[mockNotes[0]]} />);

      const content = screen.getByText(/Patient attended for assessment/);
      expect(content).toHaveStyle({ whiteSpace: "pre-wrap" });
    });
  });

  describe("Category badges", () => {
    it("displays category badge for each note", () => {
      renderWithMantine(<NotesList notes={mockNotes} />);

      expect(screen.getByText("consultation")).toBeInTheDocument();
      expect(screen.getByText("telephone")).toBeInTheDocument();
      expect(screen.getByText("observation")).toBeInTheDocument();
    });
  });

  describe("Click interaction", () => {
    it("calls onNoteClick when note card is clicked", async () => {
      const handleClick = vi.fn();
      renderWithMantine(
        <NotesList notes={[mockNotes[0]]} onNoteClick={handleClick} />,
      );

      await userEvent.click(screen.getByText("Gastro clinic consultation"));
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it("calls onNoteClick with correct note", async () => {
      const handleClick = vi.fn();
      renderWithMantine(
        <NotesList notes={mockNotes} onNoteClick={handleClick} />,
      );

      await userEvent.click(screen.getByText("Telephone follow-up"));
      expect(handleClick).toHaveBeenCalledWith(mockNotes[1]);
    });
  });

  describe("Loading state", () => {
    it("shows skeleton cards when loading", () => {
      const { container } = renderWithMantine(
        <NotesList notes={[]} isLoading={true} />,
      );

      const skeletons = container.querySelectorAll('[class*="skeleton" i]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("hides notes when loading", () => {
      renderWithMantine(<NotesList notes={mockNotes} isLoading={true} />);

      expect(
        screen.queryByText("Gastro clinic consultation"),
      ).not.toBeInTheDocument();
    });
  });
});
