export function markdownToPlainText(markdown: string): string {
  const tableNormalized = markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line) => {
      if (!(line.includes("|") && (/^\s*\|/.test(line) || /\|\s*$/.test(line) || /\s\|\s/.test(line)))) {
        return [line];
      }
      const cells = line
        .replace(/^\s*\||\|\s*$/g, "")
        .split("|")
        .map((cell) => cell.trim());
      if (cells.length < 2) return [line];
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return [];
      return [cells.filter(Boolean).join(" — ")];
    })
    .join("\n");

  return tableNormalized
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:https:\/\/)?[^)]+\)/g, "$1")
    .replace(/^\s*```[^\n]*$/gmu, "")
    .replace(/```/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/^\s*>\s?/gmu, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(?<!\w)(\*|_)([^\n]+?)\1(?!\w)/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~`]+/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type SafeMarkdownInline =
  | { type: "text"; text: string }
  | { type: "strong" | "emphasis" | "strikethrough" | "code"; text: string }
  | { type: "link"; text: string; href: string | null; domain: string | null };

export type SafeMarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph" | "quote"; text: string }
  | { type: "list-item"; ordered: boolean; ordinal: number | null; text: string }
  | { type: "code"; language: string | null; text: string }
  | { type: "divider" }
  | { type: "table-row"; cells: string[] };

function stripUnsafeMarkup(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readableText(value: string): string {
  return value.replace(/[*_~`]+/g, "").replace(/\s+/g, " ").trim();
}

function normalizedBlockText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function plainInlineText(value: string): string {
  return value
    .replace(/[*_~`]+/g, "")
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ");
}

function safeHttpsLink(value: string): { href: string; domain: string } | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || !parsed.hostname) return null;
    return { href: parsed.toString(), domain: parsed.hostname };
  } catch {
    return null;
  }
}

export function parseInlineMarkdown(value: string): SafeMarkdownInline[] {
  const source = stripUnsafeMarkup(value);
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^)\n]+\))/g;
  const tokens: SafeMarkdownInline[] = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = plainInlineText(source.slice(cursor, index));
    if (prefix) tokens.push({ type: "text", text: prefix });
    const token = match[0];
    if (token.startsWith("`")) {
      tokens.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("**") || token.startsWith("__")) {
      tokens.push({ type: "strong", text: readableText(token.slice(2, -2)) });
    } else if (token.startsWith("~~")) {
      tokens.push({ type: "strikethrough", text: readableText(token.slice(2, -2)) });
    } else if (token.startsWith("*") || token.startsWith("_")) {
      tokens.push({ type: "emphasis", text: readableText(token.slice(1, -1)) });
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const target = link ? safeHttpsLink(link[2].trim()) : null;
      tokens.push({
        type: "link",
        text: readableText(link?.[1] ?? token),
        href: target?.href ?? null,
        domain: target?.domain ?? null,
      });
    }
    cursor = index + token.length;
  }
  const suffix = plainInlineText(source.slice(cursor));
  if (suffix) tokens.push({ type: "text", text: suffix });
  return tokens.length > 0 ? tokens : [{ type: "text", text: readableText(source) }];
}

export function parseSafeMarkdown(markdown: string): SafeMarkdownBlock[] {
  const lines = stripUnsafeMarkup(markdown).replace(/\r\n?/g, "\n").split("\n");
  const blocks: SafeMarkdownBlock[] = [];
  let paragraph: string[] = [];
  let codeLines: string[] | null = null;
  let codeLanguage: string | null = null;
  const flushParagraph = () => {
    const text = normalizedBlockText(paragraph.join(" "));
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  const flushCode = () => {
    if (codeLines === null) return;
    blocks.push({ type: "code", language: codeLanguage, text: codeLines.join("\n").trimEnd() });
    codeLines = null;
    codeLanguage = null;
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w.+-]+)?\s*$/);
    if (fence) {
      if (codeLines === null) {
        flushParagraph();
        codeLines = [];
        codeLanguage = fence[1]?.slice(0, 32) ?? null;
      } else {
        flushCode();
      }
      continue;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    if (/^\s{0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "divider" });
      continue;
    }
    if (line.includes("|") && (/^\s*\|/.test(line) || /\|\s*$/.test(line) || /\s\|\s/.test(line))) {
      flushParagraph();
      const cells = line.replace(/^\s*\||\|\s*$/g, "").split("|").map(normalizedBlockText);
      if (cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      if (cells.some(Boolean)) blocks.push({ type: "table-row", cells });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, text: normalizedBlockText(heading[2]) });
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ type: "quote", text: normalizedBlockText(quote[1]) });
      continue;
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      blocks.push({ type: "list-item", ordered: false, ordinal: null, text: normalizedBlockText(unordered[1]) });
      continue;
    }
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      blocks.push({ type: "list-item", ordered: true, ordinal: Number(ordered[1]), text: normalizedBlockText(ordered[2]) });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  flushCode();
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: markdownToPlainText(markdown) }];
}
