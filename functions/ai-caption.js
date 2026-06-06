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

// Pull a JSON object out of the model text (clean, or buried in prose).
function extractObj(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  var m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
  return null;
}
// Normalize the per-photo classification + a safety warning string.
function normPhotos(obj) {
  var kinds = { new_finished: 1, old_before: 1, in_progress: 1, other: 1 };
  var out = [];
  if (obj && Array.isArray(obj.photos)) {
    obj.photos.forEach(function (p, i) {
      if (!p) return;
      var k = String(p.kind || '').toLowerCase().trim();
      out.push({ n: (typeof p.n === 'number' ? p.n : i + 1), kind: kinds[k] ? k : 'other' });
    });
  }
  return out;
}
function normWarn(obj) {
  return (obj && typeof obj.warn === 'string') ? obj.warn.slice(0, 300) : '';
}

// Parse the one-tap full-post JSON: { photos, warn, captions, hashtags, category }
function parseFullPost(text) {
  var obj = extractObj(text);
  if (!obj || typeof obj !== 'object') return null;
  var caps = Array.isArray(obj.captions) ? obj.captions.filter(Boolean).slice(0, 3)
           : (obj.caption ? [obj.caption] : []);
  if (!caps.length) return null;
  var tags = typeof obj.hashtags === 'string' ? obj.hashtags
           : (Array.isArray(obj.hashtags) ? obj.hashtags.join(' ') : '');
  var cat = typeof obj.category === 'string' ? obj.category.toLowerCase().trim() : '';
  if (!{ portfolio: 1, edu: 1, fun: 1, customer: 1 }[cat]) cat = '';
  return { captions: caps, hashtags: tags, category: cat, warn: normWarn(obj), photos: normPhotos(obj) };
}

// Parse caption JSON: { photos, warn, options }
function parseCaption(text) {
  var obj = extractObj(text);
  if (obj && Array.isArray(obj.options)) {
    return { options: obj.options.filter(Boolean).slice(0, 3), warn: normWarn(obj), photos: normPhotos(obj) };
  }
  // fallback: salvage lines if JSON shape was off
  var opts = String(text || '').split(/\n+/).map(function (s) {
    return s.replace(/^\s*(\d+[\).]|[-*•])\s*/, '').replace(/^["']|["']$/g, '').trim();
  }).filter(function (s) { return s.length > 8 && s[0] !== '{' && s[0] !== '}'; }).slice(0, 3);
  return { options: opts, warn: '', photos: [] };
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

    // Forced per-photo classification — the core safeguard against calling an OLD/unfinished window the new install.
    const VISION_RULE = images.length ?
('PHOTO CHECK — do this FIRST, before writing anything:\n' +
'Classify EACH attached photo as one of: "new_finished" (a brand-new, fully finished window/door — clean new frame, crisp caulk & trim, no tools or debris), "old_before" (an old/existing unit, or anything labeled BEFORE), "in_progress" (mid-install — gaps, tools, missing trim), or "other" (crew, interior, materials, wide exterior, landscaping, etc.).\n' +
'The BEFORE/AFTER label above each photo is the source of truth when present: BEFORE => old_before, AFTER => new_finished.\n' +
'HARD RULE: you may credit a NEW install or a "finished/new" product ONLY if at least one attached photo is "new_finished". If none are, write a transformation, behind-the-scenes, or teaser caption instead — NEVER describe an old, existing, or unfinished window as the new install.\n' +
'Set "warn" to a SHORT plain-English heads-up (e.g. "Photo 1 looks like the old/before window — written as a transformation; double-check before posting.") whenever the finished NEW product is NOT clearly shown. If a new finished product is clearly shown, set "warn" to "".\n')
: '';

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
VISION_RULE +
'- Base everything on what you can actually SEE plus the facts given (e.g. white double-hung windows, a black entry door, new siding, brick facade). NEVER invent a brand, material, count, price, or warranty that was not given.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
'- captions: 3 distinct options, each 1 to 3 short sentences, no hashtags, at most one emoji.\n' +
'- hashtags: ONE set of 8 to 12 relevant tags — always include #WindowGuardians and a local tag if a town is given; match what the photos actually show.\n' +
'- category: pick the single best fit from EXACTLY this list — "portfolio" (the work itself / before-after / installs / craftsmanship), "edu" (tips / what homeowners should know), "fun" (behind-the-scenes / crew / lighter), "customer" (reviews / happy homeowners / thank-yous).\n' +
'- Return ONLY valid JSON in this exact shape: {"photos":[{"n":1,"kind":"new_finished"}],"warn":"","captions":["..","..",".."],"hashtags":"#a #b #c","category":"portfolio"} — nothing else.';
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
VISION_RULE +
'- Keep the owner’s facts and meaning. NEVER invent brands, materials, counts, prices, warranties, or claims that were not given.\n' +
'- Fix all grammar, spelling, capitalization, and flow.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
styleRule + '\n' +
'- No hashtags. At most one emoji, only if it fits.\n' +
'- Return ONLY valid JSON in this exact shape: ' + (images.length ? '{"photos":[{"n":1,"kind":"new_finished"}],"warn":"","options":["one","two","three"]}' : '{"options":["one","two","three"]}') + ' — three distinct captions, nothing else.';
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
        max_tokens: (mode === 'fullpost') ? 1000 : (images.length ? 900 : 700),
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
    const cap = parseCaption(text);
    if (!cap.options.length) return json({ error: 'empty', message: 'AI replied but I couldn’t read it — try again.' });
    return json({ options: cap.options, warn: cap.warn, photos: cap.photos });
  } catch (e) {
    return json({ error: 'exception', message: String((e && e.message) || e) });
  }
}
