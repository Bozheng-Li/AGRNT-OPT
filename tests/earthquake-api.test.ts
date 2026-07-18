import { describe, expect, test } from "vitest";
import { POST } from "../src/app/api/plugins/[slug]/invoke/route";

const slug = "earthquake-situation-lab";

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
  expect(payload.plugin).toBe("io.github.cyanheads/earthquake-mcp-server");
  expect(payload.result.isError).toBe(false);
  return payload.result.structuredContent as Record<string, unknown>;
}

async function resource(uri: string) {
  return request({ operation: "resource", uri });
}

describe("Earthquake public API", () => {
  test("runs four real tools across USGS and EMSC and reads both resource templates", async () => {
    const feed = await structured("earthquake_get_feed", { magnitude_tier: "4.5", time_window: "week" });
    expect(Number(feed.count)).toBeGreaterThan(0);
    expect(String(feed.feed_url)).toMatch(/^https:\/\/earthquake\.usgs\.gov\//);

    const search = await structured("earthquake_search", {
      start_time: "2024-01-01",
      end_time: "2024-01-08",
      min_magnitude: 6,
      source: "usgs",
      limit: 3,
      order_by: "magnitude",
    });
    expect(search.count).toBe(2);
    expect(JSON.stringify(search.events)).toContain("us6000m0xl");

    const detail = await structured("earthquake_get_event", { event_id: "us6000m0xl" });
    expect((detail.event as Record<string, unknown>).id).toBe("us6000m0xl");
    expect((detail.event as Record<string, unknown>).alert).toBe("red");

    const usgsCount = await structured("earthquake_count", {
      start_time: "2024-01-01",
      end_time: "2024-01-08",
      min_magnitude: 6,
      source: "usgs",
    });
    const emscCount = await structured("earthquake_count", {
      start_time: "2024-01-01",
      end_time: "2024-01-08",
      min_magnitude: 6,
      source: "emsc",
    });
    expect(usgsCount.count).toBe(2);
    expect(emscCount.count).toBe(3);

    const feedResource = await resource("earthquake://feed/4.5/week");
    expect(feedResource.status).toBe(200);
    const feedPayload = await feedResource.json();
    expect(JSON.parse(feedPayload.result.contents[0].text).count).toBeGreaterThan(0);

    const eventResource = await resource("earthquake://event/us6000m0xl");
    expect(eventResource.status).toBe(200);
    const eventPayload = await eventResource.json();
    expect(JSON.parse(eventPayload.result.contents[0].text).event.id).toBe("us6000m0xl");
  }, 240_000);

  test("rejects heavy feeds, unsafe options, malformed events, and unapproved resources", async () => {
    expect((await invoke("earthquake_get_feed", { magnitude_tier: "all", time_window: "month" })).status).toBe(400);
    expect((await invoke("earthquake_search", {
      start_time: "2024-01-01",
      end_time: "2024-01-08",
      min_magnitude: 6,
      source: "usgs",
      baseUrl: "https://example.com",
    })).status).toBe(400);
    expect((await invoke("earthquake_get_event", { event_id: "../../etc/passwd" })).status).toBe(400);
    expect((await resource("earthquake://feed/all/month")).status).toBe(400);
    expect((await resource("https://earthquake.usgs.gov/fdsnws/event/1/query")).status).toBe(400);
  });
});
