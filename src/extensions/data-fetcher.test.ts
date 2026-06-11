import { describe, it, expect } from "bun:test";
import { DataFetcher } from "./data-fetcher";

// Minimal mock fetch factory
function mockFetch(responses: Array<{ status: number; body: string }>): typeof fetch {
  let call = 0;
  return async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return new Response(r.body, { status: r.status });
  };
}

const ok = (body: string) => ({ status: 200, body });
const err = (status: number) => ({ status, body: "" });

describe("DataFetcher", () => {
  it("fetchCsv returns body from a successful response", async () => {
    const csv = "id,name\n1,Alice\n2,Bob";
    const fetcher = new DataFetcher({ fetch: mockFetch([ok(csv)]) });
    const result = await fetcher.fetchCsv("https://example.com/data.csv");
    expect(result.body).toBe(csv);
    expect(result.statusCode).toBe(200);
  });

  it("fetchCsv acquisition code contains the URL and uses pd.read_csv", async () => {
    const url = "https://example.com/data.csv";
    const fetcher = new DataFetcher({ fetch: mockFetch([ok("a,b\n1,2")]) });
    const { acquisitionCode } = await fetcher.fetchCsv(url);
    expect(acquisitionCode).toContain(url);
    expect(acquisitionCode).toContain("pd.read_csv");
  });

  it("fetchApi sends custom headers in the request", async () => {
    let capturedInit: RequestInit | undefined;
    const capturingFetch: typeof fetch = async (_url, init) => {
      capturedInit = init;
      return new Response('{"ok":true}', { status: 200 });
    };
    const fetcher = new DataFetcher({ fetch: capturingFetch });
    await fetcher.fetchApi("https://api.example.com/data", {
      headers: { Authorization: "Bearer token123" },
    });
    expect((capturedInit?.headers as Record<string, string>)?.Authorization).toBe("Bearer token123");
  });

  it("fetchApi acquisition code uses requests.get and includes headers", async () => {
    const url = "https://api.example.com/data";
    const fetcher = new DataFetcher({ fetch: mockFetch([ok("{}")]) });
    const { acquisitionCode } = await fetcher.fetchApi(url, {
      headers: { Authorization: "Bearer tok" },
    });
    expect(acquisitionCode).toContain("requests.get");
    expect(acquisitionCode).toContain(url);
    expect(acquisitionCode).toContain("Authorization");
  });

  it("retries up to 3 times on 5xx before throwing", async () => {
    let calls = 0;
    const countingFetch: typeof fetch = async () => {
      calls++;
      return new Response("", { status: 503 });
    };
    const fetcher = new DataFetcher({ fetch: countingFetch });
    await expect(
      fetcher.fetchCsv("https://example.com/data.csv", { retries: 3, backoffMs: 0 })
    ).rejects.toThrow("503");
    expect(calls).toBe(4); // 1 initial + 3 retries
  });

  it("does not retry on 4xx errors", async () => {
    let calls = 0;
    const countingFetch: typeof fetch = async () => {
      calls++;
      return new Response("Not Found", { status: 404 });
    };
    const fetcher = new DataFetcher({ fetch: countingFetch });
    await expect(
      fetcher.fetchCsv("https://example.com/data.csv", { backoffMs: 0 })
    ).rejects.toThrow("404");
    expect(calls).toBe(1);
  });

  it("succeeds if a retry recovers after transient 5xx", async () => {
    const fetcher = new DataFetcher({
      fetch: mockFetch([err(503), err(503), ok("id,name\n1,Alice")]),
    });
    const result = await fetcher.fetchCsv("https://example.com/data.csv", { backoffMs: 0 });
    expect(result.body).toContain("Alice");
    expect(result.statusCode).toBe(200);
  });
});
