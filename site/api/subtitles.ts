/**
 * OpenSubtitles proxy.
 *
 * The API key lives here and never reaches the browser. That is the entire
 * reason this route exists: OpenSubtitles bills and rate-limits per key, so a
 * key shipped in client JavaScript is a key anyone can read out of devtools and
 * spend. It also solves a second problem for free: the upstream API sends no
 * CORS headers, so a page cannot call it directly regardless of the key.
 *
 * Two operations, chosen by `?action=`:
 *   search:    by moviehash (exact release match) and/or by title text
 *   download: turns a file id into a temporary direct link to the .srt
 *
 * Everything the client sends is treated as untrusted: only the parameters
 * named below are forwarded, so no caller can turn this into an open relay to
 * arbitrary OpenSubtitles endpoints.
 */

const API = 'https://api.opensubtitles.com/api/v1';
/** Required by OpenSubtitles; they reject requests from unnamed clients. */
const USER_AGENT = 'Cadence v1.0';

/** Parameters we are willing to pass through to the search endpoint. */
const SEARCH_PARAMS = ['query', 'moviehash', 'languages', 'season_number', 'episode_number'];

/**
 * Origins allowed to call this route from a browser.
 *
 * The desktop application is not served from this domain. It runs from a file
 * on disk, so its requests are cross-origin and it has to be named here or
 * the browser inside it will refuse the response. It cannot be `*`: this route
 * exists to spend a metered OpenSubtitles key without exposing it, and a
 * wildcard would let any page on the internet spend it too.
 *
 * The Tauri origins are fixed strings, not something a caller can influence:
 * Windows serves the application from `http://tauri.localhost`, and the other
 * platforms from `tauri://localhost`.
 */
const ALLOWED_ORIGINS = new Set([
  'https://cadence.auva.dev',
  'http://tauri.localhost',
  'tauri://localhost',
  'http://localhost:3000',
]);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    // The response varies by request origin, so a cache keyed only on the URL
    // would hand one origin's allow header to another and fail the check.
    vary: 'Origin',
  };
}

function json(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // A short cache is enough to stop a retyped query costing a fresh call
      // against the quota, without holding results long enough to go stale.
      'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
      ...(request ? corsHeaders(request) : {}),
    },
  });
}

/** Preflight. Sent before the desktop application's first cross-origin call. */
export function OPTIONS(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-max-age': '86400',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const key = process.env.OPENSUBTITLES_API_KEY;
  if (!key) {
    // Say which knob is missing. A bare 500 here sends whoever deployed this
    // looking through the client code for a bug that is not there.
    return json({ error: 'Subtitle search is not configured on this deployment.' }, 501, request);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  const headers = {
    'Api-Key': key,
    'User-Agent': USER_AGENT,
    'content-type': 'application/json',
  };

  try {
    if (action === 'search') {
      const forwarded = new URLSearchParams();
      for (const name of SEARCH_PARAMS) {
        const value = url.searchParams.get(name);
        if (value) forwarded.set(name, value.slice(0, 200));
      }
      if ([...forwarded.keys()].length === 0) {
        return json({ error: 'Nothing to search for.' }, 400, request);
      }

      const upstream = await fetch(`${API}/subtitles?${forwarded}`, { headers });
      if (!upstream.ok) {
        return json({ error: `Subtitle search failed (${upstream.status}).` }, 502, request);
      }

      const body = (await upstream.json()) as { data?: unknown[] };
      // Reshaped rather than passed through: the upstream record is large and
      // deeply nested, and the client only renders these six fields.
      const results = (body.data ?? []).slice(0, 40).map((item) => {
        const entry = item as {
          attributes?: Record<string, unknown> & {
            files?: Array<{ file_id?: number; file_name?: string }>;
          };
        };
        const attr = entry.attributes ?? {};
        const file = attr.files?.[0];
        return {
          fileId: file?.file_id ?? null,
          name: (file?.file_name as string) ?? (attr.release as string) ?? 'Subtitle',
          language: (attr.language as string) ?? '',
          release: (attr.release as string) ?? '',
          downloads: (attr.download_count as number) ?? 0,
          /** True when matched by file hash, an exact match for this release. */
          hashMatch: attr.moviehash_match === true,
        };
      });

      return json({ results: results.filter((r) => r.fileId !== null) }, 200, request);
    }

    if (action === 'download') {
      const fileId = Number(url.searchParams.get('file_id'));
      if (!Number.isInteger(fileId) || fileId <= 0) {
        return json({ error: 'Invalid subtitle id.' }, 400, request);
      }

      const upstream = await fetch(`${API}/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ file_id: fileId }),
      });

      if (upstream.status === 406) {
        // The one upstream error worth naming: the daily quota is the limit
        // users actually hit, and "try again tomorrow" is actionable.
        return json({ error: 'Daily subtitle download limit reached. Try again tomorrow.' }, 429, request);
      }
      if (!upstream.ok) {
        return json({ error: `Could not fetch that subtitle (${upstream.status}).` }, 502, request);
      }

      const body = (await upstream.json()) as { link?: string };
      if (!body.link) return json({ error: 'No download link was returned.' }, 502, request);

      /* Fetch the file here rather than handing the link to the browser. The
         link is single-use and same-origin-less, so a client fetch would be
         another CORS failure, and proxying it means the client receives plain
         subtitle text it can turn straight into a track. */
      const fileResponse = await fetch(body.link);
      if (!fileResponse.ok) {
        return json({ error: 'The subtitle file could not be downloaded.' }, 502, request);
      }

      const text = await fileResponse.text();
      return new Response(text, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
          ...corsHeaders(request),
        },
      });
    }

    return json({ error: 'Unknown action.' }, 400, request);
  } catch {
    return json({ error: 'Subtitle service is unreachable.' }, 502, request);
  }
}
