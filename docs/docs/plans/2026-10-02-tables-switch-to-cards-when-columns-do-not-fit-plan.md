# Tables switch to cards when columns do not fit plan

`DataTable` draws rows as a table on a wide screen and as cards on a
narrow one, switching at one fixed point, `theme.breakpoints.sm` (640px),
whatever the column count. A three-column table fits comfortably down to
there. A seven-column one needs more room than 640px long before the
screen gets that small, and because nothing wraps the table in a scroll
container it spills off the right of the page. Seen on the admin tables
when a window is dragged narrower.

The outcome is a table that asks the right question: not "is the screen
small?" but "do my columns fit the space I have?" It measures its own
container, compares that to the room its columns need, and switches to
cards when they do not fit. A wide table becomes cards at a laptop width
where it has to; a narrow one stays a table down to a phone held sideways,
where it still fits. Each table finds its own switching point without
anyone setting it by hand.

## Phase 1: Switch on fit, in `DataTable`

- [ ] **Measure the container.** `DataTableView` wraps its output in a
      `div` carrying the `ref` from Mantine's `useElementSize`, which
      reports the width and updates it whenever the window is dragged or
      the sidebar opens or closes. Every rendering (loading, error, empty,
      cards, table) sits inside the same wrapper so the measurement never
      disappears between states.
- [ ] **Work out what the columns need.** A new `minColumnWidth` prop in
      rem, default 10, times the column count. A table that knows better
      passes `cardsBelow`, a width in rem under which it goes to cards,
      and that replaces the calculation. Rem is converted to pixels with
      the document's root font size, so a user who has enlarged their
      text gets cards sooner, which is right: their columns need more
      room.
- [ ] **Switch with a margin.** Cards when the container is narrower than
      the need; back to a table only once it is wider than the need plus
      2rem. Without the margin a switch to cards can change the page's
      height, bring a scrollbar in, narrow the container by its width and
      flip the layout straight back.
- [ ] **Keep the viewport rule as a floor.** Below `sm` the table is
      always cards, as now, so a phone in portrait never sees a table even
      with two columns. A container that has not been measured yet (width
      0, which is also what jsdom reports) falls back to the viewport rule
      alone, so the first paint and every existing test behave as before.
- [ ] **Stories** in `DataTable.stories.tsx`: seven columns in a 40rem
      container (cards), three columns in the same container (table), and
      seven columns at full width (table), each with a `StoryNote` saying
      what to expect. Shrinking the Storybook canvas shows the switch.
- [ ] **Tests** mock `useElementSize` to report a width: seven columns at
      500px draw cards, three columns at 500px draw a table, `cardsBelow`
      overrides the calculation, and width 0 leaves the viewport rule in
      charge. The existing tests stay as they are, because width 0 is what
      they already run under.

## Phase 2: Secondary columns, if wanted

- [ ] **A `hideBelow` width per column**, so a wide table can drop its
      least important columns before giving up on being a table at all.
      Composes with Phase 1: the need is worked out from the columns still
      shown. Only worth doing on the few admin tables with six or more
      columns, and only after Phase 1 has been seen working.

## Decisions

- **Fit, not breakpoint** – the problem is columns against width, not
  screen size, so the rule measures width. Moving the fixed breakpoint up
  to `md` would have fixed wide tables and punished narrow ones, turning a
  three-column table into cards on a tablet where it fitted.

- **No horizontal scroll** – a scroll container would stop the overflow
  too, but a sideways-scrolling table hides columns and is poor for touch
  and for screen readers. Cards show every column. If a table is ever
  found that cannot become cards, a `Table.ScrollContainer` is the
  fallback to add then.

- **Default 10rem per column** – wide enough for a date, a name or a
  badge without squashing. A table with long text passes a larger
  `minColumnWidth` or a `cardsBelow` of its own; the default is a
  starting point, not a law.
