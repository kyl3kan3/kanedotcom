export const NEXT_ADVENTURE_ROUND_SLUG = "next-adventure";

export const NEXT_ADVENTURE_OPTIONS = [
  { slug: "lake-michigan", place: "Lake Michigan", emoji: "⛵" },
  { slug: "smoky-mountains", place: "Smoky Mountains", emoji: "⛰️" },
  { slug: "backyard-campout", place: "Backyard campout", emoji: "⛺" },
] as const;

export type NextAdventureOptionSlug =
  (typeof NEXT_ADVENTURE_OPTIONS)[number]["slug"];

export function isNextAdventureOptionSlug(
  value: string,
): value is NextAdventureOptionSlug {
  return NEXT_ADVENTURE_OPTIONS.some((option) => option.slug === value);
}
