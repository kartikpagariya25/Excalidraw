import { ICON_SETS, isAllowedIconSet } from "./iconSets";

import type { IconSetId } from "./iconSets";

export type IconResult = {
  /** long id form, e.g. `heroicons-home` — the short `set:name` form is unreliable */
  iconId: string;
  name: string;
  set: IconSetId;
};

export class IconsError extends Error {}

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESULTS = 60;
const PER_SET_LIMIT_FOR_ALL = 12;
const GET_ICONS_BATCH_SIZE = 20;

const searchCache = new Map<string, IconResult[]>();
const svgCache = new Map<string, string>();

let requestId = 0;

export const clearIconsCache = () => {
  searchCache.clear();
  svgCache.clear();
};

const parseToolPayload = async (response: Response): Promise<any> => {
  const body = await response.text();
  try {
    const isEventStream = (response.headers.get("content-type") || "").includes(
      "text/event-stream",
    );
    const json = isEventStream
      ? body
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .pop()
      : body;
    const envelope = JSON.parse(json!);
    if (envelope.error || envelope.result?.isError) {
      throw new IconsError("Icons server returned an error");
    }
    // the server double-encodes the tool payload as a JSON string
    return JSON.parse(envelope.result.content[0].text);
  } catch (error) {
    if (error instanceof IconsError) {
      throw error;
    }
    throw new IconsError("Unexpected response from the icons server");
  }
};

const callTool = async (
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<any> => {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  if (signal?.aborted) {
    controller.abort();
  }

  try {
    const response = await fetch(import.meta.env.VITE_APP_ICONS_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new IconsError(`Icons server responded with ${response.status}`);
    }
    return await parseToolPayload(response);
  } catch (error) {
    if (signal?.aborted || error instanceof IconsError) {
      throw error;
    }
    throw new IconsError(
      timedOut ? "Icons server timed out" : "Couldn't reach the icons server",
    );
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
};

const searchSet = async (
  query: string,
  setId: IconSetId,
  limit: number,
  signal?: AbortSignal,
): Promise<IconResult[]> => {
  const payload = await callTool(
    "search_icons",
    { query, set: setId, limit },
    signal,
  );
  const results: any[] = Array.isArray(payload?.results) ? payload.results : [];
  const icons: IconResult[] = [];
  for (const result of results) {
    if (typeof result?.iconId !== "string" || !isAllowedIconSet(result.set)) {
      continue;
    }
    icons.push({
      iconId: result.iconId,
      name: typeof result.name === "string" ? result.name : result.iconId,
      set: result.set,
    });
    if (typeof result.svg === "string") {
      svgCache.set(result.iconId, result.svg);
    }
  }
  return icons;
};

const interleave = <T>(lists: T[][]): T[] => {
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
      }
    }
  }
  return out;
};

export const searchIcons = async (
  query: string,
  setId: IconSetId | null,
  signal?: AbortSignal,
): Promise<IconResult[]> => {
  const normalized = query.trim().toLowerCase();
  const cacheKey = `${setId ?? "all"}|${normalized}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let results: IconResult[];
  let isPartial = false;
  if (setId) {
    results = await searchSet(normalized, setId, MAX_RESULTS, signal);
  } else {
    const settled = await Promise.allSettled(
      ICON_SETS.map((iconSet) =>
        searchSet(normalized, iconSet.id, PER_SET_LIMIT_FOR_ALL, signal),
      ),
    );
    if (signal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    const fulfilled = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (!fulfilled.length) {
      throw new IconsError("Couldn't reach the icons server");
    }
    results = interleave(fulfilled);
    isPartial = fulfilled.length < settled.length;
  }

  results = results.slice(0, MAX_RESULTS);
  // partial results would hide the failed sets for the rest of the session
  if (!isPartial) {
    searchCache.set(cacheKey, results);
  }
  return results;
};

export const getIconSvgs = async (
  iconIds: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, string>> => {
  const missing = iconIds.filter((iconId) => !svgCache.has(iconId));
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += GET_ICONS_BATCH_SIZE) {
    batches.push(missing.slice(i, i + GET_ICONS_BATCH_SIZE));
  }

  const settled = await Promise.allSettled(
    batches.map(async (batch) => {
      const payload = await callTool("get_icons", { icon_ids: batch }, signal);
      for (const icon of Array.isArray(payload?.icons) ? payload.icons : []) {
        if (
          typeof icon?.legacyId === "string" &&
          typeof icon.svg === "string"
        ) {
          svgCache.set(icon.legacyId, icon.svg);
        }
      }
    }),
  );
  if (signal?.aborted) {
    throw new DOMException("aborted", "AbortError");
  }
  // one failed batch only drops its icons; fail only if nothing came back
  const firstRejection = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (
    firstRejection &&
    settled.every((result) => result.status === "rejected")
  ) {
    throw firstRejection.reason;
  }

  const svgs = new Map<string, string>();
  for (const iconId of iconIds) {
    const svg = svgCache.get(iconId);
    if (svg) {
      svgs.set(iconId, svg);
    }
  }
  return svgs;
};
