/**
 * Retention Exception Card Tests
 */

import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithMantine } from "@/test/test-utils";
import {
  whatHappened,
  type RetentionException,
} from "@/lib/retention/retentionReviews";
import RetentionExceptionCard from "./RetentionExceptionCard";

const exception: RetentionException = {
  id: 1,
  user_id: 42,
  full_name: "Alex Example",
  email: "alex.example@example.nhs.uk",
  closed_at: "2028-01-14T09:00:00Z",
  due_on: "2030-01-14T09:00:00Z",
  reason: "failed",
  detail: "The account has a passport and there is no archive to move it to.",
  noted_at: "2030-02-03T03:30:00Z",
};

describe("RetentionExceptionCard", () => {
  it("shows who it is", () => {
    renderWithMantine(<RetentionExceptionCard exception={exception} />);

    expect(screen.getByText("Alex Example")).toBeInTheDocument();
    expect(screen.getByText("alex.example@example.nhs.uk")).toBeInTheDocument();
  });

  it("says a failure is tried again, with what went wrong", () => {
    renderWithMantine(<RetentionExceptionCard exception={exception} />);

    expect(
      screen.getByText(
        "Could not be emptied: The account has a passport and there is no archive to move it to. Tried again each night.",
      ),
    ).toBeInTheDocument();
  });

  it("says when an account was opened again", () => {
    renderWithMantine(
      <RetentionExceptionCard
        exception={{ ...exception, reason: "opened_again", detail: null }}
      />,
    );

    expect(
      screen.getByText("Left alone: the account was opened again."),
    ).toBeInTheDocument();
  });

  it("says when it has training records again", () => {
    renderWithMantine(
      <RetentionExceptionCard
        exception={{ ...exception, reason: "has_records", detail: null }}
      />,
    );

    expect(
      screen.getByText("Left alone: it has training records again."),
    ).toBeInTheDocument();
  });

  it("has nothing to press", () => {
    renderWithMantine(<RetentionExceptionCard exception={exception} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("falls back to a general cause when a failure gives none", () => {
    expect(whatHappened({ ...exception, detail: null })).toBe(
      "Could not be emptied: something went wrong while emptying it. Tried again each night.",
    );
  });
});
