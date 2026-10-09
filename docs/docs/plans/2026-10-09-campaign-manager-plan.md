# Campaign manager plan

A newsletter today is a template file in the repository. Sending one
means writing the file, landing it by pull request, waiting for the
deploy and then running `just newsletter-send`. That suits one developer
sending the occasional newsletter and nobody else: a change of wording is
a pull request, and somebody without the repository cannot write one at
all. Nothing in the earlier email plans weighed this up; files were the
default reached for when the sender was built.

This plan moves a campaign into the core database, with an admin page to
write, preview and send it. It is a campaign manager and not a CRM:
nothing here tracks leads, conversations or organisations. **It is on
hold.** It was written on 9 October 2026 as a record of the shape agreed
in discussion, while work outside the teaching delivery plan is paused,
and every decision marked open below is to be settled before Phase 1
starts.

## Phase 1: Settle the open decisions

- [ ] Choose the body format. The recommendation is Markdown held in a
      plain text column and rendered through the macros in
      `backend/app/email/templates/_components.html.j2`, so every
      newsletter carries the brand's layout and nobody writes HTML. A
      body is a document read back whole, so a text column does not
      break the rule on non-relational storage. Raw Jinja is ruled out:
      rendering a template somebody typed into a web page is a
      template-injection hole. A block editor would mean a `JSON`
      column, which needs an explicit decision from a person under
      `.claude/rules/backend.md`.

- [ ] Choose who may send. The recommendation is a new competency,
      `manage_newsletters`, in `shared/competency-definitions/admin.yaml`
      and on no `may_grant` list, so only a holder of `manage_users` can
      hand it out. The alternative is `DEP_REQUIRE_OPERATOR`, which is
      simpler and shuts out everybody but a superadmin for good.

- [ ] Decide whether the right to send is tied to a brand. Campaigns go
      out as `quill` or `ldd`, for Let's Do Digital. If Let's Do Digital
      will write their own, somebody who may send as one brand must not
      be able to send as the other. The recommendation is to leave this
      out until they need it, and to say so in Decisions.

- [ ] Decide whether a newsletter may carry images. Text and links need
      nothing new. Images need uploading, hosting at a public address
      and a size limit, which is a piece of work of its own. The
      recommendation is text and links only to begin with.

- [ ] Decide whether a send can be scheduled. "Send at nine on Tuesday"
      needs something to wake up and run it. The recommendation is
      send-now only.

- [ ] Decide what happens to the text once a send has started. A send
      can go out in batches, so a typo can be spotted after fifty people
      have it. The recommendation is to lock the subject, preheader and
      body when the first email leaves, so that one campaign is one
      text, and to correct a mistake with a new campaign.

## Phase 2: Store a campaign

- [ ] Add a `campaign` table in `backend/app/models.py`: a name unique
      across the table and matching `CAMPAIGN_NAME` in
      `backend/app/marketing/newsletter.py`, the brand, the subject, the
      preheader, the body, a status, who wrote it, and when it was
      created, last changed and first sent. Also who it is from: the
      sign-off name, the sign-off role and the sender's name, all
      optional, which a file campaign sets with `signoff_name`,
      `signoff_role` and `from_name` (see `newsletter.html.j2`). Empty,
      a newsletter is from the brand's team. Validate the brand and the
      status in code against a tuple, as `validate_platform_role` does,
      so neither needs a migration to grow.

- [ ] Give the status three values: `draft`, `sending` and `sent`. A
      draft may be edited and deleted. A campaign that is `sending` or
      `sent` may be neither, because it is the record of what people
      received.

- [ ] Point `newsletter_send` at the campaign by id. Its `campaign`
      column holds a name today, and its two unique constraints are on
      that name. This is an expand-contract change across deploys: add a
      nullable `campaign_id` with a foreign key, backfill it from the
      name, switch the reads and the unique constraints, then drop the
      name column in a migration of its own. See "Renaming or retiring a
      column" in `.claude/rules/backend.md`.

- [ ] Create rows for campaigns already sent from files, before the
      backfill above, so no `newsletter_send` row is left pointing at
      nothing. Check App production for which names have rows.

## Phase 3: Send from a row

