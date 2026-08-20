import { afterEach, describe, expect, it } from "vitest";
import { persistFormState, restoreFormState } from "./formStatePersistence";

function clearDom(): void {
  document.body.innerHTML = ""; // nosemgrep: js.dom.xss.innerhtml
  sessionStorage.clear();
}

describe("persistFormState / restoreFormState", () => {
  afterEach(clearDom);

  it("persists and restores a named text input's value", () => {
    document.body.innerHTML = `<input type="text" name="noteTitle" value="Draft title" />`; // nosemgrep: js.dom.xss.innerhtml
    persistFormState("/patients/1/notes/new");

    document.body.innerHTML = `<input type="text" name="noteTitle" />`; // nosemgrep: js.dom.xss.innerhtml
    restoreFormState("/patients/1/notes/new");

    const field =
      document.querySelector<HTMLInputElement>('[name="noteTitle"]');
    expect(field?.value).toBe("Draft title");
  });

  it("persists and restores a textarea by id when no name is set", () => {
    document.body.innerHTML = `<textarea id="clinical-note">Half-written note</textarea>`; // nosemgrep: js.dom.xss.innerhtml
    persistFormState("/patients/1/notes/new");

    document.body.innerHTML = `<textarea id="clinical-note"></textarea>`; // nosemgrep: js.dom.xss.innerhtml
    restoreFormState("/patients/1/notes/new");

    const field = document.getElementById(
      "clinical-note",
    ) as HTMLTextAreaElement;
    expect(field.value).toBe("Half-written note");
  });

  it("drops fields with no exact match on restore rather than guessing", () => {
    document.body.innerHTML = `<input type="text" name="noteTitle" value="Draft" />`; // nosemgrep: js.dom.xss.innerhtml
    persistFormState("/patients/1/notes/new");

    // Restored page has no matching field at all.
    document.body.innerHTML = `<div>no form here</div>`; // nosemgrep: js.dom.xss.innerhtml
    expect(() => restoreFormState("/patients/1/notes/new")).not.toThrow();
  });

  it("is scoped per-pathname", () => {
    document.body.innerHTML = `<input type="text" name="noteTitle" value="Draft" />`; // nosemgrep: js.dom.xss.innerhtml
    persistFormState("/patients/1/notes/new");

    document.body.innerHTML = `<input type="text" name="noteTitle" />`; // nosemgrep: js.dom.xss.innerhtml
    restoreFormState("/patients/2/notes/new");

    const field =
      document.querySelector<HTMLInputElement>('[name="noteTitle"]');
    expect(field?.value).toBe("");
  });

  it("is a one-shot restore — the saved snapshot is cleared after use", () => {
    document.body.innerHTML = `<input type="text" name="noteTitle" value="Draft" />`; // nosemgrep: js.dom.xss.innerhtml
    persistFormState("/patients/1/notes/new");

    document.body.innerHTML = `<input type="text" name="noteTitle" />`; // nosemgrep: js.dom.xss.innerhtml
    restoreFormState("/patients/1/notes/new");

    document.body.innerHTML = `<input type="text" name="noteTitle" />`; // nosemgrep: js.dom.xss.innerhtml
    restoreFormState("/patients/1/notes/new");

    const field =
      document.querySelector<HTMLInputElement>('[name="noteTitle"]');
    expect(field?.value).toBe("");
  });

  it("does nothing when there is no saved snapshot for the pathname", () => {
    document.body.innerHTML = `<input type="text" name="noteTitle" />`; // nosemgrep: js.dom.xss.innerhtml
    expect(() => restoreFormState("/patients/1/notes/new")).not.toThrow();
    const field =
      document.querySelector<HTMLInputElement>('[name="noteTitle"]');
    expect(field?.value).toBe("");
  });

  it("skips empty fields when persisting", () => {
    document.body.innerHTML = `<input type="text" name="noteTitle" value="" />`; // nosemgrep: js.dom.xss.innerhtml
    persistFormState("/patients/1/notes/new");
    expect(
      sessionStorage.getItem(
        "quill-forced-reload-form-state:/patients/1/notes/new",
      ),
    ).toBeNull();
  });
});
