import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import { QuestionView } from "./QuestionView";
import type { CandidateItem } from "@/features/teaching/types";

const uniformItem: CandidateItem = {
  answer_id: 1,
  display_order: 3,
  question_type: "single",
  images: [
    { key: "img1", label: "White light", url: "/img1.png" },
    { key: "img2", label: "NBI", url: "/img2.png" },
  ],
  options: [
    { id: "a", label: "Adenoma" },
    { id: "b", label: "Serrated" },
  ],
};

const textItem: CandidateItem = {
  answer_id: 2,
  display_order: 7,
  question_type: "single",
  images: [],
  text: "A patient presents with abdominal pain.",
  options: [
    { id: "x", label: "Option X" },
    { id: "y", label: "Option Y" },
  ],
};

describe("QuestionView", () => {
  it("renders images with labels", () => {
    renderWithMantine(
      <QuestionView
        item={uniformItem}
        selectedOption={null}
        onSelectOption={() => {}}
      />,
    );

    expect(screen.getByText("White light")).toBeInTheDocument();
    expect(screen.getByText("NBI")).toBeInTheDocument();
  });

  it("renders question number", () => {
    renderWithMantine(
      <QuestionView
        item={uniformItem}
        selectedOption={null}
        onSelectOption={() => {}}
      />,
    );

    expect(screen.getByText("Question 3")).toBeInTheDocument();
  });

  it("renders all options", () => {
    renderWithMantine(
      <QuestionView
        item={uniformItem}
        selectedOption={null}
        onSelectOption={() => {}}
      />,
    );

    expect(screen.getByText("Adenoma")).toBeInTheDocument();
    expect(screen.getByText("Serrated")).toBeInTheDocument();
  });

  it("calls onSelectOption when user picks an option", async () => {
    const handleSelect = vi.fn();
    const user = userEvent.setup();

    renderWithMantine(
      <QuestionView
        item={uniformItem}
        selectedOption={null}
        onSelectOption={handleSelect}
      />,
    );

    await user.click(screen.getByText("Adenoma"));
    expect(handleSelect).toHaveBeenCalledWith("a");
  });

  it("shows selected option", () => {
    renderWithMantine(
      <QuestionView
        item={uniformItem}
        selectedOption="b"
        onSelectOption={() => {}}
      />,
    );

    const radio = screen.getByRole("radio", { name: "Serrated" });
    expect(radio).toBeChecked();
  });

  it("renders item text when provided", () => {
    renderWithMantine(
      <QuestionView
        item={textItem}
        selectedOption={null}
        onSelectOption={() => {}}
      />,
    );

    expect(
      screen.getByText("A patient presents with abdominal pain."),
    ).toBeInTheDocument();
  });

  it("disables options when disabled", () => {
    renderWithMantine(
      <QuestionView
        item={uniformItem}
        selectedOption={null}
        onSelectOption={() => {}}
        disabled
      />,
    );

    const radios = screen.getAllByRole("radio");
    radios.forEach((radio) => expect(radio).toBeDisabled());
  });

  describe("Navigation buttons", () => {
    it("renders Next button when onNext is provided", () => {
      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption={null}
          onSelectOption={() => {}}
          onNext={() => {}}
        />,
      );

      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
    });

    it("renders Previous button when onPrevious is provided", () => {
      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption={null}
          onSelectOption={() => {}}
          onPrevious={() => {}}
          onNext={() => {}}
        />,
      );

      expect(
        screen.getByRole("button", { name: /previous/i }),
      ).toBeInTheDocument();
    });

    it("shows Submit & finish on last question", () => {
      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption="a"
          onSelectOption={() => {}}
          onSubmit={() => {}}
          isLastQuestion
        />,
      );

      expect(
        screen.getByRole("button", { name: /submit & finish/i }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /next/i })).toBeNull();
    });

    it("disables Next when no option is selected", () => {
      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption={null}
          onSelectOption={() => {}}
          onNext={() => {}}
        />,
      );

      expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    });

    it("enables Next when an option is selected", () => {
      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption="a"
          onSelectOption={() => {}}
          onNext={() => {}}
        />,
      );

      expect(screen.getByRole("button", { name: /next/i })).not.toBeDisabled();
    });

    it("calls onNext when clicked", async () => {
      const handleNext = vi.fn();
      const user = userEvent.setup();

      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption="a"
          onSelectOption={() => {}}
          onNext={handleNext}
        />,
      );

      await user.click(screen.getByRole("button", { name: /next/i }));
      expect(handleNext).toHaveBeenCalledTimes(1);
    });

    it("calls onPrevious when clicked", async () => {
      const handlePrevious = vi.fn();
      const user = userEvent.setup();

      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption={null}
          onSelectOption={() => {}}
          onPrevious={handlePrevious}
          onNext={() => {}}
        />,
      );

      await user.click(screen.getByRole("button", { name: /previous/i }));
      expect(handlePrevious).toHaveBeenCalledTimes(1);
    });

    it("calls onSubmit on last question", async () => {
      const handleSubmit = vi.fn();
      const user = userEvent.setup();

      renderWithMantine(
        <QuestionView
          item={uniformItem}
          selectedOption="a"
          onSelectOption={() => {}}
          onSubmit={handleSubmit}
          isLastQuestion
        />,
      );

      await user.click(
        screen.getByRole("button", { name: /submit & finish/i }),
      );
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
