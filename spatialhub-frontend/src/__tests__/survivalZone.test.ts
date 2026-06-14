import { describe, it, expect } from "vitest";
import { solEventToReadings } from "../simulation/survivalZone";

describe("solEventToReadings", () => {
  it("maps modules to zone readings via biosimMapper", () => {
    const modules = {
      Crew_Quarters_Environment: { properties: { temperature: 22, relativeHumidity: 40, totalPressure: 101 } },
    };
    const r = solEventToReadings(modules, {});
    expect(r["grow-bays"]["gb-temp"].value).toBe(22);
  });
});
