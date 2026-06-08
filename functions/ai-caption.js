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

// ── PRODUCT BRAIN ──────────────────────────────────────────────────────────
// GENERAL, true industry knowledge the AI can teach homeowners from (guidance,
// tips, food for thought). This is NOT a fact sheet about the job in the photo —
// it must never claim a specific job HAS a feature unless that feature was seen
// in the photo or stated in the owner's notes. Use it to add real value.
const KNOWLEDGE =
'WINDOW GUARDIANS PRODUCT KNOWLEDGE (general & true industry-wide — teach from this, never fabricate job specifics):\n' +
'• WINDOWS — styles: double-hung (both sashes tilt in for easy cleaning), casement (cranks out, tightest seal, great over a sink), sliders, bay/bow (adds space & light), picture/fixed. Frames: vinyl (low-maintenance, energy-efficient, most popular), fiberglass (strongest, paintable), wood-clad (warm inside, low-maintenance outside).\n' +
'• GLASS & EFFICIENCY: double- or triple-pane; Low-E coatings reflect heat (cooler summers, warmer winters); argon/krypton gas fill insulates; warm-edge spacers cut condensation. Look for the ENERGY STAR + NFRC label — U-factor = insulation (lower is better), SHGC = solar heat gain. What homeowners actually feel: lower energy bills, fewer drafts, less street noise, no more foggy or stuck sashes, UV protection for floors & furniture.\n' +
'• ENTRY DOORS: fiberglass (dent- & rot-proof, insulated core, can mimic real wood), steel (security, budget-friendly), wood (classic, more upkeep). Features worth knowing: multi-point locks, quality weatherstripping, insulated cores, decorative/privacy glass, sidelights & transoms. Payoffs: curb appeal, security, a draft-free entry.\n' +
'• PATIO DOORS: sliding (space-saving) vs French/hinged (wide opening, classic look); ask about Low-E glass and smooth, secure hardware.\n' +
'• SIDING: vinyl (low cost & upkeep), insulated vinyl (adds R-value/comfort), fiber cement like James Hardie (fire-resistant, long warranty, painted finish), engineered wood. Payoffs: protects the home, big curb-appeal & resale boost, less energy loss.\n' +
'• ROOFING: architectural/dimensional asphalt shingles (thicker, longer-lasting) vs basic 3-tab. The hidden stuff that prevents leaks & adds life: proper attic ventilation, ice-and-water shield, drip edge, and flashing done right.\n' +
'• QUALITY CUES homeowners should look for in ANY install: clean caulk lines, proper flashing & insulation around the opening, level/plumb fit, full job-site cleanup, and BOTH a manufacturer warranty AND a labor warranty. Window Guardians also offers free in-home estimates and financing.\n' +
'• HOME-STYLE FIT (Bucks County): colonials & farmhouses love double-hung with grids; mid-century & ranch homes suit sliders and big picture windows; casements shine over a kitchen sink and for max airflow; bays/bows add light and a sitting nook to a flat façade.\n' +
'• GLASS PACKAGES: a good double-pane Low-E + argon is the everyday sweet spot; triple-pane with dual Low-E is the premium comfort & quiet upgrade for busy roads or very cold rooms; obscure/privacy glass for baths; tempered (safety) glass near doors, floors and tubs.\n' +
'• READING THE LABEL: a U-factor around 0.30 or lower = strong insulation; SHGC tuned to exposure (lower on hot south/west faces); ENERGY STAR for the Northern climate zone is the bar to beat here in PA.\n' +
'• WHERE PREMIUM REALLY LIVES (the install): full-frame vs pocket/insert installs, a proper sill pan & flashing, low-expansion foam in the gaps, exterior trim capped/wrapped in coil stock, and a dead-level, square, weather-tight set. Cheap installs skip these — it is exactly why a "new" window can still draft or leak.\n' +
'• VALUE FRAMING: replacement windows & doors are consistently among the best resale ROI in remodeling; energy savings + comfort + curb appeal + quiet compound over the years; manufacturer + labor warranties and financing make it a low-risk upgrade.\n' +
'TEACHING STYLE: when it adds value, fold in ONE genuinely useful nugget — a quick tip, a "did you know," a question worth considering (food for thought), or what to look for — drawn from the knowledge above. Natural and friendly, never a lecture or a spec dump, never fear-mongering. If a feature was NOT seen/stated for this job, frame it as general guidance ("Low-E glass is worth asking about…"), not as a claim about this job.\n';

