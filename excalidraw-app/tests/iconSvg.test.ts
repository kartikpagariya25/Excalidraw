import { base64ToString } from "@excalidraw/excalidraw/data/encode";

import {
  ICON_SETS,
  getIconSetLabel,
  isAllowedIconSet,
} from "../icons/iconSets";
import {
  InvalidSvgError,
  prepareIconSvg,
  svgToDataURL,
} from "../icons/iconSvg";

const parse = (svg: string) =>
  new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;

const LUCIDE_DB = `<svg
xmlns="http://www.w3.org/2000/svg"
width="24"
height="24"
viewBox="0 0 24 24"
fill="none"
stroke="currentColor"
stroke-width="2"
><ellipse cx="12" cy="5" rx="9" ry="3" /></svg>`;

describe("iconSets", () => {
  it("allows exactly the five licensed sets", () => {
    expect(ICON_SETS.map((s) => s.id)).toEqual([
      "lucide-icons",
      "tabler-icons",
      "ph",
      "heroicons",
      "mdi",
    ]);
    expect(isAllowedIconSet("lucide-icons")).toBe(true);
    expect(isAllowedIconSet("fluent-emoji")).toBe(false);
    expect(isAllowedIconSet(undefined)).toBe(false);
    expect(getIconSetLabel("ph")).toBe("Phosphor");
  });
});

describe("prepareIconSvg", () => {
  it("tints currentColor and sets size", () => {
    const out = prepareIconSvg(LUCIDE_DB, "#e03131", 64);
    const root = parse(out);
    expect(root.getAttribute("stroke")).toBe("#e03131");
    expect(root.getAttribute("width")).toBe("64");
    expect(root.getAttribute("height")).toBe("64");
    expect(root.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(out).not.toMatch(/currentColor/i);
  });

  it("tints currentColor case-insensitively, including style", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path style="fill: CurrentColor" stroke="currentcolor" d="M0 0h1"/></svg>`;
    const out = prepareIconSvg(svg, "#2f9e44");
    expect(out).not.toMatch(/currentcolor/i);
    expect(out).toContain('style="fill: #2f9e44"');
    expect(out).toContain('stroke="#2f9e44"');
  });

  it("falls back when color is transparent or empty", () => {
    expect(prepareIconSvg(LUCIDE_DB, "transparent")).toContain(
      'stroke="#1e1e1e"',
    );
    expect(prepareIconSvg(LUCIDE_DB, "")).toContain('stroke="#1e1e1e"');
  });

  it("leaves hardcoded colors alone", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#ff0000" d="M0 0h1"/></svg>`;
    expect(prepareIconSvg(svg, "#2f9e44")).toContain('fill="#ff0000"');
  });

  it("derives a missing viewBox from unitless width/height", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path d="M0 0h1"/></svg>`;
    expect(parse(prepareIconSvg(svg, "#000")).getAttribute("viewBox")).toBe(
      "0 0 256 256",
    );
  });

  it("uses 0 0 24 24 when width/height are missing or have units", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em"><path d="M0 0h1"/></svg>`;
    expect(parse(prepareIconSvg(svg, "#000")).getAttribute("viewBox")).toBe(
      "0 0 24 24",
    );
  });

  it("adds a missing xmlns", () => {
    const svg = `<svg viewBox="0 0 24 24"><path d="M0 0h1"/></svg>`;
    expect(prepareIconSvg(svg, "#000")).toContain(
      'xmlns="http://www.w3.org/2000/svg"',
    );
  });

  it("throws InvalidSvgError on malformed input", () => {
    expect(() => prepareIconSvg("<svg><path></svg", "#000")).toThrow(
      InvalidSvgError,
    );
    expect(() => prepareIconSvg("<div></div>", "#000")).toThrow(
      InvalidSvgError,
    );
  });
});

describe("svgToDataURL", () => {
  it("round-trips non-ASCII content", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><title>café ✓</title></svg>`;
    const url = svgToDataURL(svg);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(base64ToString(url.split(",")[1])).toBe(svg);
  });
});
