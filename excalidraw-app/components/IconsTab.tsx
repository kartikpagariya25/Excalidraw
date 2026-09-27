import { useEffect, useMemo, useState } from "react";

import { THEME, useExcalidrawAPI } from "@excalidraw/excalidraw";
import Spinner from "@excalidraw/excalidraw/components/Spinner";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { ICON_SETS, getIconSetLabel } from "../icons/iconSets";
import { getIconSvgs, searchIcons } from "../icons/iconsClient";
import { prepareIconSvg, svgToDataURL } from "../icons/iconSvg";
import { insertIcon } from "../icons/insertIcon";

import "./IconsTab.scss";

import type { IconSetId } from "../icons/iconSets";
import type { IconResult } from "../icons/iconsClient";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const PREVIEW_SIZE = 28;

type Status = "idle" | "loading" | "results" | "empty" | "error";

const toPreviewURL = (svg: string, color: string) => {
  try {
    return svgToDataURL(prepareIconSvg(svg, color, PREVIEW_SIZE));
  } catch {
    return null;
  }
};

export const IconsTab = () => {
  const api = useExcalidrawAPI();
  const { theme } = useUIAppState();

  const [query, setQuery] = useState("");
  const [setId, setSetId] = useState<IconSetId | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<IconResult[]>([]);
  const [svgs, setSvgs] = useState<Map<string, string>>(new Map());
  const [retryToken, setRetryToken] = useState(0);
  const [insertingId, setInsertingId] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setStatus("idle");
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const found = await searchIcons(trimmed, setId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setSvgs(new Map());
        setResults(found);
        setStatus(found.length ? "results" : "empty");
        if (!found.length) {
          return;
        }

        const previews = await getIconSvgs(
          found.map((result) => result.iconId),
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        // hide icons the server couldn't provide or that aren't valid SVG
        const visible = found.filter((result) => {
          const svg = previews.get(result.iconId);
          return !!svg && toPreviewURL(svg, "#000") !== null;
        });
        setSvgs(previews);
        setResults(visible);
        setStatus(visible.length ? "results" : "empty");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, setId, retryToken]);

  // previews are drawn in <img>, which doesn't inherit `color`
  const previewColor = theme === THEME.DARK ? "#ced4da" : "#1e1e1e";
  const previewURLs = useMemo(() => {
    const urls = new Map<string, string | null>();
    for (const [iconId, svg] of svgs) {
      urls.set(iconId, toPreviewURL(svg, previewColor));
    }
    return urls;
  }, [svgs, previewColor]);

  const onIconClick = async (result: IconResult) => {
    if (!api || insertingId) {
      return;
    }
    setInsertingId(result.iconId);
    try {
      const svg = (await getIconSvgs([result.iconId])).get(result.iconId);
      if (!svg) {
        throw new Error("missing svg");
      }
      insertIcon(api, result.iconId, svg);
    } catch {
      api.setToast({ message: "Couldn't load that icon.", closable: true });
    } finally {
      setInsertingId(null);
    }
  };

  return (
    <div className="icons-tab">
      <div className="icons-tab__controls">
        <input
          className="icons-tab__search"
          type="search"
          placeholder="Search icons"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="icons-tab__set"
          aria-label="Icon set"
          value={setId ?? ""}
          onChange={(event) =>
            setSetId((event.target.value || null) as IconSetId | null)
          }
        >
          <option value="">All sets</option>
          {ICON_SETS.map((iconSet) => (
            <option key={iconSet.id} value={iconSet.id}>
              {iconSet.label}
            </option>
          ))}
        </select>
      </div>

      {status === "idle" && (
        <p className="icons-tab__message">
          Search for an icon, e.g. “database”
        </p>
      )}
      {status === "loading" && (
        <div className="icons-tab__message">
          <Spinner />
        </div>
      )}
      {status === "empty" && (
        <p className="icons-tab__message">No icons found</p>
      )}
      {status === "error" && (
        <div className="icons-tab__message">
          <p>Couldn't reach the icons server.</p>
          <button
            type="button"
            className="icons-tab__retry"
            onClick={() => setRetryToken((token) => token + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {status === "results" && (
        <div className="icons-tab__grid">
          {results.map((result) => {
            const previewURL = previewURLs.get(result.iconId);
            const label = `${result.name} (${getIconSetLabel(result.set)})`;
            return (
              <button
                key={result.iconId}
                type="button"
                className="icons-tab__icon"
                title={label}
                aria-label={label}
                aria-busy={insertingId === result.iconId}
                disabled={insertingId !== null}
                onClick={() => onIconClick(result)}
              >
                {previewURL ? (
                  <img src={previewURL} alt="" draggable={false} />
                ) : (
                  <span className="icons-tab__placeholder" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
