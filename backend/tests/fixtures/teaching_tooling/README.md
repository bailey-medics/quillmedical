# Teaching content validation fixtures

Golden module directories used by `test_teaching_tooling_validate.py` and
`test_teaching_tooling_cli.py`.

## Why the image files are empty

Every `.png` and `.jpg` here is **zero bytes on purpose** — they are not
corrupt, and nothing has stripped them.

The validator only ever asks whether an image *exists*, by name and
extension. It never opens one:

- `_validate_uniform_images` compares declared `images[].key` values against
  the filenames present in the question directory
- undeclared-file detection filters on `Path(name).suffix`

So a zero-byte file exercises the logic exactly as a real image would, while
keeping the fixture tree small. `.valid-module/cover.png` is the one
exception, holding the text `fake-cover-image`, and even that is only checked
with `is_file()`.

## Why the directories start with a dot

`validate_modules_dir` skips dot-prefixed directories when scanning, so these
fixtures never get picked up by a real validation run. Tests reach them by
path, or copy them to a name without the leading dot first.

## Known gap this makes visible

The validator never opens an image, so anything with the right name and
extension passes — including a Git LFS pointer, which is a ~132-byte text
file. Both content repos declare `*.png filter=lfs` in `.gitattributes`
while `actions/checkout` does not fetch LFS, so that is a live route for a
non-image to reach GCS wearing an image's name. Recorded as a follow-up in
`docs/docs/plans/2026-08-30-consolidate-teaching-tooling-plan.md`; do not
"fix" these fixtures by giving them real bytes, as their emptiness is what
the corresponding test would assert on.
