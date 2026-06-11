// Public media server — serves photos AND videos stored in R2 (binding "MEDIA") at /img/<key>.
// No auth: these are images/videos being published to social anyway; keys are unguessable.
// Supports HTTP Range requests — required for <video> streaming + seeking (iPhone refuses
// to play video at all without it).
export async function onRequestGet(context) {
  const { env, params, request } = context;
  if (!env.MEDIA) return new Response('Media hosting not configured', { status: 404 });
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!key) return new Response('Not found', { status: 404 });

  const rangeHeader = request.headers.get('range');
  const baseHeaders = (obj) => {
    const h = new Headers();
    obj.writeHttpMetadata(h);
    h.set('cache-control', 'public, max-age=31536000, immutable');
    h.set('access-control-allow-origin', '*');
    h.set('accept-ranges', 'bytes');
    return h;
  };

  if (rangeHeader) {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (m && (m[1] !== '' || m[2] !== '')) {
      // need total size for Content-Range — head() is a cheap metadata read
      const head = await env.MEDIA.head(key);
      if (!head) return new Response('Not found', { status: 404 });
      const size = head.size;
      let start, end;
      if (m[1] === '') { // suffix range: last N bytes
        const n = Math.min(parseInt(m[2], 10), size);
        start = size - n; end = size - 1;
      } else {
        start = parseInt(m[1], 10);
        end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1);
      }
      if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        return new Response('Range not satisfiable', { status: 416, headers: { 'content-range': 'bytes */' + size } });
      }
      const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
      if (!obj) return new Response('Not found', { status: 404 });
      const h = baseHeaders(obj);
      h.set('content-range', 'bytes ' + start + '-' + end + '/' + size);
      h.set('content-length', String(end - start + 1));
      return new Response(obj.body, { status: 206, headers: h });
    }
  }

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const h = baseHeaders(obj);
  h.set('content-length', String(obj.size));
  return new Response(obj.body, { headers: h });
}
