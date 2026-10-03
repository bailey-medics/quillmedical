/**
 * Member lookup tests.
 *
 * Covers that it asks only when told to and only about a whole address,
 * what it says for each of the four answers, that somebody found is
 * handed to the page, and that creating is offered only for an address
 * nobody has.
 */

import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithMantine } from "@/test/test-utils";
import type { MemberLookup as Result } from "@/domains/orgUnit";
import MemberLookup from "./MemberLookup";

const person = {
  id: 9,
  username: "a.patel",
  full_name: "Anita Patel",
  competencies: [],
};

function renderLookup(result: Result | Error, withCreate = true) {
  const handlers = {
    onLookUp:
      result instanceof Error
        ? vi.fn().mockRejectedValue(result)
        : vi.fn().mockResolvedValue(result),
    onFound: vi.fn(),
    onCreate: vi.fn(),
  };
  renderWithMantine(
    <MemberLookup
      placeName="Oncology"
      onLookUp={handlers.onLookUp}
      onFound={handlers.onFound}
      onCreate={withCreate ? handlers.onCreate : undefined}
    />,
  );
  return handlers;
}

async function find(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email address/i), email);
  await user.click(screen.getByRole("button", { name: "Find" }));
  return user;
}

describe("MemberLookup", () => {
  it("asks nothing as the address is typed", async () => {
    const { onLookUp } = renderLookup({ status: "not_found", user: null });

    await userEvent
      .setup()
      .type(screen.getByLabelText(/email address/i), "a.patel@example.org");

    expect(onLookUp).not.toHaveBeenCalled();
  });

  it("refuses part of an address without asking", async () => {
    const { onLookUp } = renderLookup({ status: "not_found", user: null });

    await find("a.patel");

    expect(onLookUp).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a whole email address")).toBeInTheDocument();
  });

  it("asks about the address, trimmed, on Find", async () => {
    const { onLookUp } = renderLookup({ status: "not_found", user: null });

    await find("  a.patel@example.org ");

    expect(onLookUp).toHaveBeenCalledWith("a.patel@example.org");
  });

  it("asks on Enter, and does not submit a form around it", async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const onLookUp = vi.fn().mockResolvedValue({
      status: "not_found",
      user: null,
    });
    renderWithMantine(
      <form onSubmit={onSubmit}>
        <MemberLookup
          placeName="Oncology"
          onLookUp={onLookUp}
          onFound={vi.fn()}
        />
        <button type="submit">Save</button>
      </form>,
    );

    await userEvent
      .setup()
      .type(
        screen.getByLabelText(/email address/i),
        "a.patel@example.org{Enter}",
      );

    expect(onLookUp).toHaveBeenCalledWith("a.patel@example.org");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hands over somebody who may be added, and says so", async () => {
    const { onFound, onCreate } = renderLookup({
      status: "found",
      user: person,
    });

    await find("a.patel@example.org");

    expect(onFound).toHaveBeenCalledWith(person);
    expect(screen.getByText("a.patel")).toBeInTheDocument();
    expect(
      screen.getByText(/They are chosen below, ready to add to Oncology/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create new user" }),
    ).not.toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("says when they are here already, and hands nobody over", async () => {
    const { onFound } = renderLookup({
      status: "already_member",
      user: person,
    });

    await find("a.patel@example.org");

    expect(screen.getByText(/is already at Oncology/)).toBeInTheDocument();
    expect(onFound).not.toHaveBeenCalled();
  });

  it("says an account may not be added, and offers no way round", async () => {
    const { onFound } = renderLookup({ status: "not_addable", user: null });

    await find("a.patel@example.org");

    expect(
      screen.getByText(/has a Quill account that you may not add here/),
    ).toBeInTheDocument();
    expect(onFound).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Create new user" }),
    ).not.toBeInTheDocument();
  });

  it("offers to create somebody nobody has the address of", async () => {
    const { onCreate } = renderLookup({ status: "not_found", user: null });

    const user = await find("new.person@example.org");
    await user.click(screen.getByRole("button", { name: "Create new user" }));

    expect(onCreate).toHaveBeenCalledWith("new.person@example.org");
  });

  it("does not offer to create when the page cannot", async () => {
    renderLookup({ status: "not_found", user: null }, false);

    await find("new.person@example.org");

    expect(screen.getByText(/Nobody on Quill has the address/)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Create new user" }),
    ).not.toBeInTheDocument();
  });

  it("says so when the lookup fails", async () => {
    const { onFound } = renderLookup(new Error("offline"));

    await find("a.patel@example.org");

    expect(
      screen.getByText("Could not look that address up. Please try again."),
    ).toBeInTheDocument();
    expect(onFound).not.toHaveBeenCalled();
  });
});
