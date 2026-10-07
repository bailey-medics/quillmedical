import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithRouter } from "@test/test-utils";
import Unsubscribe from "./Unsubscribe";

const SWITCH = "News and updates by email";

describe("Unsubscribe", () => {
  it("shows the heading in every state", () => {
    for (const status of [
      "loading",
      "ready",
      "invalid",
      "unavailable",
    ] as const) {
      const { unmount } = renderWithRouter(<Unsubscribe status={status} />);
      expect(
        screen.getByRole("heading", { name: "Email preferences" }),
      ).toBeInTheDocument();
      unmount();
    }
  });

  // A waiting message used to show here. The answer arrives in a moment,
  // so it flashed up and was replaced, which read as something going wrong.
  it("shows the heading and nothing else while loading", () => {
    renderWithRouter(<Unsubscribe status="loading" />);

    expect(
      screen.getByRole("heading", { name: "Email preferences" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Finding your preferences/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Please wait/)).not.toBeInTheDocument();
  });

  it("offers no switch for a link that is not real", () => {
    renderWithRouter(<Unsubscribe status="invalid" />);

    expect(screen.getByText("This link does not work")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("says nothing was changed when the link could not be checked", () => {
    renderWithRouter(<Unsubscribe status="unavailable" />);

    expect(
      screen.getByText("We could not load your preferences"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been changed/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shows the switch on, and whose address it is, for a subscriber", () => {
    renderWithRouter(
      <Unsubscribe status="ready" email="a***@e***.com" wantsNews />,
    );

    expect(screen.getByRole("switch", { name: SWITCH })).toBeChecked();
    expect(
      screen.getByText(/sent to a\*\*\*@e\*\*\*\.com\./),
    ).toBeInTheDocument();
  });

  it("shows the switch off for somebody who had already said no", () => {
    renderWithRouter(<Unsubscribe status="ready" wantsNews={false} />);

    expect(screen.getByRole("switch", { name: SWITCH })).not.toBeChecked();
  });

  it("says account emails are still sent", () => {
    renderWithRouter(<Unsubscribe status="ready" wantsNews />);

    expect(
      screen.getByText(/password resets and certificates, are always sent/),
    ).toBeInTheDocument();
  });

  it("asks to turn news off when the switch is switched off", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithRouter(
      <Unsubscribe status="ready" wantsNews onChange={onChange} />,
    );

    await user.click(screen.getByRole("switch", { name: SWITCH }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("asks to turn news on when the switch is switched on", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithRouter(
      <Unsubscribe status="ready" wantsNews={false} onChange={onChange} />,
    );

    await user.click(screen.getByRole("switch", { name: SWITCH }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("does nothing when no handler is given", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Unsubscribe status="ready" wantsNews />);

    await user.click(screen.getByRole("switch", { name: SWITCH }));

    expect(screen.getByRole("switch", { name: SWITCH })).toBeChecked();
  });

  it("confirms nothing until a change has been saved", () => {
    renderWithRouter(<Unsubscribe status="ready" wantsNews={false} />);

    expect(
      screen.queryByText("You will not be sent news and updates"),
    ).not.toBeInTheDocument();
  });

  // A second-level heading: a coloured result card was too much for a
  // card this small.
  it("confirms an unsubscribe once it is saved, as a heading", () => {
    renderWithRouter(<Unsubscribe status="ready" wantsNews={false} saved />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "You will not be sent news and updates",
      }),
    ).toBeInTheDocument();
  });

  it("confirms turning news back on once it is saved, as a heading", () => {
    renderWithRouter(<Unsubscribe status="ready" wantsNews saved />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "You will be sent news and updates",
      }),
    ).toBeInTheDocument();
  });

  it("marks the switch busy while a change is saved", () => {
    renderWithRouter(<Unsubscribe status="ready" wantsNews saving />);

    expect(screen.getByRole("switch", { name: SWITCH })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("shows why a change was not saved", () => {
    renderWithRouter(
      <Unsubscribe
        status="ready"
        wantsNews
        error="We could not save that. Please try again."
      />,
    );

    expect(
      screen.getByText("We could not save that. Please try again."),
    ).toBeInTheDocument();
  });
});
