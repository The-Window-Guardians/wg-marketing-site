// Window Guardians — upload ONE photo to R2 (binding "MEDIA"), STREAMING the raw bytes
// (no base64) so mobile uploads are fast and light on memory. Returns a public /img/<key> URL.
// Mirrors upload-video.js. Uses the same R2 binding "MEDIA" that videos already use, so if
// video upload works, this works. If the binding is missing it returns {error:'no_bucket'}
// and the app falls back to the legacy Firestore path automatically.
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.MEDIA) return json({ error: 'no_bucket', message: 'Image hosting isn’t set up yet — add the R2 binding named MEDIA in Cloudflare.' });
  try {
    const len = parseInt(request.headers.get('content-length') || '0', 10);
    if (!len) return json({ error: 'empty', message: 'No image data.' });
    if (len > 25000000) return json({ error: 'toolarge', message: 'Image too large (25MB max).' });
    const mime = String(request.headers.get('content-type') || 'image/webp').split(';')[0];
    if (!/^image\//.test(mime)) return json({ error: 'badtype', message: 'Not an image.' });
    const ext = /png/.test(mime) ? 'png' : /webp/.test(mime) ? 'webp' : /gif/.test(mime) ? 'gif' : 'jpg';
    const u = new URL(request.url);
    const safeId = String(u.searchParams.get('id') || 'img').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    const key = 'photos/' + safeId + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + '.' + ext;
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: mime } });
    return json({ url: u.origin + '/img/' + key, key: key });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
