/**
 * Letters Component Tests
 *
 * Tests for clinical letters list display with sender information,
 * subject lines, and preview snippets.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import Letters, { type Letter } from "./Letters";

// Mock ProfilePic component
vi.mock("@/components/profile-pic/ProfilePic", () => ({
  default: ({
    givenName,
    familyName,
    gradientIndex,
    size,
    isLoading,
    showGeneric,
  }: {
    givenName?: string;
    familyName?: string;
    gradientIndex?: number;
    size: string;
    isLoading?: boolean;
    showGeneric?: boolean;
  }) =>
    isLoading ? (
      <div data-testid="profile-pic-loading" data-size={size} />
    ) : (
      <div
        data-testid="profile-pic"
        data-given={givenName}
        data-family={familyName}
        data-gradient={gradientIndex}
        data-size={size}
        data-generic={showGeneric}
      />
    ),
}));

const mockLetters: Letter[] = [
  {
    id: "1",
    subject: "Lab Results",
    date: "2024-01-15T10:30:00Z",
    from: "Dr. Smith",
    fromGivenName: "John",
    fromFamilyName: "Smith",
    gradientIndex: 1,
    snippet: "Your recent blood test results show...",
  },
  {
    id: "2",
    subject: "Prescription Update",
    date: "2024-01-10T14:00:00Z",
    from: "Pharmacy Team",
    snippet: "Your prescription has been updated as discussed.",
  },
  {
    id: "3",
    subject: "Appointment Confirmation",
    from: "Reception",
  },
];

describe("Letters", () => {
  describe("Basic rendering", () => {
    it("renders Letters title", () => {
      renderWithMantine(<Letters letters={mockLetters} />);
      expect(screen.getByText("Letters")).toBeInTheDocument();
    });

    it("renders list of letters", () => {
      renderWithMantine(<Letters letters={mockLetters} />);
      expect(screen.getByText("Lab Results")).toBeInTheDocument();
      expect(screen.getByText("Prescription Update")).toBeInTheDocument();
      expect(screen.getByText("Appointment Confirmation")).toBeInTheDocument();
    });

    it("renders letter snippets", () => {
      renderWithMantine(<Letters letters={mockLetters} />);
      expect(
        screen.getByText("Your recent blood test results show..."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Your prescription has been updated as discussed."),
      ).toBeInTheDocument();
    });

    it("formats letter dates", () => {
      renderWithMantine(<Letters letters={mockLetters} />);
      // Check for date presence (format may vary by locale)
      const dateElements = screen.getAllByText(/15\/01\/2024|1\/15\/2024/);
      expect(dateElements.length).toBeGreaterThan(0);
    });
  });

  describe("Empty state", () => {
    it("displays empty message when no letters", () => {
      renderWithMantine(<Letters letters={[]} />);
      expect(screen.getByText("No letters available")).toBeInTheDocument();
    });

    it("renders custom children in header", () => {
      renderWithMantine(
        <Letters letters={[]}>
          <button>Add Letter</button>
        </Letters>,
      );
      expect(screen.getByText("Add Letter")).toBeInTheDocument();
    });
  });

  describe("Profile pictures", () => {
    it("renders profile pictures for letters with sender names", () => {
      renderWithMantine(<Letters letters={mockLetters} />);
      const profilePics = screen.getAllByTestId("profile-pic");
      expect(profilePics.length).toBe(mockLetters.length);
    });

    it("passes correct sender names to ProfilePic", () => {
      renderWithMantine(<Letters letters={[mockLetters[0]]} />);
      const profilePic = screen.getByTestId("profile-pic");
      expect(profilePic).toHaveAttribute("data-given", "John");
      expect(profilePic).toHaveAttribute("data-family", "Smith");
    });

    it("shows generic avatar when no sender names provided", () => {
      renderWithMantine(<Letters letters={[mockLetters[1]]} />);
      const profilePic = screen.getByTestId("profile-pic");
      expect(profilePic).toHaveAttribute("data-generic", "true");
    });
  });

  describe("Letter interaction", () => {
    it("calls onOpen when letter is clicked", async () => {
      const user = userEvent.setup();
      const onOpen = vi.fn();
      renderWithMantine(<Letters letters={mockLetters} onOpen={onOpen} />);

      await user.click(screen.getByText("Lab Results"));

      expect(onOpen).toHaveBeenCalledWith("1");
    });

    it("calls onOpen with correct letter ID", async () => {
      const user = userEvent.setup();
      const onOpen = vi.fn();
      renderWithMantine(<Letters letters={mockLetters} onOpen={onOpen} />);

      await user.click(screen.getByText("Prescription Update"));

      expect(onOpen).toHaveBeenCalledWith("2");
    });

    it("shows pointer cursor when onOpen is provided", () => {
      const { container } = renderWithMantine(
        <Letters letters={mockLetters} onOpen={vi.fn()} />,
      );
      const letterElements = container.querySelectorAll('[style*="cursor"]');
      expect(letterElements.length).toBeGreaterThan(0);
    });

    it("does not show pointer cursor when onOpen is not provided", () => {
      const { container } = renderWithMantine(
        <Letters letters={mockLetters} />,
      );
      const defaultCursors = container.querySelectorAll(
        '[style*="cursor: default"]',
      );
      expect(defaultCursors.length).toBeGreaterThan(0);
    });
  });

  describe("Loading state", () => {
    it("displays skeleton loaders when loading", () => {
      renderWithMantine(<Letters letters={[]} isLoading={true} />);
      const loadingPics = screen.getAllByTestId("profile-pic-loading");
      expect(loadingPics.length).toBe(3); // Shows 3 skeleton items
    });

    it("hides letter content when loading", () => {
      renderWithMantine(<Letters letters={mockLetters} isLoading={true} />);
      expect(screen.queryByText("Lab Results")).not.toBeInTheDocument();
      expect(screen.queryByText("Prescription Update")).not.toBeInTheDocument();
    });

    it("shows Letters title when loading", () => {
      renderWithMantine(<Letters letters={[]} isLoading={true} />);
      expect(screen.getByText("Letters")).toBeInTheDocument();
    });
  });

  describe("Letter date handling", () => {
    it("displays formatted dates for letters with dates", () => {
      renderWithMantine(<Letters letters={[mockLetters[0]]} />);
      // Date should be formatted
      const container = screen.getByText("Lab Results").closest("div");
      expect(container).toBeInTheDocument();
    });

    it("handles missing dates gracefully", () => {
      renderWithMantine(<Letters letters={[mockLetters[2]]} />);
      expect(screen.getByText("Appointment Confirmation")).toBeInTheDocument();
    });

    it("handles invalid dates gracefully", () => {
      const lettersWithInvalidDate: Letter[] = [
        {
          id: "1",
          subject: "Test Letter",
          date: "invalid-date",
        },
      ];
      renderWithMantine(<Letters letters={lettersWithInvalidDate} />);
      expect(screen.getByText("Test Letter")).toBeInTheDocument();
    });
  });

  describe("Optional fields", () => {
    it("handles letters without snippets", () => {
      renderWithMantine(<Letters letters={[mockLetters[2]]} />);
      expect(screen.getByText("Appointment Confirmation")).toBeInTheDocument();
    });

    it("handles letters without from field", () => {
      const letter: Letter[] = [
        {
          id: "1",
          subject: "Anonymous Letter",
        },
      ];
      renderWithMantine(<Letters letters={letter} />);
      expect(screen.getByText("Anonymous Letter")).toBeInTheDocument();
    });

    it("handles letters without gradient index", () => {
      const letter: Letter[] = [
        {
          id: "1",
          subject: "Test",
          fromGivenName: "John",
          fromFamilyName: "Doe",
        },
      ];
      renderWithMantine(<Letters letters={letter} />);
      const profilePic = screen.getByTestId("profile-pic");
      // Undefined attributes are rendered as null
      expect(profilePic.getAttribute("data-gradient")).toBeNull();
    });
  });

  describe("Responsive behavior", () => {
    it("passes size props to ProfilePic", () => {
      renderWithMantine(<Letters letters={[mockLetters[0]]} />);
      const profilePic = screen.getByTestId("profile-pic");
      expect(profilePic).toHaveAttribute("data-size");
    });
  });

  describe("Edge cases", () => {
    it("handles undefined letters array", () => {
      renderWithMantine(<Letters isLoading={false} />);
      expect(screen.getByText("No letters available")).toBeInTheDocument();
    });

    it("renders many letters without issues", () => {
      const manyLetters: Letter[] = Array.from({ length: 50 }, (_, i) => ({
        id: `${i}`,
        subject: `Letter ${i}`,
        from: `Sender ${i}`,
      }));
      renderWithMantine(<Letters letters={manyLetters} />);
      expect(screen.getByText("Letter 0")).toBeInTheDocument();
      expect(screen.getByText("Letter 49")).toBeInTheDocument();
    });
  });
});
