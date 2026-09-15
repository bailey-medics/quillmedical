# Stack tests

A small sandbox used to rehearse the stacked branch workflow. Nothing here
is part of the Quill application, and nothing here is imported by the
backend or the frontend.

## Layout

- `text-files/` — Markdown files, one per name. Each holds a list of names.
- `scripts/` — the Python scripts that add names, the module they share,
  and the tests for both.

## Running a script

Each `add_*_name.py` script adds its own name to the end of every Markdown
file in `text-files/`:

```bash
python3 stack-tests/scripts/add_animal_name.py
```

Running one twice is safe: the second run reports that there is nothing to
do rather than listing the same name again. Pass `--directory` to point a
script at a different folder.

## Running the tests

The scripts use nothing outside the Python standard library, so the tests
run without the dev stack, without Docker and without any install step:

```bash
python3 -m unittest discover -s stack-tests/scripts -p "test_*.py"
```

The tests live beside the scripts rather than in a folder of their own so
that a test can import the script it covers with no path juggling.
