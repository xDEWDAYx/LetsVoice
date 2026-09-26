import type { NoteExportBlock, NoteExportLayout } from './NoteExportData';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderList(
  blocks: NoteExportBlock[],
  start: number,
): { html: string; next: number } {
  const first = blocks[start];
  if (first.kind !== 'listItem') return { html: '', next: start + 1 };
  const ordered = Boolean(first.ordered);
  const tag = ordered ? 'ol' : 'ul';
  const items: string[] = [];
  let index = start;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.kind !== 'listItem' || Boolean(block.ordered) !== ordered) break;
    const checkbox =
      block.checked === undefined
        ? ''
        : `<span class="check">${block.checked ? '[x]' : '[ ]'}</span>`;
    items.push(
      `<li class="level-${block.level ?? 0}">${checkbox}${escapeHtml(
        block.text,
      )}</li>`,
    );
    index += 1;
  }
  return { html: `<${tag}>${items.join('')}</${tag}>`, next: index };
}

function renderBlock(block: NoteExportBlock): string {
  if (block.kind === 'heading') {
    return `<h${block.level + 1}>${escapeHtml(block.text)}</h${
      block.level + 1
    }>`;
  }
  if (block.kind === 'paragraph') {
    return `<p class="${block.style ?? 'body'}">${escapeHtml(block.text)}</p>`;
  }
  if (block.kind === 'definition') {
    return `<div class="definition"><dt>${escapeHtml(
      block.label,
    )}</dt><dd>${escapeHtml(block.value)}</dd></div>`;
  }
  if (block.kind === 'divider') return '<hr>';
  return '';
}

export function buildNoteExportHtml(layout: NoteExportLayout): string {
  const content: string[] = [];
  let index = 0;
  while (index < layout.blocks.length) {
    const block = layout.blocks[index];
    if (block.kind === 'listItem') {
      const rendered = renderList(layout.blocks, index);
      content.push(rendered.html);
      index = rendered.next;
    } else {
      content.push(renderBlock(block));
      index += 1;
    }
  }

  return `<!DOCTYPE html>
<html lang="${layout.language === 'zh' ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(layout.title)}</title>
  <style>
    @page { size: Letter portrait; margin: 25.4mm; }
    * { box-sizing: border-box; }
    html { background: #fff; }
    body {
      margin: 0;
      color: #202628;
      font-family: Calibri, "Microsoft YaHei", "Noto Sans CJK SC", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .title-block { margin: 0 0 18pt; }
    h1 {
      margin: 0 0 5pt;
      color: #0b2545;
      font-size: 26pt;
      line-height: 1.16;
      overflow-wrap: anywhere;
    }
    .subtitle {
      margin: 0;
      color: #667176;
      font-size: 11pt;
      font-weight: 600;
      letter-spacing: .04em;
    }
    h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
    h2 {
      margin: 18pt 0 9pt;
      padding-bottom: 4pt;
      border-bottom: 1px solid #dbe3ea;
      color: #2e74b5;
      font-size: 16pt;
      line-height: 1.25;
    }
    h3 {
      margin: 14pt 0 7pt;
      color: #2e74b5;
      font-size: 13pt;
      line-height: 1.3;
    }
    h4 {
      margin: 10pt 0 5pt;
      color: #1f4d78;
      font-size: 12pt;
      line-height: 1.35;
    }
    p { margin: 0 0 8pt; white-space: pre-wrap; overflow-wrap: anywhere; }
    p.lead {
      margin: 2pt 0 10pt;
      padding: 9pt 11pt;
      border-left: 3pt solid #2e74b5;
      background: #f4f6f9;
    }
    p.muted { color: #687278; font-size: 9.5pt; }
    p.code {
      padding: 8pt;
      background: #f2f4f7;
      font-family: Consolas, "Microsoft YaHei", monospace;
      font-size: 9.5pt;
    }
    .definition {
      display: grid;
      grid-template-columns: minmax(78pt, 1.15fr) minmax(0, 4.85fr);
      gap: 8pt;
      margin: 0 0 4pt;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    dt { color: #5c686d; font-weight: 700; }
    dd { margin: 0; overflow-wrap: anywhere; }
    ul, ol { margin: 0 0 9pt; padding-left: 20pt; }
    li { margin: 0 0 4pt; padding-left: 2pt; overflow-wrap: anywhere; }
    li.level-1 { margin-left: 18pt; }
    .check { display: inline-block; min-width: 25pt; color: #1f4d78; font-weight: 700; }
    hr { margin: 14pt 0 5pt; border: 0; border-top: 1px solid #dbe3ea; }
  </style>
</head>
<body>
  <header class="title-block">
    <h1>${escapeHtml(layout.title)}</h1>
    <p class="subtitle">${escapeHtml(layout.subtitle)}</p>
  </header>
  ${content.join('\n  ')}
</body>
</html>`;
}

export function buildPdfHeaderTemplate(title: string): string {
  return `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;font-size:8px;color:#7a858a;width:100%;padding:0 25.4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
    title,
  )}</div>`;
}

export function buildPdfFooterTemplate(language: 'zh' | 'en'): string {
  const page = language === 'zh' ? '第' : 'Page';
  const of = language === 'zh' ? '页，共' : 'of';
  const suffix = language === 'zh' ? '页' : '';
  return `<div style="font-family:Arial,'Microsoft YaHei',sans-serif;font-size:8px;color:#7a858a;width:100%;padding:0 25.4mm;text-align:right;">${page} <span class="pageNumber"></span> ${of} <span class="totalPages"></span> ${suffix}</div>`;
}
