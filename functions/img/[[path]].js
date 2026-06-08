// Public image server — serves a post photo stored in R2 (binding "MEDIA") at /img/<key>.
// No auth: these are images you're publishing to social anyway; keys are unguessable.
export async function onRequestGet(context) {
  const { env, params } = context;
  if (!env.MEDIA) return new Response('Image hosting not configured', { status: 404 });
  const key = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  if (!key) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('access-control-allow-origin', '*');
  return new Response(obj.body, { headers });
}
