/**
 * SendFeedbackNavLink Component Tests
 */

import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SendFeedbackNavLink from "./SendFeedbackNavLink";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn().mockResolvedValue({ id: 1 }) },
}));

describe("SendFeedbackNavLink", () => {
  it("shows the label", () => {
    renderWithMantine(<SendFeedbackNavLink />);

    expect(screen.getByText("Send feedback")).toBeInTheDocument();
  });

  it("shows the icon by default", () => {
    const { container } = renderWithMantine(<SendFeedbackNavLink />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("hides the icon when asked", () => {
    const { container } = renderWithMantine(
      <SendFeedbackNavLink showIcons={false} />,
    );

    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("opens the feedback modal rather than navigating", async () => {
    const user = userEvent.setup();
    renderWithMantine(<SendFeedbackNavLink />);

    await user.click(screen.getByText("Send feedback"));

    expect(
      await screen.findByText("Do not include patient details."),
    ).toBeInTheDocument();
  });

  it("closes the modal from Cancel", async () => {
    const user = userEvent.setup();
    renderWithMantine(<SendFeedbackNavLink />);

    await user.click(screen.getByText("Send feedback"));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Do not include patient details."),
    ).not.toBeInTheDocument();
  });
});
