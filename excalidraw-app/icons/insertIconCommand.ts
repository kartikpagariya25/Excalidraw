import { DEFAULT_CATEGORIES } from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ImageIcon } from "@excalidraw/excalidraw/components/icons";

import type { CommandPaletteItem } from "@excalidraw/excalidraw/components/CommandPalette/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** Command palette entry that opens the sidebar's Icons tab. */
export const getInsertIconCommand = (
  getAPI: () => ExcalidrawImperativeAPI | null,
): CommandPaletteItem => ({
  label: "Insert icon…",
  category: DEFAULT_CATEGORIES.app,
  icon: ImageIcon,
  viewMode: false,
  keywords: [
    "icons",
    "svg",
    "symbol",
    "lucide",
    "tabler",
    "phosphor",
    "heroicons",
    "material",
  ],
  perform: () => {
    getAPI()?.toggleSidebar({ name: "default", tab: "icons", force: true });
    // the tab only autofocuses on mount, so focus it explicitly in case it
    // was already open (the docked sidebar is restored between sessions)
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(".icons-tab__search")?.focus();
    });
  },
});
