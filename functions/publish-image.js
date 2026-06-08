// Window Guardians — publish ONE post photo to public R2 storage, return a fetchable URL.
// Used when sending a post to GoHighLevel so GHL/Facebook can pull the image by link.
// Requires an R2 bucket bound to this Pages project as the binding name "MEDIA".
//   Cloudflare → Pages project → Settings → Functions → R2 bindings → variable "MEDIA" → your bucket.
// If the binding isn't set up yet, this returns {error:'no_bucket'} and the app falls back to text-only.

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}
function b64ToBytes(b64) {
  const bin = atob(b64); const len = bin.length; const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.MEDIA) return json({ error: 'no_bucket', message: 'Public image hosting isn’t set up yet — add an R2 binding named MEDIA in Cloudflare.' });
  try {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    let data = String(body.data || '');
    if (data.indexOf(',') >= 0) data = data.slice(data.indexOf(',') + 1); // strip any dataURL prefix
    if (!data) return json({ error: 'empty', message: 'No image data.' });
    const mime = String(body.mime || 'image/jpeg');
    const ext = mime.indexOf('png') >= 0 ? 'png' : mime.indexOf('webp') >= 0 ? 'webp' : 'jpg';
    const bytes = b64ToBytes(data);
    if (bytes.length > 6000000) return json({ error: 'toolarge', message: 'Image too large.' });
    const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const safeId = String(body.id || 'img').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
    const key = 'posts/' + safeId + '_' + rand + '.' + ext;
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime } });
    const origin = new URL(request.url).origin;
    return json({ url: origin + '/img/' + key });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
