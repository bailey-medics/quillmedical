# Avatar Gradient System Migration

## Overview

The avatar gradient system has been refactored from storing explicit color values (`colorFrom`/`colorTo`) to using predefined gradient indices (0-29). This provides better consistency, maintainability, and simpler API.

## Frontend Changes

### New Exports in `gradients.ts`

```typescript
// Access gradients by index
export const AVATAR_GRADIENTS: AvatarGradient[] = [
  /* 30 gradients */
];

// Get a gradient by index (wraps round past the end)
export function getGradient(index: number): AvatarGradient;
```

### ProfilePic Component API

**Old API** (deprecated):

```tsx
<ProfilePic colorFrom="#F44336" colorTo="#E57373" />
```

**New API**:

```tsx
<ProfilePic gradientIndex={0} />
```

**Fallback behavior:**

- Indices 0-29: Use predefined gradient
- Indices ≥30: White background with thin black border

## Backend Changes

### New Function: `generate_avatar_gradient_index()`

Located in `backend/app/utils/colors.py`:

```python
from app.utils.colors import generate_avatar_gradient_index

# Generate random gradient index (0-29)
gradient_index = generate_avatar_gradient_index()
```

### Updated FHIR Extension

**Extension Format:**

```python
{
  "url": "urn:quillmedical:avatar-gradient",
  "valueInteger": 12  # Gradient index
}
```

### Updated FHIR Client Function

**New API** (`backend/app/fhir_client.py`):

```python
from app.fhir_client import add_avatar_gradient_extension

patient = Patient()
add_avatar_gradient_extension(patient, gradient_index=5)  # Or None for random
```

## Migration Strategy

### For New Patients

All new patients should use the gradient index system:

```python
# When creating new patient
patient = Patient()
add_avatar_gradient_extension(patient)  # Random index 0-29
```

### For Existing Patients

Existing patients with `colorFrom`/`colorTo` extensions will need migrating to gradient indices using a backfill script.

**Backfill Script** (written, run and since removed from `backend/scripts/`):

```python
# Pseudo-code for migration script
for patient in get_all_patients():
    # Add new gradient index extension
    gradient_index = generate_avatar_gradient_index()
    add_avatar_gradient_extension(patient, gradient_index)

    # Update patient in FHIR
    update_fhir_patient(patient)
```

## Frontend Reading FHIR Extensions

The frontend reads the gradient index from FHIR:

```typescript
import { extractAvatarGradientIndex } from "@lib/fhir-patient";

// undefined when the patient has no extension; ProfilePic then uses gradient 0
<ProfilePic gradientIndex={extractAvatarGradientIndex(fhirPatient)} />
```

## Benefits of New System

1. **Consistency**: Same index always produces same colors across entire app
2. **Maintainability**: Update all avatar colors by editing one file (`gradients.ts`)
3. **Simplicity**: Single integer instead of two hex color strings
4. **Type Safety**: Frontend validates indices via TypeScript
5. **Performance**: Smaller FHIR extension data (integer vs two strings)
6. **Scalability**: Easy to add more gradients (just append to array)

## Configuration

### Updating GRADIENT_COUNT

If you add more gradients to the frontend:

1. Add new gradients to `frontend/src/components/profile-pic/gradients.ts`
2. Update `GRADIENT_COUNT` constant in `backend/app/utils/colors.py`
3. Ensure `GRADIENT_COUNT` matches `AVATAR_GRADIENTS.length`

### Current Gradient Count

- **Frontend**: 30 gradients (indices 0-29)
- **Backend**: `GRADIENT_COUNT = 30`

## Testing

### Frontend Tests

```bash
just uf src/components/profile-pic/ProfilePic.test.tsx
```

### Backend Tests

```bash
cd backend
poetry run pytest app/utils/colors_test.py -v
```

## Rollback Plan

If migration causes issues:

1. Revert frontend to accept `colorFrom`/`colorTo` props again
2. Revert backend to store colour pairs instead of indices
3. Patients without the new extension will get a random gradient on next update

## Next Steps

1. ✅ Frontend gradient index system implemented
2. ✅ Backend random gradient index generator created
3. ✅ FHIR extension updated to use `valueInteger`
4. ✅ Create backfill script to migrate existing patients (since removed)
5. ✅ Update patient creation scripts to use new API
6. ✅ Update frontend Home.tsx to read gradient index from FHIR
7. ✅ Add tests for new gradient index system
8. 🔲 Update API documentation
