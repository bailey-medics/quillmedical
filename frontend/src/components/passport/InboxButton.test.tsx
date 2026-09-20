import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import InboxButton from "./InboxButton";

describe("InboxButton", () => {
  it("shows how many requests are waiting", () => {
    renderWithMantine(<InboxButton count={3} onClick={vi.fn()} />);

    expect(screen.getByTestId("inbox-count")).toHaveTextContent("3");
  });

  it("shows no badge when nothing is waiting", () => {
    // A zero is a fact nobody needs, and it makes an idle button look
    // like it wants attention.
    renderWithMantine(<InboxButton count={0} onClick={vi.fn()} />);

    expect(screen.queryByTestId("inbox-count")).not.toBeInTheDocument();
  });

  it("shows no badge when the count is not known yet", () => {
    renderWithMantine(<InboxButton onClick={vi.fn()} />);

    expect(screen.queryByTestId("inbox-count")).not.toBeInTheDocument();
  });

  it("caps the badge at 9+", () => {
    // Above nine the exact figure stops mattering: what somebody does
    // about eleven and about forty is the same.
    renderWithMantine(<InboxButton count={42} onClick={vi.fn()} />);

    expect(screen.getByTestId("inbox-count")).toHaveTextContent("9+");
  });

  it("tells a screen reader the count as well as showing it", () => {
    renderWithMantine(<InboxButton count={3} onClick={vi.fn()} />);

    expect(
      screen.getByRole("button", {
        name: "Sign-off requests for me to assess (3 waiting)",
      }),
    ).toBeInTheDocument();
  });

  it("says what it is when nothing is waiting", () => {
    renderWithMantine(<InboxButton count={0} onClick={vi.fn()} />);

    expect(
      screen.getByRole("button", {
        name: "Sign-off requests for me to assess",
      }),
    ).toBeInTheDocument();
  });

  it("calls back when pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<InboxButton count={1} onClick={onClick} />);

    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
