// Window Guardians — upload ONE video to R2 (binding "MEDIA"), return a playable URL.
// Streams the raw request body straight into the bucket (no base64, no memory blowup),
// so phone videos of 50-200MB work. Served back via /img/<key> which supports Range
// requests (required for <video> playback + seeking, especially on iPhone).
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.MEDIA) return json({ error: 'no_bucket', message: 'Video hosting isn’t set up yet — add the R2 binding named MEDIA in Cloudflare.' });
  try {
    const len = parseInt(request.headers.get('content-length') || '0', 10);
    if (!len) return json({ error: 'empty', message: 'No video data.' });
    if (len > 300000000) return json({ error: 'toolarge', message: 'Video too large (300MB max). Trim it or send it another way.' });
    const mime = String(request.headers.get('content-type') || 'video/mp4').split(';')[0];
    if (!/^video\//.test(mime)) return json({ error: 'badtype', message: 'Not a video.' });
    const ext = /quicktime/.test(mime) ? 'mov' : /webm/.test(mime) ? 'webm' : 'mp4';
    const u = new URL(request.url);
    const safeId = String(u.searchParams.get('id') || 'vid').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    const key = 'vids/' + safeId + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + '.' + ext;
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: mime } });
    return json({ url: u.origin + '/img/' + key, key: key });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
