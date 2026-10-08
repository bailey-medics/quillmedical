/**
 * AdminNewsletterPage tests
 *
 * The audience numbers, and the two-step import: a dropped file is only
 * checked, and the same file goes back with the check's fingerprint.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@/test/test-utils";
import * as apiLib from "@/lib/api";
import type {
  MailingListSummary,
  NewsletterAudience,
} from "@/lib/newsletter/api";
import AdminNewsletterPage from "./AdminNewsletterPage";

const audience: NewsletterAudience = {
  accounts: 12,
  subscribers: 870,
  unsubscribed: 6,
};

const summary: MailingListSummary = {
  rows: 5,
  new: 3,
  already_there: 1,
  switched_off: 0,
  opted_in: 4,
  opted_out: 0,
  have_accounts: 0,
  no_address: 0,
  unreadable_answer: 0,
  repeated: 0,
  has_opt_column: true,
  no_address_rows: [],
  unreadable_answer_rows: [],
  fingerprint: "a".repeat(64),
  imported: false,
};

const csv = () =>
  new File(["Email\nsam@example.com\n"], "list.csv", { type: "text/csv" });

async function drop(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("No file input");
  await userEvent.setup({ applyAccept: false }).upload(input, file);
}

describe("AdminNewsletterPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiLib.api, "get").mockResolvedValue(audience);
  });

  it("shows how many people a newsletter would reach", async () => {
    renderWithRouter(<AdminNewsletterPage />);

    expect(
      screen.getByRole("heading", { name: "Newsletter", level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByText("870")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(apiLib.api.get).toHaveBeenCalledWith("/newsletter/audience");
  });

  it("still offers the import when the numbers cannot be loaded", async () => {
    vi.spyOn(apiLib.api, "get").mockRejectedValue(new Error("down"));
    renderWithRouter(<AdminNewsletterPage />);

    expect(
      await screen.findByText("The numbers could not be loaded"),
    ).toBeInTheDocument();
    expect(screen.getByText("Drop a CSV file")).toBeInTheDocument();
  });

  it("only checks a dropped file", async () => {
    const post = vi.spyOn(apiLib.api, "post").mockResolvedValue(summary);
    renderWithRouter(<AdminNewsletterPage />);

    await drop(csv());

    expect(
      await screen.findByRole("heading", { name: "What list.csv would do" }),
    ).toBeInTheDocument();
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0]).toBe("/newsletter/mailing-list/check");
    const form = post.mock.calls[0][1] as FormData;
    expect((form.get("file") as File).name).toBe("list.csv");
    expect(form.get("fingerprint")).toBeNull();
  });

  it("imports the checked file with the check's fingerprint", async () => {
    const post = vi
      .spyOn(apiLib.api, "post")
      .mockResolvedValueOnce(summary)
      .mockResolvedValueOnce({ ...summary, imported: true });
    const get = vi.spyOn(apiLib.api, "get").mockResolvedValue(audience);
    renderWithRouter(<AdminNewsletterPage />);
    await drop(csv());

    await userEvent.click(
      await screen.findByRole("button", { name: "Import 3 people" }),
    );

    expect(
      await screen.findByText("Mailing list imported"),
    ).toBeInTheDocument();
    expect(post.mock.calls[1][0]).toBe("/newsletter/mailing-list/import");
    const form = post.mock.calls[1][1] as FormData;
    expect((form.get("file") as File).name).toBe("list.csv");
    expect(form.get("fingerprint")).toBe(summary.fingerprint);
    // The numbers are read again, now that the list has grown.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it("says why a file was refused, and offers the drop again", async () => {
    vi.spyOn(apiLib.api, "post").mockRejectedValue(
      new Error('No column is headed "Email".'),
    );
    renderWithRouter(<AdminNewsletterPage />);

    await drop(csv());

    expect(
      await screen.findByText('No column is headed "Email".'),
    ).toBeInTheDocument();
    expect(screen.getByText("Drop a CSV file")).toBeInTheDocument();
  });

  it("puts the file aside when the import is refused", async () => {
    vi.spyOn(apiLib.api, "post")
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(new Error("The file has changed."));
    renderWithRouter(<AdminNewsletterPage />);
    await drop(csv());

    await userEvent.click(
      await screen.findByRole("button", { name: "Import 3 people" }),
    );

    expect(
      await screen.findByText("The file has changed."),
    ).toBeInTheDocument();
    expect(screen.getByText("Drop a CSV file")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Import/ }),
    ).not.toBeInTheDocument();
  });

  it("goes back to the drop when another file is chosen", async () => {
    vi.spyOn(apiLib.api, "post").mockResolvedValue(summary);
    renderWithRouter(<AdminNewsletterPage />);
    await drop(csv());

    await userEvent.click(
      await screen.findByRole("button", { name: "Choose another file" }),
    );

    expect(screen.getByText("Drop a CSV file")).toBeInTheDocument();
  });
});
