/**
 * AssessorDeclaration Component Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import AssessorDeclaration, {
  ASSESSOR_DECLARATION_TEXT,
} from "./AssessorDeclaration";

describe("AssessorDeclaration", () => {
  it("renders the declaration text", () => {
    renderWithMantine(<AssessorDeclaration />);
    expect(screen.getByText(ASSESSOR_DECLARATION_TEXT)).toBeInTheDocument();
  });

  it("renders a default heading", () => {
    renderWithMantine(<AssessorDeclaration />);
    expect(screen.getByText("Declaration")).toBeInTheDocument();
  });

  it("accepts a different heading", () => {
    renderWithMantine(<AssessorDeclaration title="Before you sign" />);
    expect(screen.getByText("Before you sign")).toBeInTheDocument();
  });

  it("states that the assessor accepts accountability", () => {
    // The point of the declaration. If this wording is ever softened, the
    // record stops meaning what the passport claims it means.
    expect(ASSESSOR_DECLARATION_TEXT).toContain(
      "accept professional accountability",
    );
  });

  it("carries no checkbox of its own", () => {
    // Confirmation belongs to the submitting form, so the same words can
    // be shown where no signing happens.
    renderWithMantine(<AssessorDeclaration />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
