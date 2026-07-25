import { describe, expect, it } from "vitest";
import { roadDistanceKm, resolveLocationCoords } from "../lib/somaliaGeo.js";
import { estimateDistanceKm } from "../services/pricingService.js";

describe("resolveLocationCoords", () => {
  it("resolves district centroids", () => {
    const hodan = resolveLocationCoords({ district: "Hodan", region: "Banaadir" });
    const baydhabo = resolveLocationCoords({ district: "Baydhabo", region: "Bay" });
    expect(hodan.source).toBe("district");
    expect(baydhabo.source).toBe("district");
    expect(hodan.lat).toBeCloseTo(2.04, 1);
    expect(baydhabo.lat).toBeCloseTo(3.11, 1);
  });

  it("parses neighborhood, district, region text", () => {
    const place = resolveLocationCoords({ text: "Xaafad, Marka, Shabeellaha Hoose" });
    expect(place.source).toBe("district");
    expect(place.lat).toBeCloseTo(1.72, 1);
  });
});

describe("road distance pricing", () => {
  it("gives a meaningful Mogadishu → Baidoa distance", () => {
    const km = estimateDistanceKm("Hodan, Banaadir", "Baydhabo, Bay", {
      fromRegion: "Banaadir",
      fromDistrict: "Hodan",
      toRegion: "Bay",
      toDistrict: "Baydhabo",
    });
    // Straight ~250km * 1.3 road factor ≈ 300+
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(450);
  });

  it("keeps same-district trips above zero", () => {
    const km = roadDistanceKm(
      resolveLocationCoords({ district: "Hodan" }),
      resolveLocationCoords({ district: "Hodan" })
    );
    expect(km).toBeGreaterThanOrEqual(5);
  });
});
