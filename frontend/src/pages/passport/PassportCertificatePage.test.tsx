/**
 * Passport Certificate Page Tests
 *
 * Laid out as every passport record page is, so these pin the same
 * things the logbook entry and CPD activity pages' tests do: the title
 * names the section, the record is shown, and editing sends back what
 * the form does not show.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import { certificates } from "@/components/passport/fixtures";
import { Component as PassportCertificatePage } from "./PassportCertificatePage";

const fetchMyPassport = vi.fn();
const fetchCertificates = vi.fn();
const amendCertificate = vi.fn();

vi.mock("@lib/passport", () => ({
  fetchMyPassport: (...args: unknown[]) => fetchMyPassport(...args),
  fetchCertificates: (...args: unknown[]) => fetchCertificates(...args),
  amendCertificate: (...args: unknown[]) => amendCertificate(...args),
}));

// The record the page is opened on: the second fixture, which carries a
// competency the form does not show.
const opened = certificates[1];

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...actual, useParams: () => ({ name: opened.name }) };
});

function detail(canWrite = true) {
  return {
    passport: { passport_id: "3f2a8c1e" },
    competencies: [],
    entitlement: { can_write: canWrite },
  };
}

describe("PassportCertificatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMyPassport.mockResolvedValue(detail());
    fetchCertificates.mockResolvedValue(certificates);
  });

  it("names the section, then the certificate, in the title", async () => {
    renderWithRouter(<PassportCertificatePage />);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Certificates: Bronchoscopy course",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("passport-record-card")).toBeInTheDocument();
  });

  it("says so when the certificate is not there", async () => {
    fetchCertificates.mockResolvedValue([]);
    renderWithRouter(<PassportCertificatePage />);

    expect(
      await screen.findByText("That certificate is not here"),
    ).toBeInTheDocument();
  });

  it("explains a failed load", async () => {
    fetchMyPassport.mockRejectedValue(new Error("network"));
    renderWithRouter(<PassportCertificatePage />);

    expect(
      await screen.findByText(/That certificate could not be loaded/),
    ).toBeInTheDocument();
  });

  it("opens the form filled in from the certificate", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PassportCertificatePage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit certificate" }),
    );

    expect(screen.getByRole("textbox", { name: /What is it\?/ })).toHaveValue(
      "Bronchoscopy course",
    );
    expect(
      screen.queryByTestId("passport-record-card"),
    ).not.toBeInTheDocument();
  });

  it("disables editing where the passport is read-only", async () => {
    fetchMyPassport.mockResolvedValue(detail(false));
    renderWithRouter(<PassportCertificatePage />);

    expect(
      await screen.findByRole("button", { name: "Edit certificate" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the competencies it supports when saved", async () => {
    const user = userEvent.setup();
    amendCertificate.mockResolvedValue({ name: opened.name, commit: "abc" });
    renderWithRouter(<PassportCertificatePage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit certificate" }),
    );
    const title = screen.getByRole("textbox", { name: /What is it\?/ });
    await user.clear(title);
    await user.type(title, "Bronchoscopy course, part two");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(amendCertificate).toHaveBeenCalled());
    const [passportId, name, sent] = amendCertificate.mock.calls[0];
    expect(passportId).toBe("3f2a8c1e");
    expect(name).toBe(opened.name);
    expect(sent.title).toBe("Bronchoscopy course, part two");
    expect(sent.competencies).toEqual(["perform_bronchoscopy"]);
  });
});
