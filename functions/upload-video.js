// Upload ONE video to R2 (binding "MEDIA"), return a playable URL.
// Cloudflare caps a single request body at ~100MB, so big phone videos (HEVC .mov are
// often 100-300MB) get a 413 BEFORE this code runs. To handle them we support R2
// MULTIPART uploads: the client splits the file into <100MB parts and we stitch them
// back together in the bucket. Small videos still use the fast single-shot path.
// Served back via /img/<key> which supports Range requests (needed for <video> seeking).
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}
function extFor(mime){ return /quicktime/.test(mime) ? 'mov' : /webm/.test(mime) ? 'webm' : 'mp4'; }
function safeId(s){ return String(s || 'vid').replace(/[^a-z0-9_-]/gi, '').slice(0, 40); }
function newKey(id, mime){ return 'vids/' + safeId(id) + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + '.' + extFor(mime); }

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.MEDIA) return json({ error: 'no_bucket', message: 'Video hosting isn’t set up yet — add the R2 binding named MEDIA in Cloudflare.' });
  const u = new URL(request.url);
  const action = u.searchParams.get('action') || 'single';
  try {
    // ---- single-shot (small videos, <~90MB) -------------------------------
    if (action === 'single') {
      const len = parseInt(request.headers.get('content-length') || '0', 10);
      if (!len) return json({ error: 'empty', message: 'No video data.' });
      if (len > 99000000) return json({ error: 'toolarge_single', message: 'Too big for one request — use multipart.' });
      const mime = String(request.headers.get('content-type') || 'video/mp4').split(';')[0];
      if (!/^video\//.test(mime)) return json({ error: 'badtype', message: 'Not a video.' });
      const key = newKey(u.searchParams.get('id'), mime);
      await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: mime } });
      return json({ url: u.origin + '/img/' + key, key: key });
    }
    // ---- multipart: 1) create --------------------------------------------
    if (action === 'create') {
      const mime = String(u.searchParams.get('mime') || 'video/mp4').split(';')[0];
      if (!/^video\//.test(mime)) return json({ error: 'badtype', message: 'Not a video.' });
      const key = newKey(u.searchParams.get('id'), mime);
      const mp = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
      return json({ key: key, uploadId: mp.uploadId });
    }
    // ---- multipart: 2) one part ------------------------------------------
    if (action === 'part') {
      const key = u.searchParams.get('key'); const uploadId = u.searchParams.get('uploadId');
      const partNumber = parseInt(u.searchParams.get('part') || '0', 10);
      if (!key || !uploadId || !partNumber) return json({ error: 'badpart', message: 'Missing part info.' });
      const len = parseInt(request.headers.get('content-length') || '0', 10);
      if (len > 99000000) return json({ error: 'parttoobig', message: 'Chunk over the limit.' });
      const mp = env.MEDIA.resumeMultipartUpload(key, uploadId);
      const buf = await request.arrayBuffer();                 // ~40MB in memory — fine per invocation
      const uploaded = await mp.uploadPart(partNumber, buf);
      return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
    }
    // ---- multipart: 3) finish --------------------------------------------
    if (action === 'complete') {
      const key = u.searchParams.get('key'); const uploadId = u.searchParams.get('uploadId');
      if (!key || !uploadId) return json({ error: 'badcomplete', message: 'Missing upload info.' });
      const body = await request.json();                       // { parts:[{partNumber,etag},...] }
      const parts = (body && body.parts) || [];
      if (!parts.length) return json({ error: 'noparts', message: 'No parts to finish.' });
      const mp = env.MEDIA.resumeMultipartUpload(key, uploadId);
      await mp.complete(parts);
      return json({ url: u.origin + '/img/' + key, key: key });
    }
    // ---- multipart: abort (cleanup on failure) ---------------------------
    if (action === 'abort') {
      const key = u.searchParams.get('key'); const uploadId = u.searchParams.get('uploadId');
      try { const mp = env.MEDIA.resumeMultipartUpload(key, uploadId); await mp.abort(); } catch (e) {}
      return json({ ok: true });
    }
    return json({ error: 'badaction', message: 'Unknown action.' });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
