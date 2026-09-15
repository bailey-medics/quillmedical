import { describe, it, expect } from "vitest";
import { renderWithMantine } from "@test/test-utils";
import CaptionStatusBadge from "./CaptionStatusBadge";

describe("CaptionStatusBadge", () => {
  it("says captions have been reviewed", () => {
    const { getByText } = renderWithMantine(
      <CaptionStatusBadge status="reviewed" />,
    );
    expect(getByText("Reviewed")).toBeInTheDocument();
  });

  it("says captions have not been reviewed", () => {
    // The wording matters: "Not reviewed" states what is missing,
    // where "Unreviewed" reads as a category rather than a gap.
    const { getByText } = renderWithMantine(
      <CaptionStatusBadge status="unreviewed" />,
    );
    expect(getByText("Not reviewed")).toBeInTheDocument();
  });

  it("shows a skeleton while loading", () => {
    const { queryByText } = renderWithMantine(
      <CaptionStatusBadge status="reviewed" isLoading />,
    );
    expect(queryByText("Reviewed")).not.toBeInTheDocument();
  });
});
