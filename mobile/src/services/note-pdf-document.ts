import type { CoreNoteInsight } from "@/domain/core-note-insight/core-note-insight";
import type { KnowledgeDocument } from "@/domain/knowledge/knowledge-document";
import type { Note } from "@/domain/note/note";
import type { NoteConversationExportItem } from "@/services/ai-conversation-service";
import { markdownToPlainText } from "@/services/safe-markdown";

export type NotePdfDocumentInput = {
  note: Note;
  workspaceName: string | null;
  structuredNote: CoreNoteInsight | null;
  knowledgeHistory: KnowledgeDocument[];
  conversations: NoteConversationExportItem[];
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function text(value: string | null | undefined, fallback = "Not available"): string {
  const normalized = value?.trim();
  return escapeHtml(normalized || fallback);
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : escapeHtml(
        parsed.toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      );
}

function paragraphs(value: string, fallback = "No content."): string {
  const normalized = value.trim();
  if (!normalized) return `<p class="empty">${escapeHtml(fallback)}</p>`;
  return normalized
    .split(/\n{2,}/)
    .map((item) => `<p>${escapeHtml(item.trim()).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function list(items: readonly string[], fallback = "No items."): string {
  return items.length
    ? `<ul>${items.map((item) => `<li>${text(item)}</li>`).join("")}</ul>`
    : `<p class="empty">${escapeHtml(fallback)}</p>`;
}

function structuredSection(insight: CoreNoteInsight | null): string {
  if (!insight) return '<section><h2>Structured Note</h2><p class="empty">No Structured Note has been generated.</p></section>';
  const tasks = insight.getTasks();
  const actions = insight.getUnassignedActionItems();

  return `<section>
    <h2>Structured Note</h2>
    <div class="meta">Generated ${date(insight.getUpdatedAt())}</div>
    <h3>Summary</h3>${paragraphs(insight.getSummary(), "No summary.")}
    <h3>Key Points</h3>${list(insight.getKeyPoints())}
    <h3>Tasks &amp; Action Plan</h3>
    ${tasks.length ? `<ol>${tasks.map((task) => `<li><strong>${text(task.title)}</strong>${task.description ? `<div>${text(task.description)}</div>` : ""}<div class="meta">Status: ${text(task.status)}${task.dueAt ? ` · Due: ${text(task.dueAt)}` : ""}</div>${task.actionItems.length ? `<ol>${task.actionItems.map((item) => `<li>${text(item.title)}${item.description ? ` — ${text(item.description)}` : ""}</li>`).join("")}</ol>` : ""}</li>`).join("")}</ol>` : '<p class="empty">No tasks.</p>'}
    ${actions.length ? `<h3>Other Action Items</h3><ul>${actions.map((item) => `<li>${text(item.title)}${item.description ? ` — ${text(item.description)}` : ""}</li>`).join("")}</ul>` : ""}
  </section>`;
}

function knowledgeSection(history: readonly KnowledgeDocument[]): string {
  if (!history.length) return '<section><h2>Knowledge</h2><p class="empty">No Knowledge results have been generated.</p></section>';
  return `<section><h2>Knowledge</h2>${history.map((document) => `<article class="result">
    <h3>${text(document.getTemplateName())}</h3>
    <div class="meta">Generated ${date(document.getCreatedAt())}${document.getTemplateDeleted() ? " · Template deleted" : ""}</div>
    ${paragraphs(document.getSummary(), "No summary.")}
    ${document.getSections().map((section) => `<h4>${text(section.title)}</h4>${list(section.items)}`).join("")}
  </article>`).join("")}</section>`;
}

function conversationsSection(history: readonly NoteConversationExportItem[]): string {
  if (!history.length) return '<section><h2>Ask AI Conversations</h2><p class="empty">No linked Ask AI conversations.</p></section>';
  return `<section><h2>Ask AI Conversations</h2>${history.map((item) => {
    const sources = item.linkedNotes.map((note) => note.getName()?.trim() || "Untitled note");
    const header = `<article class="conversation"><h3>${text(item.conversation.getName())}</h3><div class="meta">Updated ${date(item.conversation.getUpdatedAt())} · ${sources.length} ${sources.length === 1 ? "source" : "sources"}: ${sources.map((source) => text(source)).join(", ")}</div>`;
    if (item.messages === null) {
      return `${header}<p class="privacy">This conversation uses multiple notes. Message content is omitted from this one-note export.</p></article>`;
    }
    return `${header}${item.messages.map((message) => `<div class="message"><div class="message-role">${message.getRole() === "user" ? "You" : "Ask AI"} · ${date(message.getCreatedAt())}</div>${paragraphs(markdownToPlainText(message.getContent()))}</div>`).join("")}</article>`;
  }).join("")}</section>`;
}

export function buildNotePdfHtml(input: NotePdfDocumentInput): string {
  const title = input.note.getName()?.trim() || "Untitled Note";
  const audioPath = input.note.getAudioRelativePath();
  const audioFileName = audioPath?.split("/").filter(Boolean).at(-1) ?? null;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 46px 42px; }
  * { box-sizing: border-box; }
  body { color: #17212b; font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; font-size: 12px; line-height: 1.55; margin: 0; }
  header { border-bottom: 2px solid #2563eb; margin-bottom: 24px; padding-bottom: 18px; }
  h1 { font-size: 27px; line-height: 1.2; margin: 0 0 8px; }
  h2 { break-after: avoid; color: #173b65; font-size: 19px; margin: 28px 0 10px; }
  h3 { break-after: avoid; font-size: 15px; margin: 18px 0 6px; }
  h4 { break-after: avoid; font-size: 13px; margin: 14px 0 4px; }
  p { margin: 6px 0; white-space: normal; }
  ul, ol { margin: 7px 0; padding-left: 22px; }
  li { break-inside: avoid; margin: 5px 0; }
  section { break-before: auto; }
  .meta { color: #627083; font-size: 10px; }
  .empty { color: #788597; font-style: italic; }
  .facts { display: table; width: 100%; }
  .fact { display: table-row; }
  .fact strong, .fact span { display: table-cell; padding: 2px 10px 2px 0; }
  .fact strong { color: #536276; width: 92px; }
  .transcript { background: #f4f7fb; border: 1px solid #dce4ee; border-radius: 8px; padding: 14px; }
  .result, .conversation { border-top: 1px solid #dce4ee; break-inside: avoid-page; margin-top: 12px; padding-top: 4px; }
  .message { border-left: 3px solid #cad6e5; margin: 12px 0; padding-left: 10px; }
  .message-role { color: #173b65; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .privacy { background: #fff7e6; border-radius: 6px; color: #795400; padding: 9px; }
  footer { border-top: 1px solid #dce4ee; color: #788597; font-size: 9px; margin-top: 28px; padding-top: 10px; }
</style></head><body>
  <header><h1>${text(title)}</h1><div class="meta">LetsVoice Local · Private one-note export</div></header>
  <section><h2>Note Details</h2><div class="facts">
    <div class="fact"><strong>Workspace</strong><span>${text(input.workspaceName)}</span></div>
    <div class="fact"><strong>Category</strong><span>${text(input.note.getCategory())}</span></div>
    <div class="fact"><strong>Created</strong><span>${date(input.note.getCreatedAt())}</span></div>
    <div class="fact"><strong>Updated</strong><span>${date(input.note.getUpdatedAt())}</span></div>
    <div class="fact"><strong>Audio</strong><span>${audioFileName ? `${text(audioFileName)} (recording present; audio is not embedded)` : "No recording attached"}</span></div>
  </div></section>
  <section><h2>Transcript</h2><div class="transcript">${paragraphs(input.note.getTranscript(), "No transcript.")}</div></section>
  ${structuredSection(input.structuredNote)}
  ${knowledgeSection(input.knowledgeHistory)}
  ${conversationsSection(input.conversations)}
  <footer>Generated locally by LetsVoice. The temporary PDF is removed from the app cache after the share sheet closes.</footer>
</body></html>`;
}
