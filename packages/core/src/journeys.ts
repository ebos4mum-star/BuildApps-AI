/** The three entry journeys every project belongs to. */
export const PROJECT_JOURNEYS = ["start", "continue", "rescue"] as const;
export type ProjectJourney = (typeof PROJECT_JOURNEYS)[number];

export function isProjectJourney(value: unknown): value is ProjectJourney {
  return typeof value === "string" && (PROJECT_JOURNEYS as readonly string[]).includes(value);
}
