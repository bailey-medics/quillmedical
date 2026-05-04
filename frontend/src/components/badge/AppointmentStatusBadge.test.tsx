/**
 * AppointmentStatus Badge Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import AppointmentStatusBadge from "./AppointmentStatusBadge";

describe("AppointmentStatusBadge", () => {
  it("renders upcoming status", () => {
    renderWithMantine(<AppointmentStatusBadge status="upcoming" />);
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
  });

  it("renders completed status", () => {
    renderWithMantine(<AppointmentStatusBadge status="completed" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("renders cancelled status", () => {
    renderWithMantine(<AppointmentStatusBadge status="cancelled" />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("renders no-show status", () => {
    renderWithMantine(<AppointmentStatusBadge status="no-show" />);
    expect(screen.getByText("No show")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    const { container } = renderWithMantine(
      <AppointmentStatusBadge status="upcoming" isLoading />,
    );
    expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
    expect(
      container.querySelector(".mantine-Skeleton-root"),
    ).toBeInTheDocument();
  });
});
