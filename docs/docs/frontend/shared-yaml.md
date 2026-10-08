# How a shared YAML change reaches both sides

The files under `shared/` are the one source for things the backend and the
frontend must agree on: the competency catalogue, the base professions, the
org unit types, the jurisdiction's registration bodies, the brand colours and
the passport specialties. This page follows a change to one of them to both
sides, and lists what somebody adding a field or a whole new file has to
touch.

It was written from `frontend/scripts/generate-json-from-yaml.ts`,
`frontend/src/generated/index.d.ts`, `frontend/src/types/cbac.ts`,
`frontend/package.json`, `frontend/Dockerfile`, `frontend/.gitignore`,
`backend/app/paths.py` and the backend loaders named below.

## What is in `shared/`, and who reads it

- **`competency-definitions/*.yaml`** - the competency catalogue, split by
  kind and merged into one. Backend: `backend/app/cbac/competencies.py`.
  Frontend: `competencies.json`.
- **`base-professions.yaml`** - Backend: `backend/app/cbac/base_professions.py`.
  Frontend: `base-professions.json`.
- **`org-unit-types.yaml`** - Backend: `backend/app/org_units/types.py`.
  Frontend: `org-unit-types.json`.
- **`jurisdiction-config.yaml`** - Backend: `backend/app/registrations.py`.
  Frontend: `jurisdiction-config.json`.
- **`brand.yaml`** - Backend: `backend/app/email/brand.py`, for the email
  themes. Frontend: `brand.json`, read by `theme.ts`.
- **`passport-specialties/*.yaml`** - one file per specialty. Backend:
  `backend/app/features/passport/specialties.py`. Frontend:
  `passport-specialties.json`.

## The two paths

```text
                    ┌──▶ backend reads the YAML itself, when the module is imported
shared/*.yaml ──────┤
                    └──▶ generate-json-from-yaml.ts ──▶ frontend/src/generated/*.json ──▶ imports
```

### Backend: the YAML, read directly

The backend finds `shared/` through `SHARED_DIR` in `backend/app/paths.py`
and loads each file when its module is imported. The loaders validate as
they read. For competencies, base professions and org unit types an entry
with a field the model does not know is refused, and so is a competency id
defined twice. So a bad file stops the backend starting, and its unit tests
fail first.

There is no generation step on this side and nothing to regenerate.

### Frontend: JSON, generated

The frontend cannot read YAML at build time, so
`frontend/scripts/generate-json-from-yaml.ts` writes one JSON file per
source into `frontend/src/generated/`:

- each of the four single files is copied across as JSON
- `competency-definitions/` is merged into one `competencies.json`, in
  sorted filename order, and a duplicate id is an error
- `passport-specialties/` is merged into one `passport-specialties.json`,
  in sorted filename order

Run it with `yarn generate:types`, from `frontend/`.

**The JSON is not in git.** `frontend/.gitignore` ignores
`src/generated/*.json` and keeps `*.d.ts`. A fresh checkout has no JSON
until the script has run, and an import of it fails until then.

## When generation runs

It is called explicitly wherever the JSON is needed:

- `yarn typecheck:all`, `yarn unit-test`, `yarn unit-test:run` and
  `yarn unit-test:coverage` each run it first
- `yarn storybook` and `yarn storybook:build` each run it first
- the `build` stage of `frontend/Dockerfile` runs it before `yarn build`
- the public pages run it through `pages:gen`
- `docs.yml` runs it as its own step

`package.json` also has `predev` and `prebuild` scripts that call it. Do
not rely on them: the Dockerfile's own comment says Yarn 4 skips `pre*`
hooks, which is why the build stage calls the script by name. A new script
or workflow that needs the JSON must call `yarn generate:types` itself.

After changing a file under `shared/`, run `yarn generate:types` again, or
the frontend keeps reading the old JSON.

## How the JSON is typed, and where that goes wrong

There are two routes, and they behave differently.

- **Through the alias, `@/generated/...`.** Most pages import this way.
  The type comes from `frontend/src/generated/index.d.ts`, which declares
  each module by name.
- **By relative path.** `frontend/src/types/cbac.ts` imports
  `../generated/competencies.json` and takes `CompetencyId` and
  `BaseProfessionId` from the JSON's own contents, so those two types are
  exactly the ids in the YAML.

**`index.d.ts` is written by hand.** Its header says the files are
auto-generated, which is true of the JSON and not of the declaration. It is
tracked in git, the script never writes it, and nothing checks it against
the YAML. Two things show the cost:

- its declaration for `jurisdiction-config.json` was wrong for as long as
  nothing imported the file. The comment in `index.d.ts` records that the
  first reader had to cast around it.
- its `BaseProfession` still declares a `notes` field, which
  `shared/base-professions.yaml` no longer has.

So a field added to a YAML file does not appear on the alias route until
somebody adds it to `index.d.ts`, and a field removed stays declared until
somebody takes it out.

`Competency` in `types/cbac.ts` is also declared by hand, on purpose. The
comment there gives the reason: inferring it from the JSON produced a union
of whichever shapes happened to be in the file, so the first entry to carry
an optional field split the type and callbacks stopped matching.

## Rules nothing enforces

- **Both sides merge the competency files in the same order.** The script
  sorts the filenames, and its comment says it mirrors `_load_competencies`
  in the backend. Change the order on one side only and the two catalogues
  list differently.
- **Ids are unique across a whole directory**, not within a file. Both
  sides refuse a duplicate, each in its own code.
- **A few frontend constants are worked out from the catalogue to match the
  backend**, such as `SCOPED_MANAGER_IDS` in `types/cbac.ts`. They agree
  because both derive from the same YAML, not because anything compares
  them.

## Changing a shared file

### Adding or changing a field

1. Edit the YAML.
2. Add the field to the backend model that loads it. The models for
   competencies, base professions and org unit types forbid extra fields,
   so the backend refuses the file until this is done.
3. Add the field to `frontend/src/generated/index.d.ts`, and to the
   interface in `types/cbac.ts` if it is a competency field.
4. Run `yarn generate:types`.
5. Run the tests for what reads it: `just ub -k "..."` and
   `just uf src/path/to/file.test.tsx`.

### Adding a whole new file

All of the above, and:

1. Add it to `FILES_TO_GENERATE` in `generate-json-from-yaml.ts`, or write
   a merge function if it is a directory.
2. Add a `declare module` block for its JSON to `index.d.ts`.
3. Add a backend loader that finds it through `SHARED_DIR`.
4. Check the workflow path filters. `deploy.yml`, `docs.yml` and
   `e2e-image-cache.yml` watch all of `shared/**`. `public-site.yml` names
   `shared/brand.yaml` alone, so a new file the public site depends on has
   to be added there by name.

## Not recorded

Two choices here have no reason written down in the code, the plans or the
commit messages read for this page:

- why the frontend gets JSON with a hand-written declaration, and not
  TypeScript types generated from the YAML
- why the generated JSON is ignored by git and not committed
