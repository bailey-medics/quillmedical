import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import InboxButton from "./InboxButton";

const LABEL = "Sign-off requests for me to assess";

describe("InboxButton", () => {
  it("shows how many requests are waiting", () => {
    renderWithMantine(
      <InboxButton label={LABEL} count={3} onClick={vi.fn()} />,
    );

    expect(screen.getByTestId("inbox-count")).toHaveTextContent("3");
  });

  it("shows no badge when nothing is waiting", () => {
    // A zero is a fact nobody needs, and it makes an idle button look
    // like it wants attention.
    renderWithMantine(
      <InboxButton label={LABEL} count={0} onClick={vi.fn()} />,
    );

    expect(screen.queryByTestId("inbox-count")).not.toBeInTheDocument();
  });

  it("shows no badge when the count is not known yet", () => {
    renderWithMantine(<InboxButton label={LABEL} onClick={vi.fn()} />);

    expect(screen.queryByTestId("inbox-count")).not.toBeInTheDocument();
  });

  it("colours the envelope amber when something is waiting", () => {
    const { container } = renderWithMantine(
      <InboxButton label={LABEL} count={2} onClick={vi.fn()} />,
    );

    expect(container.querySelector("svg")).toHaveAttribute(
      "stroke",
      "var(--brand-secondary)",
    );
  });

  it("leaves the envelope its default colour when nothing is waiting", () => {
    const { container } = renderWithMantine(
      <InboxButton label={LABEL} count={0} onClick={vi.fn()} />,
    );

    expect(container.querySelector("svg")).not.toHaveAttribute(
      "stroke",
      "var(--brand-secondary)",
    );
  });

  it("caps the badge at 9+", () => {
    // Above nine the exact figure stops mattering: what somebody does
    // about eleven and about forty is the same.
    renderWithMantine(
      <InboxButton label={LABEL} count={42} onClick={vi.fn()} />,
    );

    expect(screen.getByTestId("inbox-count")).toHaveTextContent("9+");
  });

  it("tells a screen reader the count as well as showing it", () => {
    renderWithMantine(
      <InboxButton label={LABEL} count={3} onClick={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", {
        name: "Sign-off requests for me to assess (3 waiting)",
      }),
    ).toBeInTheDocument();
  });

  it("says what it is when nothing is waiting", () => {
    renderWithMantine(
      <InboxButton label={LABEL} count={0} onClick={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", {
        name: "Sign-off requests for me to assess",
      }),
    ).toBeInTheDocument();
  });

  it("sits back on a dark background when nothing is waiting", () => {
    // A mid grey, not white: an idle envelope should not be the
    // brightest thing on the ribbon.
    const { container } = renderWithMantine(
      <InboxButton label={LABEL} count={0} onDark onClick={vi.fn()} />,
    );

    expect(container.querySelector("svg")).toHaveAttribute(
      "stroke",
      "var(--mantine-color-gray-6)",
    );
  });

  it("is still amber on a dark background when something is waiting", () => {
    const { container } = renderWithMantine(
      <InboxButton label={LABEL} count={2} onDark onClick={vi.fn()} />,
    );

    expect(container.querySelector("svg")).toHaveAttribute(
      "stroke",
      "var(--brand-secondary)",
    );
  });

  it("passes other props to the button, as a menu's target must", () => {
    renderWithMantine(
      <InboxButton label={LABEL} aria-expanded="true" onClick={vi.fn()} />,
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("calls back when pressed", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(
      <InboxButton label={LABEL} count={1} onClick={onClick} />,
    );

    await user.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
