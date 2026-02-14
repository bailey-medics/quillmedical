/**
 * LetterView Component Tests
 *
 * Tests for clinical letter detail view with back navigation,
 * sender information, and full letter content.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import LetterView, { type Letter } from "./LetterView";

const mockLetter: Letter = {
  id: "1",
  subject: "Blood Test Results",
  date: "2024-01-15T10:30:00Z",
  from: "Dr. John Smith",
  body: "Dear Patient,\n\nYour recent blood test results are within normal ranges.\n\nBest regards,\nDr. Smith",
};

describe("LetterView", () => {
  describe("Basic rendering", () => {
    it("renders letter subject", () => {
      renderWithMantine(<LetterView letter={mockLetter} />);
      expect(screen.getByText("Blood Test Results")).toBeInTheDocument();
    });

    it("renders sender name", () => {
      renderWithMantine(<LetterView letter={mockLetter} />);
      expect(screen.getByText(/Dr. John Smith/)).toBeInTheDocument();
    });

    it("renders letter body", () => {
      renderWithMantine(<LetterView letter={mockLetter} />);
      expect(screen.getByText(/Dear Patient/)).toBeInTheDocument();
      expect(
        screen.getByText(
          /Your recent blood test results are within normal ranges/,
        ),
      ).toBeInTheDocument();
    });

    it("renders formatted date", () => {
      renderWithMantine(<LetterView letter={mockLetter} />);
      // Date should be formatted with locale string
      const datePattern = /15\/01\/2024|1\/15\/2024/;
      expect(screen.getByText(datePattern)).toBeInTheDocument();
    });

    it("renders sender avatar with first letter", () => {
      renderWithMantine(<LetterView letter={mockLetter} />);
      // Avatar should contain "D" from "Dr. John Smith"
      expect(screen.getByText("D")).toBeInTheDocument();
    });
  });

  describe("Back navigation", () => {
    it("renders back button", () => {
      renderWithMantine(<LetterView letter={mockLetter} />);
      expect(screen.getByLabelText("Back")).toBeInTheDocument();
    });

    it("calls onBack when back button is clicked", async () => {
      const user = userEvent.setup();
      const onBack = vi.fn();
      renderWithMantine(<LetterView letter={mockLetter} onBack={onBack} />);

      await user.click(screen.getByLabelText("Back"));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Action buttons", () => {
    it("renders custom action buttons", () => {
      renderWithMantine(
        <LetterView
          letter={mockLetter}
          actions={<button>Download PDF</button>}
        />,
      );
      expect(screen.getByText("Download PDF")).toBeInTheDocument();
    });

    it("renders multiple action buttons", () => {
      renderWithMantine(
        <LetterView
          letter={mockLetter}
          actions={
            <>
              <button>Download</button>
              <button>Print</button>
              <button>Share</button>
            </>
          }
        />,
      );
      expect(screen.getByText("Download")).toBeInTheDocument();
      expect(screen.getByText("Print")).toBeInTheDocument();
      expect(screen.getByText("Share")).toBeInTheDocument();
    });
  });

  describe("Letter body formatting", () => {
    it("preserves whitespace in letter body", () => {
      const { container } = renderWithMantine(
        <LetterView letter={mockLetter} />,
      );
      const bodyElement = container.querySelector(
        '[style*="white-space: pre-wrap"]',
      );
      expect(bodyElement).toBeInTheDocument();
    });

    it("displays line breaks correctly", () => {
      const letterWithBreaks: Letter = {
        id: "1",
        subject: "Test",
        body: "Line 1\n\nLine 2\n\nLine 3",
      };
      renderWithMantine(<LetterView letter={letterWithBreaks} />);
      const bodyText = screen.getByText(/Line 1/).closest("div");
      expect(bodyText?.textContent).toContain("Line 1");
      expect(bodyText?.textContent).toContain("Line 2");
      expect(bodyText?.textContent).toContain("Line 3");
    });

    it("handles empty body gracefully", () => {
      const letterNoBody: Letter = {
        id: "1",
        subject: "Empty Letter",
        body: "",
      };
      renderWithMantine(<LetterView letter={letterNoBody} />);
      expect(screen.getByText("Empty Letter")).toBeInTheDocument();
    });

    it("displays default message when body is missing", () => {
      const letterNoBody: Letter = {
        id: "1",
        subject: "No Content",
      };
      renderWithMantine(<LetterView letter={letterNoBody} />);
      expect(screen.getByText("(No content)")).toBeInTheDocument();
    });
  });

  describe("Optional fields", () => {
    it("handles missing date", () => {
      const letterNoDate: Letter = {
        id: "1",
        subject: "Test Letter",
        from: "Dr. Smith",
        body: "Content",
      };
      renderWithMantine(<LetterView letter={letterNoDate} />);
      expect(screen.getByText("Test Letter")).toBeInTheDocument();
      expect(screen.getByText("Dr. Smith")).toBeInTheDocument();
    });

    it("handles missing sender", () => {
      const letterNoFrom: Letter = {
        id: "1",
        subject: "Anonymous Letter",
        body: "Content",
      };
      renderWithMantine(<LetterView letter={letterNoFrom} />);
      expect(screen.getByText("Anonymous Letter")).toBeInTheDocument();
      // Avatar should show "L" for "Letter"
      expect(screen.getByText("L")).toBeInTheDocument();
    });

    it("handles invalid date gracefully", () => {
      const letterInvalidDate: Letter = {
        id: "1",
        subject: "Test",
        date: "invalid-date",
        body: "Content",
      };
      renderWithMantine(<LetterView letter={letterInvalidDate} />);
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("displays skeleton loaders when loading", () => {
      const { container } = renderWithMantine(
        <LetterView letter={null} isLoading={true} />,
      );
      // Check for Skeleton component
      const skeletons = container.querySelectorAll('[class*="Skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("hides letter content when loading", () => {
      renderWithMantine(<LetterView letter={mockLetter} isLoading={true} />);
      expect(screen.queryByText("Blood Test Results")).not.toBeInTheDocument();
    });

    it("shows content when not loading", () => {
      renderWithMantine(<LetterView letter={mockLetter} isLoading={false} />);
      expect(screen.getByText("Blood Test Results")).toBeInTheDocument();
    });
  });

  describe("Null letter handling", () => {
    it("renders nothing when letter is null and not loading", () => {
      renderWithMantine(<LetterView letter={null} isLoading={false} />);
      // Component returns null - check for absence of content
      expect(screen.queryByText("Back")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("renders nothing when letter is undefined", () => {
      renderWithMantine(<LetterView isLoading={false} />);
      // Component returns null - check for absence of content
      expect(screen.queryByText("Back")).not.toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("Layout and spacing", () => {
    it("renders with proper padding", () => {
      const { container } = renderWithMantine(
        <LetterView letter={mockLetter} />,
      );
      const mainDiv = container.querySelector('[style*="padding: 16px"]');
      expect(mainDiv).toBeInTheDocument();
    });

    it("separates header from body with border", () => {
      const { container } = renderWithMantine(
        <LetterView letter={mockLetter} />,
      );
      const separator = container.querySelector(
        '[style*="border-top: 1px solid"]',
      );
      expect(separator).toBeInTheDocument();
    });
  });

  describe("Avatar generation", () => {
    it("uses first letter of sender name for avatar", () => {
      const letter: Letter = {
        id: "1",
        subject: "Test",
        from: "Alice Johnson",
        body: "Content",
      };
      renderWithMantine(<LetterView letter={letter} />);
      expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("handles empty sender name with default letter", () => {
      const letter: Letter = {
        id: "1",
        subject: "Test",
        from: "",
        body: "Content",
      };
      renderWithMantine(<LetterView letter={letter} />);
      expect(screen.getByText("L")).toBeInTheDocument();
    });
  });

  describe("Complex letter content", () => {
    it("handles long letter body", () => {
      const longBody = "Lorem ipsum ".repeat(200);
      const letter: Letter = {
        id: "1",
        subject: "Long Letter",
        body: longBody,
      };
      renderWithMantine(<LetterView letter={letter} />);
      expect(screen.getByText(/Lorem ipsum/)).toBeInTheDocument();
    });

    it("handles special characters in body", () => {
      const letter: Letter = {
        id: "1",
        subject: "Special Chars",
        body: "Price: £50.00\nDosage: 500mg\nTemp: 37°C",
      };
      renderWithMantine(<LetterView letter={letter} />);
      expect(screen.getByText(/£50.00/)).toBeInTheDocument();
      expect(screen.getByText(/37°C/)).toBeInTheDocument();
    });
  });
});
