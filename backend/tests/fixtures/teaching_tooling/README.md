# Teaching content validation fixtures

Golden module directories used by `test_teaching_tooling_validate.py` and
`test_teaching_tooling_cli.py`.

## Why most image files are empty

Every `.png` and `.jpg` here except `.valid-module/cover.png` is **zero bytes
on purpose** — they are not corrupt, and nothing has stripped them.

They are reached through the sync-side entry points, which never open an
image. They ask only whether one *exists*, by name and extension:

- `_validate_uniform_images` compares declared `images[].key` values against
  the filenames present in the question directory
- undeclared-file detection filters on `Path(name).suffix`

So a zero-byte file exercises that logic exactly as a real image would, while
keeping the fixture tree small.

`.valid-module/cover.png` is the exception: it carries a real 8-byte PNG
signature followed by the text `fake-cover-image`. It is the only fixture
validated through `validate_modules_dir`, the merge gate, which does open
images and check they start with the right bytes — so an empty file there
would be genuinely invalid rather than conveniently small. Keep the
signature; the rest of the bytes are meaningless and can stay that way.

## Why the directories start with a dot

`validate_modules_dir` skips dot-prefixed directories when scanning, so these
fixtures never get picked up by a real validation run. Tests reach them by
path, or copy them to a name without the leading dot first.

## The gap these used to make visible, now closed at one gate

The validator never opened an image, so anything with the right name and
extension passed — including a Git LFS pointer, a ~132-byte text file. Both
content repos declare `*.png filter=lfs` in `.gitattributes` while
`actions/checkout` did not fetch LFS, so that was a live route for a
non-image to reach GCS wearing an image's name.

The merge gate now checks image signatures, and the content checkouts fetch
LFS. Sync still cannot check: `download_bank_from_gcs` fetches only YAML and
`download_module_from_gcs` writes zero-byte placeholders, so the bytes are
not there to inspect — which is exactly why the fixtures below stay empty.

Do not give the remaining fixtures real bytes. Tests for the signature check
build their own files, in `test_teaching_tooling_image_bytes.py`, so nothing
here needs to change to cover it.
