import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine, remToPx } from "@test/test-utils";
import DateField from "./DateField";

describe("DateField", () => {
  it("renders with a label", () => {
    renderWithMantine(<DateField label="Observed on" />);
    expect(screen.getByText("Observed on")).toBeInTheDocument();
  });

  it("renders a British-format placeholder by default", () => {
    renderWithMantine(<DateField label="Observed on" />);
    expect(screen.getByPlaceholderText("DD/MM/YYYY")).toBeInTheDocument();
  });

  it("renders a description", () => {
    renderWithMantine(
      <DateField
        label="Performed on"
        description="The day the procedure happened"
      />,
    );
    expect(
      screen.getByText("The day the procedure happened"),
    ).toBeInTheDocument();
  });

  it("renders an error message", () => {
    renderWithMantine(
      <DateField
        label="Observed on"
        error="Enter the date you observed this"
      />,
    );
    expect(
      screen.getByText("Enter the date you observed this"),
    ).toBeInTheDocument();
  });

  describe("String values, never Date objects", () => {
    it("displays a YYYY-MM-DD value in British long form", () => {
      // The backend sends and accepts YYYY-MM-DD. Converting to Date and
      // back is where a timezone shifts a clinical date by a day.
      renderWithMantine(
        <DateField label="Observed on" defaultValue="2026-03-12" />,
      );
      expect(screen.getByDisplayValue("12 March 2026")).toBeInTheDocument();
    });

    it("reports a chosen date back as a YYYY-MM-DD string", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      renderWithMantine(
        <DateField
          label="Observed on"
          defaultValue="2026-03-12"
          onChange={onChange}
        />,
      );

      await user.click(screen.getByRole("textbox"));
      await user.click(screen.getByText("14"));

      expect(onChange).toHaveBeenCalledWith("2026-03-14");
    });
  });

  describe("Styling", () => {
    it("applies the standardised label styles", () => {
      renderWithMantine(<DateField label="Observed on" />);

      const label = screen.getByText("Observed on");
      expect(label).toHaveStyle({
        marginBottom: remToPx("0.25rem"),
      });
      expect(label.style.fontSize).toBe("var(--mantine-font-size-md)");
      expect(label.style.color).toBe("var(--mantine-color-text)");
    });

    it("applies the standardised input font size", () => {
      renderWithMantine(<DateField label="Observed on" />);

      expect(screen.getByRole("textbox").style.fontSize).toBe(
        "var(--mantine-font-size-md)",
      );
    });
  });

  describe("Constraints are the form's to impose", () => {
    it("allows a future date unless the caller sets maxDate", () => {
      // A certificate expiry is legitimately in the future, so the field
      // imposes no rule of its own.
      renderWithMantine(
        <DateField label="Expires on" defaultValue="2030-01-01" />,
      );
      expect(screen.getByDisplayValue("1 January 2030")).toBeInTheDocument();
    });
  });

  it("can be disabled", () => {
    renderWithMantine(
      <DateField label="Signed on" defaultValue="2026-03-14" disabled />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("names the clear button for screen readers", () => {
    renderWithMantine(
      <DateField label="Observed on" defaultValue="2026-03-14" clearable />,
    );
    expect(
      screen.getByRole("button", { name: "Clear date" }),
    ).toBeInTheDocument();
  });

  it("lets a caller rename the clear button", () => {
    renderWithMantine(
      <DateField
        label="Observed on"
        defaultValue="2026-03-14"
        clearable
        clearButtonProps={{ "aria-label": "Clear observed date" }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Clear observed date" }),
    ).toBeInTheDocument();
  });

  describe("Typed dates", () => {
    it("reads a typed 03/04/2026 as 3 April", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithMantine(
        <DateField label="Date of birth" onChange={onChange} />,
      );

      await user.type(screen.getByRole("textbox"), "03/04/2026");

      expect(onChange).toHaveBeenLastCalledWith("2026-04-03");
    });

    it("asks for the year in full when a two-digit year is typed", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithMantine(
        <DateField label="Date of birth" onChange={onChange} />,
      );

      await user.type(screen.getByRole("textbox"), "1/2/80");
      await user.tab();

      expect(
        await screen.findByText("Enter the year in full, for example 1980"),
      ).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalledWith("1980-02-01");
    });

    it("refuses a day that does not exist", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithMantine(<DateField label="Due on" onChange={onChange} />);

      await user.type(screen.getByRole("textbox"), "31/02/2026");
      await user.tab();

      expect(await screen.findByText(/Enter a real date/)).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalledWith("2026-03-03");
    });

    it("shows the caller's error before its own", async () => {
      const user = userEvent.setup();
      renderWithMantine(
        <DateField label="Due on" error="The due date is needed" />,
      );

      await user.type(screen.getByRole("textbox"), "1/2/80");
      await user.tab();

      expect(screen.getByText("The due date is needed")).toBeInTheDocument();
      expect(
        screen.queryByText("Enter the year in full, for example 1980"),
      ).toBeNull();
    });
  });

  it("names the calendar's arrows", async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <DateField label="Observed on" defaultValue="2026-03-14" />,
    );

    await user.click(screen.getByRole("textbox"));

    expect(
      await screen.findByRole("button", { name: "Next month" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous month" }),
    ).toBeInTheDocument();
  });
});
