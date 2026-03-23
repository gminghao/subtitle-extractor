 'use client';

import { useMemo, useState } from 'react';
import { Copy, Download, Loader2 } from 'lucide-react';
import { supadataChunksToSrt, type SupadataTimestampChunk } from './lib/supadataToSrt';

type SupadataResponse = {
  content: string | SupadataTimestampChunk[];
  lang?: string;
  availableLangs?: string[];
};

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export default function Page() {
  const [videoUrl, setVideoUrl] = useState('');
  const [textMode, setTextMode] = useState(false); // false: 带时间戳, true: 纯文本
  const [isLoading, setIsLoading] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [availableLangs, setAvailableLangs] = useState<string[]>([]);
  const [selectedLang, setSelectedLang] = useState<string>('');

  const [data, setData] = useState<SupadataResponse | null>(null);

  const displayText = useMemo(() => {
    if (!data) return '';

    if (textMode) {
      return typeof data.content === 'string' ? data.content : '';
    }

    if (Array.isArray(data.content)) {
      return data.content.map((c) => c.text).filter(Boolean).join('\n');
    }

    return '';
  }, [data, textMode]);

  async function handleExtract(langOverride?: string) {
    setErrorMsg(null);
    if (!videoUrl.trim()) {
      setErrorMsg('请输入视频 URL');
      return;
    }

    const lang = langOverride ?? selectedLang ?? undefined;

    setIsLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoUrl.trim(),
          text: textMode,
          ...(lang ? { lang } : {}),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message = json?.error?.message || json?.message || `提取失败（HTTP ${res.status}）`;
        setErrorMsg(message);
        return;
      }

      const next = json as SupadataResponse;
      setData(next);

      const nextLangs = Array.isArray(next.availableLangs) ? next.availableLangs : [];
      setAvailableLangs(nextLangs);

      const nextSelected = next.lang || nextLangs[0] || '';
      setSelectedLang(nextSelected);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '网络错误');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    if (!displayText) return;
    try {
      await navigator.clipboard.writeText(displayText);
      setErrorMsg(null);
      setErrorMsg('已复制到剪贴板');
      window.setTimeout(() => setErrorMsg(null), 1200);
    } catch {
      setErrorMsg('复制失败：浏览器权限可能被限制');
      window.setTimeout(() => setErrorMsg(null), 2000);
    }
  }

  function handleDownloadTxt() {
    if (!data || !textMode) return;
    const content = typeof data.content === 'string' ? data.content : '';
    if (!content) return;

    const langSuffix = selectedLang ? `-${selectedLang}` : '';
    downloadTextFile(`subtitle${langSuffix}.txt`, content);
  }

  function handleDownloadSrt() {
    if (!data || textMode) return;
    if (!Array.isArray(data.content)) return;

    const srt = supadataChunksToSrt(data.content as SupadataTimestampChunk[]);
    if (!srt) return;

    const langSuffix = selectedLang ? `-${selectedLang}` : '';
    downloadTextFile(`subtitle${langSuffix}.srt`, srt);
  }

  const canExport = Boolean(data && displayText);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900 flex items-center justify-center">
      <div className="w-full mx-auto max-w-3xl px-4 py-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
              YouTube 字幕提取与下载
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate-600">输入视频链接，选择输出格式，即可复制或下载字幕。</p>
        </header>

        <section className="rounded-2xl border bg-white/70 p-5 shadow-sm backdrop-blur">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">视频 URL</label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="mt-2 w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-base text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-700">输出格式</div>
                <div className="text-xs text-slate-500">切换纯文本或带时间戳</div>
              </div>

              <button
                type="button"
                onClick={() => setTextMode((v) => !v)}
                className={
                  'relative h-10 w-24 rounded-full border transition ' +
                  (textMode
                    ? 'border-indigo-600 bg-indigo-600'
                    : 'border-slate-300 bg-slate-100')
                }
                aria-pressed={textMode}
              >
                <span
                  className={
                    'absolute top-1/2 h-8 w-8 -translate-y-1/2 rounded-full bg-white shadow transition ' +
                    (textMode ? 'left-12' : 'left-1')
                  }
                />
                <span className="sr-only">切换输出格式</span>
              </button>

              <div className="text-sm font-medium text-slate-700">{textMode ? '纯文本' : '带时间戳'}</div>
            </div>

            {availableLangs.length > 1 && (
              <div>
                <label className="text-sm font-medium text-slate-700">语言</label>
                <select
                  value={selectedLang}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedLang(next);
                    handleExtract(next);
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {availableLangs.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleExtract()}
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提取中
                  </>
                ) : (
                  '提取字幕'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setVideoUrl('');
                  setData(null);
                  setAvailableLangs([]);
                  setSelectedLang('');
                  setErrorMsg(null);
                }}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                重置
              </button>
            </div>
          </div>

          {errorMsg && (
            <p className={errorMsg === '已复制到剪贴板' ? 'mt-4 text-sm text-emerald-700' : 'mt-4 text-sm text-red-600'}>
              {errorMsg}
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border bg-white/70 p-5 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-700">字幕结果</div>
              <div className="text-xs text-slate-500">{textMode ? '纯文本' : '带时间戳模式（可导出 SRT）'}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canExport || isLoading}
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Copy className="h-4 w-4" />
                复制
              </button>

              {textMode ? (
                <button
                  type="button"
                  disabled={!data || !textMode || !canExport || isLoading}
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  下载 TXT
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!data || textMode || !canExport || isLoading}
                  onClick={handleDownloadSrt}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  下载 SRT
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
            {displayText ? (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-900">
                {displayText}
              </pre>
            ) : (
              <p className="text-sm text-slate-500">尚未提取字幕。请输入 URL 并点击“提取字幕”。</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
