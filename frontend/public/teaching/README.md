# Teaching sample assets

Static assets Storybook serves for the teaching stories, via
`staticDirs: ["../public"]` in `.storybook/main.ts`.

## `sample/`

Holds a short clip the hosted-video stories play, so the real player
renders and its controls can be styled. Without it those stories can
only show the refusal path, because a real grant is a network call and
Storybook has no backend to answer one.

Expected at `sample/ltd-transition.mp4`, matching the `videoSrc` in
`slide-layouts/stubSlides.ts`.

Keep it small — a few hundred kilobytes, a few seconds long. It lives in
git, so the repository carries its size forever. It is a placeholder for
styling, not teaching content: nothing clinical, nothing identifiable.
