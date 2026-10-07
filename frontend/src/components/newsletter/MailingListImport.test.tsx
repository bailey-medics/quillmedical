import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import type { MailingListSummary } from "@lib/newsletter/api";
import MailingListImport, {
  type MailingListImportProps,
} from "./MailingListImport";

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
  fingerprint: "f".repeat(64),
  imported: false,
};

function show(props: Partial<MailingListImportProps> = {}) {
  const handlers = {
    onFile: vi.fn(),
    onReject: vi.fn(),
    onImport: vi.fn(),
    onStartAgain: vi.fn(),
  };
  renderWithMantine(
    <MailingListImport stage="idle" {...handlers} {...props} />,
  );
  return handlers;
}

describe("MailingListImport", () => {
  it("says the file is only checked, and never kept", () => {
    show();

    expect(
      screen.getByRole("heading", { name: "Import a mailing list" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/only checks it/)).toBeInTheDocument();
    expect(screen.getByText(/never kept/)).toBeInTheDocument();
  });

  it("offers somewhere to drop a file, and no import, before one is checked", () => {
    show();

    expect(screen.getByText("Drop a CSV file")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Import/ }),
    ).not.toBeInTheDocument();
  });

  it("says it is checking while the file is read", () => {
    show({ stage: "checking" });

    expect(screen.getByText("Checking the file…")).toBeInTheDocument();
  });

  it("shows what a checked file would do, naming the file", () => {
    show({ stage: "checked", summary, fileName: "list.csv" });

    expect(
      screen.getByRole("heading", { name: "What list.csv would do" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("New to the mailing list: 3 people."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Already on it and left as they are: 1 person."),
    ).toBeInTheDocument();
    expect(screen.getByText("Opted in: 4. Opted out: 0.")).toBeInTheDocument();
  });

  it("imports only on a second press", async () => {
    const user = userEvent.setup();
    const handlers = show({ stage: "checked", summary });

    expect(handlers.onImport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Import 3 people" }));

    expect(handlers.onImport).toHaveBeenCalledOnce();
  });

  it("lets a checked file be put aside", async () => {
    const user = userEvent.setup();
    const handlers = show({ stage: "checked", summary });

    await user.click(
      screen.getByRole("button", { name: "Choose another file" }),
    );

    expect(handlers.onStartAgain).toHaveBeenCalledOnce();
    expect(handlers.onImport).not.toHaveBeenCalled();
  });

  it("warns that a file with no opt in column takes everybody as opted in", () => {
    show({ stage: "checked", summary: { ...summary, has_opt_column: false } });

    expect(
      screen.getByText("This file has no opt in column"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Everybody in it is taken as opted in/),
    ).toBeInTheDocument();
  });

  it("gives no such warning when the file has the column", () => {
    show({ stage: "checked", summary });

    expect(
      screen.queryByText("This file has no opt in column"),
    ).not.toBeInTheDocument();
  });

  it("names the rows it left out by number, and why", () => {
    show({
      stage: "checked",
      summary: {
        ...summary,
        no_address: 3,
        unreadable_answer: 1,
        no_address_rows: [4, 9, 12],
        unreadable_answer_rows: [7],
      },
    });

    expect(screen.getByText("4 rows were left out")).toBeInTheDocument();
    expect(
      screen.getByText(/No usable email address: rows 4, 9 and 12\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Opt in or out could not be read: row 7\./),
    ).toBeInTheDocument();
  });

  it("says there were more rows than it lists", () => {
    show({
      stage: "checked",
      summary: { ...summary, no_address: 60, no_address_rows: [2, 3] },
    });

    expect(screen.getByText(/rows 2 and 3 and more\./)).toBeInTheDocument();
  });

  it("says who a file would unsubscribe, and who holds an account", () => {
    show({
      stage: "checked",
      summary: { ...summary, switched_off: 2, have_accounts: 1, repeated: 1 },
    });

    expect(
      screen.getByText("On it now, and unsubscribed by this file: 2 people."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 person already has a Quill account/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/1 row names an address an earlier row had/),
    ).toBeInTheDocument();
  });

  it("leaves those lines out when there is nothing to say", () => {
    show({ stage: "checked", summary });

    expect(
      screen.queryByText(/unsubscribed by this file/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Quill account/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left out/)).not.toBeInTheDocument();
  });

  it("says why a file was refused, and still offers the drop", () => {
    show({ error: 'No column is headed "Email".' });

    expect(screen.getByText("That did not work")).toBeInTheDocument();
    expect(
      screen.getByText('No column is headed "Email".'),
    ).toBeInTheDocument();
    expect(screen.getByText("Drop a CSV file")).toBeInTheDocument();
  });

  it("confirms an import, with what was added", async () => {
    const user = userEvent.setup();
    const handlers = show({
      stage: "imported",
      summary: { ...summary, imported: true },
    });

    expect(screen.getByText("Mailing list imported")).toBeInTheDocument();
    expect(screen.getByText("Added: 3 people.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Import another file" }),
    );
    expect(handlers.onStartAgain).toHaveBeenCalledOnce();
  });
});
