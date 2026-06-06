// Window Guardians — AI caption backend (Cloudflare Pages Function)
// Lives at  POST /ai-caption  on the same site. Holds the Anthropic key as a
// Cloudflare secret (env.ANTHROPIC_API_KEY) so it NEVER touches the browser.
//
// Setup (one time, done in the Cloudflare dashboard — see chat steps):
//   Settings > Environment variables > add  ANTHROPIC_API_KEY = sk-ant-...
//   (optional)  ANTHROPIC_MODEL = claude-sonnet-4-5
//
// Returns 200 with { options:[...] } on success, or 200 with { error, message }
// so the front-end can show a friendly note and fall back to built-in suggestions.

const DEFAULT_MODEL = 'claude-sonnet-4-6';

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

// Health check: GET /ai-caption  -> tells the app if the key is set (without revealing it)
export async function onRequestGet(context) {
  return json({ ok: true, configured: !!context.env.ANTHROPIC_API_KEY });
}

function friendlyApiErr(status, body) {
  if (status === 401 || status === 403) return 'The AI key is missing or wrong — re-check ANTHROPIC_API_KEY in Cloudflare.';
  if (status === 400 && /model/i.test(body || '')) return 'AI model name not recognized — set ANTHROPIC_MODEL in Cloudflare.';
  if (status === 429) return 'AI is busy or out of credit — top up your Anthropic balance and try again.';
  if (status >= 500) return 'The AI service hiccuped — try again in a moment.';
  return 'AI request failed (' + status + ').';
}

function parseOptions(text) {
  if (!text) return [];
  // 1) clean JSON
  try {
    var d = JSON.parse(text);
    if (d && Array.isArray(d.options)) return d.options.filter(Boolean).slice(0, 3);
  } catch (e) {}
  // 2) JSON buried in prose
  var m = text.match(/\{[\s\S]*\}/);
  if (m) { try { var d2 = JSON.parse(m[0]); if (d2 && Array.isArray(d2.options)) return d2.options.filter(Boolean).slice(0, 3); } catch (e) {} }
  // 3) fall back: split into non-empty lines, strip numbering/quotes
  return text.split(/\n+/).map(function (s) {
    return s.replace(/^\s*(\d+[\).]|[-*•])\s*/, '').replace(/^["']|["']$/g, '').trim();
  }).filter(function (s) { return s.length > 8; }).slice(0, 3);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) return json({ error: 'no_key', message: 'AI isn’t set up yet — add ANTHROPIC_API_KEY in Cloudflare.' });

    var body = {};
    try { body = await request.json(); } catch (e) {}
    const caption  = String(body.caption  || '').slice(0, 2000);
    const jobNote  = String(body.jobNote  || '').slice(0, 2000);
    const town     = String(body.town     || '').slice(0, 80);
    const grounding= String(body.grounding|| '').slice(0, 2000);
    const type     = (body.type === 'reel' || body.type === 'video') ? 'video' : 'photo';
    const model    = env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    const sys =
'You write social media captions for Window Guardians, a premium exterior remodeling company in Langhorne, PA (replacement windows, entry & patio doors, siding, roofing).\n' +
'Voice: warm, confident, proud of the craftsmanship — never salesy, hypey, or full of buzzwords. Plain English a real homeowner would use. Short sentences.\n' +
'Rules:\n' +
'- Keep the owner’s facts and meaning. NEVER invent brands, materials, counts, prices, warranties, or claims that were not given.\n' +
'- Fix all grammar, spelling, capitalization, and flow.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
'- 1 to 3 short sentences. No hashtags. At most one emoji, only if it fits.\n' +
'- Return ONLY valid JSON in this exact shape: {"options":["option one","option two","option three"]} — three distinct captions, nothing else.';

    const usr =
'Town: ' + (town || '(none)') + '\n' +
'What the owner typed (their voice — preserve it): ' + (caption || '(nothing yet — write a fresh one)') + '\n' +
'Job note (what was actually done): ' + (jobNote || '(none)') + '\n' +
'Product / trade facts you MAY weave in if they fit (do not force, do not add others): ' + (grounding || '(none)') + '\n' +
'Media type: ' + type + '.\n' +
'Write 3 caption options now.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 700,
        system: sys,
        messages: [{ role: 'user', content: usr }]
      })
    });

    if (!r.ok) {
      var errText = '';
      try { errText = await r.text(); } catch (e) {}
      return json({ error: 'api', status: r.status, message: friendlyApiErr(r.status, errText) });
    }

    const data = await r.json();
    const text = (data && data.content && data.content[0] && data.content[0].text) || '';
    const options = parseOptions(text);
    if (!options.length) return json({ error: 'empty', message: 'AI replied but I couldn’t read it — try again.' });
    return json({ options: options });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
