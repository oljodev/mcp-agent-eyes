/**
 * Set-of-mark types: a numbered, addressable interactive element painted onto a
 * screenshot so an agent can pick "[2]" visually and act on its exact selector.
 */

/** One numbered interactive element discovered by label_interactives. */
export interface InteractiveMark {
  /** 1-based badge number painted over the element. */
  n: number;
  /** Unique, addressable selector (anchored at the nearest stable id). */
  selector: string;
  /** Human-readable accessible name / label (best effort). */
  label: string;
  /** Lowercased tag (or role), e.g. "button", "a", "role=button". */
  tag: string;
  /** Viewport-relative geometry of the element, in CSS pixels. */
  rect: { x: number; y: number; width: number; height: number };
}

/** Raw payload returned by the in-page set-of-mark scanner. */
export interface InteractiveMarkScan {
  marks: InteractiveMark[];
  /** Total interactive candidates seen before the cap. */
  candidates: number;
  /** True when the scan hit its cap and may be incomplete. */
  truncated: boolean;
}
