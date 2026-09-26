/** 播报前移除常见 Markdown 标记，但保留原文字词和换行含义。 */
export default function toSpeechText(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*/g, ''))
    .replace(/!?\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*>])\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
