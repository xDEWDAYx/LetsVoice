import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';
import type { NoteExportBlock, NoteExportLayout } from './NoteExportData';

const FONT = {
  ascii: 'Calibri',
  hAnsi: 'Calibri',
  eastAsia: 'Microsoft YaHei',
  cs: 'Calibri',
};

function textRuns(value: string, options: { bold?: boolean } = {}): TextRun[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  return lines.flatMap((line, index) => [
    new TextRun({ text: line, bold: options.bold, font: FONT }),
    ...(index < lines.length - 1 ? [new TextRun({ break: 1 })] : []),
  ]);
}

function paragraphForBlock(
  block: NoteExportBlock,
  nextBlock?: NoteExportBlock,
): Paragraph | null {
  if (block.kind === 'heading') {
    const heading = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
    }[block.level];
    return new Paragraph({
      heading,
      children: textRuns(block.text, { bold: true }),
      keepNext: true,
    });
  }
  if (block.kind === 'paragraph') {
    const style = {
      lead: 'ExportLead',
      muted: 'ExportMuted',
      code: 'ExportCode',
      body: 'Normal',
    }[block.style ?? 'body'];
    return new Paragraph({
      style,
      children: textRuns(block.text),
      keepNext: nextBlock?.kind === 'definition',
    });
  }
  if (block.kind === 'definition') {
    return new Paragraph({
      style: 'ExportDefinition',
      children: [
        new TextRun({ text: `${block.label}: `, bold: true, font: FONT }),
        ...textRuns(block.value),
      ],
      keepNext: nextBlock?.kind === 'definition',
    });
  }
  if (block.kind === 'listItem') {
    let prefix = '';
    if (block.checked !== undefined) prefix = block.checked ? '[x] ' : '[ ] ';
    return new Paragraph({
      numbering: {
        reference: block.ordered ? 'export-numbers' : 'export-bullets',
        level: block.level ?? 0,
      },
      children: textRuns(`${prefix}${block.text}`),
    });
  }
  if (block.kind === 'divider') {
    return new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          color: 'DBE3EA',
          size: 5,
          space: 8,
        },
      },
      spacing: { before: 80, after: 80 },
    });
  }
  return null;
}

export function buildNoteExportWordDocument(
  layout: NoteExportLayout,
): Document {
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: textRuns(layout.title, { bold: true }),
      keepNext: true,
    }),
    new Paragraph({
      style: 'ExportSubtitle',
      children: textRuns(layout.subtitle, { bold: true }),
      keepNext: true,
    }),
    ...layout.blocks
      .map((block, index) => paragraphForBlock(block, layout.blocks[index + 1]))
      .filter((block): block is Paragraph => block !== null),
  ];

  return new Document({
    title: layout.title,
    subject: layout.subtitle,
    creator: 'SpeakSpace Local',
    description: layout.subtitle,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: '202628' },
          paragraph: {
            spacing: { before: 0, after: 120, line: 300 },
          },
        },
        title: {
          run: { font: FONT, size: 52, bold: true, color: '0B2545' },
          paragraph: {
            spacing: { before: 0, after: 80, line: 280 },
            keepNext: true,
          },
        },
        heading1: {
          run: { font: FONT, size: 32, bold: true, color: '2E74B5' },
          paragraph: {
            spacing: { before: 360, after: 200, line: 300 },
            keepNext: true,
            outlineLevel: 0,
          },
        },
        heading2: {
          run: { font: FONT, size: 26, bold: true, color: '2E74B5' },
          paragraph: {
            spacing: { before: 280, after: 140, line: 300 },
            keepNext: true,
            outlineLevel: 1,
          },
        },
        heading3: {
          run: { font: FONT, size: 24, bold: true, color: '1F4D78' },
          paragraph: {
            spacing: { before: 200, after: 100, line: 300 },
            keepNext: true,
            outlineLevel: 2,
          },
        },
      },
      paragraphStyles: [
        {
          id: 'ExportSubtitle',
          name: 'Export subtitle',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 22, bold: true, color: '667176' },
          paragraph: { spacing: { before: 0, after: 240, line: 280 } },
        },
        {
          id: 'ExportDefinition',
          name: 'Export definition',
          basedOn: 'Normal',
          next: 'ExportDefinition',
          quickFormat: true,
          run: { font: FONT, size: 21, color: '39464B' },
          paragraph: {
            spacing: { before: 0, after: 80, line: 280 },
            indent: { left: 120 },
          },
        },
        {
          id: 'ExportLead',
          name: 'Export lead',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 22, color: '202628' },
          paragraph: {
            spacing: { before: 40, after: 200, line: 300 },
            indent: { left: 180, right: 120 },
            shading: { fill: 'F4F6F9' },
            border: {
              left: {
                style: BorderStyle.SINGLE,
                color: '2E74B5',
                size: 18,
                space: 8,
              },
            },
          },
        },
        {
          id: 'ExportMuted',
          name: 'Export muted',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, size: 19, color: '687278' },
          paragraph: { spacing: { before: 0, after: 100, line: 280 } },
        },
        {
          id: 'ExportCode',
          name: 'Export code',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: {
            font: {
              ascii: 'Consolas',
              hAnsi: 'Consolas',
              eastAsia: 'Microsoft YaHei',
            },
            size: 19,
            color: '263238',
          },
          paragraph: {
            spacing: { before: 80, after: 120, line: 280 },
            indent: { left: 160, right: 160 },
            shading: { fill: 'F2F4F7' },
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'export-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                run: { font: FONT, color: '2E74B5' },
                paragraph: {
                  indent: { left: 540, hanging: 270 },
                  spacing: { before: 0, after: 80, line: 300 },
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.BULLET,
              text: '◦',
              alignment: AlignmentType.LEFT,
              style: {
                run: { font: FONT, color: '1F4D78' },
                paragraph: {
                  indent: { left: 900, hanging: 270 },
                  spacing: { before: 0, after: 80, line: 300 },
                },
              },
            },
          ],
        },
        {
          reference: 'export-numbers',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                run: { font: FONT, color: '1F4D78' },
                paragraph: {
                  indent: { left: 540, hanging: 270 },
                  spacing: { before: 0, after: 80, line: 300 },
                },
              },
            },
            {
              level: 1,
              format: LevelFormat.DECIMAL,
              text: '%2.',
              alignment: AlignmentType.LEFT,
              style: {
                run: { font: FONT, color: '1F4D78' },
                paragraph: {
                  indent: { left: 900, hanging: 270 },
                  spacing: { before: 0, after: 80, line: 300 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
              header: 708,
              footer: 708,
              gutter: 0,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `SpeakSpace Local  |  ${layout.subtitle}`,
                    font: FONT,
                    size: 16,
                    color: '7A858A',
                  }),
                ],
                spacing: { after: 0 },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [
                      layout.language === 'zh' ? '第 ' : 'Page ',
                      PageNumber.CURRENT,
                      layout.language === 'zh' ? ' 页，共 ' : ' of ',
                      PageNumber.TOTAL_PAGES,
                      layout.language === 'zh' ? ' 页' : '',
                    ],
                    font: FONT,
                    size: 16,
                    color: '7A858A',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
}
