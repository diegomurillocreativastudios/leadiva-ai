import { sourceTypes, type SourceType } from "@/server/db/schema/enums";

export const sourceGroupIds = [
  "ALL",
  "PUBLIC",
  "PRIVATE",
  "MANUAL",
] as const;

export type SourceGroupId = (typeof sourceGroupIds)[number];

export const sourceGroupLabels: Record<SourceGroupId, string> = {
  ALL: "Todas",
  PUBLIC: "Sector público",
  PRIVATE: "Sector privado",
  MANUAL: "Manuales",
};

const SOURCE_GROUP_MAP: Record<
  Exclude<SourceGroupId, "ALL">,
  readonly SourceType[]
> = {
  PUBLIC: ["COMPRASAL"],
  PRIVATE: ["PRIVATE_WEB", "LINKEDIN"],
  MANUAL: ["MANUAL"],
};

export function sourceTypesForGroup(group: SourceGroupId): SourceType[] {
  if (group === "ALL") {
    return [];
  }
  return [...SOURCE_GROUP_MAP[group]];
}

export function detectSourceGroup(
  selected: readonly string[],
): SourceGroupId | null {
  if (selected.length === 0) {
    return "ALL";
  }

  const set = new Set(selected);
  for (const group of ["PUBLIC", "PRIVATE", "MANUAL"] as const) {
    const members = SOURCE_GROUP_MAP[group];
    if (
      members.length === selected.length &&
      members.every((item) => set.has(item))
    ) {
      return group;
    }
  }

  return null;
}

export function isSourceType(value: string): value is SourceType {
  return (sourceTypes as readonly string[]).includes(value);
}
