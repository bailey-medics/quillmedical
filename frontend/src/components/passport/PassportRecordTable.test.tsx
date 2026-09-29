/**
 * PassportRecordTable Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import PassportRecordTable, { RECORDS_PER_PAGE } from "./PassportRecordTable";
import { passportRecords } from "./fixtures";

describe("PassportRecordTable", () => {
  it("lists every kind of record, in the order given", () => {
    renderWithMantine(<PassportRecordTable records={passportRecords} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(passportRecords.length);
    expect(rows[0]).toHaveTextContent(passportRecords[0].title);
    for (const type of [
      "Sign-off",
      "Logbook",
      "CPD",
      "Certificate",
      "Reflection",
    ]) {
      expect(screen.getAllByText(type).length).toBeGreaterThan(0);
    }
  });

  it("shows a status only for sign-offs", () => {
    renderWithMantine(<PassportRecordTable records={passportRecords} />);

    const reflectionRow = screen
      .getByText("Breaking bad news")
      .closest("tr") as HTMLElement;
    expect(within(reflectionRow).getByText("–")).toBeInTheDocument();
    expect(screen.getAllByText("Signed off").length).toBeGreaterThan(0);
  });

  it("pages a long record", () => {
    const many = Array.from({ length: RECORDS_PER_PAGE + 5 }, (_, i) => ({
      ...passportRecords[0],
      key: `record-${i}`,
      title: `Record ${i}`,
    }));
    renderWithMantine(<PassportRecordTable records={many} />);

    expect(screen.getAllByRole("row").slice(1)).toHaveLength(RECORDS_PER_PAGE);
    expect(
      screen.queryByText(`Record ${RECORDS_PER_PAGE}`),
    ).not.toBeInTheDocument();
  });

  it("reports the record chosen", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <PassportRecordTable records={passportRecords} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByText("Breaking bad news"));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reflection",
        href: "/passport/reflections/2026-06-03-breaking-bad-news",
      }),
    );
  });

  it("says so when there is nothing", () => {
    renderWithMantine(<PassportRecordTable records={[]} />);
    expect(screen.getByText("Nothing recorded yet")).toBeInTheDocument();
  });
});
