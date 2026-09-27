# Icons Tab — Design

Date: 2026-09-27
Status: Approved in chat, pending spec review
Scope: Sub-project 1 of 4 (icons tab → AI diagram icons → command palette entry → tooling upgrades)

## Goal

In our self-hosted Excalidraw (used by the owner plus a team, deployed at our own URL), a user opens the sidebar, searches for an icon (e.g. "database"), clicks a result, and the icon appears on the canvas as an image tinted with the current stroke color.

Success criteria:

- Search → click → icon on canvas, selected, in the viewport center, tinted with `appState.currentItemStrokeColor`.
- Undo/redo removes/restores the inserted icon like any other element.
- If the icons server is slow or down, only the Icons tab shows an error with a retry button; the rest of the editor is unaffected.
- Only icon sets whose licenses allow use in a hosted product are exposed.

## Constraints

- **No changes to `packages/excalidraw`.** Everything lives in `excalidraw-app/` and uses only the public `ExcalidrawImperativeAPI` (`addFiles`, `updateScene`, `getAppState`, `scrollToContent`). This keeps merges from upstream Excalidraw cheap.
- Icons source: the Aria Icons MCP server at `https://icons.leularia.com/api/mcp` (verified: no auth, `Access-Control-Allow-Origin: *`, stateless JSON-RPC over HTTP POST).
- Endpoint configurable via `VITE_APP_ICONS_MCP_URL` (added to `.env.development`, `.env.production`, and `excalidraw-app/vite-env.d.ts`).

## Icon set allowlist

A single exported constant `ICON_SETS` in `excalidraw-app/icons/iconSets.ts`:

| Set id (server)  | Label                 | License    |
| ---------------- | --------------------- | ---------- |
| `lucide-icons`   | Lucide                | ISC        |
| `tabler-icons`   | Tabler                | MIT        |
| `ph`             | Phosphor              | MIT        |
| `heroicons`      | Heroicons             | MIT        |
| `mdi`            | Material Design Icons | Apache-2.0 |

- Set filter "All": five parallel `search_icons` calls (one per allowed set, `limit: 12`), results interleaved round-robin (up to 60). A single unfiltered search is not used: measured on 2026-09-27, 200 unfiltered results for "arrow" contained only 4 from allowed sets. If some set searches fail, the others are shown; only if all fail is it an error.
- Specific set selected: `search_icons` with `set: <id>`, `limit: 60`.
- Any result whose `set` is not in the allowlist is dropped client-side.

## Server quirks (verified 2026-09-27)

- `search_icons` returns SVG previews only for the first ~8 results even with `include_svg: true`, so previews are batch-fetched with `get_icons` (max 20 ids per call).
- The short id form is unreliable: `heroicons:home` resolves to `house` and fails. The long form returned as `iconId` in search results (e.g. `heroicons-home`, `lucide-icons-database`) works for all five sets with both `get_icons` and `get_icon_svg`. **All fetches use the long `iconId`**; `get_icons` results map back via their `legacyId` field.
- `get_icons` returns `{ icons: [{ id, legacyId, set, name, svg }], errors: [{ id, error }] }`; missing icons appear in `errors`, not as a failed call.

## Architecture

```
excalidraw-app/
  icons/
    iconSets.ts        allowlist constant + types
    iconsClient.ts     MCP JSON-RPC client (search, getSvg), cache, timeout, abort
    iconSvg.ts         pure SVG transforms: tint + size
    insertIcon.ts      build image element, addFiles + updateScene
  components/
    IconsTab.tsx       sidebar tab UI
    IconsTab.scss
    AppSidebar.tsx     (modified) adds Icons tab, removes Excalidraw+ promo tabs
  tests/
    iconsClient.test.ts
    iconSvg.test.ts
    IconsTab.test.tsx
```

### `iconsClient.ts`

- `callTool(name, args, signal)`: POSTs `{"jsonrpc":"2.0","id":<n>,"method":"tools/call","params":{name, arguments}}` with headers `Content-Type: application/json` and `Accept: application/json, text/event-stream`.
- Response parsing:
  - `application/json`: read `result.content[0].text` and `JSON.parse` it (the server double-encodes the payload as a JSON string).
  - `text/event-stream`: take the last `data:` line, parse it as the JSON-RPC envelope, then as above.
  - JSON-RPC `error`, `result.isError === true`, non-2xx status, or unparsable body → throw `IconsError` with a user-safe message.
