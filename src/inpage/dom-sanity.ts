/**
 * Runs inside the page (must be self-contained — no outer-scope captures).
 * Verifies the page actually rendered something: a body with zero visible
 * elements and zero text is the signature of a crashed SPA bundle.
 */
export function domSanityCheck(): { blank: boolean; detail: string } {
  const body = document.body;
  if (!body) {
    return { blank: true, detail: "document.body does not exist" };
  }
  const text = (body.innerText || "").trim();
  const all = body.getElementsByTagName("*");
  let visible = 0;
  for (let i = 0; i < all.length && visible < 3; i++) {
    const el = all.item(i);
    if (!el) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width > 4 && rect.height > 4) {
      visible++;
    }
  }
  if (visible === 0 && text.length === 0) {
    return {
      blank: true,
      detail:
        `document.body contains ${all.length} element(s) but nothing ` +
        "renders visibly and there is no text",
    };
  }
  return {
    blank: false,
    detail: `${visible >= 3 ? "3+" : visible} visible element(s), ${text.length} chars of text`,
  };
}
