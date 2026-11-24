/**
 * The form's own guards: what it keeps after a save, when it lets the
 * person leave, and how often it calls onSubmit. These need a data
 * router, because the leave warning uses `useBlocker`.
 */

import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stack } from "@mantine/core";
import {
  createMemoryRouter,
  Link,
  RouterProvider,
  useNavigate,
} from "react-router-dom";
import { renderWithMantine } from "@/test/test-utils";
import { Form, FormStatus, SubmitButton, useFormContext } from "./index";
import type { FormSubmitResult } from "./Form";
import TextField from "../TextField";

interface Values {
  name: string;
}

type Submit = (data: Values) => Promise<FormSubmitResult>;

function deferred(): {
  promise: Promise<FormSubmitResult>;
  resolve: (result: FormSubmitResult) => void;
} {
  let resolve: (result: FormSubmitResult) => void = () => {};
  const promise = new Promise<FormSubmitResult>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

const SAVED: FormSubmitResult = {
  state: "success",
  message: { title: "Saved" },
};

function NameField() {
  const { methods } = useFormContext();

  return <TextField label="Name" {...methods.register("name")} />;
}

function NameForm({ onSubmit }: { onSubmit: Submit }) {
  return (
    <Form<Values> defaultValues={{ name: "" }} onSubmit={onSubmit}>
      <Stack gap="md">
        <FormStatus />
        <NameField />
        <SubmitButton />
        <Link to="/elsewhere">Go elsewhere</Link>
        <Link to="/form?page=2">Next page of results</Link>
      </Stack>
    </Form>
  );
}

/** A form whose save navigates on, through afterSave. */
function SavingAndLeavingForm({ onSubmit }: { onSubmit: Submit }) {
  const navigate = useNavigate();

  return (
    <NameForm
      onSubmit={async (data) => ({
        ...(await onSubmit(data)),
        afterSave: () => void navigate("/elsewhere"),
      })}
    />
  );
}

function renderInRouter(form: React.ReactElement) {
  const router = createMemoryRouter(
    [
      { path: "/form", element: form },
      { path: "/elsewhere", element: <p>Somewhere else</p> },
    ],
    { initialEntries: ["/form"] },
  );

  return renderWithMantine(<RouterProvider router={router} />);
}

describe("Form guards", () => {
  it("keeps an edit typed while the save runs, and still warns about it", async () => {
    const user = userEvent.setup();
    const save = deferred();
    renderInRouter(<NameForm onSubmit={() => save.promise} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    await user.click(screen.getByTestId("submit-button"));
    await user.type(screen.getByLabelText("Name"), "e");
    await act(async () => {
      save.resolve(SAVED);
      await save.promise;
    });

    expect(screen.getByLabelText("Name")).toHaveValue("Anne");

    await user.click(screen.getByRole("link", { name: "Go elsewhere" }));
    expect(
      await screen.findByRole("dialog", { name: "Leave this page?" }),
    ).toBeInTheDocument();
  });

  it("lets the person leave once the save has landed with no newer edits", async () => {
    const user = userEvent.setup();
    renderInRouter(<NameForm onSubmit={async () => SAVED} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    await user.click(screen.getByTestId("submit-button"));
    await screen.findByText("Saved");
    await user.click(screen.getByRole("link", { name: "Go elsewhere" }));

    expect(await screen.findByText("Somewhere else")).toBeInTheDocument();
  });

  it("calls onSubmit once for two submits in the same tick", async () => {
    const user = userEvent.setup();
    const save = deferred();
    const onSubmit = vi.fn<Submit>(() => save.promise);
    const { container } = renderInRouter(<NameForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    const form = container.querySelector("form");
    if (!form) throw new Error("no form rendered");

    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledOnce();
    await act(async () => {
      save.resolve(SAVED);
      await save.promise;
    });
  });

  it("warns before leaving while the save is still running", async () => {
    const user = userEvent.setup();
    const save = deferred();
    renderInRouter(<NameForm onSubmit={() => save.promise} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    await user.click(screen.getByTestId("submit-button"));
    await user.click(screen.getByRole("link", { name: "Go elsewhere" }));

    expect(
      await screen.findByRole("dialog", { name: "Leave this page?" }),
    ).toBeInTheDocument();
    await act(async () => {
      save.resolve(SAVED);
      await save.promise;
    });
  });

  it("warns before a change of query string with unsaved edits", async () => {
    const user = userEvent.setup();
    renderInRouter(<NameForm onSubmit={async () => SAVED} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    await user.click(
      screen.getByRole("link", { name: "Next page of results" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Leave this page?" }),
    ).toBeInTheDocument();
  });

  it("navigates through afterSave without its own warning stopping it", async () => {
    const user = userEvent.setup();
    renderInRouter(<SavingAndLeavingForm onSubmit={async () => SAVED} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    await user.click(screen.getByTestId("submit-button"));

    expect(await screen.findByText("Somewhere else")).toBeInTheDocument();
  });

  it("does not run afterSave over edits typed during the save", async () => {
    const user = userEvent.setup();
    const save = deferred();
    renderInRouter(<SavingAndLeavingForm onSubmit={() => save.promise} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    await user.click(screen.getByTestId("submit-button"));
    await user.type(screen.getByLabelText("Name"), "e");
    await act(async () => {
      save.resolve(SAVED);
      await save.promise;
    });

    expect(screen.queryByText("Somewhere else")).toBeNull();
    expect(screen.getByLabelText("Name")).toHaveValue("Anne");
  });

  it("asks the browser to warn before unloading with unsaved edits", async () => {
    const user = userEvent.setup();
    renderInRouter(<NameForm onSubmit={async () => SAVED} />);

    await user.type(screen.getByLabelText("Name"), "Ann");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("lets the page unload when nothing is unsaved", () => {
    renderInRouter(<NameForm onSubmit={async () => SAVED} />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