- [ ] Change `send_campaign` in `backend/app/marketing/newsletter.py` to
      load its subject, preheader and body from the `campaign` row and
      render the body through `newsletter.html.j2`. Who it reaches, the
      per-person unsubscribe link, the batching, the send-once log and
      the bounce and complaint handling are untouched.

- [ ] Keep the send inside the admin job. The page asks for a send and
      the `send-newsletter` action of `backend/scripts/admin_cli.py`
      carries it out, so the Amazon SES key stays out of the web
      backend. Work out how the backend starts the job: it needs
      permission to run that one job and nothing else.

- [ ] Keep the dry run and its confirmation. The page shows how many
      people a send would reach and passes that number back with the
      request, as `trial:12` does on the command line, so a count that
      is out of date cannot send.

- [ ] Remove the file campaigns: the templates under
      `backend/app/email/templates/campaigns/`, `CAMPAIGNS_DIR`, and the
      brand-from-folder rule. `backend/tests/test_marketing_newsletter.py`
      uses `trial` and `ldd-trial` throughout, so its campaigns become
      rows made by a fixture. Until this step the two templates stay:
      they are what those tests send, and `trial` is how sending is
      checked on App production.

- [ ] Delete `backend/app/email/templates/previews/newsletter_sample.html.j2`
      and `newsletter_personal_sample.html.j2` beside it, and give the
      two Storybook previews sample bodies in their place. The file
      is the "Newsletter" entry in `backend/app/email/previews.py`: a
      Jinja template extending `newsletter.html.j2`, which is the shape
      of a file campaign. Once a newsletter is a body rendered from a
      row, the sample should go through that same path, as sample text
      held in `previews.py`, so Storybook shows what the page will
      really send. Run `just email-preview` afterwards and commit the
      renders, or `backend/tests/test_email_previews.py` fails. Keep
      the preview itself: it is the only full-size newsletter in
      Storybook, with an image and several sections in each theme.

## Phase 4: The admin page

- [ ] Add routes under `/api/marketing/campaigns` in
      `backend/app/marketing/admin_router.py`: list, create, read,
      update a draft, delete a draft, preview, send a test and send.
      Every one carries the gate chosen in Phase 1, and every mutating
      one carries `DEP_REQUIRE_CSRF`. Response models go in
      `backend/app/schemas/`.

- [ ] Make preview return the rendered HTML and the plain text for a
      draft, in its brand's theme, without sending anything.

- [ ] Make the test send go to the signed-in user's own address and
      write no `newsletter_send` row, as a trial to one address does
      today.

- [ ] Add the pages under `frontend/src/pages/admin/`: a list of
      campaigns with their status, and an editor with the preview beside
      it. Check the Storybook catalogue first and build from existing
      components; anything new gets a plan, a story and a test before it
      is written.

- [ ] Put the send behind a confirmation that names the campaign, the
      brand and the number of people, using `ButtonPairRed`.

- [ ] Show progress for a campaign that is `sending`: how many of how
      many, read from `newsletter_send`.

## Phase 5: Documents and clean-up

- [ ] Rewrite "Sending a newsletter" in
      `docs/docs/backend/marketing-email.md` for the page.

- [ ] Decide whether `just newsletter-send` stays as a second way in. It
      is useful when the page is broken, and it is a second path to keep
      working.

- [ ] Name the accessibility journeys the new admin pages touch and add
      them to the "Not yet run" list in
      `docs/docs/frontend/accessibility/testing-log.md`.

## Decisions

- **A campaign manager, not a CRM** - Mark asked for the first on
  9 October 2026. A CRM tracks contacts, conversations and leads, is a
  product in its own right and has no place beside clinical data. If
  that is ever wanted it is bought and kept separate.

- **Built in Quill, not bought** - the move to Amazon SES made Quill's
  database the only list, so that consent has one home. An email
  marketing service would keep a second copy of the list at a provider,
  which is what that move took away.

- **The merge stops being the gate** - today nothing can be sent that
  was not reviewed in a pull request and deployed. After this, what
  stands between a draft and the whole list is the test send and the
  confirmation showing the count. That is accepted for one sender. A
  second person approving before a send is the thing to add if more
  people come to write newsletters.

- **File campaigns stay until Phase 3** - removing the two trial
  templates sooner was considered and left. They are what the newsletter
  tests send and how a send is checked on App production, so taking them
  out early means either moving them into test fixtures or removing a
  working sender, for no gain while this plan is on hold.
