import { Excalidraw } from "@excalidraw/excalidraw";
import { base64ToString } from "@excalidraw/excalidraw/data/encode";
import { Keyboard } from "@excalidraw/excalidraw/tests/helpers/ui";
import { act, render } from "@excalidraw/excalidraw/tests/test-utils";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { InvalidSvgError } from "../icons/iconSvg";
import { insertIcon } from "../icons/insertIcon";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor"><path d="M0 0h1"/></svg>`;

describe("insertIcon", () => {
  const { h } = window;
  let api: ExcalidrawImperativeAPI;

  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        onExcalidrawAPI={(excalidrawAPI) => {
          if (excalidrawAPI) {
            api = excalidrawAPI;
          }
        }}
      />,
    );
  });

  it("adds a selected, tinted SVG image at the viewport center", () => {
    act(() => {
      api.updateScene({
        appState: { currentItemStrokeColor: "#e03131" },
      });
    });

    let element!: ReturnType<typeof insertIcon>;
    act(() => {
      element = insertIcon(api, "lucide-icons-database", SVG);
    });

    expect(h.elements).toHaveLength(1);
    expect(h.elements[0]).toMatchObject({
      id: element.id,
      type: "image",
      status: "saved",
      width: 64,
      height: 64,
    });
    expect(h.state.selectedElementIds).toEqual({ [element.id]: true });

    const { scrollX, scrollY, width, height, zoom } = h.state;
    expect(element.x + 32).toBeCloseTo(-scrollX + width / 2 / zoom.value);
    expect(element.y + 32).toBeCloseTo(-scrollY + height / 2 / zoom.value);

    const file = h.app.files[element.fileId!];
    expect(file.mimeType).toBe("image/svg+xml");
    const svg = base64ToString(file.dataURL.split(",")[1]);
    expect(svg).toContain('stroke="#e03131"');
  });

  it("reuses one file for repeat inserts", () => {
    act(() => {
      insertIcon(api, "lucide-icons-database", SVG);
      insertIcon(api, "lucide-icons-database", SVG);
    });
    expect(h.elements).toHaveLength(2);
    expect(h.elements[0].id).not.toBe(h.elements[1].id);
    expect((h.elements[0] as any).fileId).toBe((h.elements[1] as any).fileId);
    expect(Object.keys(h.app.files)).toHaveLength(1);
  });

  it("is undoable", () => {
    act(() => {
      insertIcon(api, "lucide-icons-database", SVG);
    });
    Keyboard.undo();
    expect(h.elements.filter((el) => !el.isDeleted)).toHaveLength(0);
  });

  it("adds nothing for malformed SVG", () => {
    expect(() => insertIcon(api, "x", "<svg><path></svg")).toThrow(
      InvalidSvgError,
    );
    expect(h.elements).toHaveLength(0);
    expect(Object.keys(h.app.files)).toHaveLength(0);
  });
});
