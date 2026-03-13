/**
 * Letters Component Tests
 *
 * Tests for the clinical letters list component covering:
 * - Letter card rendering (title, date, author, summary, status)
 * - Status badge colours
 * - Click interactions
 * - Loading and empty states
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import LetterList from "./LetterList";
import type { LetterSummary } from "./LetterList";

const mockLetters: LetterSummary[] = [
  {
    id: "1",
    title: "Gastroenterology outpatient clinic letter",
    date: "2026-03-19",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    status: "final",
    summary: "Patient seen in clinic and referred for physiotherapy.",
  },
  {
    id: "2",
    title: "Follow-up endoscopy report",
    date: "2026-03-12",
    author: "Dr Gareth Corbett",
    authorRole: "Consultant Gastroenterologist",
    status: "draft",
    summary: "Upper GI endoscopy performed under conscious sedation.",
  },
  {
    id: "3",
    title: "Amended referral letter",
    date: "2026-02-20",
    author: "Dr Emily Williams",
    authorRole: "General Practitioner",
    status: "amended",
    summary: "Updated medication list to include aspirin 75mg.",
  },
];

describe("Letters", () => {
  describe("Basic rendering", () => {
    it("renders all letter cards", () => {
      renderWithMantine(
        <LetterList letters={mockLetters} onLetterClick={vi.fn()} />,
      );

      expect(
        screen.getByText("Gastroenterology outpatient clinic letter"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Follow-up endoscopy report"),
      ).toBeInTheDocument();
      expect(screen.getByText("Amended referral letter")).toBeInTheDocument();
    });

    it("renders empty list when no letters", () => {
      const { container } = renderWithMantine(
        <LetterList letters={[]} onLetterClick={vi.fn()} />,
      );

      expect(
        container.querySelector('[class*="Card"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe("Letter content", () => {
    it("displays formatted date", () => {
      renderWithMantine(
        <LetterList letters={[mockLetters[0]]} onLetterClick={vi.fn()} />,
      );

      expect(screen.getByText("19 March 2026")).toBeInTheDocument();
    });

    it("displays author and role", () => {
      renderWithMantine(
        <LetterList letters={[mockLetters[0]]} onLetterClick={vi.fn()} />,
      );

      expect(
        screen.getByText("Dr Gareth Corbett — Consultant Gastroenterologist"),
      ).toBeInTheDocument();
    });

    it("displays summary text", () => {
      renderWithMantine(
        <LetterList letters={[mockLetters[0]]} onLetterClick={vi.fn()} />,
      );

      expect(
        screen.getByText(
          "Patient seen in clinic and referred for physiotherapy.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Status badges", () => {
    it("displays status badge for each letter", () => {
      renderWithMantine(
        <LetterList letters={mockLetters} onLetterClick={vi.fn()} />,
      );

      expect(screen.getByText("final")).toBeInTheDocument();
      expect(screen.getByText("draft")).toBeInTheDocument();
      expect(screen.getByText("amended")).toBeInTheDocument();
    });
  });

  describe("Click interaction", () => {
    it("calls onLetterClick when letter card is clicked", async () => {
      const user = userEvent.setup();
      const onLetterClick = vi.fn();

      renderWithMantine(
        <LetterList letters={mockLetters} onLetterClick={onLetterClick} />,
      );

      await user.click(
        screen.getByText("Gastroenterology outpatient clinic letter"),
      );
      expect(onLetterClick).toHaveBeenCalledWith(mockLetters[0]);
    });

    it("calls onLetterClick with correct letter", async () => {
      const user = userEvent.setup();
      const onLetterClick = vi.fn();

      renderWithMantine(
        <LetterList letters={mockLetters} onLetterClick={onLetterClick} />,
      );

      await user.click(screen.getByText("Amended referral letter"));
      expect(onLetterClick).toHaveBeenCalledWith(mockLetters[2]);
    });
  });

  describe("Loading state", () => {
    it("shows skeleton cards when loading", () => {
      const { container } = renderWithMantine(
        <LetterList letters={[]} onLetterClick={vi.fn()} isLoading={true} />,
      );

      const cards = container.querySelectorAll('[class*="Card"]');
      expect(cards.length).toBe(3);
    });

    it("hides letters when loading", () => {
      renderWithMantine(
        <LetterList
          letters={mockLetters}
          onLetterClick={vi.fn()}
          isLoading={true}
        />,
      );

      expect(
        screen.queryByText("Gastroenterology outpatient clinic letter"),
      ).not.toBeInTheDocument();
    });
  });
});
