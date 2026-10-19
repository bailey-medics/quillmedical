/**
 * EvidenceScanStatus Tests
 *
 * Each state says something different a doctor acts on, and the one
 * that matters most is that a file with malware never reads as attached.
 */

import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import EvidenceScanStatus from "./EvidenceScanStatus";

describe("EvidenceScanStatus", () => {
  it("says the file is being checked, not attached, while the scan runs", () => {
    renderWithMantine(
      <EvidenceScanStatus status="checking" filename="als.pdf" />,
    );

    expect(screen.getByText("Scanning als.pdf…")).toBeInTheDocument();
    expect(screen.queryByText(/Attached/)).not.toBeInTheDocument();
  });

  it("says the file is attached once it is clean", () => {
    renderWithMantine(
      <EvidenceScanStatus status="attached" filename="als.pdf" />,
    );

    expect(screen.getByText("Attached: als.pdf")).toBeInTheDocument();
  });

  it("says malware was found, names it, and never says attached", () => {
    renderWithMantine(
      <EvidenceScanStatus
        status="malware"
        filename="eicar-in-a-pdf.pdf"
        signature="Eicar-Signature"
      />,
    );

    expect(screen.getByText("Malware found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Malware was found in eicar-in-a-pdf.pdf (Eicar-Signature). It has been deleted and is not attached.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Attached/)).not.toBeInTheDocument();
  });

  it("still reads sensibly when no signature was named", () => {
    renderWithMantine(
      <EvidenceScanStatus status="malware" filename="x.pdf" signature={null} />,
    );

    expect(
      screen.getByText(
        "Malware was found in x.pdf. It has been deleted and is not attached.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for the file again when the scan could not finish", () => {
    renderWithMantine(<EvidenceScanStatus status="failed" filename="x.pdf" />);

    expect(
      screen.getByText(
        "x.pdf could not be checked for malware, so it is not attached. Upload it again.",
      ),
    ).toBeInTheDocument();
  });

  it("says a slow scan is still running, though the file is attached", () => {
    renderWithMantine(<EvidenceScanStatus status="slow" filename="als.pdf" />);

    expect(
      screen.getByText(
        /Attached: als.pdf. Still scanning; it will be shown once it passes./,
      ),
    ).toBeInTheDocument();
  });
});
