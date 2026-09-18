/** Accessibility scan: image-alt, heading-hierarchy, and accessible-name issues. */

/** An <img> with missing or undeclared-decorative alternate text. */
export interface A11yImageIssue {
  selector: string;
  kind: "missing-alt" | "empty-alt-undeclared";
  /** Trimmed src, to help locate the asset. */
  src: string;
}

/** A heading that breaks the document's hierarchy sequence. */
export interface A11yHeadingIssue {
  selector: string;
  /** 1-6. */
  level: number;
  /** The level of the preceding heading (1 when this is the first). */
  previousLevel: number;
  text: string;
  kind: "skipped-level" | "starts-too-deep";
}

/** An interactive control with no computable accessible name. */
export interface A11yNameIssue {
  selector: string;
  tag: string;
  /** input's type attribute, when applicable. */
  typeAttr: string | null;
  /** Extra context, e.g. "placeholder present — not an accessible name". */
  hint: string | null;
}

/** Raw scan data returned by the in-page accessibility payload. */
export interface AccessibilityScan {
  imageIssues: A11yImageIssue[];
  headingIssues: A11yHeadingIssue[];
  nameIssues: A11yNameIssue[];
  /** Whether the document contains an <h1> at all. */
  hasH1: boolean;
  imagesChecked: number;
  headingsChecked: number;
  controlsChecked: number;
  /** True when the scan hit its caps and may be incomplete. */
  truncated: boolean;
}
