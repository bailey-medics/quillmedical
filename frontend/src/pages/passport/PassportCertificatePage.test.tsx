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
  uploadEvidence: vi.fn(),
  certificateAttachmentUrl: (passportId: string, name: string, hash: string) =>
    `/api/passport/${passportId}/certificates/${name}/attachments/${hash}`,
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

/** The fixtures, with one file attached to the certificate opened. */
function certificatesWith(attachment: {
  hash: string;
  filename: string;
  size_bytes: number;
  media_type: string;
}) {
  fetchCertificates.mockResolvedValue(
    certificates.map((item) =>
      item.name === opened.name ? { ...item, attachments: [attachment] } : item,
    ),
  );
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

  it("shows an attached PDF in the browser's viewer", async () => {
    certificatesWith({
      hash: "sha256:ab12",
      filename: "als.pdf",
      size_bytes: 1024,
      media_type: "application/pdf",
    });
    renderWithRouter(<PassportCertificatePage />);

    const frame = await screen.findByTitle("als.pdf");
    expect(frame).toHaveAttribute(
      "src",
      expect.stringContaining(
        `/api/passport/3f2a8c1e/certificates/${opened.name}/attachments/sha256:ab12`,
      ),
    );
  });

  it("shows an attached image as an image", async () => {
    certificatesWith({
      hash: "sha256:cd34",
      filename: "als.png",
      size_bytes: 1024,
      media_type: "image/png",
    });
    renderWithRouter(<PassportCertificatePage />);

    expect(await screen.findByRole("img", { name: "als.png" })).toHaveAttribute(
      "src",
      `/api/passport/3f2a8c1e/certificates/${opened.name}/attachments/sha256:cd34`,
    );
  });

  it("offers a HEIC photograph as a download, since few browsers draw one", async () => {
    certificatesWith({
      hash: "sha256:ef56",
      filename: "als.heic",
      size_bytes: 1024,
      media_type: "image/heic",
    });
    renderWithRouter(<PassportCertificatePage />);

    expect(
      await screen.findByText("Document preview not available"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument();
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

  it("removes the file when the holder takes it off and saves", async () => {
    const user = userEvent.setup();
    certificatesWith({
      hash: "sha256:ab12",
      filename: "als.pdf",
      size_bytes: 1024,
      media_type: "application/pdf",
    });
    amendCertificate.mockResolvedValue({ name: opened.name, commit: "abc" });
    renderWithRouter(<PassportCertificatePage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit certificate" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove file" }));
    expect(screen.queryByText("als.pdf")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(amendCertificate).toHaveBeenCalled());
    expect(amendCertificate.mock.calls[0][2].attachments).toEqual([]);
  });

  it("sends the file back unchanged when it is left alone", async () => {
    const user = userEvent.setup();
    const attached = {
      hash: "sha256:ab12",
      filename: "als.pdf",
      size_bytes: 1024,
      media_type: "application/pdf",
    };
    certificatesWith(attached);
    amendCertificate.mockResolvedValue({ name: opened.name, commit: "abc" });
    renderWithRouter(<PassportCertificatePage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit certificate" }),
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(amendCertificate).toHaveBeenCalled());
    expect(amendCertificate.mock.calls[0][2].attachments).toEqual([attached]);
  });

  it("offers an upload box to replace the file", async () => {
    const user = userEvent.setup();
    renderWithRouter(<PassportCertificatePage />);

    await user.click(
      await screen.findByRole("button", { name: "Edit certificate" }),
    );

    expect(
      screen.getByText("Drop a certificate or click to browse"),
    ).toBeInTheDocument();
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
