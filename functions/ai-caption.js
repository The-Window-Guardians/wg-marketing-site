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

// Build the Claude message content: each image gets a small label (incl. its Before/After tag),
// then the image, then the text prompt. The labels stop the AI from calling an OLD window the new install.
function buildContent(images, usrText) {
  if (!images || !images.length) return usrText;
  var content = [];
  images.forEach(function (im, idx) {
    var tag = im.role === 'before' ? ' — labeled BEFORE (this is the OLD / existing window; never describe it as newly installed)'
            : im.role === 'after'  ? ' — labeled AFTER (this is the NEW, finished product)'
            : '';
    content.push({ type: 'text', text: 'Photo ' + (idx + 1) + tag + ':' });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType || 'image/jpeg', data: im.data } });
  });
  content.push({ type: 'text', text: usrText });
  return content;
}

// Parse the one-tap full-post JSON: { captions:[..], hashtags:"..", category:".." }
function parseFullPost(text) {
  if (!text) return null;
  var obj = null;
  try { obj = JSON.parse(text); } catch (e) {
    var m = text.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!obj || typeof obj !== 'object') return null;
  var caps = Array.isArray(obj.captions) ? obj.captions.filter(Boolean).slice(0, 3)
           : (obj.caption ? [obj.caption] : []);
  if (!caps.length) return null;
  var tags = typeof obj.hashtags === 'string' ? obj.hashtags
           : (Array.isArray(obj.hashtags) ? obj.hashtags.join(' ') : '');
  var cat = typeof obj.category === 'string' ? obj.category.toLowerCase().trim() : '';
  if (!{ portfolio: 1, edu: 1, fun: 1, customer: 1 }[cat]) cat = '';
  return { captions: caps, hashtags: tags, category: cat };
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
    const mode     = (body.mode === 'hashtags') ? 'hashtags' : (body.mode === 'fullpost') ? 'fullpost' : 'caption';
    const style    = (body.style === 'elaborate' || body.style === 'funny') ? body.style : 'rewrite';
    const model    = env.ANTHROPIC_MODEL || DEFAULT_MODEL;
    const images   = Array.isArray(body.images)
      ? body.images.slice(0, 4)
          .filter(function (im) { return im && typeof im.data === 'string' && im.data.length; })
          .map(function (im) { return { mediaType: (im.mediaType || 'image/jpeg'), data: String(im.data).slice(0, 4000000), role: (im.role === 'before' || im.role === 'after') ? im.role : '' }; })
      : [];

    var sys, usr;
    if (mode === 'hashtags') {
      sys =
'You generate social media hashtag sets for Window Guardians, a premium exterior remodeling company in Langhorne, Bucks County, PA (replacement windows, entry & patio doors, siding, roofing).\n' +
'Rules:\n' +
'- Each set = 8 to 12 hashtags: a mix of branded (#WindowGuardians), the actual service shown, local (#BucksCountyPA, #LanghornePA and nearby towns), and a few broader reach tags homeowners search.\n' +
'- Always include #WindowGuardians. If a town is given, include a local tag for it.\n' +
'- Match the hashtags to what the post is actually about — do not tag siding on a window post.\n' +
'- Each hashtag is one word, no spaces, no punctuation except the leading #. Separate tags with single spaces.\n' +
'- Return ONLY valid JSON in this exact shape: {"options":["#a #b #c","#d #e #f","#g #h #i"]} — three distinct sets, nothing else.';
      usr =
'Town: ' + (town || '(none)') + '\n' +
'Caption / what the post says: ' + (caption || '(none)') + '\n' +
'What was done: ' + (jobNote || '(none)') + '\n' +
'Product / trade context: ' + (grounding || '(none)') + '\n' +
'Media type: ' + type + '.\n' +
'Write 3 hashtag sets now.';
    } else if (mode === 'fullpost') {
      sys =
'You are the social media manager for Window Guardians, a premium exterior remodeling company in Langhorne, Bucks County, PA (replacement windows, entry & patio doors, siding, roofing).\n' +
'You are shown one or more PHOTOS of a real job, plus an optional note from the owner. Look closely at the photos and write a complete, ready-to-post social post.\n' +
'Voice: warm, confident, proud of the craftsmanship — plain English a homeowner uses, never salesy, hypey, or buzzwordy.\n' +
'Rules:\n' +
'- Base everything on what you can actually SEE plus the facts given (e.g. white double-hung windows, a black entry door, new siding, brick facade). NEVER invent a brand, material, count, price, or warranty that was not given.\n' +
'- NEW vs OLD (very important): only say a window/door was newly installed or finished if a photo CLEARLY shows a brand-new, finished unit (clean new frame, crisp caulk and trim, no tools/debris). If a photo shows an OLD/existing window, a mid-install/in-progress shot, or the crew working — or you are not sure it is the finished new product — do NOT claim "we installed this new window." Describe it honestly instead (the before, the process, the team, the transformation). Trust the BEFORE/AFTER labels above each photo: BEFORE = the old window (never promote it as new); AFTER = the finished new product.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
'- captions: 3 distinct options, each 1 to 3 short sentences, no hashtags, at most one emoji.\n' +
'- hashtags: ONE set of 8 to 12 relevant tags — always include #WindowGuardians and a local tag if a town is given; match what the photos actually show.\n' +
'- category: pick the single best fit from EXACTLY this list — "portfolio" (the work itself / before-after / installs / craftsmanship), "edu" (tips / what homeowners should know), "fun" (behind-the-scenes / crew / lighter), "customer" (reviews / happy homeowners / thank-yous).\n' +
'- Return ONLY valid JSON in this exact shape: {"captions":["..","..",".."],"hashtags":"#a #b #c","category":"portfolio"} — nothing else.';
      usr =
'Town: ' + (town || '(none)') + '\n' +
'Owner note (optional): ' + (caption || jobNote || '(none)') + '\n' +
'Product / trade facts you MAY weave in if they fit (do not force, do not add others): ' + (grounding || '(none)') + '\n' +
'Media type: ' + type + '.\n' +
(images.length ? ('There ' + (images.length > 1 ? ('are ' + images.length + ' photos') : 'is 1 photo') + ' attached — look closely and describe the real work.') : '(No photo attached — write from the note.)') + '\n' +
'Write the full post now as JSON.';
    } else {
      var styleRule =
        style === 'elaborate'
          ? '- MODE: ELABORATE. Expand into a fuller caption — add a little story, context, and benefit to the homeowner. 2 to 4 sentences. Still 100% truthful: do not invent any fact.'
        : style === 'funny'
          ? '- MODE: FUNNY. Write a light, playful, genuinely funny caption (a wink, a relatable joke about old drafty windows, etc.) — still on-brand and tasteful, not corny or unprofessional. 1 to 3 short sentences.'
          : '- MODE: REWRITE. Produce a clean, polished, ready-to-post caption. Keep it tight: 1 to 3 short sentences.';
      sys =
'You write social media captions for Window Guardians, a premium exterior remodeling company in Langhorne, PA (replacement windows, entry & patio doors, siding, roofing).\n' +
'Voice: warm, confident, proud of the craftsmanship — never salesy, hypey, or full of buzzwords. Plain English a real homeowner would use.\n' +
'The owner’s text below may be EITHER a rough draft caption OR a plain-English description of what they want the post to say. Either way, turn it into a finished caption — never echo an instruction back literally.\n' +
'Rules:\n' +
'- Keep the owner’s facts and meaning. NEVER invent brands, materials, counts, prices, warranties, or claims that were not given.\n' +
'- NEW vs OLD (very important): if photos are attached, only say a window/door was newly installed or finished if a photo CLEARLY shows a brand-new, finished unit (clean new frame, crisp caulk and trim, no tools/debris). If a photo shows an OLD/existing window, a mid-install/in-progress shot, or the crew working — or you are unsure — do NOT claim it is the new install. Describe it honestly (the before, the process, the team). Trust any BEFORE/AFTER labels: BEFORE = old (never promote as new); AFTER = the finished product.\n' +
'- Fix all grammar, spelling, capitalization, and flow.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
styleRule + '\n' +
'- No hashtags. At most one emoji, only if it fits.\n' +
'- Return ONLY valid JSON in this exact shape: {"options":["option one","option two","option three"]} — three distinct captions, nothing else.';
      usr =
'Town: ' + (town || '(none)') + '\n' +
'The owner wrote (may be a draft caption OR a description of what they want): ' + (caption || jobNote || '(nothing yet — write a fresh, on-brand caption for this kind of job)') + '\n' +
'Extra context on the job: ' + (jobNote || '(none)') + '\n' +
'Product / trade facts you MAY weave in if they fit (do not force, do not add others): ' + (grounding || '(none)') + '\n' +
'Media type: ' + type + '.\n' +
'Write 3 caption options now.';
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: (mode === 'fullpost') ? 900 : 700,
        system: sys,
        messages: [{ role: 'user', content: buildContent(images, usr) }]
      })
    });

    if (!r.ok) {
      var errText = '';
      try { errText = await r.text(); } catch (e) {}
      return json({ error: 'api', status: r.status, message: friendlyApiErr(r.status, errText) });
    }

    const data = await r.json();
    const text = (data && data.content && data.content[0] && data.content[0].text) || '';
    if (mode === 'fullpost') {
      const fp = parseFullPost(text);
      if (!fp) return json({ error: 'empty', message: 'AI replied but I couldn’t read it — try again.' });
      return json(fp);
    }
    const options = parseOptions(text);
    if (!options.length) return json({ error: 'empty', message: 'AI replied but I couldn’t read it — try again.' });
    return json({ options: options });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
