/** Shared arg normalization for the tool registration layer. */

/** Normalize an ignoreSelector arg (string | string[] | undefined) to string[]. */
export function toSelectorList(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
