/**
 * Passport Certificates Page Tests
 *
 * The page's own job is the wiring: fetching the passport before the
 * certificates it addresses, and carrying an uploaded file from the
 * uploader into the record. The components either side are tested on
 * their own.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { Component as PassportCertificatesPage } from "./PassportCertificatesPage";

const fetchMyPassport = vi.fn();
const fetchCertificates = vi.fn();
const addCertificate = vi.fn();
const uploadEvidence = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchCertificates: (...args: unknown[]) => fetchCertificates(...args),
  addCertificate: (...args: unknown[]) => addCertificate(...args),
  uploadEvidence: (...args: unknown[]) => uploadEvidence(...args),
}));

const detail = {
  passport: {
    passport_id: "3f2a8c1e",
    holder_user_id: "42",
    holder_name: "Dr Mark Bailey",
    registrations: [],
    created_at: "2026-09-10",
    head_commit: null,
  },
  competencies: [],
};

const certificate = {
  name: "2026-03-14-advanced-life-support",
  id: "20260314T091044.000Z-8b1d5a7f",
  title: "Advanced life support",
  issuer: "Resuscitation Council UK",
  awarded_on: "2026-03-14",
  expires_on: "2030-03-14",
  competencies: [],
  description: null,
  attachments: [],
};

describe("PassportCertificatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail);
  });

  it("lists the holder's certificates", async () => {
    fetchCertificates.mockResolvedValue([certificate]);
    renderWithRouter(<PassportCertificatesPage />);

    expect(
      await screen.findByText("Advanced life support"),
    ).toBeInTheDocument();
    expect(screen.getByText("Resuscitation Council UK")).toBeInTheDocument();
  });

  it("asks the API for the passport before its certificates", async () => {
    // The certificates endpoint is addressed by passport id, so the
    // order matters.
    fetchCertificates.mockResolvedValue([]);
    renderWithRouter(<PassportCertificatesPage />);

    await screen.findByText("Nothing recorded yet");

    expect(fetchCertificates).toHaveBeenCalledWith("3f2a8c1e");
  });

  it("says nobody countersigns these", async () => {
    // The distinction from a sign-off is the one the passport keeps
    // hardest, and the empty state is where a holder first meets it.
    fetchCertificates.mockResolvedValue([]);
    renderWithRouter(<PassportCertificatesPage />);

    expect(
      await screen.findByText(/Nobody countersigns these/),
    ).toBeInTheDocument();
  });

  it("opens the form and its uploader together", async () => {
    const user = userEvent.setup();
    fetchCertificates.mockResolvedValue([]);
    renderWithRouter(<PassportCertificatesPage />);

    await user.click(
      await screen.findByRole("button", { name: /Record a certificate/ }),
    );

    expect(screen.getByText("Record a certificate")).toBeInTheDocument();
    expect(
      screen.getByText("Drop a certificate or click to browse"),
    ).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchCertificates.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCertificatesPage />);

    expect(
      await screen.findByText(/Your certificates could not be loaded/),
    ).toBeInTheDocument();
  });
});
