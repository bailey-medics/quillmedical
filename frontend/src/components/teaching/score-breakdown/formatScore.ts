/**
 * A learner's score on one criterion, as a percentage to two decimal
 * places. One place could round a near miss up to the pass mark: 96
 * right out of 113 is 84.96%, which one place shows as 85.0% beside a
 * fail.
 *
 * @param value - The score as a fraction, from 0 to 1
 * @returns The score, such as "84.96%"
 */
export function formatScore(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
