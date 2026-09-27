import { stringToBase64 } from "@excalidraw/excalidraw/data/encode";

import type { DataURL } from "@excalidraw/excalidraw/types";

export const DEFAULT_ICON_SIZE = 64;

const FALLBACK_COLOR = "#1e1e1e";
const DEFAULT_VIEWBOX_SIZE = 24;
const SVG_NS = "http://www.w3.org/2000/svg";

export class InvalidSvgError extends Error {}

const parseSize = (value: string | null) =>
  value && /^\d+(\.\d+)?(px)?$/.test(value.trim())
    ? parseFloat(value)
    : DEFAULT_VIEWBOX_SIZE;

/**
 * Tints `currentColor` with `color` and gives the root a fixed pixel size so
 * the icon renders consistently as an image element.
 */
export const prepareIconSvg = (
  svg: string,
  color: string,
  size = DEFAULT_ICON_SIZE,
): string => {
  const withNamespace = /<svg\b[^>]*\sxmlns=/.test(svg)
    ? svg
    : svg.replace(/<svg\b/, `<svg xmlns="${SVG_NS}"`);

  const doc = new DOMParser().parseFromString(withNamespace, "image/svg+xml");
  const root = doc.documentElement;
  if (
    doc.getElementsByTagName("parsererror").length ||
    root.localName !== "svg"
  ) {
    throw new InvalidSvgError("Invalid SVG");
  }

  if (!root.hasAttribute("viewBox")) {
    const width = parseSize(root.getAttribute("width"));
    const height = parseSize(root.getAttribute("height"));
    root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  root.setAttribute("width", String(size));
  root.setAttribute("height", String(size));

  const tint = !color || color === "transparent" ? FALLBACK_COLOR : color;
  return new XMLSerializer()
    .serializeToString(doc)
    .replace(/currentColor/gi, tint);
};

export const svgToDataURL = (svg: string) =>
  `data:image/svg+xml;base64,${stringToBase64(svg)}` as DataURL;
