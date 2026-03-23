import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type ExtractRequestBody = {
  url: string;
  text: boolean;
  lang?: string;
};

type ErrorResponse = {
  error: {
    message: string;
    status: number;
    code: string;
    details?: unknown;
  };
};

const SUPADATA_BASE = 'https://api.supadata.ai/v1';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorResponse(message: string, status: number, code: string, details?: unknown): ErrorResponse {
  const body: ErrorResponse = {
    error: {
      message,
      status,
      code,
    },
  };
  if (details !== undefined) body.error.details = details;
  return body;
}

export async function POST(req: Request) {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      toErrorResponse('缺少环境变量 SUPADATA_API_KEY', 500, 'MISSING_SUPADATA_API_KEY'),
      { status: 500 }
    );
  }

  let body: ExtractRequestBody;
  try {
    body = (await req.json()) as ExtractRequestBody;
  } catch {
    return NextResponse.json(
      toErrorResponse('请求体必须是 JSON', 400, 'INVALID_JSON'),
      { status: 400 }
    );
  }

  const { url, text, lang } = body ?? {};
  if (!url || typeof url !== 'string') {
    return NextResponse.json(
      toErrorResponse('参数 `url` 为必填字符串', 400, 'MISSING_URL'),
      { status: 400 }
    );
  }
  if (typeof text !== 'boolean') {
    return NextResponse.json(
      toErrorResponse('参数 `text` 为必填布尔值', 400, 'MISSING_TEXT_FLAG'),
      { status: 400 }
    );
  }
  if (lang !== undefined && typeof lang !== 'string') {
    return NextResponse.json(
      toErrorResponse('参数 `lang` 必须是字符串（可选）', 400, 'INVALID_LANG'),
      { status: 400 }
    );
  }

  const transcriptUrl = new URL(`${SUPADATA_BASE}/transcript`);
  transcriptUrl.searchParams.set('url', url);
  transcriptUrl.searchParams.set('text', String(text));
  if (lang) transcriptUrl.searchParams.set('lang', lang);

  try {
    const res = await fetch(transcriptUrl.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
      // 转发字幕结果属于敏感内容，不希望被缓存
      cache: 'no-store',
    });

    const raw = (await res.json().catch(() => null)) as unknown;

    if (res.status === 200) {
      // 200：直接把 Supadata 返回结果原样透传给前端
      return NextResponse.json(raw);
    }

    if (res.status === 202) {
      // 202：轮询等待最终完成
      const jobId = (raw as { jobId?: unknown } | null)?.jobId;
      if (!jobId || typeof jobId !== 'string') {
        return NextResponse.json(
          toErrorResponse('Supadata 返回 202 但缺少 jobId', 502, 'SUPADATA_BAD_202_PAYLOAD', raw),
          { status: 502 }
        );
      }

      const maxAttempts = 30;
      const waitMs = 1500;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await sleep(waitMs);

        const jobRes = await fetch(`${SUPADATA_BASE}/transcript/${jobId}`, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
          },
          cache: 'no-store',
        });

        const jobRaw = (await jobRes.json().catch(() => null)) as unknown;
        if (jobRaw === null) continue;

        const jobStatus = (jobRaw as { status?: unknown } | null)?.status;
        if (jobStatus === 'completed') {
          return NextResponse.json(jobRaw);
        }

        if (jobStatus === 'failed') {
          const message =
            (jobRaw as { error?: { message?: unknown } | null } | null)?.error?.message ??
            'Supadata 任务失败';

          return NextResponse.json(
            toErrorResponse(String(message), 502, 'SUPADATA_JOB_FAILED', jobRaw),
            { status: 502 }
          );
        }

        // queued/active -> 继续轮询
      }

      return NextResponse.json(
        toErrorResponse('Supadata 任务轮询超时', 504, 'SUPADATA_TIMEOUT'),
        { status: 504 }
      );
    }

    // 其他非 200 状态：返回规范错误 JSON
    return NextResponse.json(
      toErrorResponse('Supadata 请求失败', res.status, 'SUPADATA_HTTP_ERROR', raw),
      { status: res.status }
    );
  } catch (err) {
    return NextResponse.json(
      toErrorResponse(
        err instanceof Error ? err.message : '未知错误',
        500,
        'SUPADATA_FETCH_ERROR'
      ),
      { status: 500 }
    );
  }
}

