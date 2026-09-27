import { MIME_TYPES } from "@excalidraw/common";
import { hashString, newImageElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";

import type { FileId } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { DEFAULT_ICON_SIZE, prepareIconSvg, svgToDataURL } from "./iconSvg";

/**
 * Adds the icon as a selected SVG image element centered in the viewport,
 * tinted with the current stroke color. Undoable.
 */
export const insertIcon = (
  api: ExcalidrawImperativeAPI,
  iconId: string,
  rawSvg: string,
  size = DEFAULT_ICON_SIZE,
) => {
  const appState = api.getAppState();
  const color = appState.currentItemStrokeColor;
  // throws before anything is added to the scene
  const svg = prepareIconSvg(rawSvg, color, size);

  // same icon + color → same file, so repeat inserts don't bloat the scene
  const fileId = `icon-${hashString(`${iconId}|${color}`)}` as FileId;
  api.addFiles([
    {
      id: fileId,
      dataURL: svgToDataURL(svg),
      mimeType: MIME_TYPES.svg,
      created: Date.now(),
    },
  ]);

  const { zoom, scrollX, scrollY, width, height } = appState;
  const element = newImageElement({
    type: "image",
    fileId,
    status: "saved",
    x: -scrollX + width / 2 / zoom.value - size / 2,
    y: -scrollY + height / 2 / zoom.value - size / 2,
    width: size,
    height: size,
  });

  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    appState: { selectedElementIds: { [element.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  return element;
};
