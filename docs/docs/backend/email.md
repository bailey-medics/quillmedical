# How an email is made and sent

Every email Quill sends takes one path: a template is rendered against a
brand's theme, and the result is handed to one function that sends it
through Amazon SES. This page follows that path and lists what somebody
adding a new email has to touch.

Who is sent news, and how they opt out, is a separate subject:
see [Marketing email](marketing-email.md).

It was written from `backend/app/email/` (`render.py`, `brand.py`,
`theme.py`, `previews.py` and `templates/`), `backend/app/email_send.py`,
`backend/app/features/teaching/email_templates.py`, the callers in
`backend/app/main.py`, `.pre-commit-config.yaml` and the `Justfile`. The
reasons given are the ones in those files' docstrings.

## The path

```text
shared/brand.yaml ──▶ email theme ("quill" or "ldd")
                            │
template (.html.j2) ──▶ render_email(template, theme, context)
                            │
                      RenderedEmail: subject, HTML, plain text,
                      sender name, reply-to
                            │
                      send_email(to=..., **send_args(rendered))
                            │
                      Amazon SES, London
```

A caller looks like this, from `main.py`:

```python
rendered = render_email(
    "email_verification.html.j2",
    "quill",
    {"name": ..., "verify_url": ..., "ttl_minutes": ..., "welcome": True},
)
send_email(to=user.email, **send_args(rendered))
```

## Brands and themes

`shared/brand.yaml` holds two different things, and `brand.py` keeps them
apart:

- **The app's own colours.** One set, because there is one app.
- **The email themes**, one for each brand an email can go out as:
  `quill`, and `ldd` for Let's Do Digital. A theme is that brand's
  colours, fonts, logo and names. A template sees it as `t`.

So a new brand is a new email theme, and adds nothing to the app.

The file is read and checked once, when the backend starts. A misspelt
field or a missing colour fails then, not in somebody's inbox.

`theme.py` holds only the list of theme names, written out as a `Literal`
so that mypy can read it. **It is generated: do not edit it.** Change
`email_themes` in `brand.yaml` and run `just email-themes`, which writes
it and the frontend's copy. The pre-commit hook does the same for a commit
that changes the brand file.

## Templates

Every email extends `templates/base.html.j2`, the one layout they share,
and fills its blocks: `subject`, `preheader`, `body` and `reason`. The
building blocks of a body, such as a heading, a paragraph and a button,
are macros in `_components.html.j2`.

Each template opens with a comment listing the values it needs.

Two settings in `render.py` are there for safety:

- **Autoescaping is on.** A value is escaped unless it is marked safe, so
  a name containing a bracket cannot become markup. Before this, each
  email escaped its own values, and a new one could forget.
- **A missing value is an error.** A template naming a value the caller
  did not pass fails at render, where it would otherwise send an email
  with a gap in it.

### Sending for a partner

Passing an `EmailPartner` to `render_email` shows the partner's strip,
names them in the footer and the sender line ("EoEETA via Quill Medical"),
and sends replies to the partner's coordinator.

### The other `render_email`

There are two functions with that name. The one above is in
`app/email/render.py`. Teaching has its own in
`features/teaching/email_templates.py`, for certificate emails: an
educator writes the wording in a bank's `config.yaml`, with `$variable`
placeholders and a Markdown body. That function fills it in, cleans the
HTML, and then calls the branded renderer to wrap it. Import the one you
mean by its module.

## What `send_email` does before sending

`send_email` in `email_send.py` is the only way out. In order:

1. **Checks the allow-list.** `EMAIL_ALLOWED_RECIPIENTS` is empty in
   production, which allows everybody. Set in a development `.env`, it
   refuses any other address with an `EmailNotAllowedError`. It refuses
   loudly on purpose: a silent skip looks exactly like a send that worked.
2. **Checks the sender name and any extra headers** are safe to put in a
   header.
3. **Checks the rate limit**: ten emails to one recipient in an hour. It
   counts what was sent, never what was tried, so a mail outage does not
   use up somebody's allowance.
4. **Logs instead of sending when `EMAIL_DRY_RUN` is true**, which is the
   default. The dev stack sets it to false.

Logs never carry a whole address. `mask_email` turns `mark@example.org`
into `m***@e***.org`. The subject and attachment names are left out too,
because a certificate's subject carries the person's name.

Mail goes through SES in London so that email data stays in the United
Kingdom. The [Amazon SES plan](../plans/2026-10-06-amazon-ses-email-plan.md)
records that choice.

## Previews in Storybook

Storybook's Foundations/Emails stories show what the backend really sends,
not a copy of the design. CI builds Storybook without Python, so it cannot
render the templates itself. The renders are therefore **committed**, under
`frontend/src/stories/emails/rendered/`, and
`backend/app/email/previews_test.py` fails when a template has changed and
they have not been rendered again.

`previews.py` lists each preview with its sample values. `just
email-preview` renders them all, once for each theme. The pre-commit hook
also does it for a commit that touches `backend/app/email/`, the teaching
email module or `brand.yaml`.

## Adding an email

1. Write the template in `backend/app/email/templates/`, extending
   `base.html.j2`. List the values it needs in the opening comment.
2. Add a `Preview` for it to `previews()` in `previews.py`, with sample
   values.
3. Run `just email-preview` and look at it in Storybook, in both themes.
4. Call `render_email` and `send_email` from the route, as above. Pick the
   theme there.
5. Commit the renders with the template. If they are stale,
   `previews_test.py` fails in CI.

Adding a brand is step 0: add it to `email_themes` in `shared/brand.yaml`
and run `just email-themes`.

## Not recorded

How a route should choose between the `quill` and `ldd` themes is not
written down. Each caller names one.
