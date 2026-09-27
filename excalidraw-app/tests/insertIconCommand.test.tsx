import { Excalidraw } from "@excalidraw/excalidraw";
import { CommandPalette } from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { AppSidebar } from "../components/AppSidebar";
import { getInsertIconCommand } from "../icons/insertIconCommand";

const PALETTE_PLACEHOLDER = "Search menus, commands, and discover hidden gems";

const renderWithPalette = async (props: { viewModeEnabled?: boolean } = {}) => {
  let api: ExcalidrawImperativeAPI | null = null;
  const Harness = () => {
    return (
      <Excalidraw
        {...props}
        onExcalidrawAPI={(excalidrawAPI) => {
          api = excalidrawAPI;
        }}
      >
        <CommandPalette
          customCommandPaletteItems={[getInsertIconCommand(() => api)]}
        />
        <AppSidebar />
      </Excalidraw>
    );
  };
  await render(<Harness />);
  act(() => {
    window.h.setState({ openDialog: { name: "commandPalette" } });
  });
};

const searchPalette = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText(PALETTE_PLACEHOLDER), {
    target: { value },
  });

describe("Insert icon command", () => {
  it("opens the Icons tab with the search box focused", async () => {
    await renderWithPalette();

    searchPalette("icon");
    await screen.findByText("Insert icon…");
    fireEvent.keyDown(screen.getByPlaceholderText(PALETTE_PLACEHOLDER), {
      key: "Enter",
    });

    await waitFor(() =>
      expect(window.h.state.openSidebar).toEqual({
        name: "default",
        tab: "icons",
      }),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText("Search icons"),
      ),
    );
  });

  it("focuses the search box when the Icons tab is already open", async () => {
    await renderWithPalette();
    act(() => {
      window.h.app.toggleSidebar({ name: "default", tab: "icons" });
    });
    act(() => {
      window.h.setState({ openDialog: { name: "commandPalette" } });
    });
    (document.activeElement as HTMLElement | null)?.blur();

    searchPalette("icon");
    await screen.findByText("Insert icon…");
    fireEvent.keyDown(screen.getByPlaceholderText(PALETTE_PLACEHOLDER), {
      key: "Enter",
    });

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText("Search icons"),
      ),
    );
  });

  it("is matched by related keywords", async () => {
    await renderWithPalette();
    searchPalette("lucide");
    expect(await screen.findByText("Insert icon…")).not.toBeNull();
  });

  it("is hidden in view mode", async () => {
    await renderWithPalette({ viewModeEnabled: true });
    searchPalette("icon");
    await screen.findByText("No matching commands...");
    expect(screen.queryByText("Insert icon…")).toBeNull();
  });
});
