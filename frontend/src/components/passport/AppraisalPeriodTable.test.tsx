/**
 * AppraisalPeriodTable Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import AppraisalPeriodTable from "./AppraisalPeriodTable";
import { appraisalPeriods } from "./fixtures";

describe("AppraisalPeriodTable", () => {
  it("lists every range, newest first, with its length", () => {
    renderWithMantine(<AppraisalPeriodTable periods={appraisalPeriods} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("4 months");
    expect(rows[1]).toHaveTextContent("12 months");
  });

  it("says so when there are none", () => {
    renderWithMantine(<AppraisalPeriodTable periods={[]} />);
    expect(screen.getByText("No date ranges added")).toBeInTheDocument();
  });

  it("offers nothing to press without actions", () => {
    renderWithMantine(<AppraisalPeriodTable periods={appraisalPeriods} />);
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it("reports the range chosen to edit or remove", async () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    renderWithMantine(
      <AppraisalPeriodTable
        periods={appraisalPeriods}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", {
        name: "Actions for the date range from 1 August 2025",
      }),
    );
    await userEvent.click(await screen.findByText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(appraisalPeriods[0]);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Actions for the date range from 1 August 2026",
      }),
    );
    await userEvent.click(await screen.findByText("Remove"));
    expect(onRemove).toHaveBeenCalledWith(appraisalPeriods[1]);
  });
});
