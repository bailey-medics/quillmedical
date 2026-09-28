/**
 * PassportRecordCard Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import PassportRecordCard from "./PassportRecordCard";

describe("PassportRecordCard", () => {
  it("heads the card with the date", () => {
    renderWithMantine(<PassportRecordCard date="2026-03-12" facts={[]} />);
    expect(
      screen.getByRole("heading", { name: /12 Mar 2026/ }),
    ).toBeInTheDocument();
  });

  it("shows each fact under its label", () => {
    renderWithMantine(
      <PassportRecordCard
        date="2026-03-12"
        facts={[{ label: "Setting", value: "Endoscopy unit" }]}
      />,
    );
    expect(screen.getByText("Setting")).toBeInTheDocument();
    expect(screen.getByText("Endoscopy unit")).toBeInTheDocument();
  });

  it("leaves out a fact with no value, rather than a blank", () => {
    renderWithMantine(
      <PassportRecordCard
        date="2026-03-12"
        facts={[
          { label: "Outcome", value: null },
          { label: "Notes", value: "" },
        ]}
      />,
    );
    expect(screen.queryByText("Outcome")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("keeps prose in its paragraphs", () => {
    renderWithMantine(
      <PassportRecordCard
        date="2026-03-12"
        facts={[
          {
            label: "Reflection",
            value: "First thought.\n\nSecond thought.",
            prose: true,
          },
        ]}
      />,
    );
    expect(screen.getByText("First thought.")).toBeInTheDocument();
    expect(screen.getByText("Second thought.")).toBeInTheDocument();
  });
});
