import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@test/test-utils";
import { CertificateDownload } from "./CertificateDownload";

describe("CertificateDownload", () => {
  it("renders the download button", () => {
    renderWithMantine(<CertificateDownload assessmentId={42} />);
    expect(screen.getByText("Download certificate")).toBeInTheDocument();
  });
});
