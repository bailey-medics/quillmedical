/**
 * CertificateTable Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import CertificateTable from "./CertificateTable";
import { certificates } from "./fixtures";

describe("CertificateTable", () => {
  it("lists every certificate, newest first", () => {
    renderWithMantine(<CertificateTable certificates={certificates} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Bronchoscopy course");
    expect(rows[1]).toHaveTextContent("Advanced life support");
  });

  it("shows who issued it, and a dash where there is no expiry", () => {
    renderWithMantine(<CertificateTable certificates={certificates} />);
    expect(screen.getByText("Resuscitation Council UK")).toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("says so when there are none", () => {
    renderWithMantine(<CertificateTable certificates={[]} />);
    expect(screen.getByText("No certificates recorded")).toBeInTheDocument();
  });

  it("reports the certificate chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <CertificateTable certificates={certificates} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByText("Advanced life support"));

    expect(onSelect).toHaveBeenCalledWith(certificates[0]);
  });
});
