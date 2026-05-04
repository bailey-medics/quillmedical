/**
 * Demo Single Letter Data
 *
 * Sample clinical letter for use in letter detail view stories and testing.
 * Provides complete letter structure including subject, sender, date, and body.
 */

/** Sample clinical letter with full content for detail view demos */
export const sampleLetter = {
  id: "l1",
  subject: "Outpatient clinic letter: chronic cough",
  from: "Respiratory Medicine",
  date: new Date().toISOString(),
  body: `## Diagnosis

1. Chronic persistent cough — likely **post-nasal drip syndrome**
2. Possible mild asthma (to confirm with spirometry)

## Plan

1. Trial of nasal corticosteroid spray (fluticasone 50mcg, two sprays each nostril daily) for **eight weeks**
2. Salbutamol inhaler 100mcg as required for wheeze or breathlessness
3. Chest X-ray — requested to exclude underlying pathology
4. Spirometry with reversibility testing at next visit
5. Review in respiratory clinic in **eight weeks** with results

Dear Dr Gallagher,

Thank you for referring this 42-year-old non-smoking gentleman who presents with a persistent dry cough of approximately three months' duration. He reports the cough is worse at night and on waking, with occasional clear post-nasal drip. There is no haemoptysis, weight loss, or significant dyspnoea. He has no known drug allergies.

On examination, he appeared well. Respiratory rate was 14 breaths per minute. Oxygen saturations were 98% on room air. Chest auscultation revealed good bilateral air entry with no wheeze, crackles, or pleural rub. Throat examination showed mild cobblestoning of the posterior pharynx consistent with post-nasal drip.

Peak expiratory flow was 520 L/min (92% predicted). There was no significant diurnal variation on the two-week peak flow diary he had completed prior to his appointment.

I have arranged the investigations outlined above and will review him with the results. Should his symptoms deteriorate in the interim, please do not hesitate to contact our department.

Kind regards,
**Dr A. Mahmood**
*Consultant Respiratory Physician*`,
};

export default sampleLetter;
