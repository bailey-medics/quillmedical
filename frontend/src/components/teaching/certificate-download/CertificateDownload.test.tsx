import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { CertificateDownload } from "./CertificateDownload";

describe("CertificateDownload", () => {
  it("renders the download button", () => {
    renderWithMantine(<CertificateDownload assessmentId={42} />);
    expect(
      screen.getByRole("button", { name: /download certificate/i }),
    ).toBeInTheDocument();
  });

  it("renders the page title", () => {
    renderWithMantine(<CertificateDownload assessmentId={42} />);
    const matches = screen.getAllByText("Download certificate");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("renders explanatory text", () => {
    renderWithMantine(<CertificateDownload assessmentId={42} />);
    expect(
      screen.getByText(/download your certificate below/i),
    ).toBeInTheDocument();
  });
});
