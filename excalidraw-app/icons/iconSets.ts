export type IconSetId =
  | "lucide-icons"
  | "tabler-icons"
  | "ph"
  | "heroicons"
  | "mdi";

// only sets whose licenses allow use in a hosted product
export const ICON_SETS: readonly { id: IconSetId; label: string }[] = [
  { id: "lucide-icons", label: "Lucide" }, // ISC
  { id: "tabler-icons", label: "Tabler" }, // MIT
  { id: "ph", label: "Phosphor" }, // MIT
  { id: "heroicons", label: "Heroicons" }, // MIT
  { id: "mdi", label: "Material Design Icons" }, // Apache-2.0
];

export const isAllowedIconSet = (set: unknown): set is IconSetId =>
  ICON_SETS.some((iconSet) => iconSet.id === set);

export const getIconSetLabel = (set: IconSetId) =>
  ICON_SETS.find((iconSet) => iconSet.id === set)?.label ?? set;
