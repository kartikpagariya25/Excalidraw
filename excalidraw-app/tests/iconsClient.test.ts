import {
  IconsError,
  clearIconsCache,
  getIconSvgs,
  searchIcons,
} from "../icons/iconsClient";

type RpcBody = {
  method: string;
  params: { name: string; arguments: Record<string, any> };
};

const jsonRpc = (payload: unknown) =>
  new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text: JSON.stringify(payload) }] },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const searchPayload = (set: string, names: string[]) => ({
  results: names.map((name) => ({
    id: `${set}:${name}`,
    iconId: `${set}-${name}`,
    set,
    name,
  })),
});

let fetchMock: ReturnType<typeof vi.fn>;
const bodies = () =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body) as RpcBody);

beforeEach(() => {
  clearIconsCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("searchIcons", () => {
  it("calls search_icons for one set and maps results", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRpc(searchPayload("lucide-icons", ["database", "server"])),
    );

    const results = await searchIcons("  Database ", "lucide-icons");

    expect(results).toEqual([
      {
        iconId: "lucide-icons-database",
        name: "database",
        set: "lucide-icons",
      },
      { iconId: "lucide-icons-server", name: "server", set: "lucide-icons" },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://icons.leularia.com/api/mcp");
    expect(init.method).toBe("POST");
    expect(init.headers.Accept).toBe("application/json, text/event-stream");
    expect(bodies()[0]).toMatchObject({
      method: "tools/call",
      params: {
        name: "search_icons",
        arguments: { query: "database", set: "lucide-icons", limit: 60 },
      },
    });
  });

  it("fans out to all five sets and interleaves for 'All'", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const set = JSON.parse(init.body).params.arguments.set;
      return jsonRpc(searchPayload(set, ["a", "b"]));
    });

    const results = await searchIcons("home", null);

    expect(bodies().map((b) => b.params.arguments.set)).toEqual([
      "lucide-icons",
      "tabler-icons",
      "ph",
      "heroicons",
      "mdi",
    ]);
    expect(bodies().every((b) => b.params.arguments.limit === 12)).toBe(true);
    expect(results.map((r) => r.iconId)).toEqual([
      "lucide-icons-a",
      "tabler-icons-a",
      "ph-a",
      "heroicons-a",
      "mdi-a",
      "lucide-icons-b",
      "tabler-icons-b",
      "ph-b",
      "heroicons-b",
      "mdi-b",
    ]);
  });

  it("returns partial results when some set searches fail", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const set = JSON.parse(init.body).params.arguments.set;
      if (set === "ph") {
        return new Response("boom", { status: 500 });
      }
      return jsonRpc(searchPayload(set, ["a"]));
    });

    const results = await searchIcons("home", null);
    expect(results.map((r) => r.set)).toEqual([
      "lucide-icons",
      "tabler-icons",
      "heroicons",
      "mdi",
    ]);
  });

  it("throws IconsError when every set search fails", async () => {
    fetchMock.mockImplementation(
      async () => new Response("boom", { status: 500 }),
    );
    await expect(searchIcons("home", null)).rejects.toBeInstanceOf(IconsError);
  });

  it("drops results from sets outside the allowlist", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRpc({
        results: [
          { id: "mdi:home", iconId: "mdi-home", set: "mdi", name: "home" },
          {
            id: "fluent-emoji:house",
            iconId: "fluent-emoji-house",
            set: "fluent-emoji",
            name: "house",
          },
        ],
      }),
    );
    const results = await searchIcons("home", "mdi");
    expect(results.map((r) => r.iconId)).toEqual(["mdi-home"]);
  });

  it("parses text/event-stream responses", async () => {
    const envelope = {
      jsonrpc: "2.0",
      id: 1,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify(searchPayload("mdi", ["home"])),
          },
        ],
      },
    };
    fetchMock.mockResolvedValueOnce(
      new Response(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const results = await searchIcons("home", "mdi");
    expect(results.map((r) => r.iconId)).toEqual(["mdi-home"]);
  });

  it("throws IconsError on JSON-RPC error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "nope" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(searchIcons("home", "mdi")).rejects.toBeInstanceOf(
      IconsError,
    );
  });

  it("throws IconsError on isError tool results", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: '{"error":"bad"}' }],
            isError: true,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(searchIcons("home", "mdi")).rejects.toBeInstanceOf(
      IconsError,
    );
  });

  it("throws IconsError after the 8s timeout", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const promise = searchIcons("home", "mdi");
    const assertion = expect(promise).rejects.toBeInstanceOf(IconsError);
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
  });

  it("rethrows the abort when the caller aborts", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const promise = searchIcons("home", "mdi", controller.signal);
    controller.abort();
    await expect(promise).rejects.not.toBeInstanceOf(IconsError);
  });

  it("serves repeat searches from cache", async () => {
    fetchMock.mockResolvedValueOnce(jsonRpc(searchPayload("mdi", ["home"])));
    await searchIcons("home", "mdi");
    await searchIcons("HOME ", "mdi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getIconSvgs", () => {
  const svgFor = (id: string) => `<svg data-id="${id}"/>`;

  it("batch-fetches in chunks of 20, maps by legacyId, skips errors", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const ids: string[] = JSON.parse(init.body).params.arguments.icon_ids;
      return jsonRpc({
        icons: ids
          .filter((id) => id !== "mdi-missing")
          .map((id) => ({ id: `short:${id}`, legacyId: id, svg: svgFor(id) })),
        errors: ids
          .filter((id) => id === "mdi-missing")
          .map((id) => ({ id, error: "Not found" })),
      });
    });

    const ids = [
      ...Array.from({ length: 24 }, (_, i) => `mdi-icon-${i}`),
      "mdi-missing",
    ];
    const svgs = await getIconSvgs(ids);

    const batches = bodies().map((b) => b.params.arguments.icon_ids);
    expect(bodies().every((b) => b.params.name === "get_icons")).toBe(true);
    expect(batches.map((b: string[]) => b.length)).toEqual([20, 5]);
    expect(svgs.size).toBe(24);
    expect(svgs.get("mdi-icon-3")).toBe(svgFor("mdi-icon-3"));
    expect(svgs.has("mdi-missing")).toBe(false);
  });

  it("only fetches ids not already cached", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const ids: string[] = JSON.parse(init.body).params.arguments.icon_ids;
      return jsonRpc({
        icons: ids.map((id) => ({ legacyId: id, svg: svgFor(id) })),
        errors: [],
      });
    });

    await getIconSvgs(["mdi-a"]);
    const svgs = await getIconSvgs(["mdi-a", "mdi-b"]);

    expect(bodies()[1].params.arguments.icon_ids).toEqual(["mdi-b"]);
    expect([...svgs.keys()]).toEqual(["mdi-a", "mdi-b"]);
  });
});
