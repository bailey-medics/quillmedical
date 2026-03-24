/**
 * AppointmentStatus Badge Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import AppointmentStatus from "./AppointmentStatus";

describe("AppointmentStatus", () => {
  it("renders upcoming status", () => {
    renderWithMantine(<AppointmentStatus status="upcoming" />);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });

  it("renders completed status", () => {
    renderWithMantine(<AppointmentStatus status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders cancelled status", () => {
    renderWithMantine(<AppointmentStatus status="cancelled" />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("renders no-show status", () => {
    renderWithMantine(<AppointmentStatus status="no-show" />);
    expect(screen.getByText("No show")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(
      <AppointmentStatus status="upcoming" isLoading />,
    );
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
  });
});
