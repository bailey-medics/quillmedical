# Readable pull request descriptions plan

The descriptions `/crpd` writes cover the right things, decisions, risks and
what changed, and they are still slow to read. Mark reviews every line of
this codebase himself, so the description is the first thing read on every
pull request, often on a phone the morning after an unattended run, and its
job is to let him decide fast: merge after a skim, read every line, or push
back. The last 30 descriptions do not let him do that. They are all about
the same length whatever the size of the change, their sentences are
compressed in ways that need decoding ("the old address hears of it"), and
nothing in them says where to look or what to check. Most of this traces to
one instruction in step 9 of the skill, "the fewest words that stay true",
with a 250-word aim beside it, and to a September rule that banned the bold
lead Mark relies on everywhere else.

The outcome is a description that opens with a three-line triage block
(size, where to look, what to check), is written in plain sentences whose
subjects are people or named things in the code, and whose bullets carry a
bold lead so the bold column alone tells the story. The three sections stay,
renamed where the name helps the reader. The same shape then goes into the
sibling skills, so there is one specification for a pull request body rather
than three, and the deferred GitHub rendering ideas wait until the new shape
has been read for a week.

## Phase 1: rewrite step 9 of `/crpd`

All of this phase is in `.claude/skills/crpd/SKILL.md`, step 9 ("Write the
title and the body", from "Open with one orienting line" to "Closing"),
plus the Report section. The skill is Claude-only, with no copy under
`.github/prompts/`, so it is edited in place.

- [x] Replace the shape at the top of step 9 with the one below, and carry
      the worked example into the skill in place of the current skeleton.
      The example is pull request #2263 rewritten; the original is 291 words
      and this is about the same, so the gain is reading speed, not length.

      ```markdown
      **Size:** large. 20 files, a migration, two new emails.
      **Look hardest at:** where the change link is checked in `backend/app/security.py`.
      **Check for me:** that signing somebody out after they confirm is acceptable.

      Changing your email address now needs confirming. Quill sends a link to
      the new address and does nothing until it is clicked. It also tells the
      old address that a change was asked for.

      ## Decisions to check

      - **The current password is optional for now.** You chose expand then
        contract before the run. Until then somebody with a stolen cookie but
        no password can start a change, but cannot finish it.
      - **The confirm link reuses the `/verify-email` page instead of a new
        one.** A new page would have duplicated the token-in-URL handling. Its
        own signing salt means a verification link cannot be used as a change
        link.
      - **A password change cancels a pending link.** The link carries
        `token_version`, which a password change bumps. So the account page
        saves the password first and the email second. My reading; the plan
        is silent.

      ## Risks

      - **A mistyped new address keeps the old one.** No link arrives,
        nothing changes. That is the safe failure.
      - **Confirming signs the person out.** They must sign in again.

      ## What has changed

      - **`users.pending_email` holds the new address** until it is
        confirmed (migration `772b1a92d9dd`).
      - **Two new emails**, `email_change_confirm` and `email_change_notice`,
        each with a Storybook render.
      - **The account page asks for the current password** before an email
        change, and says to check the new inbox.

      <!-- crp:pr-summary -->
      ```

- [x] Add the triage block as the first thing in the body, three lines, each
      a bold label and one plain sentence. Pirouzkhah, Wurzel Gonçalves and
      Bacchelli (arXiv 2602.14611, 80,000 pull requests) found that saying
      what feedback the author wants is the single strongest predictor of a
      merge, 64 to 72% more likely, ahead of explaining the code at 12 to
      20%; the current descriptions never ask for anything. The three lines:

      - **Size** - one of `tiny`, `small`, `medium`, `large`, then what makes
        it so in a few words: the file count, a migration, a new email, a
        security boundary, clinical data. Anything touching a migration, a
        security boundary or clinical data is `large` whatever its line
        count. A `tiny` change may add "merge if it reads well" and nothing
        else needs to be said about how to review it.
      - **Look hardest at** - one place, named well enough to open: a file
        path and a function or component name, and what to look for there.
        It is where the model's own uncertainty is, or where a mistake would
        hurt most. One place, not a list; a list belongs in Phase 4's reading
        order.
      - **Check for me** - the one thing the reader must agree with before
        merging, written as a request. For a `tiny` change it may be "nothing
        in particular".

      There is no review-time line. Mark dropped it on 31 October 2026; the
      Size line already carries what the reader needs to triage.

- [x] Name the reader, in one sentence at the head of step 9, in place of
      "a reader who knows the product, but has not read this diff": the
      person who ran the overnight stack, reading the next morning, probably
      on a phone, deciding in twenty seconds whether to merge after a skim,
      read every line, or push back. Every rule below is a consequence of
      that sentence, and when a rule and the sentence disagree the sentence
      wins.

- [x] Replace "the fewest words that stay true" and the 250-word aim with
      sentence-shape rules, and remove the word count everywhere in step 9,
      including the "Closing" paragraph that says what to cut to meet it.
      Clark, Martin and Mahowald (arXiv 2610.29162) compared nine frontier
      models with human text and found the models over-produce four things:
      inanimate subjects doing human verbs, dropped "that" and "which",
      stacked nouns, and rare word pairings. Their proposed mechanism is
      pressure toward the shorter of two phrasings with the same meaning,
      which is what "fewest words" asks for. All four are in the last 30
      bodies: "the old address hears of it", "a new email waits for its
      owner", "a second change stops an older link", "people the admin can
      already see who are not yet at the `org_unit`", "the guide screenshot
      seed". The current skill treats the symptoms (no aphorisms, no gentler
      synonyms, gloss every name) and keeps the cause. The rules that
      replace it:

      - **The subject of a sentence is a person or a named thing in the
        code.** "Quill sends a link", "`decode_token` refuses the token",
        "the user clicks". Never an abstraction doing a human verb: not "the
        address hears", "the link stops", "the page asks".
      - **Keep the small words**: that, which, because, so, but, instead of.
        They are the reader's map of how one fact leads to the next, and
        cutting them saves two words and costs a re-read.
      - **One fact a sentence, around fifteen words.** Two short sentences
        beat one with a comma in the middle.
      - **Concrete before abstract.** "Somebody with a stolen cookie but no
        password", not "a session alone". An example the reader can picture
        comes before the general statement, if the general statement is
        needed at all.
      - **Spell out an abbreviation the first time**, unless it is an
        identifier the code uses. Mark is dyslexic and `/s` already carries
        this rule for the same reason.
      - **A little repetition is fine.** A sentence that only parses on the
        second read is not. Length follows the change: a one-file wording
        fix is three or four lines, and a twenty-file security change is as
        long as it needs to be.

      The measurements behind dropping the count, from the last 30 merged
      pull requests on 31 October 2026: 4 to 2468 lines changed produced 102
      to 388 words of description, with a correlation of 0.4 between the two.
      A 4-line wording fix (#2247) got 102 words, a 40-line one (#2248) got
      274, and the 2468-line one (#2246) got 352. The target had flattened
      every description to the same size, so the reader could not tell a
      two-minute merge from a thirty-minute read.

- [x] Bring back the bold lead, done the way the `## TL;DR` rule in
      `CLAUDE.md` and `/tldr` already do it, and remove "Never open a bullet
      with a bold phrase" from the "One idea per bullet, and no bold"
      subsection. Each bullet opens with the claim in bold, five to eight
      words, then one or two plain sentences giving the reason or the
      consequence. The bold and the sentence never say the same thing. The
      September 2026 rule (commit 09065542) was answering two real failures,
      a bold headline that the sentence then repeated, and the conclusion in
      bold with its premise in the plain text; the second clause above keeps
      what that rule got right. What it got wrong was treating bold as
      emphasis. Here it is a second, shorter text laid over the first: a
      reader skims the bold column and dips into the plain text only where
      they want to, which is how Mark reads everything else in this
      repository. The British Dyslexia Association's style guide says the
      same in general terms, bold for emphasis rather than italics, short
      sentences, bullets, white space and no dense blocks. The measurements
      above found the current bullets are dense blocks: median 26 words, one
      in six over 40, the longest 85.

- [x] Give every decision one shape under `## Decisions to check`: what was
      chosen, what it was chosen instead of, and why, then a confidence word
      where the choice is not certain. "The confirm link reuses the
      `/verify-email` page instead of a new one. A new page would have
      duplicated the token-in-URL handling." The current bullets weave the
      choice, the mitigation and the consequence together and often leave
      out the alternative or the reason, so the reader can only accept them,
      not disagree with them. The confidence words are fixed, so they can be
      scanned for: `sure`, `my reading`, `a guess`. Only the last two are
      written; a bullet with no word is `sure`. Pull request #2270 did this
      by accident ("The docs deploy is the least certain") and it was the
      most useful line in the set.

- [x] Rename `## LLM decisions` to `## Decisions to check`. The old name says
      who made them; the new one says what the reader does with them. The
      rule that the section is omitted when there genuinely were none stays,
      as does "Departed from the plan:" as the opening of a bullet that did.

- [x] Ban references to context the reader does not have. "Fix 3a", "as
      asked", "as a human chose before the run" and "the plan" each point at
      something that was in the conversation and is not in the reader's head
      the next morning. Say the thing: "you chose this before the run", "the
      plan's Phase 3 step 2", or leave it out.

- [x] Keep `## Risks` and `## What has changed` as they are, with the bold
      lead applied. Risks is always present, "None found." rather than
      "None", for the reason the skill already gives. What has changed stays
      a plain section in every description, never collapsed and never
      dropped for a small change: Mark asked for it on 31 October 2026. Its
      rule stays too: what is different in terms of what a user sees, not a
      file list, and counting is not describing.

- [x] Trim the subsections the cause rule now covers, so the step gets
      shorter rather than longer. "Say it straight" reduces to one worked
      aphorism rewrite under the sentence-shape rules. "Name things by their
      real names", "Introduce a name the first time you use it" and the bare
      noun phrase rule merge into one "Names" subsection with one example
      each; they are still needed, because plain sentences can still use a
      private synonym. "Punctuation and spelling" stays as it is. The
      "Closing" paragraph keeps the marker and the attribution ban and loses
      the word budget.

- [x] Update the Report section so the terminal report repeats the three
      triage lines, under the pull request URL, in place of "one line on
      what the description now says". The terminal is read before the pull
      requests after an unattended run, and the triage lines are what the
      reader would want from it. The decisions and risks are already
      repeated there and stay.

## Phase 2: one specification across the sibling skills

- [x] In `.claude/skills/f/SKILL.md`, under "Sizing a unit", replace "a
      pull request whose description cannot be written inside `/crpd`'s three
      sections and 200-word ceiling" with the sizing the new shape implies: a
      unit whose Decisions to check or What has changed section cannot be
      said in a handful of bullets, or whose Look hardest at line wants to be
      a list. The 200 there, the 250 in `/crpd` and the 200 in `/nst-crp`
      were three numbers for one idea, and the idea is now stated without a
      number. Under "Fix the code, not the test", rename `## LLM decisions`
      to `## Decisions to check`.

- [x] In `.claude/skills/update-docs-docs/SKILL.md`, rename the one mention
      of `## LLM decisions`. Its Copilot source,
      `.github/prompts/update-docs-docs.prompt.md`, does not carry the
      section name, so the mention is Claude-only text and is edited in
      place.

- [x] Make `/nst-crp`'s "Final: update the pull request description" use the
      same body as `/crpd` step 9, by reference, rather than its own flat
      list of up to twelve verb-first bullets under a 200-word ceiling. Keep
      only what genuinely differs for a branch cut from `main`: step 2 reads
      the whole branch from the merge base, and the pull request is marked
      ready at the end. One specification means the two cannot drift again,
      and a reviewer sees one shape whether the branch was stacked or not.
      This skill is synced from `.github/prompts/commit-rebase-push.prompt.md`
      by `/sync-copilot-config`, so the edit is made there first and the sync
      run afterwards, never in `.claude/skills/nst-crp/SKILL.md` directly.
      The Copilot prompt cannot point at a Claude skill file, so it carries
      the shape in a short form of its own: the triage block, the three
      section names, the bold lead and the marker.

- [x] Departed from the plan: `.claude/skills/nst-crpf/SKILL.md` was not
      left alone. Its "review packet" is a chat message, as the plan said,
      but its "Final: update the pull request description" section carried
      the same twelve-bullet, 200-word body specification as `/nst-crp`,
      word for word. It gets the same replacement, in place, because the
      text has no Copilot source: `follow-the-plan-document.prompt.md` does
      not contain it.

## Phase 3: read a week of descriptions against the shape

- [ ] After the first stacked run under the new step 9, read each
      description against four questions and note what fails: does the Size
      line match the diff; does Look hardest at name a place that can be
      opened; could the bold column alone be read as the summary; is there a
      sentence whose subject is an abstraction. Fix the rule, not the
      description, when the same failure appears twice. The point of the
      week is to find which of the new rules the model follows without being
      policed and which need a worked example beside them.

- [ ] Re-measure, the same way as the 31 October 2026 baseline: description
      words against lines changed over the next 30 merged pull requests, and
      words per bullet. The description length should now track the change,
      and the median bullet should be well under 26 words with the bold lead
      included.

## Phase 4: let GitHub render what words describe

Deferred until Phase 3 has run, because each of these adds mechanism to a
skill that is already long, and the shape should settle first.

- [ ] Make Look hardest at a permalink where it can be: a
      `https://github.com/bailey-medics/quillmedical/blob/<sha>/<path>#L10-L20`
      URL on its own line renders in a pull request body as the code itself,
      so the reader sees the lines without opening the diff. The sha is the
      branch's commit after `stack-submit`, which step 6 already has. A
      rebase changes the sha and leaves the snippet pointing at the old
      commit, which still renders; note that in the skill rather than trying
      to keep it current.

- [ ] Embed the committed images for guide and Storybook pull requests.
      #2257 described four screenshots in 60 words, and the files were in the
      diff. A raw URL at the commit sha renders inline. One image per
      picture the description would otherwise describe, under What has
      changed.

- [ ] Add a "Read in this order" list for `large` changes only: three to
      five files, one line each on what to check there, after the triage
      block. The Pirouzkhah survey found developers rate reading order low
      when asked, but that was open source, where a reviewer can skip; a
      reviewer who reads every line wants the order.

## Decisions

- **No review-time line** - Mark's call, 31 October 2026. The Size line
  already says how big the change is, and that is what the reader triages
  on.

- **What has changed stays, not collapsed, in every description** - Mark's
  call, 31 October 2026. The earlier proposal put it in `<details>` or
  dropped it for a tiny change. It stays a plain section with one bullet
  when one is all there is.

- **Drop the word target rather than raise it** - every previous revision
  of step 9 moved the number (200, then 250, then "a target") and each time
  the count was bought by compressing sentences. The shape now controls
  length: three sections of bullets scale with the change on their own.

- **One shape that scales, not tiers** - an earlier draft had three formats
  by size. The triage block's Size line and one-bullet sections do the same
  job with one specification to maintain.

- **Bold lead returns, with the September clause kept** - the bold and the
  plain text never say the same thing. That was the half of the September
  rule that was right. Removing bold altogether removed the scan path that
  the `## TL;DR` rule exists to provide.

- **Confidence is three fixed words** - `sure`, `my reading`, `a guess`,
  with `sure` unwritten. Free-text hedging ("may", "should", "I believe")
  cannot be scanned for and tends to spread to every sentence.

- **`/nst-crp` adopts the `/crpd` shape by reference** - two specifications
  for one artefact drifted within a month of being written. The cost is
  that the Copilot prompt carries a short form of the shape, since it cannot
  read the Claude skill.

- **GitHub rendering waits** - permalink snippets, inline images and a
  reading order are each a clear gain and each adds mechanism. The shape is
  changed first and read for a week, so that what the rendering is added to
  is already known to work.

- **The research is advisory** - both pull request studies are
  correlational and on open-source data, one from a 2019 snapshot; the
  agent study (arXiv 2602.17084) found short, structured descriptions had
  the fastest reviews and long text-heavy ones the slowest, but cannot
  separate that from code quality; and Clark, Martin and Mahowald count
  features that earlier work links to reading load rather than timing
  readers. The measurements of this repository's own 30 descriptions carry
  more weight here than any of them, and they point the same way.
