# Avatar Gradient System Migration

## Overview

The avatar gradient system has been refactored from storing explicit color values (`colorFrom`/`colorTo`) to using predefined gradient indices (0-29). This provides better consistency, maintainability, and simpler API.

## Frontend Changes

### New Exports in `gradients.ts`

```typescript
// Total number of available gradients
export const GRADIENT_COUNT = 30;

// Access gradients by index
export const AVATAR_GRADIENTS: AvatarGradient[] = [
  /* 30 gradients */
];
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

**New Extension Format:**

```python
{
  "url": "urn:quillmedical:avatar-gradient",
  "valueInteger": 12  # Gradient index
}
```

**Legacy Extension Format** (backwards compatibility):

```python
{
  "url": "urn:quillmedical:avatar-gradient-legacy",
  "extension": [
    {"url": "colorFrom", "valueString": "#F44336"},
    {"url": "colorTo", "valueString": "#E57373"}
  ]
}
```

### Updated FHIR Client Function

**New API** (`backend/app/fhir_client.py`):

```python
from app.fhir_client import add_avatar_gradient_extension

patient = Patient()
add_avatar_gradient_extension(patient, gradient_index=5)  # Or None for random
```

**Legacy API** (for backwards compatibility):

```python
from app.fhir_client import add_avatar_gradient_extension_legacy

patient = Patient()
gradient = {"colorFrom": "#F44336", "colorTo": "#E57373"}
add_avatar_gradient_extension_legacy(patient, gradient)
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

Existing patients with `colorFrom`/`colorTo` extensions will continue to work, but should be migrated to gradient indices using a backfill script.

**Backfill Script** (to be created):

```python
# Pseudo-code for migration script
for patient in get_all_patients():
    # Remove old extension
    remove_extension(patient, "urn:quillmedical:avatar-gradient-legacy")

    # Add new gradient index extension
    gradient_index = generate_avatar_gradient_index()
    add_avatar_gradient_extension(patient, gradient_index)

    # Update patient in FHIR
    update_fhir_patient(patient)
```

## Frontend Reading FHIR Extensions

The frontend should read the gradient index from FHIR:

```typescript
// Extract gradient index from FHIR Patient extension
function getGradientIndex(patient: FHIRPatient): number {
  const extension = patient.extension?.find(
    ext => ext.url === "urn:quillmedical:avatar-gradient"
  );

  return extension?.valueInteger ?? 0; // Fallback to gradient 0
}

// Use in component
<ProfilePic gradientIndex={getGradientIndex(patient)} />
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
cd frontend
yarn test ProfilePic
```

### Backend Tests

```bash
cd backend
poetry run pytest tests/test_colors.py -v
```

## Rollback Plan

If migration causes issues, the legacy system can still be used:

1. Revert to `add_avatar_gradient_extension_legacy()` in backend
2. Update frontend to accept `colorFrom`/`colorTo` props again
3. Continue using `urn:quillmedical:avatar-gradient-legacy` extension

## Next Steps

1. ✅ Frontend gradient index system implemented
2. ✅ Backend random gradient index generator created
3. ✅ FHIR extension updated to use `valueInteger`
4. 🔲 Create backfill script to migrate existing patients
5. 🔲 Update patient creation scripts to use new API
6. 🔲 Update frontend Home.tsx to read gradient index from FHIR
7. 🔲 Add tests for new gradient index system
8. 🔲 Update API documentation