- `searchIcons(query, setId | null, signal): Promise<IconResult[]>` where `IconResult = { iconId: string; name: string; set: IconSetId }` (`iconId` is the long form, e.g. `lucide-icons-database`).
- `getIconSvgs(iconIds, signal): Promise<Map<string, string>>` → returns SVGs for the requested long ids, serving cached ones and batch-fetching the rest with `get_icons` in chunks of 20 (chunks in parallel). Ids the server reports in `errors` are simply absent from the map.
- 8 s timeout per request (via `AbortController` combined with the caller's signal).
- In-memory session caches: `Map<string, IconResult[]>` keyed by `${setId ?? "all"}|${query.trim().toLowerCase()}`, and `Map<string, string>` for SVGs keyed by long icon id. Search results that happen to include `svg` also populate the SVG cache.

### `iconSvg.ts` (pure, no DOM required beyond `DOMParser`)

- `prepareIconSvg(svg: string, color: string, size = 64): string`:
  - Replaces every `currentColor` (case-insensitive; attribute values and inline styles) with `color`. If `color` is empty or `"transparent"`, uses `#1e1e1e` instead so the icon is never invisible. (Dark mode needs no special handling: the renderer already inverts SVG images in dark theme, matching how stroke colors are inverted — `renderElement.ts`, `shouldInvertImage`.)
  - Sets root `width` and `height` to `size`; if the root has no `viewBox`, derives it from the original width/height (default `0 0 24 24`).
  - Ensures `xmlns="http://www.w3.org/2000/svg"` is present.
  - Hardcoded colors (e.g. brand logos) are left untouched.
- `svgToDataURL(svg: string): DataURL` → `data:image/svg+xml;base64,...` (UTF-8 safe).

### `insertIcon.ts`

- `insertIcon(api, iconId, rawSvg)` (`iconId` is the long form):
  1. `color = api.getAppState().currentItemStrokeColor`.
  2. `svg = prepareIconSvg(rawSvg, color)`; `dataURL = svgToDataURL(svg)`.
  3. `fileId` = `icon-${hashString(`${iconId}|${color}`)}` using `hashString` from `@excalidraw/element`, so repeat inserts share one file.
  4. `api.addFiles([{ id: fileId, dataURL, mimeType: "image/svg+xml", created: Date.now() }])`.
  5. Create the element with `newImageElement` from `@excalidraw/element` (`fileId`, `status: "pending"` — the app flips it to `"saved"` once the file is persisted (`Portal.queueFileUpload` / `LocalData`), so collaborators never fetch a not-yet-uploaded file, 64×64, positioned so its center is the viewport center computed from `scrollX/scrollY/zoom/width/height`).
  6. `api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), el], appState: { selectedElementIds: { [el.id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })` so it is undoable.

### `IconsTab.tsx`

- Search input (autofocus when the tab opens), 300 ms debounce; queries shorter than 2 chars show the idle hint.
- Set filter: a `<select>` with "All" + the allowlist labels.
- Each new query aborts the in-flight one.
- States: idle hint, loading (spinner), results grid (buttons with the SVG preview rendered via `<img src={dataURL}>` — never `dangerouslySetInnerHTML`), empty ("No icons found"), error (message + Retry button).
- After results arrive, previews are loaded with `getIconSvgs(allResultIds)`; buttons show a placeholder until their preview arrives, and results whose SVG the server can't provide are removed from the grid.
- Each grid button has `title`/`aria-label` = `"<name> (<set label>)"`; click → `getIconSvgs([iconId])` (a cache hit once previews loaded) → `insertIcon`. While inserting, the button shows a busy state; failures show a toast via `api.setToast`.
- Gets the API via `useExcalidrawAPI()` (exported from `@excalidraw/excalidraw`) and `useUIAppState()` for theme; styled with existing Excalidraw CSS variables so light/dark both work.

### `AppSidebar.tsx`

- Adds a `Sidebar.TabTrigger tab="icons"` (existing shapes icon from `components/icons`) and `Sidebar.Tab tab="icons"` rendering `<IconsTab />`.
- Removes the `comments` and `presentation` Excalidraw+ promo tabs and their now-unused promo copy component/styles.

## Error handling

| Failure                          | Behavior                                              |
| -------------------------------- | ----------------------------------------------------- |
| Network error / timeout / 5xx    | Tab error state: "Couldn't reach the icons server." + Retry |
| JSON-RPC or tool error           | Tab error state with the same message                 |
| Aborted (superseded query)       | Ignored silently                                      |
| SVG fetch fails on click         | Toast "Couldn't load that icon.", nothing inserted    |
| Malformed SVG (DOMParser error)  | Toast as above, nothing inserted                      |

## Testing

- `iconSvg.test.ts`: tints `currentColor` in attributes and `style`; sets width/height; adds missing viewBox; leaves hardcoded colors alone; data URL round-trips non-ASCII.
- `iconsClient.test.ts` (mocked `fetch`): JSON response parsing; SSE response parsing; JSON-RPC error; `isError` result; non-2xx; timeout; "All" fans out to five set searches and interleaves; partial set failure still returns results; allowlist filtering; `getIconSvgs` chunks by 20, maps back via `legacyId`, skips `errors`; cache hits avoid a second fetch.
- `IconsTab.test.tsx` (mocked client): type query → results render; click → scene contains a new image element with a file whose SVG contains the current stroke color; error state shows Retry and retry re-queries.
- Before committing: `yarn test:typecheck`, `yarn test:update`, `yarn fix`.

## Out of scope (later sub-projects)

- Drag-and-drop from the tab onto the canvas.
- Converting icons to native, editable Excalidraw shapes.
- Icons in AI text-to-diagram output (sub-project 2).
- Command palette "Insert icon…" (sub-project 3).
- Dependency/tooling upgrades (sub-project 4).
- Replacing excalidraw.com backends (share links, collab, AI) for deployment.
