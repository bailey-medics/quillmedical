# Hazard

**Hazard id:** Hazard-0009

**Hazard name:** Avatar gradient insufficient for patient distinction

**Description:** Avatar gradient colors may not provide sufficient visual distinction for rapid patient identification in high-pressure clinical environment due to limited color variations, color-blind accessibility issues, or display contrast problems.

**Causes:**

- Only 30 gradient variations (0-29) means collisions likely with >30 patients
- Color-blind clinicians cannot distinguish similar hues
- Low contrast on different displays or lighting conditions
- Random generation can assign same gradient to different patients

**Effect:**
Clinician relies on visual color cue but confuses two patients with similar or identical gradient colors.

**Hazard:**
Wrong patient selected based on visual recognition instead of reading name carefully.

**Hazard controls:**

### Design controls (manufacturer)

- Expand avatar gradient palette to 100+ distinct combinations using HSL color space with maximum perceptual distance. Ensure minimum 15-degree hue separation and saturation/lightness variation to prevent similar-looking gradients.
- Add patient initials or first two letters of surname overlaid on gradient circle in contrasting white/black text (calculated for WCAG AAA contrast). Provides text-based identifier in addition to color.
- Implement deterministic gradient assignment: hash patient FHIR ID to consistent gradient index, ensuring same patient always gets same color across sessions and devices.
- Add colorblind-safe mode setting in user preferences: alternative patient identifier system using patterns (stripes, dots, checks) overlaid on gradient for deuteranopia/protanopia users.
- Include accessibility indicator: if two patients in visible list have similar gradients (hue difference <30 degrees), display warning icon next to both: "Similar colors - verify name carefully."

### Testing controls (manufacturer)

- Unit test: Generate gradients for 100 patients, calculate minimum perceptual distance between any two gradients. Assert minimum distance >15 CIELAB ΔE units to ensure human-perceivable distinction.
- Visual regression test: Render patient list with 10 patients on various displays (high contrast, low contrast, different color gamuts). Verify gradients remain distinguishable across display types.
- Colorblind simulation test: Apply deuteranopia filter to patient list, verify initials remain readable with sufficient contrast. Assert pattern overlays (when enabled) provide additional distinction.
- Unit test: Create patient with FHIR ID "abc123", generate gradient, destroy component, recreate with same ID. Assert identical gradient generated (deterministic hashing).

### Training controls (deployment)

- Train clinicians to never rely solely on avatar color for patient identification. Emphasize: "Always read patient name and NHS number. Avatar color is supplementary visual aid only."
- Document clinical workflow: "Before selecting patient from list, verbally state patient name aloud and verify against expected patient to prevent visual recognition errors."
- Include in medication administration training: "Five Rights of Medication Administration: verify patient name, DOB, and NHS number from wristband match patient on screen. Do not rely on avatar color alone."

### Business process controls (deployment)

- NHS Trust policy: Avatar colors are visual aids only and must not be used as sole patient identifier. All clinical actions require verification of name, DOB, and NHS number.
- Clinical governance: Incident reporting for near-misses where clinician almost selected wrong patient due to similar avatar colors. Analyze trends to identify high-risk scenarios.
- Accessibility policy: Clinicians with colorblindness must declare condition during IT onboarding to enable alternative patient identifier modes. No stigma or penalty for declaration.

**Harm:**
Clinical action performed on wrong patient including medication administration, procedure scheduling, or discharge planning.

**Code associated with hazard:**

- `frontend/src/components/patients/PatientsList.tsx`
- `frontend/src/lib/fhir-patient.ts`
- `backend/app/utils/colors.py`
