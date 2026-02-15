import { screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { renderWithMantine } from "@/test/test-utils";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders title and value", () => {
    renderWithMantine(<StatCard title="Total Users" value={42} />);

    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders with zero value", () => {
    renderWithMantine(<StatCard title="Total Patients" value={0} />);

    expect(screen.getByText("Total Patients")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders skeleton when loading", () => {
    const { container } = renderWithMantine(
      <StatCard title="Total Records" value={100} loading />,
    );

    expect(screen.getByText("Total Records")).toBeInTheDocument();
    expect(screen.queryByText("100")).not.toBeInTheDocument();

    // Check for skeleton element
    const skeleton = container.querySelector(".mantine-Skeleton-root");
    expect(skeleton).toBeInTheDocument();
  });

  it("does not render skeleton when not loading", () => {
    const { container } = renderWithMantine(
      <StatCard title="Total Users" value={42} />,
    );

    const skeleton = container.querySelector(".mantine-Skeleton-root");
    expect(skeleton).not.toBeInTheDocument();
  });

  it("renders large numbers correctly", () => {
    renderWithMantine(<StatCard title="Total Records" value={123456} />);

    expect(screen.getByText("123456")).toBeInTheDocument();
  });

  it("applies Card styling", () => {
    const { container } = renderWithMantine(
      <StatCard title="Test" value={10} />,
    );

    const card = container.querySelector(".mantine-Card-root");
    expect(card).toBeInTheDocument();
  });
});