// ── BRAND VOICE / PERSONA ───────────────────────────────────────────────────
// What makes Window Guardians sound different from every other window company.
// Always present; the TONE control below decides how far toward "bold" to push.
const PERSONA =
'WINDOW GUARDIANS BRAND VOICE — this is what makes us different from every other window company:\n' +
'KEY INSIGHT: almost every contractor online is OVERLY confident — chest-thumping about how amazing they are, how nobody does it better, how you should be impressed. Homeowners are exhausted by it; it reads as a sales pitch and it is a turn-off. We go the OPPOSITE way. We sound like the witty, likable, refreshingly down-to-earth neighbor who happens to know windows cold — quietly confident, never a show-off. We make the HOMEOWNER and their home the hero, and let the wit + the work do the talking. We almost never talk about how great WE are.\n' +
'HOW WE WRITE:\n' +
'- Open with a HOOK that breaks the pattern — a twist, a confession, a personified jab at old windows. NEVER open with "We installed…".\n' +
'- Clever and witty with a little bite; dry sarcasm is welcome. Premium, never corny, never crude.\n' +
'- Confidence is QUIET — shown through sharp wit, real know-how and great results, never through bragging. BANNED energy: "we’re the best," "nobody does it better," "unmatched/unrivaled quality," "we don’t do good enough," and any chest-thumping self-praise. If a line is about how great WE are, rewrite it to be about the homeowner, the home, or the old-window villain.\n' +
'- Short and punchy. Say less, hit harder. Let the photos and the result speak — you supply the wit, not the hype.\n' +
'- Recurring villains we tease (NEVER the customer): old windows & doors acting like they have a personality and bad manners; the years-long "I\'ll get to it next year" procrastination; the quiet neighbor-envy a great-looking house creates.\n' +
'- Even the boldest post stays grounded — the real craftsmanship and product are the backbone under the joke.\n' +
'CALLS TO ACTION: sprinkle a soft CTA here and there — NOT every post (roughly one in three, or just one of the three caption options). Keep it light and varied: "free in-home estimate," "DM us," "link in bio," "we’re booking [season] now," "tap to get a quote," or "call/text 215-608-1075." Window Guardians’ real phone number is 215-608-1075 — use it in SOME CTAs (not every one). Use ONLY real offers (free estimate, financing). Never pushy, never the same CTA twice in a row.\n' +
'BE BRAVE: a safe, forgettable, corporate-sounding post is a FAILURE. The only thing worse than a joke that swings and misses is a caption so boring no one finishes it. Take the swing. The hard guardrails below are the ONLY limits — everything inside them is fair game, so commit fully and surprise people.\n' +
'HARD GUARDRAILS (never break, even as a joke):\n' +
'- Never mention or joke about politics or religion.\n' +
'- Never use profanity or crude/vulgar humor — clever, not dirty.\n' +
'- Never name, mock, or compare against competitors.\n' +
'- Never use fear-mongering or scare tactics ("your home is unsafe!"). Tease the inconvenience, never threaten.\n' +
'- Never insult the homeowner. The joke is always the OLD windows or the situation, with the reader in on it.\n';

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
  if (/credit balance|billing|insufficient|too low/i.test(body || '')) return '💳 Your Anthropic AI credit ran out. Add credits at console.anthropic.com → Plans & Billing, then try again.';
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
            : im.role === 'during' ? ' — labeled DURING (mid-install / work in progress; NOT the finished product)'
            : im.role === 'after'  ? ' — labeled AFTER (this is the NEW, finished product)'
            : '';
    content.push({ type: 'text', text: 'Photo ' + (idx + 1) + tag + ':' });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType || 'image/jpeg', data: im.data } });
  });
  content.push({ type: 'text', text: usrText });
  return content;
}

