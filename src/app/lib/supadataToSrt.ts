export type SupadataTimestampChunk = {
  offset: number; // milliseconds
  duration: number; // milliseconds
  text: string;
  lang?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function pad3(n: number) {
  return String(n).padStart(3, '0');
}

function msToSrtTime(ms: number) {
  const t = Math.max(0, Math.round(ms));
  const hours = Math.floor(t / 3600000);
  const minutes = Math.floor((t % 3600000) / 60000);
  const seconds = Math.floor((t % 60000) / 1000);
  const milliseconds = t % 1000;

  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)},${pad3(milliseconds)}`;
}

// 纯函数：将 Supadata timestamp chunks 转换为 SRT 文本
export function supadataChunksToSrt(chunks: SupadataTimestampChunk[]) {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';

  const blocks = chunks.map((c, i) => {
    const startMs = c.offset;
    const endMs = c.offset + c.duration;

    // SRT 文本通常不需要额外的缩进；这里把换行折叠成空格，避免字幕排版过长
    const text = String(c.text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' ')
      .trim();

    return (
      `${i + 1}\n` +
      `${msToSrtTime(startMs)} --> ${msToSrtTime(endMs)}\n` +
      `${text}`
    );
  });

  return `${blocks.join('\n\n')}\n`;
}

