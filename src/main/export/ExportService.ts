import { BrowserWindow, dialog } from 'electron';
import fs from 'fs/promises';
import { Packer } from 'docx';
import { SettingsService } from '../settings/SettingsService';
import { buildNoteExportLayout } from './NoteExportContent';
import type { NoteExportLayout, NoteExportRequest } from './NoteExportData';
import {
  buildNoteExportHtml,
  buildPdfFooterTemplate,
  buildPdfHeaderTemplate,
} from './NoteExportHtml';
import { NoteExportRepository } from './NoteExportRepository';
import { buildNoteExportWordDocument } from './NoteExportWord';

export type ExportRequest = NoteExportRequest;

export function normalizeExportRequest(value: unknown): ExportRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('无效的导出请求 / Invalid export request');
  }
  const candidate = value as Partial<ExportRequest>;
  const workspaceId = Number(candidate.workspaceId);
  const noteId = Number(candidate.noteId);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    throw new Error('无效的工作空间 ID / Invalid workspace ID');
  }
  if (!Number.isInteger(noteId) || noteId <= 0) {
    throw new Error('无效的笔记 ID / Invalid note ID');
  }
  if (candidate.format !== 'word' && candidate.format !== 'pdf') {
    throw new Error('不支持的导出格式 / Unsupported export format');
  }
  return { workspaceId, noteId, format: candidate.format };
}

function safeFilename(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return (cleaned || 'SpeakSpace Local Note').slice(0, 120);
}

function exportDialogTitle(language: 'zh' | 'en', word: boolean): string {
  if (language === 'zh') {
    return word ? '导出完整 Word 文档' : '导出完整 PDF 文档';
  }
  return word
    ? 'Export complete Word document'
    : 'Export complete PDF document';
}

export async function writeWordExport(
  layout: NoteExportLayout,
  filePath: string,
): Promise<void> {
  const document = buildNoteExportWordDocument(layout);
  const buffer = await Packer.toBuffer(document);
  await fs.writeFile(filePath, buffer);
}

export async function writePdfExport(
  layout: NoteExportLayout,
  filePath: string,
): Promise<void> {
  const html = buildNoteExportHtml(layout);
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false,
    },
  });

  try {
    await win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: buildPdfHeaderTemplate(layout.title),
      footerTemplate: buildPdfFooterTemplate(layout.language),
    });
    await fs.writeFile(filePath, pdfData);
  } finally {
    win.destroy();
  }
}

export class ExportService {
  public static async exportNote(rawRequest: unknown): Promise<void> {
    const request = normalizeExportRequest(rawRequest);
    const data = new NoteExportRepository().getNote(
      request.workspaceId,
      request.noteId,
    );
    const { language } = new SettingsService().getSettings();
    const layout = buildNoteExportLayout(data, language);
    const name = safeFilename(data.title);
    const word = request.format === 'word';
    const { filePath } = await dialog.showSaveDialog({
      title: exportDialogTitle(language, word),
      defaultPath: `${name}.${word ? 'docx' : 'pdf'}`,
      filters: [
        word
          ? { name: 'Word Document', extensions: ['docx'] }
          : { name: 'PDF Document', extensions: ['pdf'] },
      ],
    });
    if (!filePath) return;

    if (word) await writeWordExport(layout, filePath);
    else await writePdfExport(layout, filePath);
  }
}