// Strip a web page down to readable text (drop scripts, styles, tags, entities).
function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Same registrable host? (ignore www.) — keeps the crawl on the company's own site.
function sameHost(a, b) {
  try { return new URL(a).host.replace(/^www\./, '') === new URL(b).host.replace(/^www\./, ''); } catch (e) { return false; }
}
// Pull same-site page links out of an HTML page (skips files, anchors, mailto/tel, off-site).
function extractLinks(html, base) {
  var out = [], seen = {}, m, re = /href\s*=\s*["']([^"']+)["']/gi;
  while ((m = re.exec(html))) {
    var href = (m[1] || '').trim();
    if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) continue;
    if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|mov|css|js|ico|woff2?|xml|rss)(\?|$)/i.test(href)) continue;
    var abs; try { abs = new URL(href, base).href; } catch (e) { continue; }
    abs = abs.split('#')[0];
    if (!/^https?:/i.test(abs) || !sameHost(abs, base)) continue;
    if (seen[abs]) continue; seen[abs] = 1; out.push(abs);
    if (out.length >= 120) break;
  }
  return out;
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
    const mode     = (body.mode === 'hashtags') ? 'hashtags' : (body.mode === 'fullpost') ? 'fullpost' : (body.mode === 'ingest') ? 'ingest' : 'caption';
    const style    = (body.style === 'elaborate' || body.style === 'funny' || body.style === 'advice' || body.style === 'bold' || body.style === 'boldmax') ? body.style : 'rewrite';
    const brain    = String(body.brain    || '').slice(0, 14000); // the owner's distilled company facts (from brochures/site)
    const voice    = String(body.voice    || '').slice(0, 6000); // the owner's voice/style notes + swipe file
    const note     = String(body.note     || '').slice(0, 1200); // per-post director's note (steer THIS post)
    const useDraft = (body.useDraft === true); // build on the owner's existing caption; default = invent a FRESH concept
    const bold     = (body.bold === true || style === 'bold' || style === 'boldmax');   // push the witty/edgy persona for this post
    const model    = env.ANTHROPIC_MODEL || DEFAULT_MODEL;

    // ── FETCHPAGE: grab ONE web page's readable text + its same-site links (no AI call).
    //    The client uses this to crawl a whole site page-by-page, then sends the text back via ingest.
    if (body.mode === 'fetchpage') {
      const u = String(body.url || '').slice(0, 1200);
      if (!/^https?:\/\//i.test(u)) return json({ error: 'badurl', message: 'Bad URL', text: '', links: [] });
      try {
        const pr = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WindowGuardiansBot/1.0)', 'accept': 'text/html' } });
        if (!pr.ok) return json({ error: 'fetch', status: pr.status, text: '', links: [] });
        const ct = pr.headers.get('content-type') || '';
        if (ct && !/text\/html|application\/xhtml|^$/i.test(ct)) return json({ text: '', links: [] }); // not an HTML page
        const html = await pr.text();
        return json({ text: htmlToText(html).slice(0, 32000), links: extractLinks(html, u) });
      } catch (e) { return json({ error: 'fetch', text: '', links: [] }); }
    }

    // ── INGEST: read a brochure (text already pulled from a PDF) or a website URL,
    //    then have Claude distill it into a tight, reusable fact sheet for the brain.
    if (mode === 'ingest') {
      const srcName = String(body.sourceName || '').slice(0, 120);
      const srcUrl  = String(body.url || '').slice(0, 500);
      // page-render images — used when a brochure is image-based / scanned (no selectable text). Claude reads them with vision.
      var ingImgs = Array.isArray(body.images)
        ? body.images.slice(0, 6).filter(function (im) { return im && typeof im.data === 'string' && im.data.length; })
            .map(function (im) { return { mediaType: (im.mediaType || 'image/jpeg'), data: String(im.data).slice(0, 4000000) }; })
        : [];
      var raw = String(body.rawText || '').slice(0, 60000);
      if (srcUrl && !raw && !ingImgs.length) {
        try {
          const pr = await fetch(srcUrl, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WindowGuardiansBot/1.0)', 'accept': 'text/html' } });
          if (!pr.ok) return json({ error: 'fetch', message: 'Couldn’t read that page (' + pr.status + '). If it’s a manufacturer site, try their brochure PDF instead.' });
          raw = htmlToText(await pr.text());
        } catch (e) {
          return json({ error: 'fetch', message: 'Couldn’t reach that website. Check the link, or use the brochure PDF instead.' });
        }
      }
      raw = raw.slice(0, 45000); // generous per-call window; the client chunks big brochures so every page still gets read
      if (!ingImgs.length && raw.replace(/\s/g, '').length < 40)
        return json({ error: 'empty', message: 'Not enough readable text found' + (srcUrl ? ' — that may be a JavaScript-heavy site. Try the brochure PDF instead.' : ' in that file.') });
      const dsys =
'You are a product-knowledge analyst building a DEEP, expert fact sheet on this window/door/siding/roofing product or brand, for Window Guardians (Langhorne, Bucks County PA) to use when writing social posts and answering homeowners. Become a genuine expert on this source — be thorough, not stingy.\n' +
'Extract EVERY concrete, reusable fact, grouped under clear headers. Capture, wherever the source states them:\n' +
'• Exact PRODUCT LINE / SERIES / MODEL names (real names, not generic).\n' +
'• Construction & MATERIALS: frame type & chambers, weld/joinery, reinforcement, sash/balance hardware, weatherstripping, cores.\n' +
'• GLASS & PERFORMANCE: glass-package names, pane count, Low-E type(s), gas fill, spacer type, and any NUMBERS — U-factor, SHGC, VT, air infiltration, STC/sound, ENERGY STAR zones, DP/structural ratings.\n' +
'• FEATURES each paired with the homeowner BENEFIT (so a writer can turn a spec into a selling point).\n' +
'• Options: colors/finishes, grille/grid styles, hardware, sizes/configurations.\n' +
'• WARRANTY specifics (what is covered, length, transferability, glass breakage), certifications, awards, made-in.\n' +
'• Ideal use-cases / what makes this product premium or distinctive vs. ordinary alternatives (no competitor names).\n' +
'• Any brand voice, taglines, financing, or service notes.\n' +
'Rules: keep ONLY what the source actually states — never invent a number, brand, claim, or rating. Skip pure fluff, but DO capture the meaningful detail; depth is the goal. Organize as short bullet lines under headers. Up to ~380 words. If the source is thin, return only what is really there.\n' +
'Return ONLY valid JSON: {"name":"short source label","brief":"HEADER\\n- fact\\n- fact"}';
      var dcontent;
      if (ingImgs.length) { // image-based / scanned brochure → Claude reads the page pictures with vision
        dcontent = [{ type: 'text', text: 'These are page images from a brochure that had NO selectable text. Read EVERY word in the images carefully — headers, spec tables, fine print, captions — and extract the fact sheet per the rules. Source label: ' + (srcName || 'brochure') }];
        ingImgs.forEach(function (im) { dcontent.push({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } }); });
      } else {
        dcontent = 'Source label: ' + (srcName || srcUrl || 'brochure') + '\n\nSource text:\n' + raw;
      }
      const dr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model, max_tokens: 3000, system: dsys, messages: [{ role: 'user', content: dcontent }] })
      });
      if (!dr.ok) { var de = ''; try { de = await dr.text(); } catch (e) {} return json({ error: 'api', status: dr.status, message: friendlyApiErr(dr.status, de) }); }
      const dd = await dr.json();
      const dtext = (dd && dd.content && dd.content[0] && dd.content[0].text) || '';
      const dobj = extractObj(dtext) || {};
      const brief = String(dobj.brief || dtext || '').slice(0, 9000).trim();
      if (!brief) return json({ error: 'empty', message: 'AI read it but couldn’t summarize — try again.' });
      return json({ brief: brief, name: String(dobj.name || srcName || srcUrl || 'Source').slice(0, 120) });
    }
    const images   = Array.isArray(body.images)
      ? body.images.slice(0, 4)
          .filter(function (im) { return im && typeof im.data === 'string' && im.data.length; })
          .map(function (im) { return { mediaType: (im.mediaType || 'image/jpeg'), data: String(im.data).slice(0, 4000000), role: (im.role === 'before' || im.role === 'after' || im.role === 'during') ? im.role : '' }; })
      : [];

    // Forced per-photo classification — the core safeguard against calling an OLD/unfinished window the new install.
    const VISION_RULE = images.length ?
