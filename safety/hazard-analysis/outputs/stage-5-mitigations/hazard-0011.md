# Hazard

**Hazard id:** Hazard-0011

**Hazard name:** Missing letters in list

**Description:** Letters list page displays letters from EHRbase AQL query but does not handle pagination limits or auto-refresh, potentially missing recent letters if query has default row limit or letters created during page load.

**Causes:**

- AQL query may have default row limit (e.g., 100 letters)
- Letters created during page load not shown until manual refresh
- No "refresh" button or auto-refresh mechanism in UI

**Effect:**
Clinician does not see most recent clinical letter in letters list, believes they have reviewed all available clinical information.

**Hazard:**
Critical clinical information in recent letter not reviewed before making clinical decision (e.g., recent consultant letter documenting contraindication).

**Hazard controls:**

### Design controls (manufacturer)

- Add explicit LIMIT and OFFSET clauses to EHRbase AQL query with pagination controls: display "Showing 1-50 of 150 letters" with Next/Previous buttons. Fetch total count in separate query.
- Implement automatic polling: refetch letters list every 60 seconds while page is active using React Query refetchInterval. Display timestamp "Last refreshed: 14:35:22" with manual refresh button.
- Add "Load more" button at bottom of letters list if pagination indicates more letters available. Display warning banner if letters count exceeds single page: "More letters available - click Load More."
- Sort letters by creation date descending (newest first) to ensure most recent clinical information appears at top of list.
- Add visual indicator when new letters created: display notification badge "+2 new letters" with auto-scroll to top option.

### Testing controls (manufacturer)

- Integration test: Create 150 letters for patient, load letters page. Assert only first 50 displayed with "Load More" button visible. Click button, assert next 50 letters loaded. Verify total count shows 150.
- Integration test: Load letters page, create new letter via API in background (simulating different user), wait 70 seconds (>1 polling interval). Assert new letter appears in list automatically without manual refresh.
- Unit test: Mock AQL query to return total count of 200 letters but only 50 results. Assert pagination UI displays correct count "Showing 1-50 of 200" and enables Next button.
- Integration test: Create letter at timestamp T0, load letters page at T1 (after T0). Verify letter created at T0 appears in list at T1 (no missing letter from timing race).

### Training controls (deployment)

- Train clinicians to always check total letters count and use pagination to review complete clinical history before making high-risk treatment decisions.
- Document workflow: "Before prescribing new medication, review all available letters by clicking 'Load More' until full history reviewed. Check timestamp to ensure recent letters not missed."
- Include in clinical handover training: "When reviewing patient history, verify you've seen all letters by checking 'Showing X of Y' counter. Don't assume first page shows everything."

### Business process controls (deployment)

- NHS Trust policy: Before high-risk treatments (chemotherapy, anticoagulation, biologics), clinician must document review of complete clinical letter history including pagination confirmation.
- Clinical governance: Medical records team must audit letter completeness quarterly, verifying all clinical letters properly indexed in EHRbase and accessible via Quill interface.
- IT SLA: Letters created must appear in patient's letter list within 2 minutes of creation (either via polling or WebSocket notification). Monitor and alert on indexing delays.

**Harm:**
Clinician prescribes medication that conflicts with contraindication documented in unseen letter, causing adverse drug reaction or treatment failure.

**Code associated with hazard:**

- `frontend/src/pages/Letters.tsx`
