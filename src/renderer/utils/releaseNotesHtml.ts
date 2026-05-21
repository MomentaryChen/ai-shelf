const BLOCKED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "meta",
  "link",
  "base",
]);

/** GitHub / electron-updater release notes are HTML; sanitize before rendering in the UI. */
export function sanitizeReleaseNotesHtml(raw: string): string {
  const doc = new DOMParser().parseFromString(raw, "text/html");

  for (const tag of BLOCKED_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  for (const el of doc.body.querySelectorAll("*")) {
    if (BLOCKED_TAGS.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (
        (name === "href" || name === "src") &&
        /^\s*javascript:/i.test(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }

  return doc.body.innerHTML;
}
