/**
 * Generated declarations check
 *
 * `src/generated/index.d.ts` is written by hand, and the JSON files it
 * describes are generated from the shared YAML. Nothing else compares
 * the two, so a field dropped from a YAML file stays declared and a
 * field added to one stays undeclared until somebody trips over it.
 *
 * Each JSON file is imported twice here. The `@/generated/...` alias
 * matches a `declare module` in the declaration file, so it carries the
 * hand-written type. The relative path matches no declaration, so
 * TypeScript reads the type from the JSON itself. Assigning one to the
 * other turns a disagreement into a `yarn typecheck:all` failure. The
 * assertions at runtime are trivially true: the check is the types.
 */

import { describe, expect, it } from "vitest";

import declaredBaseProfessions from "@/generated/base-professions.json";
import declaredBrand from "@/generated/brand.json";
import declaredCompetencies from "@/generated/competencies.json";
import declaredJurisdictionConfig from "@/generated/jurisdiction-config.json";
import declaredOrgUnitTypes from "@/generated/org-unit-types.json";
import declaredPassportSpecialties from "@/generated/passport-specialties.json";

import actualBaseProfessions from "../generated/base-professions.json";
import actualBrand from "../generated/brand.json";
import actualCompetencies from "../generated/competencies.json";
import actualJurisdictionConfig from "../generated/jurisdiction-config.json";
import actualOrgUnitTypes from "../generated/org-unit-types.json";
import actualPassportSpecialties from "../generated/passport-specialties.json";

/**
 * The keys the JSON holds that the declaration does not name, at any
 * depth, as a union of their names. `never` when every key is declared.
 * Plain assignment cannot see these: an object with an extra field is
 * still assignable to a type that lacks it.
 */
type Undeclared<Actual, Declared> = Actual extends readonly (infer Item)[]
  ? Declared extends readonly (infer DeclaredItem)[]
    ? Undeclared<Item, DeclaredItem>
    : never
  : Actual extends object
    ? Declared extends object
      ? {
          [Key in keyof Actual]-?: Key extends keyof Declared
            ? Undeclared<Actual[Key], NonNullable<Declared[Key]>>
            : Key;
        }[keyof Actual]
      : never
    : never;

/** `true` only when the JSON holds no key the declaration lacks. */
type AllDeclared<Actual, Declared> = [Undeclared<Actual, Declared>] extends [
  never,
]
  ? true
  : { undeclared: Undeclared<Actual, Declared> };

describe("Generated declarations", () => {
  it("declares base-professions.json as it is generated", () => {
    const declared: typeof declaredBaseProfessions = actualBaseProfessions;
    const complete: AllDeclared<
      typeof actualBaseProfessions,
      typeof declaredBaseProfessions
    > = true;
    expect(declared).toBe(actualBaseProfessions);
    expect(complete).toBe(true);
  });

  it("declares brand.json as it is generated", () => {
    const declared: typeof declaredBrand = actualBrand;
    const complete: AllDeclared<typeof actualBrand, typeof declaredBrand> =
      true;
    expect(declared).toBe(actualBrand);
    expect(complete).toBe(true);
  });

  it("declares competencies.json as it is generated", () => {
    const declared: typeof declaredCompetencies = actualCompetencies;
    const complete: AllDeclared<
      typeof actualCompetencies,
      typeof declaredCompetencies
    > = true;
    expect(declared).toBe(actualCompetencies);
    expect(complete).toBe(true);
  });

  it("declares jurisdiction-config.json as it is generated", () => {
    const declared: typeof declaredJurisdictionConfig =
      actualJurisdictionConfig;
    const complete: AllDeclared<
      typeof actualJurisdictionConfig,
      typeof declaredJurisdictionConfig
    > = true;
    expect(declared).toBe(actualJurisdictionConfig);
    expect(complete).toBe(true);
  });

  it("declares org-unit-types.json as it is generated", () => {
    const declared: typeof declaredOrgUnitTypes = actualOrgUnitTypes;
    const complete: AllDeclared<
      typeof actualOrgUnitTypes,
      typeof declaredOrgUnitTypes
    > = true;
    expect(declared).toBe(actualOrgUnitTypes);
    expect(complete).toBe(true);
  });

  it("declares passport-specialties.json as it is generated", () => {
    const declared: typeof declaredPassportSpecialties =
      actualPassportSpecialties;
    const complete: AllDeclared<
      typeof actualPassportSpecialties,
      typeof declaredPassportSpecialties
    > = true;
    expect(declared).toBe(actualPassportSpecialties);
    expect(complete).toBe(true);
  });
});
