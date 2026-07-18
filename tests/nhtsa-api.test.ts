import { afterAll, describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";
import { closePluginSessions } from "../src/lib/runtime/invoke";

const slug = "nhtsa-vehicle-safety-lab";

async function request(body: Record<string, unknown>) {
  return POST(
    new Request(`http://localhost/api/plugins/${slug}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

async function invoke(tool: string, args: Record<string, unknown>) {
  return request({ operation: "tool", tool, arguments: args });
}

async function structured(tool: string, args: Record<string, unknown>) {
  const response = await invoke(tool, args);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.plugin).toBe("io.github.cyanheads/nhtsa-vehicle-safety-mcp-server");
  expect(payload.result.isError).toBe(false);
  return payload.result.structuredContent as Record<string, unknown>;
}

afterAll(async () => {
  await closePluginSessions(slug);
});

describe("NHTSA vehicle safety public API", () => {
  test("runs all six public tools against official NHTSA and VPIC data", async () => {
    const profile = await structured("nhtsa_get_vehicle_safety", {
      make: "HONDA",
      model: "CIVIC",
      modelYear: 2020,
    });
    expect(profile.sectionStatus).toEqual({ safetyRatings: "available", recalls: "available", complaints: "available" });
    expect(profile.safetyRatings).toEqual(expect.arrayContaining([
      expect.objectContaining({ vehicleId: 14819, overallRating: "5" }),
      expect.objectContaining({ vehicleId: 14483, overallRating: "5" }),
    ]));
    expect(profile.recalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ campaignNumber: "24V064000" }),
    ]));
    const complaintSummary = profile.complaintSummary as Record<string, unknown>;
    expect(Number(complaintSummary.totalCount)).toBeGreaterThan(100);
    expect(complaintSummary.componentBreakdown).toEqual([]);

    const recalls = await structured("nhtsa_search_recalls", {
      make: "HONDA",
      model: "CIVIC",
      modelYear: 2020,
      dateRange: { after: "2024-01-01", before: "2024-12-31" },
    });
    expect(recalls.recalls).toEqual(expect.arrayContaining([
      expect.objectContaining({ campaignNumber: "24V064000" }),
    ]));

    const campaign = await structured("nhtsa_search_recalls", { campaignNumber: "24V064000" });
    expect(campaign).toMatchObject({ totalCount: 1, effectiveQuery: "24V064000" });
    expect(campaign.recalls).toEqual([
      expect.objectContaining({ campaignNumber: "24V064000", potentialUnitsAffected: 750114 }),
    ]);

    const complaints = await structured("nhtsa_search_complaints", {
      make: "HONDA",
      model: "CIVIC",
      modelYear: 2020,
      limit: 5,
      offset: 0,
    });
    expect(Number(complaints.totalCount)).toBeGreaterThan(100);
    expect(complaints).toMatchObject({ returned: 5, offset: 0, limit: 5 });
    expect(complaints.componentBreakdown).toEqual([]);
    expect(complaints.complaints).toHaveLength(5);
    expect((complaints.complaints as Array<Record<string, unknown>>).every((item) => !("dateOfIncident" in item))).toBe(true);

    const ratings = await structured("nhtsa_get_safety_ratings", {
      make: "HONDA",
      model: "CIVIC",
      modelYear: 2020,
    });
    expect(ratings.ratings).toEqual(expect.arrayContaining([
      expect.objectContaining({ vehicleId: 14819, overallRating: "5" }),
    ]));
    const rating = await structured("nhtsa_get_safety_ratings", { vehicleId: 14819 });
    expect(rating.ratings).toEqual([
      expect.objectContaining({
        vehicleId: 14819,
        overallRating: "5",
        rollover: expect.objectContaining({ probability: 0.093 }),
      }),
    ]);

    const vin = await structured("nhtsa_decode_vin", { vin: "1HGCM82633A004352" });
    expect(vin).toMatchObject({ effectiveQuery: "1 VIN (single)" });
    expect(vin.vehicles).toEqual([
      expect.objectContaining({ vin: "1HGCM82633A004352", make: "HONDA", model: "Accord", modelYear: "2003", errorCode: "0" }),
    ]);

    const models = await structured("nhtsa_lookup_vehicles", {
      operation: "models",
      make: "HONDA",
      modelYear: 2020,
      limit: 10,
      offset: 0,
    });
    expect(Number(models.totalCount)).toBeGreaterThan(50);
    expect(models).toMatchObject({ operation: "models", returned: 10, offset: 0, limit: 10 });
    expect(models.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ makeName: "HONDA", modelName: expect.any(String) }),
    ]));
  }, 300_000);

  test("keeps invalid input and the 389 MB investigation path outside the public boundary", async () => {
    const invalidTools: Array<[string, Record<string, unknown>]> = [
      ["nhtsa_search_investigations", { make: "HONDA", model: "CIVIC", limit: 5, offset: 0 }],
      ["nhtsa_get_vehicle_safety", { make: "HONDA", model: "CIVIC", modelYear: 1980 }],
      ["nhtsa_search_recalls", { campaignNumber: "24V064000", make: "HONDA", model: "CIVIC", modelYear: 2020 }],
      ["nhtsa_search_recalls", { make: "HONDA", model: "CIVIC", modelYear: 2020, dateRange: { after: "2025-02-01", before: "2024-01-01" } }],
      ["nhtsa_search_complaints", { make: "HONDA", model: "CIVIC", modelYear: 2020, component: "AIR BAGS", limit: 5, offset: 0 }],
      ["nhtsa_search_complaints", { make: "HONDA", model: "CIVIC", modelYear: 2020, limit: 21, offset: 0 }],
      ["nhtsa_get_safety_ratings", { vehicleId: 14819, make: "HONDA", model: "CIVIC", modelYear: 2020 }],
      ["nhtsa_decode_vin", { vin: Array.from({ length: 11 }, (_, index) => `1HGCM82633A00${String(4352 + index).padStart(4, "0")}`) }],
      ["nhtsa_lookup_vehicles", { operation: "vehicle_types", make: "HONDA", limit: 10, offset: 0 }],
      ["nhtsa_lookup_vehicles", { operation: "models", limit: 10, offset: 0 }],
      ["nhtsa_lookup_vehicles", { operation: "models", make: "HONDA", modelYear: 2020, limit: 10, offset: 0, baseUrl: "https://example.com" }],
      ["nhtsa_get_vehicle_safety", { make: "ZZZNONEXISTENT", model: "NOPE", modelYear: 2020 }],
    ];
    for (const [tool, args] of invalidTools) {
      expect((await invoke(tool, args)).status).toBe(400);
    }

    const warnedVin = await structured("nhtsa_decode_vin", { vin: "AAAAAAAAAAAAAAAAA" });
    expect(String(warnedVin.notice)).toMatch(/warning|警告/i);
    expect(warnedVin.vehicles).toEqual([
      expect.objectContaining({ vin: "AAAAAAAAAAAAAAAAA", errorCode: expect.stringMatching(/1|7|400/) }),
    ]);
  }, 90_000);
});
