import { Excalidraw } from "@excalidraw/excalidraw";
import { base64ToString } from "@excalidraw/excalidraw/data/encode";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import { AppSidebar } from "../components/AppSidebar";
import * as iconsClient from "../icons/iconsClient";

import type { IconResult } from "../icons/iconsClient";

vi.mock("../icons/iconsClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../icons/iconsClient")>();
  return { ...actual, searchIcons: vi.fn(), getIconSvgs: vi.fn() };
});

const searchIcons = vi.mocked(iconsClient.searchIcons);
const getIconSvgs = vi.mocked(iconsClient.getIconSvgs);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M0 0h1"/></svg>`;
const icon = (name: string): IconResult => ({
  iconId: `lucide-icons-${name}`,
  name,
  set: "lucide-icons",
});

const openIconsTab = async () => {
  await render(
    <Excalidraw>
      <AppSidebar />
    </Excalidraw>,
  );
  act(() => {
    window.h.app.toggleSidebar({ name: "default", tab: "icons" });
  });
};

const typeQuery = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("Search icons"), {
    target: { value },
  });

describe("IconsTab", () => {
  const { h } = window;

  beforeEach(() => {
    searchIcons.mockReset();
    getIconSvgs.mockReset();
    getIconSvgs.mockImplementation(
      async (ids) => new Map(ids.map((id) => [id, SVG])),
    );
  });

  it("shows the idle hint before typing", async () => {
    await openIconsTab();
    expect(screen.getByText(/Search for an icon/)).not.toBeNull();
    expect(searchIcons).not.toHaveBeenCalled();
  });

  it("searches and inserts the clicked icon in the stroke color", async () => {
    searchIcons.mockResolvedValue([icon("database")]);
    await openIconsTab();

    typeQuery("database");
    const button = await screen.findByRole("button", {
      name: "database (Lucide)",
    });
    expect(searchIcons).toHaveBeenCalledWith(
      "database",
      null,
      expect.any(AbortSignal),
    );

    fireEvent.click(button);
    await waitFor(() => expect(h.elements).toHaveLength(1));

    const element = h.elements[0] as any;
    expect(element.type).toBe("image");
    const file = h.app.files[element.fileId];
    expect(base64ToString(file.dataURL.split(",")[1])).toContain(
      `stroke="${h.state.currentItemStrokeColor}"`,
    );
  });

  it("passes the selected set to the search", async () => {
    searchIcons.mockResolvedValue([icon("house")]);
    await openIconsTab();

    fireEvent.change(screen.getByLabelText("Icon set"), {
      target: { value: "ph" },
    });
    typeQuery("house");

    await waitFor(() =>
      expect(searchIcons).toHaveBeenCalledWith(
        "house",
        "ph",
        expect.any(AbortSignal),
      ),
    );
  });

  it("shows an empty state", async () => {
    searchIcons.mockResolvedValue([]);
    await openIconsTab();
    typeQuery("zzzz");
    expect(await screen.findByText("No icons found")).not.toBeNull();
  });

  it("icons without SVG are hidden", async () => {
    searchIcons.mockResolvedValue([icon("a"), icon("b")]);
    getIconSvgs.mockResolvedValue(new Map([["lucide-icons-a", SVG]]));
    await openIconsTab();
    typeQuery("letters");

    await screen.findByRole("button", { name: "a (Lucide)" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "b (Lucide)" })).toBeNull(),
    );
  });

  it("hides icons whose SVG can't be parsed", async () => {
    searchIcons.mockResolvedValue([icon("a"), icon("b")]);
    getIconSvgs.mockResolvedValue(
      new Map([
        ["lucide-icons-a", SVG],
        ["lucide-icons-b", "<svg"],
      ]),
    );
    await openIconsTab();
    typeQuery("letters");

    await screen.findByRole("button", { name: "a (Lucide)" });
    expect(screen.queryByRole("button", { name: "b (Lucide)" })).toBeNull();
  });

  it("shows an error with retry that re-queries", async () => {
    searchIcons.mockRejectedValueOnce(new iconsClient.IconsError("down"));
    searchIcons.mockResolvedValueOnce([icon("database")]);
    await openIconsTab();

    typeQuery("database");
    const retry = await screen.findByRole("button", { name: "Retry" });
    expect(screen.getByText("Couldn't reach the icons server.")).not.toBeNull();

    fireEvent.click(retry);
    await screen.findByRole("button", { name: "database (Lucide)" });
    expect(searchIcons).toHaveBeenCalledTimes(2);
  });

  it("stale search results are discarded", async () => {
    let resolveFirst!: (results: IconResult[]) => void;
    searchIcons.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    searchIcons.mockResolvedValueOnce([icon("database")]);
    await openIconsTab();

    typeQuery("data");
    await waitFor(() => expect(searchIcons).toHaveBeenCalledTimes(1));
    typeQuery("database");
    await screen.findByRole("button", { name: "database (Lucide)" });

    await act(async () => resolveFirst([icon("stale")]));
    expect(screen.queryByRole("button", { name: "stale (Lucide)" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "database (Lucide)" }),
    ).not.toBeNull();
  });

  it("toasts and inserts nothing when the icon SVG can't be loaded", async () => {
    searchIcons.mockResolvedValue([icon("database")]);
    getIconSvgs
      .mockResolvedValueOnce(new Map([["lucide-icons-database", SVG]]))
      .mockResolvedValueOnce(new Map([["lucide-icons-database", "<svg"]]));
    await openIconsTab();
    typeQuery("database");

    const button = await screen.findByRole("button", {
      name: "database (Lucide)",
    });
    // the click's own getIconSvgs call returns a malformed SVG
    fireEvent.click(button);
    await waitFor(() => expect(h.state.toast).not.toBeNull());
    expect(h.state.toast?.message).toBe("Couldn't load that icon.");
    expect(h.elements).toHaveLength(0);
  });
});
