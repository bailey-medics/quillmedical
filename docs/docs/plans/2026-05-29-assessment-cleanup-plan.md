# Assessment image naming clean-up plan

## Problem

Uniform-type assessments currently use positional image filenames (`image_1.png`, `image_2.png`) with a separate `image_labels` array in `assessment.yaml` that maps by index. When adding hundreds of questions, it is easy to accidentally swap images (e.g. saving the NBI image as `image_1.png` when it should be `image_2.png`). The error is silent and only detectable visually.

## Proposed design

### Uniform assessments

Replace `images_per_item` + `image_labels` with an `image_slots` list that defines both the required filename and the display label:

```yaml
# Before (fragile)
images_per_item: 2
image_labels:
  - "White light (WLI)"
  - "Narrow band imaging (NBI)"

# After (self-documenting)
image_slots:
  - filename: wli.png
    label: "White light (WLI)"
  - filename: nbi.png
    label: "Narrow band imaging (NBI)"
```

Each `question_NNN/` directory must contain exactly the files listed in `image_slots`. CI validation will enforce this.

Other examples:

```yaml
# Chest X-ray (two-view uniform assessment)
image_slots:
  - filename: lateral.png
    label: "Lateral"
  - filename: ap.png
    label: "AP"
```

### Variable assessments

No change needed. Variable assessments already define images per-question in `question.yaml`:

```yaml
images:
  - key: "image_1.png"
    label: "PA chest X-ray"
```

The mix-up risk is low because:

1. Each question defines its own images inline — label is right next to filename
2. Most variable questions have only one image
3. Context differs per question, so there is no repeated convention to confuse

### Summary

| Type         | Image definition                              | Naming                              | CI enforcement                                             |
| ------------ | --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- |
| **uniform**  | `image_slots` at assessment level             | Semantic filenames (e.g. `wli.png`) | Every question dir must have exactly the listed files      |
| **variable** | Per-question `images` list in `question.yaml` | Flexible (any filename)             | Each listed `key` must exist as a file in the question dir |

## Implementation tasks

### 1. Update `assessment.yaml` schema (teaching-tooling)

- Add `image_slots` as an optional field (list of `{filename, label}`)
- For uniform type: require either `image_slots` or legacy `images_per_item` (backward compat during migration)
- Validate `filename` is kebab-case with allowed image extension

### 2. Add image file validation to `validate.py`

- For uniform + `image_slots`: check every `question_NNN/` contains exactly those filenames
- For variable: check every `key` in the question's `images` list exists as a file
- Report missing/extra files as validation errors

### 3. Migrate existing questions (eoeeta-teaching)

- Rename `image_1.png` → `wli.png`, `image_2.png` → `nbi.png` in all question directories
- Replace `images_per_item` + `image_labels` with `image_slots` in `assessment.yaml`
- Bump version (or stay at 1 if still draft)

### 4. Deprecate legacy fields

- After migration, make `image_slots` required for uniform type
- Remove support for `images_per_item` + `image_labels`

## Migration strategy

Since the colonoscopy module is still in `draft` status, migration is safe — no version lock constraints. A simple script can batch-rename files across all question directories.
