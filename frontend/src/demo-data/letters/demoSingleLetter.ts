/**
 * Demo Single Letter Data
 *
 * Sample clinical letter for use in letter detail view stories and testing.
 * Provides complete letter structure including subject, sender, date, and body.
 */

/** Sample clinical letter with full content for detail view demos */
export const sampleLetter = {
  id: "l1",
  subject: "Discharge summary: left knee",
  from: "Orthopaedics Dept",
  date: new Date().toISOString(),
  body: `Dear Patient,

Thank you for attending clinic. We recommend physiotherapy and return if symptoms persist.

Kind regards,
Orthopaedics Team`,
};

export default sampleLetter;
