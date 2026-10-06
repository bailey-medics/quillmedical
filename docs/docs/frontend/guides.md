# In-app guides

The guides at `/guides` are short task instructions for the people who use
Quill: how to add a delegate, how to join a course. Each is a markdown file
in the repository, with screenshots that Playwright retakes from seeded
data. This page is how to write one. The reasoning behind the design is in
the [in-app guides plan](../plans/2026-10-05-in-app-guides-plan.md).

## What a guide is made of

- **A registry entry** – in `frontend/src/guides/registry.ts`. It gives the
  guide its address, its title and who it is for.
- **A markdown file** – `frontend/src/guides/content/<slug>.md`, holding
  the words.
- **A screenshot spec** – `frontend/e2e/guides/<slug>.spec.ts`, taking the
  pictures the words name. A guide with no pictures needs none.

The tests in `frontend/src/guides/` hold the three together. A registry
entry with no file, a file with no entry, a title that differs between the
two, a picture nobody takes and a picture nobody shows each fail the build.

## Write a guide

### 1. Add the registry entry

```ts
{
  slug: "add-a-delegate-by-hand",
  title: "Add a delegate by hand",
  summary: "Create an account for somebody who cannot register for themselves.",
  audience: "admin",
  public: false,
  feature: "teaching",
},
```

- **`slug`** – lower case words joined by hyphens. It is the address,
  `/guides/<slug>`, and the name of the markdown file.
- **`title`** – sentence case, and a task: "Add a delegate by hand", not
  "Delegates".
- **`audience`** – `delegate`, `admin` or `superadmin`. A reader sees their
  own audience and every one below it.
- **`public`** – `true` lets somebody who is not signed in read it. Only
  for a guide somebody needs before they have an account. It publishes the
  guide to the internet.
- **`feature`** – leave it out for a guide about Quill as a whole. Given, the
  guide is shown only where that feature is switched on.

The audience decides what a reader is shown. It is not a guard, and nothing
sensitive belongs in a guide.

### 2. Write the markdown file

Open it with the title as a `#` heading, exactly as the registry has it.
The page shows the title in its own header and leaves this one out.

Write for somebody doing the task for the first time, with the screen in
front of them:

- **One task per guide.** A second task is a second guide.
- **Number the steps**, one action each.
- **Name things as the screen names them**, in bold: press **Create
  user**. Read the label off the page, do not remember it.
- **Say what happens next**, so the reader knows the step worked.
- **End with what goes wrong**, where something commonly does.

The guides are drawn by `MarkdownView`, a small renderer of its own and not
a full markdown parser. It understands headings, paragraphs, bold, italics,
links, bulleted and numbered lists, and images. So:

- **A list item is one line.** Do not wrap it.
- **A list cannot nest.**
- **A blank line ends a list**, and the next numbered list starts again
  at 1. Use a `##` heading where a guide has more than one run of steps.
- **Link to a page of Quill by its path**: `[register page](/register)`.

### 3. Add the pictures

Name an image by its place under the guide's own folder, with alt text
saying what it shows:

```markdown
1. Press the **Add user** button.
   ![The list of users, with the Add user button above it](add-a-delegate-by-hand/users.png)
2. Enter their name.
```

An image indented under a step belongs to that step and does not end the
list. An image with no alt text, or outside its guide's folder, fails the
build.

Then take it, in `frontend/e2e/guides/<slug>.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { shot } from "./shot";

test("add a delegate by hand", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Users" }),
  ).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/users");
});
```

- **Wait for the page to be ready** before each `shot`, as above. A
  picture of a spinner is still a picture.
- **Pass the name as a plain string.** The test that matches pictures to
  guides reads it out of the file.
- **Change nothing.** Stop before the button that saves. A spec that
  creates somebody leaves the next run a different list to photograph.
- **Signed in or out.** A spec runs as `educator`, the teaching admin that
  `backend/scripts/seed_ci.py` seeds. For a signed-out page, add
  `test.use({ storageState: { cookies: [], origins: [] } })`.

### 4. Look at it

```bash
just guide-screenshots     # or: just gsh
```

This brings up a throwaway stack from `compose.ci.yml`, takes every
guide's pictures into `frontend/public/guide-assets/` and takes the stack
down. Git ignores that folder and the dev server serves it, so the guide
at `/guides/<slug>` then shows its real pictures locally.

## Where the pictures live

They are not in the repository. After a merge to `main` that could change
a screen, `.github/workflows/guide-screenshots.yml` retakes all of them and
mirrors them to a bucket, which the load balancer serves at
`/guide-assets/*`. A picture is at most one merge behind the application.

- **A picture that will not load** is replaced by its alt text in a dashed
  box. A new guide looks like that in production for the few minutes
  between the deploy and the screenshot run.
- **A failed run posts to Slack.** It usually means a screen changed and
  the spec can no longer find something on it, so the guide's words want
  reading too.
- **Every picture is of seeded data.** The bucket is public. Nothing real
  may be added to `seed_ci.py`.

## Linking to a guide from a page

Build the address with `guidePath` from the registry, never by hand:

```tsx
import { guidePath } from "@/guides/registry";

<TextLink to={guidePath("join-a-course")}>How to join a course</TextLink>;
```

It takes only a slug the registry has, so removing a guide fails the
typecheck wherever something still links to it.
