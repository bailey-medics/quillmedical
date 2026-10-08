/**
 * SafetyDocumentSheet Component Tests
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import SafetyDocumentSheet from "./SafetyDocumentSheet";
import { SAFETY_CASES, renderDocument } from "@lib/safety";

const safetyCase = SAFETY_CASES[0];
const document = safetyCase.documents[0];

describe("SafetyDocumentSheet", () => {
  it("names the product, document, version and status in the header", () => {
    renderWithMantine(
      <SafetyDocumentSheet
        document={document}
        product={safetyCase.system}
        content={renderDocument(document, safetyCase.placeholders)}
      />,
    );
    expect(screen.getByText("Tessaly EPMA 4.2")).toBeInTheDocument();
    expect(
      screen.getByText("Clinical risk management plan, version 4.2, draft"),
    ).toBeInTheDocument();
  });

  it("renders the markdown with its headings and filled placeholders", () => {
    renderWithMantine(
      <SafetyDocumentSheet
        document={document}
        product={safetyCase.system}
        content={renderDocument(document, safetyCase.placeholders)}
      />,
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Clinical risk management plan",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "2. Scope" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Tessaly Health Ltd/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });
});
