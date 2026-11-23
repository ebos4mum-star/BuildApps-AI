import { describe, expect, it } from "vitest";
import { isProjectJourney, PROJECT_JOURNEYS } from "./journeys";

describe("project journeys", () => {
  it("defines start, continue and rescue", () => {
    expect(PROJECT_JOURNEYS).toEqual(["start", "continue", "rescue"]);
  });
  it("validates journey values", () => {
    expect(isProjectJourney("rescue")).toBe(true);
    expect(isProjectJourney("other")).toBe(false);
    expect(isProjectJourney(undefined)).toBe(false);
  });
});
