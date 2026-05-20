/**
 * Writes GitHub Release body from CHANGELOG.md for the version being tagged.
 * Expects GITHUB_REF_NAME (e.g. v1.0.0) in CI, or falls back to root package.json version.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = join(root, "CHANGELOG.md");
const outPath = join(root, "release-notes.md");

function getVersion() {
  const ref = process.env.GITHUB_REF_NAME ?? "";
  if (ref.startsWith("v") && /^v\d/.test(ref)) {
    return ref.slice(1);
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return pkg.version;
}

function extractSection(changelog, version) {
  const escaped = version.replace(/\./g, "\\.");
  const headerRe = new RegExp(`^## \\[${escaped}\\][^\\n]*\\n`, "m");
  const match = changelog.match(headerRe);
  if (!match || match.index === undefined) {
    throw new Error(
      `CHANGELOG.md has no section "## [${version}]". Add it before tagging.`,
    );
  }
  const start = match.index + match[0].length;
  const tail = changelog.slice(start);
  const nextIdx = tail.search(/^## \[/m);
  const body = (nextIdx === -1 ? tail : tail.slice(0, nextIdx)).trim();
  // Omit Keep-a-Changelog footer reference links ([x.y.z]: url) — redundant on GitHub Releases.
  return body.replace(/(?:^|\n)\[[^\]]+\]: https?:\/\/[^\s]+\s*$/gm, "").trim();
}

function changelogUrl(version) {
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = process.env.GITHUB_REF_NAME || `v${version}`;
  if (repo) {
    return `https://github.com/${repo}/blob/${tag}/CHANGELOG.md`;
  }
  return "./CHANGELOG.md";
}

/**
 * GitHub Release bodies don't resolve repo-relative links; point them at this tag's tree.
 */
function absolutizeMarkdownLinks(markdown, version) {
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = process.env.GITHUB_REF_NAME || `v${version}`;
  if (!repo) return markdown;
  const base = `https://github.com/${repo}/blob/${tag}/`;
  return markdown.replace(/\]\(([^)]+)\)/g, (full, path) => {
    const p = path.trim();
    if (/^https?:\/\//i.test(p) || p.startsWith("#") || p.startsWith("mailto:")) {
      return full;
    }
    const rel = p.replace(/^\.\//, "");
    return `](${base}${rel})`;
  });
}

const version = getVersion();
const changelog = readFileSync(changelogPath, "utf8");
let section = extractSection(changelog, version);
section = absolutizeMarkdownLinks(section, version);

const footer = `\n\n---\n\nFull changelog: [CHANGELOG.md](${changelogUrl(version)})`;

const title = `# AI Shelf ${version}`;

writeFileSync(outPath, `${title}\n\n${section}${footer}\n`, "utf8");
console.log(`Wrote ${outPath} for version ${version}`);
