import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import ErrorState from "./ErrorState";

describe("ErrorState", () => {
  it("shows the message it was given", () => {
    renderWithMantine(<ErrorState message="Could not load the letters." />);

    expect(screen.getByText("Could not load the letters.")).toBeInTheDocument();
  });

  it("defaults the title, so a caller need only supply the message", () => {
    renderWithMantine(<ErrorState message="Could not load the letters." />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("uses a supplied title instead", () => {
    renderWithMantine(
      <ErrorState
        title="This letter could not be saved"
        message="Try again."
      />,
    );

    expect(
      screen.getByText("This letter could not be saved"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("shows an error code when given one", () => {
    // A fixed vocabulary that discloses nothing, and the thread joining a
    // support call to a log entry.
    renderWithMantine(
      <ErrorState message="Could not load." code="demographics_fetch_failed" />,
    );

    expect(screen.getByText(/demographics_fetch_failed/)).toBeInTheDocument();
  });

  it("omits the code line entirely when there is none", () => {
    renderWithMantine(<ErrorState message="Could not load." />);

    expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument();
  });

  it("offers no action unless one is given", () => {
    renderWithMantine(<ErrorState message="Could not load." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls the action when its button is clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithMantine(
      <ErrorState
        message="Could not load."
        action={{ label: "Try again", onClick }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("announces itself to assistive technology when inline", () => {
    // A section failing inside a page is easy to miss without this.
    renderWithMantine(<ErrorState message="Could not load." />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the page variant for a view that cannot render at all", () => {
    const { container } = renderWithMantine(
      <ErrorState variant="page" message="An unexpected error occurred." />,
    );

    expect(
      container.querySelector('[data-testid="error-state"]'),
    ).toBeInTheDocument();
  });
});
