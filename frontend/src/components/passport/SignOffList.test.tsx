/**
 * SignOffList Component Tests
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@test/test-utils";
import SignOffList from "./SignOffList";
import { declined, signOffs, signedOff } from "./fixtures";

describe("SignOffList", () => {
  it("renders the heading and one row per sign-off", () => {
    renderWithMantine(<SignOffList title="Sign-offs" signOffs={signOffs} />);
    expect(screen.getByText("Sign-offs")).toBeInTheDocument();
    expect(screen.getAllByTestId("sign-off-row")).toHaveLength(3);
  });

  it("lists the same competency twice when it has two sign-offs", () => {
    renderWithMantine(
      <SignOffList title="History" signOffs={[signedOff, declined]} />,
    );
    expect(screen.getAllByText("Perform bronchoscopy")).toHaveLength(2);
  });

  it("renders nothing when there are none", () => {
    renderWithMantine(<SignOffList title="Declined" signOffs={[]} />);
    expect(screen.queryByText("Declined")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sign-off-list")).not.toBeInTheDocument();
  });

  it("draws placeholders while loading, and no rows", () => {
    renderWithMantine(
      <SignOffList title="Sign-offs" signOffs={signOffs} isLoading />,
    );
    expect(screen.getByTestId("sign-off-list-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("sign-off-row")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign-offs")).not.toBeInTheDocument();
  });

  it("draws placeholders while loading even with nothing to list", () => {
    renderWithMantine(
      <SignOffList title="Sign-offs" signOffs={[]} isLoading />,
    );
    expect(screen.getByTestId("sign-off-list-loading")).toBeInTheDocument();
  });

  it("passes a chosen row's name on", async () => {
    const onSelect = vi.fn();
    renderWithMantine(
      <SignOffList
        title="Signed off"
        signOffs={[signedOff]}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Perform bronchoscopy" }),
    );

    expect(onSelect).toHaveBeenCalledWith(signedOff.name);
  });
});
