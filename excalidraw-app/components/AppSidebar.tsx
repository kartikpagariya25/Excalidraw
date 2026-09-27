import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { ImageIcon } from "@excalidraw/excalidraw/components/icons";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { IconsTab } from "./IconsTab";

export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab="icons"
          title="Icons"
          style={{ opacity: openSidebar?.tab === "icons" ? 1 : 0.4 }}
        >
          {ImageIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab="icons">
        <IconsTab />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