('PHOTO CHECK — do this FIRST, before writing anything:\n' +
'Classify EACH attached photo as one of: "new_finished" (a brand-new, fully finished window/door — clean new frame, crisp caulk & trim, no tools or debris), "old_before" (an old/existing unit, or anything labeled BEFORE), "in_progress" (mid-install — gaps, tools, missing trim), or "other" (crew, interior, materials, wide exterior, landscaping, etc.).\n' +
'The stage label above each photo is the source of truth when present: BEFORE => old_before, DURING => in_progress, AFTER => new_finished.\n' +
'HARD RULE: you may credit a NEW install or a "finished/new" product ONLY if at least one attached photo is "new_finished". If none are, write a transformation, behind-the-scenes, or teaser caption instead — NEVER describe an old, existing, or unfinished window as the new install.\n' +
'BEFORE-ONLY RULE: if EVERY photo is "old_before" (only before/old shots, no after, no during, no finished), set "warn" to "Before-only photos — needs an After or During shot before posting." and write only a teaser ("transformation coming…"). A before photo is fine alongside an after or a during shot, never on its own.\n' +
'Set "warn" to a SHORT plain-English heads-up (e.g. "Photo 1 looks like the old/before window — written as a transformation; double-check before posting.") whenever the finished NEW product is NOT clearly shown. If a new finished product is clearly shown, set "warn" to "".\n')
: '';

    // The owner's distilled company facts (from their brochures & website) — verified true for THIS company.
    const BRAIN_BLOCK = brain ?
