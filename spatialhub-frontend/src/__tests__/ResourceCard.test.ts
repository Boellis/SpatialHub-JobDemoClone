import { describe, it, expect } from "vitest";
import { healthOf } from "../components/survival/ResourceCard";

describe("healthOf", () => {
  it("flags low-is-bad stores by remaining level", () => {
    expect(healthOf(5, false)).toBe("crit");   // nearly empty
    expect(healthOf(20, false)).toBe("warn");
    expect(healthOf(80, false)).toBe("ok");
  });

  it("flags high-is-bad waste stores when filling up", () => {
    expect(healthOf(95, true)).toBe("crit");
    expect(healthOf(70, true)).toBe("warn");
    expect(healthOf(10, true)).toBe("ok");
  });

  it("treats a vent-safe buffer (e.g. CO₂ store) as nominal at any level", () => {
    // CO₂ store vents/overflows harmlessly when full — saturation must NOT alarm.
    expect(healthOf(100, true, true)).toBe("ok");
    expect(healthOf(0, true, true)).toBe("ok");
  });
});
