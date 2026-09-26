/** 笔记库拖到输入框时携带的载荷，自定义 MIME 避免和外部拖拽内容混淆。 */
export const NOTE_DRAG_MIME = 'application/x-speakspace-ref';

export type NoteDragPayload =
  | { kind: 'note'; id: number }
  | { kind: 'workspace'; id: number };

export function setNoteDragPayload(
  dataTransfer: DataTransfer,
  payload: NoteDragPayload,
  label: string,
): void {
  dataTransfer.setData(NOTE_DRAG_MIME, JSON.stringify(payload));
  // 同时写入纯文本，拖到外部编辑器时至少还有个名字。
  dataTransfer.setData('text/plain', label);
  // eslint-disable-next-line no-param-reassign
  dataTransfer.effectAllowed = 'copy';
}

/** dragover 阶段读不到数据，只能靠 types 判断是不是自家的拖拽。 */
export function hasNoteDragPayload(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(NOTE_DRAG_MIME);
}

export function readNoteDragPayload(
  dataTransfer: DataTransfer,
): NoteDragPayload | null {
  try {
    const raw = dataTransfer.getData(NOTE_DRAG_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NoteDragPayload>;
    if (
      (parsed.kind === 'note' || parsed.kind === 'workspace') &&
      Number.isInteger(parsed.id)
    ) {
      return parsed as NoteDragPayload;
    }
    return null;
  } catch {
    return null;
  }
}