('VERIFIED WINDOW GUARDIANS FACTS — pulled from the company’s own brochures & website, so you MAY state these confidently as true for Window Guardians (use the real product/line names, features, warranty, financing, service area where they fit):\n' +
brain + '\n' +
'(Still: do not attach a specific feature to THIS job unless it was seen in the photo or stated in the notes — when unsure, speak generally.)\n')
: '';

    // The owner's voice notes + swipe file (examples they love) — style fuel, learn by example.
    const VOICE_BLOCK = voice ?
('OWNER’S VOICE & SWIPE FILE — brand-voice rules, angles, local flavor, offers, and example posts the owner LOVES. Match this energy, structure and attitude. Treat example posts as STYLE references — never copy them word-for-word, write fresh lines in the same spirit:\n' +
voice + '\n')
: '';

    // Per-post director's note — the owner's specific steer for THIS post. High priority.
    const NOTE_BLOCK = note ?
('OWNER’S DIRECTION FOR THIS SPECIFIC POST — follow it closely. It steers the angle, facts to emphasize, audience, or ask. It overrides default angle choices, but NEVER the hard guardrails:\n"' + note + '"\n')
: '';

    // The post can be ANY angle; the product just has to be credited (woven in, or a final credit line).
    const ANGLE_CREDIT =
'- ANGLE FREEDOM: the post can be WHATEVER you see fit — a story, a joke, an observation, a question, a tip. It does NOT have to describe the product or job literally. Be genuinely creative; surprise the reader.\n' +
'- PRODUCT CREDIT (required): the product/brand must always appear somewhere. If you name it naturally in the caption, done. If you do NOT, add a FINAL line crediting it, formatted: "Installed: <product line + key features actually shown or stated>" — e.g. "Installed: ProVia Legacy Steel entry door · black grids · AZEK trim". Use ONLY products/features actually seen in the photo or stated in the facts/notes; NEVER invent a brand — if the exact brand is unknown, credit the generic type you can see (e.g. "Installed: new black double-hung windows"). About 1 in 3 posts, add a short CTA onto that line (free estimate · call/text 215-608-1075).\n';
    // Fresh by default; the owner can flip "use my words" to build on their draft instead.
    const FRAMING = (useDraft && caption)
      ? 'The owner gave you a draft below — keep its facts and intent and polish it into a finished, on-brand caption.\n'
      : 'Write a FRESH, original post from scratch — do NOT reword any earlier caption. Build the idea from the photos, the job and the known facts (plus the owner’s note if given). Choose a genuinely interesting angle; if asked again, pick a DIFFERENT angle than the obvious one so options never feel recycled.\n';
    // TONE control — about 45% of generated posts come in bold; the rest stay warm/proud.
    const TONE = bold
      ? 'TONE: BOLD & a little UNHINGED — this is the post people screenshot and text to a friend. Think Liquid Death / Old Spice energy: absurd, unexpected, gleefully dramatic, a hook that makes people do a double-take. Personify the old windows, invent a tiny over-the-top scenario, commit to a ridiculous bit — go further than feels comfortable. Do NOT hedge, do NOT sound like a company, do NOT play it safe; a tame post is a failure. BUT land the plane: every wild swing still ties back to the real craftsmanship/product by the end — chaos with a point, not chaos for its own sake. That balance (unhinged + actually about great windows) is the whole game. Stay 100% inside the hard guardrails — that is the ONE rule; everything inside them is fair game. Short, punchy, fearless. Make at least 2 of the 3 options swing hard; one may be a touch more grounded.\n'
      : 'TONE: keep the warm, proud, confident voice with a light witty touch — clean and on-brand. Still never the boring "We installed…" opener; give it a little spark.\n';

    var sys, usr;
    if (mode === 'hashtags') {
      sys =
'You generate social media hashtag sets for Window Guardians, a premium exterior remodeling company in Langhorne, Bucks County, PA (replacement windows, entry & patio doors, siding, roofing).\n' +
BRAIN_BLOCK +
NOTE_BLOCK +
'Rules:\n' +
'- Each set = 10 to 15 hashtags: branded + the actual PRODUCT/brands used + the service shown + local + a few broader reach tags homeowners search.\n' +
'- HARD RULE #1 — ALWAYS include the brand #WindowGuardians.\n' +
'- HARD RULE #2 — ALWAYS hashtag the actual PRODUCT lines/brands used in this post (from the facts/notes/caption — e.g. Okna, ProVia, AZEK, James Hardie), and tag each in MULTIPLE natural forms, e.g. #Okna500 #OknaWindows #Okna, or #AZEKtrim #AZEK, or #ProViaDoors #ProVia. Product + brand tags appear in EVERY set. If no specific product is known, use the generic product type (#ReplacementWindows #VinylWindows etc.).\n' +
'- Local: include #BucksCountyPA, #LanghornePA, and the post’s town when given.\n' +
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
PERSONA +
KNOWLEDGE +
BRAIN_BLOCK +
VOICE_BLOCK +
NOTE_BLOCK +
TONE +
'Rules:\n' +
VISION_RULE +
'- Base everything on what you can actually SEE plus the facts given (e.g. white double-hung windows, a black entry door, new siding, brick facade). NEVER invent a brand, material, count, price, or warranty that was not given.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
'- captions: 3 distinct options, each 1 to 3 short sentences, no hashtags, at most one emoji. Make the three DIFFERENT in angle — but ALL in the brand voice with a pattern-breaking hook (never the boring "We installed…" opener). Follow the TONE above for how bold to go. Lean on the recurring villains (old/ugly/drafty units, the years-long procrastination, neighbor envy) when they fit.\n' +
ANGLE_CREDIT +
'- hashtags: ONE set of 10 to 15 relevant tags. ALWAYS include the brand #WindowGuardians AND hashtag the actual PRODUCT lines/brands used (e.g. #Okna500 #OknaWindows #Okna, #AZEKtrim #AZEK, #ProViaDoors) in multiple natural forms; add a local tag (#BucksCountyPA + the town); match what the photos actually show.\n' +
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
        : style === 'advice'
          ? '- MODE: ADVICE / EDUCATE. Write a helpful, expert caption that teaches the homeowner something real and useful — a tip, a "did you know," what to look for, or food for thought — drawn from the product knowledge above. Lead with the value, tie it to the post, end with a soft invitation to ask or learn more. 2 to 4 sentences. General guidance only unless a feature was actually seen/stated; never fabricate job specifics.'
        : style === 'bold'
          ? '- MODE: BOLD. Full witty/edgy brand voice — a scroll-stopping head-turner. Open with a pattern-breaking hook, lean on the recurring villains (old/ugly/drafty units, the years-long procrastination, neighbor envy), dry sarcasm welcome. Clever, never crude; confident, never corny. 1 to 3 punchy sentences, all inside the hard guardrails.'
        : style === 'boldmax'
          ? '- MODE: BOLD MAX 🔥 — completely UNHINGED. Maximum head-turner, borderline reckless, the kind of caption that makes someone stop dead and go "did a WINDOW company really just post that?!" Go WAY bigger than feels reasonable: absurd premises, wild metaphors, theatrical drama, deadpan chaos, personify the old windows as full-on menaces. Commit harder than Bold — no safety net, no hedging, swing for the fences. BUT: (1) still land it on the real craftsmanship by the last line, and (2) the hard guardrails are ABSOLUTE and unbreakable — no profanity, no politics/religion, no naming competitors, no fear-mongering, never insult the homeowner. Borderline, never over the line. 1 to 3 explosive sentences.'
          : '- MODE: REWRITE. Produce a clean, polished, ready-to-post caption. Keep it tight: 1 to 3 short sentences.';
      sys =
'You write social media captions for Window Guardians, a premium exterior remodeling company in Langhorne, PA (replacement windows, entry & patio doors, siding, roofing).\n' +
PERSONA +
'You are also a genuine exterior-remodeling expert who can teach, guide, and give homeowners food for thought when it adds value.\n' +
KNOWLEDGE +
BRAIN_BLOCK +
VOICE_BLOCK +
NOTE_BLOCK +
TONE +
FRAMING +
'Rules:\n' +
VISION_RULE +
'- NEVER invent brands, materials, counts, prices, warranties, or claims that were not seen or given.\n' +
'- Perfect grammar, spelling, capitalization, and flow.\n' +
'- If a town is given, work it in naturally (local pride).\n' +
ANGLE_CREDIT +
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
      return json({ error: 'api', status: r.status, message: friendlyApiErr(r.status, errText), detail: String(errText).slice(0, 400) });
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
