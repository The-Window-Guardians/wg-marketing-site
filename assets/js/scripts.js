/* ============================================================
   Window Guardians · Marketing OS — front-end prototype
   ------------------------------------------------------------
   This is the FRONT-END ONLY build (HTML + CSS + vanilla JS/jQuery).
   The backend (PHP + MySQL) will be added by the programmer later.

   BACKEND HOOK POINTS for the programmer:
     • Store.load()/Store.save()  → replace localStorage with PHP/MySQL
       (e.g. GET state.php / POST state.php writing a `state` row as JSON).
     • IndexedDB file layer (db/fileAdd/fileList/…) → replace with PHP
       upload endpoints + a MySQL `files` table + disk/S3 blob storage.
     • The "pick your name" gate → replace with a real PHP session login;
       map the 3 roles (sebastian/bogdan/ruth) to user accounts.
     • Each *.html page is a thin shell; convert each to *.php, move the
       shared chrome (top bar + sidebar + gate) into a PHP include, and
       turn the render functions below into server-rendered templates fed
       by the same data objects (PEOPLE, WEEKS, KPIS, AUDIT, …).
   Nothing in the UI changes when the data layer is swapped — it is isolated.
   ============================================================ */

/* ============================================================
   DATA LAYER  (the only part the programmer touches to add the backend)
   ============================================================ */
const KEY='wg_mktg_os_v2';
const Store={
  load(){ try{return JSON.parse(localStorage.getItem(KEY))||null}catch(e){return null} },
  save(s){ try{ localStorage.setItem(KEY,JSON.stringify(s)); }
    catch(e){ if(typeof toast==='function')toast('Storage is full — post & archive some content to free space.'); }
    /* SYNC HOOK (backend): also push `s` to MySQL here, e.g.
       POST state.php  { id:'seo_q3_2026', json:s, updated_at:NOW() } */
  }
};
/* in-memory video frame-grab cache — NEVER persisted (base64 frames would blow the ~5MB localStorage quota) */
const VTHUMB={};
/* a media item is "located" only when BOTH coords are real numbers (a half-set coord → NaN distance → broken clusters) */
function hasLoc(m){return m&&typeof m.lat==='number'&&typeof m.lng==='number'}

/* ---- People (3 active now; system is built to add more later) ---- */
const PEOPLE={
  sebastian:{name:'Sebastian',role:'Owner — content + approvals',av:'S',c:'#f15a24',bg:'#fde7da',
    fn:'Owner — content + approvals only, plus 3 town blogs every Tuesday. You unblock; you don’t build.'},
  bogdan:{name:'Bogdan',role:'Web developer — the builder',av:'B',c:'#2a548f',bg:'#e6effb',
    fn:'The builder — you make every change live on the site, then hand off so the next person can move.'},
  ruth:{name:'Ruth',role:'Execution engine — reviews, data & photos',av:'R',c:'#1f9d57',bg:'#e1f1e8',
    fn:'The execution engine — you run the reviews machine and the data + photos Bogdan needs. Follow the steps in order; if a step is unclear, ask Bogdan before Tuesday.'}
};
const TEAM_ORDER=['bogdan','ruth','sebastian']; // full roster — used by the login gate + top bar (program rosters can be a subset)

/* ============================================================
   ACCOUNTS / LOGIN  (front-end prototype layer)
   - S.users[] : the managed account list (id, name, perm, password hash, active)
   - S.uid     : who is logged in (drives PERMISSIONS — cannot be changed by the
                 "view as" dropdown, only by logging in)
   - S.role    : the "view tasks as" filter only (Everyone / a person)
   Permissions: 'owner' (full + admin) · 'editor' (build + approve) · 'poster' (Ruth-style: queue only).
   NOTE: a browser-only password check is NOT real security — the developer wires
   this to Firebase Auth (see FIREBASE_HANDOFF) so it's enforced server-side. Until
   then, treat logins as a workflow convenience, not a lock.
   ============================================================ */
function hashPw(s){s=String(s||'');let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return 'h'+h.toString(36);}
function userById(id){return (Array.isArray(S.users)?S.users.find(u=>u.id===id):null)||null;}
function curUser(){return userById(S.uid);}
function amPoster(){const u=curUser();return !!u&&u.perm==='poster';} // the ACTUAL logged-in user is a poster (used to truly lock them)
function isPoster(){const me=curUser(); if(me&&me.perm==='poster')return true; const v=userById(S.role); return !!(me&&v&&v.perm==='poster');} // poster EXPERIENCE: real poster, or owner/editor previewing a poster via "view as"
function isContributor(){const me=curUser(); if(me&&me.perm==='contributor')return true; const v=userById(S.role); return !!(me&&v&&v.perm==='contributor');} // contributor experience: real one, or previewing one
function personOf(id){return PEOPLE[id] || userById(id) || {name:String(id||'?'),av:'?',c:'#64748b',bg:'#e5e7eb',role:''};}
/* which dashboards an account may open (owner = all; everyone else = their assigned list) */
function userProgs(u){ if(!u)return PROGRAM_ORDER.slice(); if(u.perm==='owner')return PROGRAM_ORDER.slice(); return (Array.isArray(u.progs)&&u.progs.length)?u.progs:['social']; }
function canProg(id){ const u=curUser(); if(!u)return true; return userProgs(u).indexOf(id)>=0; }
function activeOwners(){return (S.users||[]).filter(u=>u.perm==='owner'&&u.active!==false);}
function ensureAuth(){ // seed the account list once, and map an existing role → uid so nobody gets logged out
  if(!Array.isArray(S.users)||!S.users.length){
    const perm={sebastian:'owner',bogdan:'editor',ruth:'poster'};
    S.users=TEAM_ORDER.map(id=>({id,name:PEOPLE[id].name,title:PEOPLE[id].role,av:PEOPLE[id].av,c:PEOPLE[id].c,bg:PEOPLE[id].bg,perm:perm[id]||'editor',progs:(id==='bogdan'?['seo']:id==='ruth'?['social']:['seo','social']),email:(id==='sebastian'?'seba@windowguardians.com':''),pass:hashPw('wgteam'),active:true,seeded:true}));
  }
  // backfill dashboard access on accounts created before the program-assignment feature
  (S.users||[]).forEach(u=>{ if(u.perm!=='owner' && (!Array.isArray(u.progs)||!u.progs.length)) u.progs=(u.id==='bogdan'?['seo']:['social']); });
  var _emails={sebastian:'seba@windowguardians.com',bogdan:'bogdan@windowguardians.com',ruth:'ruth@windowguardians.com'};
  (S.users||[]).forEach(function(u){ if(u&&_emails[u.id]&&!u.email)u.email=_emails[u.id]; }); // map the team to their Firebase logins
  if(!S.uid && S.role && userById(S.role)) S.uid=S.role;
}

/* ============================================================
   SEO PROGRAM DATA  (Program 1 — the SEO/local game plan)
   Each "program" below (SEO, Social, …) is one sub-dashboard inside
   the Marketing hub. They share the same render engine; only the data
   differs. The active program comes from <body data-program="…">.
   ============================================================ */
const SEO_ORDER=['bogdan','sebastian'];

/* ---- The standing weekly engine (runs EVERY week, on top of the build) ---- */
const SEO_ENGINE=[
  {who:'sebastian',txt:'Deliver <b>3 town-targeted blogs</b> to Bogdan (each aimed at one bullseye town, per the blog guide), and flag Bogdan this week’s <b>confirmed-happy completed jobs</b> so the reviews machine only ever asks people who loved the work.'},
  {who:'sebastian',txt:'Hand Bogdan <b>3 Company Cam portfolio showcases</b> (completed-project photo sets) for the website + social. <b>These live in Company Cam — not uploaded here.</b> This row just tracks that the 3 were handed off each Tuesday.'},
  {who:'bogdan',txt:'Publish + optimize those 3 blogs (meta, internal links to the town page + a window-style page, image alt text, CTA + phone).'},
  {who:'bogdan',txt:'<b>Run the reviews machine</b> (now owned by Bogdan): request a Google review from each confirmed-happy completed job Sebastian flags (personal text + email, one polite follow-up max — <b>never</b> a blast to unvetted contacts), <b>reply to 100% of new reviews within 48h</b>, post <b>1 GBP update</b>, and log it in the tracking sheet.'}
];

/* ---- 12-week plan ---- */
const SEO_PHASES=[
  {n:1,name:'Foundation & Quick Wins',dates:'Weeks 1–4 · Jun 2 – Jun 23'},
  {n:2,name:'Build the Bucks Bullseye, part 1',dates:'Weeks 5–8 · Jun 30 – Jul 21'},
  {n:3,name:'Bullseye part 2 + Scale',dates:'Weeks 9–12 · Jul 28 – Aug 18'}
];
const SEO_WEEKS=[
 {id:1,phase:1,due:'2026-06-02',title:'Phone Lock & Foundation',roles:{
   bogdan:{est:'4–6 hrs',sum:'Lock ONE phone + GHL tracking, stand up the tracking sheet, set the measurement baseline, and prep the page-fix pass.',
     steps:[
       'In GHL, confirm the ONE official tracking number and turn on call recording + source tracking.',
       'Search the whole site for the second number (215-709-3191) — header, footer, CTAs, contact page — and replace every instance with the official number.',
       'Update the WordPress header/footer phone fields and every click-to-call (tel:) link to the official number.',
       'Create the shared Tracking Sheet (tabs: Customers, Reviews, Blogs, Weekly Status) and give Sebastian edit access.',
       'Pull the last 60 completed-job customers (name, phone/email, town) into the Customers tab.',
       'Test-call both old numbers to confirm they route correctly, then post the official number in the team chat.',
       'Confirm Google Search Console + GA4 access (set them up if missing) and verify the property is tracking.',
       'Log the Day-One baseline in the sheet: impressions, clicks, top queries, and the current map-pack position for "window replacement Bucks County" — this is the line we measure 90 days against.',
       'Export the current title tag + meta description for every page into a "Page Fixes" tab so the Week-2 Fix Sheet pass is ready to paste.',
       'Confirm a WordPress backup + a safe way to edit pages (staging or off-hours) before any title/meta changes go live next week.'],
     handoff:'→ Self: sheet + Day-One baseline live; the GBP audit and town-labeling are now part of the build.'},
   ruth:{est:'2–3 hrs',sum:'Audit the Google Business Profile against the site and label the customer list by town.',
     steps:[
       'Open Google Business Profile Manager and the website side by side.',
       'Check the business NAME matches the site exactly (spelling, "LLC", spacing). Note any difference.',
       'Check the ADDRESS matches exactly: 430 Fox Hollow Dr, Langhorne PA 19053.',
       'Check the PHONE in GBP matches the new official number Bogdan locked — if not, update it in GBP.',
       'Write down the current primary + secondary categories, the photo count, and the date of the most recent photo.',
       'In the Customers tab, add a "Town" column and label all 60 customers by their town.',
       'Put any NAP mismatches you found into the Weekly Status tab for Bogdan.'],
     handoff:'→ Bogdan: NAP mismatches + category/photo gaps are in the Weekly Status tab for you to fix.'},
   sebastian:{est:'1–2 hrs',sum:'Pick the official number + branded email, and deliver the first 3 town blogs.',
     steps:[
       'Confirm the ONE official phone number Bogdan should use everywhere.',
       'Approve info@windowguardians.com as the branded email to replace the Gmail.',
       'Write + send 3 town blogs (Langhorne, Newtown, Yardley) per the blog guide.'],
     handoff:'→ Bogdan: number + email approved, 3 blogs delivered — publish + optimize them.'}}},
 {id:2,phase:1,due:'2026-06-09',title:'Kill the Philly Targeting',roles:{
   bogdan:{est:'3–4 hrs',sum:'Pivot the homepage off Philadelphia to Langhorne/Bucks + launch the branded email.',
     steps:[
       'Rewrite the homepage title tag to "Window Replacement in Langhorne & Bucks County, PA | Window Guardians" (55–60 chars).',
       'Rewrite the homepage meta description (150–160 chars): Bucks focus + 4.9 rating + a call to action.',
       'Update the homepage H1 and intro copy to lead with Langhorne/Bucks, not Philadelphia.',
       'Fix the /windows/ H1 typo "Philadephia" (missing the L), then rewrite it to "Bucks County" per the Fix Sheet.',
       'Fix the footer link text: "Philadelphia Hopper Windows" → "Hopper Windows", "Picture Windows Philadelphia" → "Picture Windows".',
       'Work down the Title/Meta + Schema Fix Sheet (Guides tab) — replace title + meta on the remaining pages, ~30–40 min at a time.',
       'Set up info@windowguardians.com and point the contact forms + footer to it.',
       'Publish + optimize Sebastian’s 3 blogs (meta, internal links, image alt text, CTA + phone).',
       'Add descriptive alt text (include the town name) to the homepage images.'],
     handoff:'→ Self: homepage alt text done — homepage goes live, reviews machine runs.'},
   ruth:{est:'2–3 hrs',sum:'Run the reviews machine and start alt-texting the homepage.',
     steps:[
       'Request a Google review from each confirmed-happy completed job this week (from Sebastian’s list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours (use the saved templates).',
       'Post 1 GBP update (a photo + a short caption).',
       'Confirm all 60 customers are entered and labeled by town in the sheet.',
       'Add descriptive alt text (include "Langhorne" or the town) to the homepage images on Bogdan’s list.',
       'Log this week’s review count + responses in the Reviews tab.'],
     handoff:'→ Bogdan: homepage alt text is done and the week’s reviews are logged in the sheet.'},
   sebastian:{est:'1–2 hrs',sum:'Approve the new homepage wording + the review scripts; deliver 3 blogs.',
     steps:[
       'Approve the new homepage title + H1 (Langhorne/Bucks focus).',
       'Approve the review-request text + email wording for the reviews machine.',
       'Write + send 3 town blogs per the blog guide.'],
     handoff:'→ Bogdan: wording approved — homepage goes live, review machine runs.'}}},
 {id:3,phase:1,due:'2026-06-16',title:'Langhorne Home Base',roles:{
   bogdan:{est:'4–5 hrs',sum:'Build the Langhorne home-base town page + add the PA HIC license site-wide.',
     steps:[
       'Build /langhorne/ with genuinely local content — named neighborhoods, local home styles, an embedded map, real photos.',
       'Add 2–3 Langhorne customer reviews and at least one before/after photo set to the page.',
       'Add LocalBusiness schema to the Langhorne page and validate it with the Rich Results Test.',
       'Add the PA HIC license # to the site-wide footer.',
       'Publish + optimize Sebastian’s 3 blogs and internal-link them to /langhorne/.',
       'Add descriptive alt text + short captions (include the town name) to the Langhorne page images.'],
     handoff:'→ Self: Langhorne page is up and alt-texted — gather more Langhorne photos for future blogs.'},
   ruth:{est:'2–3 hrs',sum:'Run the reviews machine and caption the Langhorne page images.',
     steps:[
       'Request a Google review from each confirmed-happy completed job this week (Langhorne customers first) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Add alt text + short captions to the Langhorne page images (Bogdan’s list).',
       'Gather + label Langhorne job photos for the page and future blogs.',
       'Log the review count + responses in the Reviews tab.'],
     handoff:'→ Sebastian: the Langhorne page is live — review it and record 2 short job videos.'},
   sebastian:{est:'1–2 hrs',sum:'Add local Langhorne detail, record 2 job videos, deliver 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Langhorne details (neighborhoods, home styles, a landmark).',
       'Record 2 short Langhorne job videos on your phone and send them to Bogdan.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: local details + videos are in — fold them into the Langhorne page.'}}},
 {id:4,phase:1,due:'2026-06-23',title:'Schema & Cleanup',roles:{
   bogdan:{est:'3–4 hrs',sum:'Add LocalBusiness + Review schema to the homepage and clean up junk URLs.',
     steps:[
       'Add LocalBusiness + AggregateRating/Review schema to the homepage; validate with the Rich Results Test.',
       'Delete /hello-world-2/ (the default WordPress demo post).',
       '301-redirect the malformed /https-windowguardians-com-energy-efficient-windows/ URL to the correct page.',
       'Pick a canonical homepage and 301-redirect /home-page/ and /window-guardians/ to it.',
       'Prune the stale taxonomy sitemap (featured_logo-sitemap.xml, last updated 2023) so it only lists pages worth crawling.',
       'Publish + optimize Sebastian’s 3 blogs.'],
     handoff:'→ Self: schema is live — the first formal GBP post goes out and any review non-responders get a nudge.'},
   ruth:{est:'2 hrs',sum:'Reviews machine + first formal GBP post; chase the non-responders.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update (this is the first formal weekly post).',
       'List the customers who didn’t respond to the first ask and send each one polite nudge.',
       'Gather Newtown photos + customer names for next week’s page.',
       'Log the review count + responses in the Reviews tab.'],
     handoff:'→ Bogdan: Newtown photos + names are in the sheet for next week’s build.'},
   sebastian:{est:'1 hr',sum:'Approve the schema + GBP post; deliver 3 blogs.',
     steps:[
       'Approve the homepage schema details (services, hours, rating display).',
       'Approve the first GBP post wording.',
       'Write + send 3 town blogs (start aiming one at Newtown).'],
     handoff:'→ Bogdan: approved — schema ships, GBP post goes live.'}}},
 {id:5,phase:2,due:'2026-06-30',title:'Newtown + Review Velocity',roles:{
   bogdan:{est:'4–5 hrs',sum:'Build the Newtown town page (real local + schema).',
     steps:[
       'Build /newtown/ with genuinely local content (Newtown Borough vs Township, the historic district, local home styles).',
       'Add LocalBusiness schema + 2–3 Newtown reviews/photos.',
       'Internal-link Newtown ↔ a window-style page ↔ a service page.',
       'Publish + optimize Sebastian’s 3 blogs; link the Newtown blog to /newtown/.',
       'Add descriptive alt text (include the town name) to the Newtown page images.'],
     handoff:'→ Self: Newtown page is up and alt-texted — push the reviews machine to hit 15+ this month.'},
   ruth:{est:'2–3 hrs',sum:'Reviews machine — hit 15+ this month — plus alt-text Newtown.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Count this month’s new reviews — if it’s under 15, ask any not-yet-asked happy customers from the last few weeks (still only confirmed-happy jobs).',
       'Add alt text to the Newtown page images.',
       'Gather Yardley photos + 1-line customer quotes for next week.',
       'Log the review count + the month-1 total in the Reviews tab.'],
     handoff:'→ Sebastian: the month-1 review total is in the sheet — review it at the check-in.'},
   sebastian:{est:'1 hr',sum:'Add local Newtown detail + deliver 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Newtown details.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: Newtown details are in — finalize the page.'}}},
 {id:6,phase:2,due:'2026-07-07',title:'Yardley + Service Schema',roles:{
   bogdan:{est:'4–5 hrs',sum:'Build the Yardley town page + add Service schema to the windows page.',
     steps:[
       'Build /yardley/ with genuinely local content (the riverfront, Yardley Borough, the older home stock).',
       'Add LocalBusiness schema + 2–3 Yardley reviews/photos.',
       'Add Service schema to the main windows page and validate it.',
       'Internal-link Yardley to a window-style page + a service page.',
       'Publish + optimize Sebastian’s 3 blogs.',
       'Add descriptive alt text (include the town name) to the Yardley page images.'],
     handoff:'→ Self: Yardley page is up and alt-texted — start collecting 1-line customer quotes.'},
   ruth:{est:'2–3 hrs',sum:'Reviews machine + start the customer-quote collection + alt-text Yardley.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Start collecting 1-line customer quotes + their town in a sheet tab (these feed the /reviews/ page).',
       'Add alt text to the Yardley page images.',
       'Gather Lower Makefield photos for next week.',
       'Log the review count in the Reviews tab.'],
     handoff:'→ Bogdan: Lower Makefield photos are in; customer quotes are being collected for /reviews/.'},
   sebastian:{est:'1 hr',sum:'Add local Yardley detail + approve the Newtown page + 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Yardley details.',
       'Review + approve the finished Newtown page.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: Yardley details are in and Newtown is approved.'}}},
 {id:7,phase:2,due:'2026-07-14',title:'Lower Makefield + Reviews Page',roles:{
   bogdan:{est:'4–5 hrs',sum:'Build the Lower Makefield town page + stub the /reviews/ page.',
     steps:[
       'Build /lower-makefield/ with genuinely local content (Edgewood, the Yardley-Makefield area, the newer developments).',
       'Add LocalBusiness schema + 2–3 reviews/photos.',
       'Create the /reviews/ page shell, ready to receive customer quotes.',
       'Publish + optimize Sebastian’s 3 blogs.',
       'Add descriptive alt text (include the town name) to the Lower Makefield page images.'],
     handoff:'→ Self: the /reviews/ shell is ready — publish the first 3 customer quotes to it.'},
   ruth:{est:'2–3 hrs',sum:'Reviews machine + publish the first quotes to /reviews/ + alt-text LMT.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Publish 3 collected customer quotes (with their town) to the new /reviews/ page.',
       'Add alt text to the Lower Makefield page images.',
       'Gather Richboro photos for next week.',
       'Log the review count in the Reviews tab.'],
     handoff:'→ Sebastian: /reviews/ now has its first quotes live — take a look.'},
   sebastian:{est:'1 hr',sum:'Add local Lower Makefield detail + approve Yardley + 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Lower Makefield details.',
       'Review + approve the finished Yardley page.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: details are in and Yardley is approved.'}}},
 {id:8,phase:2,due:'2026-07-21',title:'Richboro + Philly Consolidation',roles:{
   bogdan:{est:'5–6 hrs',sum:'Build Richboro + consolidate the 5 duplicate Philadelphia pages into one.',
     steps:[
       'Build /richboro/ with genuinely local content (Northampton Township, the Council Rock schools, the larger lots).',
       'Add LocalBusiness schema + 2–3 reviews/photos.',
       'Pick ONE canonical Philadelphia page and merge the best content from the other 4 into it.',
       '301-redirect window-replacement, home-window, house-window, window-glass, and fitler-square down to the one canonical page.',
       'Publish + optimize Sebastian’s 3 blogs.',
       'Add descriptive alt text (include the town name) to the Richboro page images.'],
     handoff:'→ Self: Richboro is up and alt-texted — confirm the month-2 review count.'},
   ruth:{est:'2–3 hrs',sum:'Reviews machine — confirm month-2 vs the 15+ goal — + alt-text Richboro.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Count the month-2 new reviews vs the 15+ goal; if short, ask any not-yet-asked confirmed-happy customers from recent weeks.',
       'Add alt text to the Richboro page images.',
       'Gather Holland photos for next week.',
       'Log the review count + the month-2 total in the Reviews tab.'],
     handoff:'→ Sebastian: the month-2 review total is in the sheet for the check-in.'},
   sebastian:{est:'1 hr',sum:'Add local Richboro detail + deliver 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Richboro details.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: Richboro details are in.'}}},
 {id:9,phase:3,due:'2026-07-28',title:'Holland Rewrite + Financing',roles:{
   bogdan:{est:'4–5 hrs',sum:'Rewrite the thin Holland page to the new standard + build /financing/.',
     steps:[
       'Rewrite /holland/ from templated boilerplate to genuinely local content (Northampton, Holland-specific detail).',
       'Add LocalBusiness schema + 2–3 Holland reviews/photos.',
       'Build the /financing/ page (options, terms, a clear CTA).',
       'Publish + optimize Sebastian’s 3 blogs.',
       'Add descriptive alt text (include the town name) to the rewritten Holland page images.'],
     handoff:'→ Self: Holland is rewritten and alt-texted.'},
   ruth:{est:'2 hrs',sum:'Reviews machine + alt-text the rewritten Holland page.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Add alt text to the Holland page images.',
       'Gather Feasterville photos for next week.',
       'Log the review count in the Reviews tab.'],
     handoff:'→ Bogdan: Feasterville photos are in for the final town page.'},
   sebastian:{est:'1 hr',sum:'Add local Holland detail + deliver 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Holland details.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: Holland details are in.'}}},
 {id:10,phase:3,due:'2026-08-04',title:'Feasterville + About Page',roles:{
   bogdan:{est:'4–5 hrs',sum:'Build Feasterville (the 7th town page) + the /about/ page.',
     steps:[
       'Build /feasterville/ with genuinely local content (Feasterville-Trevose, Lower Southampton).',
       'Add LocalBusiness schema + 2–3 reviews/photos.',
       'Build /about/ (meet Sebastian, the story, credentials, license #, a photo).',
       'Publish + optimize Sebastian’s 3 blogs.',
       'Add descriptive alt text (include the town name) to the Feasterville page images.'],
     handoff:'→ Self: all 7 town pages now exist and Feasterville is alt-texted — pull before/after sets for the gallery refresh.'},
   ruth:{est:'2–3 hrs',sum:'Reviews machine + collect before/after sets for the gallery refresh.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Add alt text to the Feasterville page images.',
       'Collect before/after photo sets for the gallery refresh and drop them in the sheet.',
       'Log the review count in the Reviews tab.'],
     handoff:'→ Sebastian: the /about/ page is ready for your meet-Sebastian video.'},
   sebastian:{est:'1–2 hrs',sum:'Local Feasterville detail + record the meet-Sebastian video + 3 blogs.',
     steps:[
       'Give Bogdan 3–5 genuinely local Feasterville details.',
       'Record a short "meet Sebastian" video for the /about/ page.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: details + about video are in — finish the /about/ page.'}}},
 {id:11,phase:3,due:'2026-08-11',title:'Service Pages: Roof · Siding · Patio',roles:{
   bogdan:{est:'5–6 hrs',sum:'Build standalone /roofing/, /siding/, and /patio-doors/ pages.',
     steps:[
       'Build /roofing/ with real content + Service schema.',
       'Build /siding/ with real content + Service schema.',
       'Build /patio-doors/ with real content + Service schema.',
       'Internal-link each service page to the relevant town pages.',
       'Publish + optimize Sebastian’s 3 blogs.',
       'Add descriptive alt text (include the town name) to the roofing / siding / patio-doors page images.'],
     handoff:'→ Self: 3 service pages are up and alt-texted — confirm the month-3 review pace.'},
   ruth:{est:'2–3 hrs',sum:'Reviews machine — confirm month-3 pace — + alt-text the service pages.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Confirm the month-3 review pace vs the 15+ goal.',
       'Add alt text to the roofing / siding / patio-doors page images.',
       'Continue re-tagging gallery images by town.',
       'Log the review count in the Reviews tab.'],
     handoff:'→ Bogdan: service-page alt text is done and the gallery re-tagging is underway.'},
   sebastian:{est:'1 hr',sum:'Approve the roofing/siding/patio pages + deliver 3 blogs.',
     steps:[
       'Review + approve the roofing, siding, and patio-doors pages.',
       'Write + send 3 town blogs.'],
     handoff:'→ Bogdan: service pages approved — push them live.'}}},
 {id:12,phase:3,due:'2026-08-18',title:'Internal Linking & 90-Day Scorecard',roles:{
   bogdan:{est:'5–6 hrs',sum:'Build the /service-area/ hub, run the full internal-link pass + final schema QA across all new pages.',
     steps:[
       'Internal-link pass: towns ↔ window styles ↔ services ↔ blogs all cross-linked.',
       'Build the /service-area/ hub page that links out to all 7 town pages (ties them together for users + internal-link equity).',
       'Run the Rich Results Test on every new page and fix any schema warnings.',
       'Confirm every redirect (Philly pages, duplicates, the malformed URL) resolves correctly.',
       'Publish + optimize Sebastian’s final 3 blogs.',
       'Export the GBP + Search Console numbers and compile the 90-day scorecard.'],
     handoff:'→ Sebastian: 90-day scorecard compiled — ready to review with the team.'},
   ruth:{est:'2–3 hrs',sum:'Compile the 90-day scorecard + clean up the tracking sheet.',
     steps:[
       'Request a Google review from every job completed + confirmed-happy this week (Sebastian’s confirmed list) — personal text + email, one polite follow-up max. Never blast unvetted contacts.',
       'Reply to 100% of new Google reviews within 48 hours.',
       'Post 1 GBP update.',
       'Compile the 90-day scorecard: total new reviews, GBP views/calls/directions, ranking movement.',
       'Archive the completed review requests and tidy up the tracking sheet.',
       'Log the final review count in the Reviews tab.'],
     handoff:'→ Sebastian: the 90-day scorecard is ready to review with the team.'},
   sebastian:{est:'1–2 hrs',sum:'Review the scorecard, set Q4 priorities, deliver the final 3 blogs.',
     steps:[
       'Review the 90-day scorecard with the team.',
       'Set the Q4 priorities (secondary towns: Washington Crossing, Southampton, Morrisville, Warminster).',
       'Write + send the final 3 town blogs.'],
     handoff:'→ Team: Q3 is done and the Q4 priorities are set.'}}}
];

/* ---- Handoffs: who hands what to whom, and where it lands ----
   Keyed by "<week>.<fromPerson>". Each entry: {to, need, toWeek?}. */
const SEO_DELIVERIES={
 '1.sebastian':[
   {to:'bogdan',need:'The official phone # + branded-email approval + your 3 town blogs (Langhorne, Newtown, Yardley)'}],

 '2.sebastian':[
   {to:'bogdan',need:'Approved homepage title/H1 wording + approved review-request text/email + your 3 town blogs'}],

 '3.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Langhorne details + 2 short job videos + your 3 town blogs'}],

 '4.sebastian':[
   {to:'bogdan',need:'Approved homepage schema details + the first GBP-post wording + your 3 town blogs'}],

 '5.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Newtown details + your 3 town blogs'}],

 '6.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Yardley details + approval of the finished Newtown page + your 3 town blogs'}],

 '7.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Lower Makefield details + approval of the Yardley page + your 3 town blogs'}],

 '8.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Richboro details + your 3 town blogs'}],

 '9.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Holland details + your 3 town blogs'}],

 '10.sebastian':[
   {to:'bogdan',need:'3–5 genuinely-local Feasterville details + your meet-Sebastian /about/ video + your 3 town blogs'}],

 '11.sebastian':[
   {to:'bogdan',need:'Approval of the roofing / siding / patio-doors pages + your 3 town blogs'}],

 '12.sebastian':[
   {to:'bogdan',need:'Q4 town priorities + your final 3 town blogs'}]
};
/* recipient lookup: every delivery addressed TO role r that lands in week wid */
function inboxFor(r,wid){const out=[];
  for(const key in DELIVERIES){const [fw,fr]=key.split('.');
    DELIVERIES[key].forEach((d,i)=>{ if(d.to===r && (d.toWeek||+fw)===wid)
      out.push({fromRole:fr,fromWeek:+fw,need:d.need,dkey:fw+'.'+fr+'.'+i}); });
  }
  return out;
}

/* ---- KPIs ---- */
const SEO_KPIS=[
  {id:'reviews',label:'New Google reviews',sub:'Quarter goal · 15/mo pace',target:45,step:1,big:5},
  {id:'townpages',label:'Town pages live',sub:'Langhorne→Feasterville',target:7,step:1,big:1},
  {id:'blogs',label:'Blog posts published',sub:'3/week × 12 weeks',target:36,step:1,big:3},
  {id:'servicepages',label:'Trust / service pages',sub:'roofing·siding·patio·about·reviews·financing',target:6,step:1,big:1}
];

/* ---- Audit (live-verified crawl 2026-05-30) ---- */
const AUDIT_CATS=[
 {id:'geo',ic:'🎯',t:'On-Page Geo-Targeting',note:'You rank where your pages say you are — and they say Philadelphia.'},
 {id:'local',ic:'📍',t:'Local Content & Town Pages',note:'The territory grab. Right now it’s aimed at the wrong towns.'},
 {id:'gbp',ic:'🗺️',t:'Google Business Profile & NAP',note:'~50% of map-pack weight. One number, everywhere, identical.'},
 {id:'schema',ic:'🔧',t:'Schema / Structured Data',note:'The entry ticket for the map pack and AI answers. You have none.'},
 {id:'index',ic:'🧹',t:'Duplicate & Junk URLs',note:'Stop splitting your own authority across copycat pages.'},
 {id:'pages',ic:'📄',t:'Service & Conversion Pages',note:'You can’t rank for a page you haven’t built.'},
 {id:'reviews',ic:'⭐',t:'Reviews & Reputation',note:'The one signal that ranks AND converts.'},
 {id:'content',ic:'✏️',t:'Content & Blog Freshness',note:'77 posts, but the cadence died and almost none are local.'},
 {id:'img',ic:'🖼️',t:'Image SEO',note:'Free local relevance you’re leaving on the table.'},
 {id:'links',ic:'🔗',t:'Internal Linking & Authority',note:'Flow link equity to the pages that make money.'},
 {id:'ai',ic:'🤖',t:'AI / LLM Readiness',note:'Get cited inside the AI answer, not buried under it.'}
];
const AUDIT=[
 {cat:'geo',s:'crit',h:'Homepage title still targets Philadelphia',p:'The homepage targets "Philadelphia Window Replacement." You’re in Langhorne, Bucks County — you’re fighting the wrong, hyper-competitive city and ignoring your money market. Rewrite to "Window Replacement in Langhorne & Bucks County, PA | Window Guardians."'},
 {cat:'geo',s:'crit',h:'Homepage H1 is a slogan with no keyword or location',p:'The H1 reads "Here’s Your Window of Opportunity." Google’s strongest on-page signal is being spent on a tagline — no service, no town. Change the H1 to "Window & Door Replacement in Langhorne & Bucks County, PA."'},
 {cat:'geo',s:'crit',h:'Services page hard-targets Philadelphia',p:'/services/ title is "Door & Window Replacement Services In Philadelphia | Call Us" and the H1 is "Philadelphia Door and Window Replacement Services." Re-point both at the Bucks County service area.'},
 {cat:'geo',s:'high',h:'Body copy reinforces the wrong city',p:'A homepage section is headed "Neglected Windows Threaten Philadelphia and Surrounding Area Homes." Reframe around Bucks County and name your bullseye towns instead.'},
 {cat:'local',s:'crit',h:'All 7 town pages target the WRONG towns',p:'Existing location pages cover Bensalem, Morrisville, Abington, Glenside, Levittown, Holland PA and Cherry Hill NJ (out of state). Not one of the affluent bullseye towns — Langhorne, Newtown, Yardley, Lower Makefield, Richboro, Feasterville — has a page.'},
 {cat:'local',s:'crit',h:'Town pages are templated city-swap (March-2026 penalty)',p:'The Bensalem page body is generic boilerplate ("Experience the difference with our superior materials, expert craftsmanship…") with only the title/H1 changed — no neighborhoods, map, local reviews or schema. All 7 were created the same day (2024-05-23). This is exactly the pattern Google’s March 2026 update penalizes; rebuild each as genuinely local.'},
 {cat:'local',s:'high',h:'Town pages show the Langhorne address, no local proof',p:'Each "town" page lists the 430 Fox Hollow Dr (Langhorne) address with zero town-specific NAP, job photos, or testimonials. Add real local detail and town-tagged proof to every rebuilt page.'},
 {cat:'local',s:'med',h:'No /service-area/ hub page',p:'There’s no page tying the towns together for users or for internal-link equity. Build a service-area hub that links out to each town page.'},
 {cat:'gbp',s:'crit',h:'Two different phone numbers, one of them malformed',p:'The site shows 215-709-8793 (primary) and an unformatted "2157093191" in the "Call Us" link/footer. That’s a NAP inconsistency AND a broken-looking click-to-call. Pick ONE number, format it identically everywhere, and route it through GHL for call tracking.'},
 {cat:'gbp',s:'high',h:'Gmail contact address',p:'windowguardians@gmail.com reads "small/unverified" for a premium brand and doesn’t match the domain. Move to info@windowguardians.com site-wide.'},
 {cat:'gbp',s:'med',h:'GBP internals need an inside check (Bogdan, Week 1)',p:'Categories, services-with-prices, photo cadence and review velocity can’t be seen from the public site. Bogdan must audit the Google Business Profile in GBP Manager and confirm NAP matches the locked number exactly.'},
 {cat:'schema',s:'crit',h:'Zero schema markup anywhere on the site',p:'No JSON-LD detected on the homepage, the services page, or the town pages — no LocalBusiness, Service, Review/AggregateRating, FAQPage or BreadcrumbList. This is table-stakes for the local pack and the entry ticket for AI Overviews. Add LocalBusiness + AggregateRating site-wide, Service schema on service pages, and a LocalBusiness block on each town page.'},
 {cat:'index',s:'high',h:'5 near-duplicate Philadelphia pages cannibalizing each other',p:'/window-replacement-in-philadelphia/, /home-window-replacement-in-philadelphia/, /house-window-replacement-in-philadelphia/, /window-glass-replacement-in-philadelphia/ and /window-replacement-in-fitler-square-philadelphia-pa/ all compete for the same intent. Pick one canonical page and 301-redirect the other four into it.'},
 {cat:'index',s:'high',h:'Three live homepage-type URLs',p:'/, /home-page/ and /window-guardians/ all resolve. That’s canonical confusion. Choose the canonical home URL and 301 the other two to it.'},
 {cat:'index',s:'med',h:'Default WordPress demo post still indexed',p:'/hello-world-2/ is still in the post sitemap. Delete it — it looks unprofessional and wastes crawl budget.'},
 {cat:'index',s:'med',h:'Malformed URL indexed',p:'/https-windowguardians-com-energy-efficient-windows/ is a botched slug sitting in the sitemap. 301-redirect it to the correct energy-efficiency page.'},
 {cat:'index',s:'low',h:'Stale taxonomy sitemap',p:'featured_logo-sitemap.xml was last touched 2023-10. Low priority, but prune unused taxonomies so the sitemap reflects only pages worth crawling.'},
 {cat:'pages',s:'high',h:'Roofing & Siding have no standalone pages',p:'On /services/ they’re only sections — there’s no /roofing/ or /siding/ page. You can’t rank for "roofing Newtown PA" without a dedicated, schema-backed roofing page. Build both.'},
 {cat:'pages',s:'high',h:'No /patio-doors/ (sliding-door) page',p:'You offer patio/sliding doors but have no page targeting that demand. Build /patio-doors/ with real content + Service schema.'},
 {cat:'pages',s:'high',h:'Missing trust & conversion pages',p:'No /about/ (owner story + EEAT), /reviews/, /financing/, or /service-area/. These convert premium buyers and feed internal links — build them across the plan.'},
 {cat:'pages',s:'high',h:'No PA HIC license number displayed',p:'No HIC # appears on the homepage, services page, or footer. It’s legally expected in PA and a trust signal for quality buyers. Add it site-wide in the footer.'},
 {cat:'reviews',s:'high',h:'Strong ratings, but no /reviews/ page and no review schema',p:'The homepage shows multiple 4.9/5.0 ratings, yet there’s no aggregated /reviews/ page and no AggregateRating schema to earn star-rich results. Build the page and wire the schema so the stars show in search.'},
 {cat:'reviews',s:'med',h:'Review velocity is the biggest unverified lever',p:'Recency (15+ reviews/month) is ~18% of local-pack weight and can’t be seen from outside. Bogdan’s weekly reviews machine — ask every confirmed-happy completed job, reply to 100% within 48h — is the single highest-leverage unlock. Ask satisfied customers only (never bulk-blast every contact), and start it Week 1.'},
 {cat:'content',s:'high',h:'Blog cadence died ~9 months ago',p:'There are 77 posts, but the three newest are dated 2025-08-19 — nothing since. Freshness is a ranking and authority signal you’re forfeiting. Restart with the 3-blogs-every-Tuesday engine.'},
 {cat:'content',s:'high',h:'Almost none of the 77 posts are locally targeted',p:'The existing posts are generic window topics with no town focus. Every new blog must target one bullseye town and internal-link to that town’s page — that’s the fuel behind the town-page rankings.'},
 {cat:'content',s:'med',h:'Clusters of near-duplicate post topics',p:'A 2024-06-20 batch produced many overlapping "door replacement value" and "window value" posts that risk cannibalizing each other. Audit, consolidate the strongest, and prune or redirect the rest.'},
 {cat:'img',s:'med',h:'Generic, untagged images on landing pages',p:'Town/landing pages use generic before/after photos with no local identification, and the gallery isn’t alt-tagged. Add descriptive alt text + filenames that include the town name (a recurring Bogdan task).'},
 {cat:'links',s:'med',h:'No deliberate internal-linking structure',p:'Town pages, the 9 window-style pages, service pages and blogs aren’t systematically cross-linked, so authority doesn’t flow to the money pages. Run a structured internal-link pass (Week 12).'},
 {cat:'links',s:'low',h:'Local off-site authority underused',p:'Manufacturer dealer pages (OKNA), Bucks County press, and HOA newsletters are easy local-link wins not yet pursued. A Q4 fast-follow once the pages exist.'},
 {cat:'ai',s:'med',h:'Not eligible for AI Overviews / LLM citation',p:'With no schema and slogan-led copy ("Here’s Your Window of Opportunity"), there’s nothing for an AI summary to cite. Add FAQPage schema and lead pages with direct answers (cost ranges, timelines) phrased "X is Y because Z."'},
 {cat:'ai',s:'med',h:'No EEAT author/credential signals on content',p:'Posts have no named author, credentials, or license visible — signals LLMs and Google weight heavily. Add author bylines, real photos, and the HIC license to content.'}
];
const ASSETS=[
 '9 dedicated window-style pages (bay, bow, hopper, picture, garden, double-hung, slider, casement, awning) — strong topical depth already indexed.',
 '77 existing blog posts — a content base to refresh, consolidate, and repurpose rather than start from zero.',
 'OKNA manufacturer authority (you already have a post on it) — barely surfaced; competitors lean on it hard.',
 '4.9 / 5.0 ratings shown site-wide + the Philadelphia 100 (2021) award + Energy Star — credibility you’re not amplifying with schema or a reviews page.',
 'Correct NAP address present (430 Fox Hollow Dr, Langhorne PA 19053) — the foundation is half-right already.',
 'Clean robots.txt (allows all, points to a working Yoast sitemap index) — your indexation plumbing is fine; the problem is what’s in the index, not crawlability.'
];
const AUDIT_FIX={
 'Homepage title still targets Philadelphia':2,
 'Homepage H1 is a slogan with no keyword or location':2,
 'Services page hard-targets Philadelphia':2,
 'Body copy reinforces the wrong city':2,
 'All 7 town pages target the WRONG towns':[3,5,6,7,8,9,10],
 'Town pages are templated city-swap (March-2026 penalty)':[3,5,6,7,8,9,10],
 'Town pages show the Langhorne address, no local proof':[3,5,6,7,8,9,10],
 'No /service-area/ hub page':12,
 'Two different phone numbers, one of them malformed':1,
 'Gmail contact address':2,
 'GBP internals need an inside check (Bogdan, Week 1)':1,
 'Zero schema markup anywhere on the site':[4,6,11,12],
 '5 near-duplicate Philadelphia pages cannibalizing each other':8,
 'Three live homepage-type URLs':4,
 'Default WordPress demo post still indexed':4,
 'Malformed URL indexed':4,
 'Stale taxonomy sitemap':4,
 'Roofing & Siding have no standalone pages':11,
 'No /patio-doors/ (sliding-door) page':11,
 'Missing trust & conversion pages':[7,9,10,12],
 'No PA HIC license number displayed':3,
 'Strong ratings, but no /reviews/ page and no review schema':[4,7],
 'Review velocity is the biggest unverified lever':[2,12],
 'Blog cadence died ~9 months ago':[1,12],
 'Almost none of the 77 posts are locally targeted':[1,12],
 'Clusters of near-duplicate post topics':'q4',
 'Generic, untagged images on landing pages':[2,11],
 'No deliberate internal-linking structure':12,
 'Local off-site authority underused':'q4',
 'Not eligible for AI Overviews / LLM citation':[4,12],
 'No EEAT author/credential signals on content':[3,10]
};
function fixLabel(h){
  const fw=AUDIT_FIX[h];
  if(fw===undefined) return {cls:'gap',txt:'⚠ Not yet scheduled'};
  if(fw==='q4') return {cls:'q4',txt:'→ Q4 fast-follow'};
  if(Array.isArray(fw)){const a=Math.min(...fw),b=Math.max(...fw);return {cls:'wk',txt:a===b?`→ Week ${a}`:`→ Wks ${a}–${b}`};}
  return {cls:'wk',txt:`→ Week ${fw}`};
}
const VERIFY_NOTE='Couldn’t be checked from outside the site and needs an inside login: GBP categories/photos/post cadence and actual review velocity (GBP Manager — Bogdan), and real Core Web Vitals / mobile rendering / page speed (PageSpeed Insights + Search Console — both free, Bogdan). Flagged in Weeks 1 and the measurement stack.';
const CATS=[
 {n:1,t:'Google Business Profile + Review Velocity',tag:'Own the map pack',why:'GBP is 32% of local-pack ranking and reviews ~18% — together <b>half</b> of what decides the 3-pack. Recency beats raw count; benchmark is 15+ reviews/month. You have a 4.9 you’re just not feeding. Cheapest, fastest, highest-leverage lever, and it runs mostly on Bogdan’s time. <b>The engine.</b>'},
 {n:2,t:'Local Page Architecture & Geo-Targeting',tag:'Own the Bucks bullseye',why:'Your site aims at the wrong city. Fix geo-targeting + build <b>genuinely local</b> pages for the main 7 towns (Langhorne, Newtown, Yardley, Lower Makefield, Richboro, Holland, Feasterville). The 3-blogs/week engine feeds them. Because Google just penalized templated city-swap pages, doing this right is a moat. <b>The territory grab.</b>'},
 {n:3,t:'Technical Trust Foundation & Fresh Content',tag:'Make 1 & 2 rank',why:'Schema, one phone number, branded email, HIC license, fixing broken/duplicate URLs, and a revived blog are the trust layer that lets Categories 1 & 2 perform. Without consistent NAP + schema, your GBP and town pages fight Google’s distrust the whole way. <b>The foundation under the house.</b>'}
];

/* ---- Guides / Playbooks ---- */
const BLOG_GUIDE={
  id:'blog',icon:'✍️',bg:'#fde7da',title:'The 3-Blogs-Every-Tuesday Guide',
  desc:'How Sebastian writes a town blog that actually ranks — the engine that feeds the town pages.',
  intro:'Every Tuesday Sebastian hands Bogdan 3 short blogs. Each one is aimed at ONE bullseye town and links into that town’s page. Done right, the blogs are the freshness + internal-link fuel behind the whole plan. Follow this exactly — it’s built to dodge Google’s March 2026 penalty on templated city-swap content.',
  fundamentals:[
    {t:'One town, one job',d:'Each post targets exactly ONE town (Langhorne, Newtown, Yardley, Lower Makefield, Richboro, Holland, Feasterville). Never split a post across two towns.'},
    {t:'Title format',d:'"[Topic] in [Town], PA | Window Guardians" — e.g. "Bay Window Replacement in Newtown, PA". Keep it 55–60 characters.'},
    {t:'Open with the answer',d:'First paragraph answers the question directly ("Replacement windows in Yardley typically run $X–$Y because…") — not a sales intro. This is what gets pulled into AI Overviews.'},
    {t:'Make it genuinely local',d:'Name a neighborhood, street, landmark, local home style, HOA reality, or weather quirk. One detail only a local would know. This is the moat competitors can’t copy.'},
    {t:'2–3 internal links',d:'Link to (1) that town’s page, (2) a relevant window-style page, (3) a service page. This is the mechanism that feeds town-page rankings — never skip it.'}
  ],
  checklist:[
    '600–1,000 words, original to your site — never AI-bulk or city-swap templated.',
    'Mention OKNA where it fits naturally (brand authority signal).',
    'One image with descriptive alt text that includes the town name.',
    'End with a clear CTA + the ONE official phone number.',
    'Meta description 150–160 chars: town + what makes WG better + a call to action.'
  ],
  avoid:'Keyword-stuffing the town name. Reusing another post’s body with the town swapped. Thin <500-word filler. Two posts targeting the same town+topic (they’ll cannibalize).'
};
const FIX_SHEET={
  id:'fix',icon:'🔧',bg:'#e6effb',title:'Title / Meta + Schema Fix Sheet',
  desc:'Bogdan’s copy-paste sheet: kill the Philadelphia targeting on all 23 pages, fix the trust gaps, add schema. ~2–3 hrs.',
  intro:'For each page, replace the current Title Tag + Meta Description (and the H1 where shown) with the new version below. Rules applied throughout: drop “Philadelphia” as the geo target → use “Bucks County” or the specific town; titles 50–60 chars ending “| Window Guardians”; metas 140–160 chars with a benefit + a call-to-action.',
  critical:[
    'On /windows/, fix the H1 typo “Philadephia” (missing the L) — then rewrite to “Bucks County” per the table.',
    'On /services/, the bottom “Call Us” link dials 215-709-3191 but every display number is 215-709-8793. Unify to 215-709-8793 everywhere.',
    'Footer email: change windowguardians@gmail.com → info@windowguardians.com. A Gmail address on a premium remodeler kills trust on every page.',
    'Footer link text: “Philadelphia Hopper Windows” → “Hopper Windows”, “Picture Windows Philadelphia” → “Picture Windows”.'
  ],
  pages:[
    ['/','Premium Window Replacement Bucks County PA | Window Guardians','Award-winning window, door & roofing replacement in Bucks County PA. Family-owned, lifetime warranty, 4.9-star Google rating. Get a free in-home estimate.','Your Local Premium Window & Door Specialists in Bucks County'],
    ['/windows/','Window Replacement Bucks County PA | Window Guardians','Premium window replacement in Bucks County and surrounding PA & NJ towns. OKNA, ProVia, Pella & Andersen. Lifetime warranty. Free in-home estimate.','Window Replacement in Bucks County, PA'],
    ['/services/','Window, Door, Roofing & Siding Services Bucks County PA | Window Guardians','Full-service exterior remodeling in Bucks County PA: windows, entry doors, roofing & siding. Family-owned. Award-winning craftsmanship. Free consultation.','Window, Door, Roofing & Siding Services in Bucks County'],
    ['/entry-doors/','Entry Door Replacement Bucks County PA | Window Guardians','Premium entry doors and patio sliding doors in Bucks County PA. ProVia, Andersen & Pella. Custom designs, lifetime warranty, expert install. Free estimate.','Entry Door Replacement in Bucks County, PA'],
    ['/why-us/','Why Choose Window Guardians | Bucks County’s Trusted Installer','4.9-star Google rating, Energy Star-rated windows, family-owned in Langhorne PA. See why Bucks County homeowners trust Window Guardians for windows, doors & roofing.','Why Bucks County Homeowners Choose Window Guardians'],
    ['/news/','Window Guardians News & Project Updates | Bucks County PA','Latest project spotlights, installation news, and home improvement tips from Bucks County’s premier window, door, and roofing specialists.','Window Guardians News & Project Spotlights'],
    ['/gallery/','Project Gallery | Window & Door Installs in Bucks County PA','Browse before-and-after photos of recent window, door, and roofing projects across Langhorne, Yardley, Newtown, and Bucks County, PA.','Our Bucks County Project Gallery'],
    ['/contact/','Contact Window Guardians | Free Estimate in Bucks County PA','Call (215) 709-8793 or request your free in-home window, door, or roofing estimate. Serving Langhorne, Yardley, Newtown & all of Bucks County, PA.','Contact Window Guardians'],
    ['/double-hung/','Double Hung Window Replacement Bucks County PA | Window Guardians','Energy-efficient double hung windows for Bucks County homes. OKNA 500 & 800 Series, lifetime warranty, expert local installation. Free estimate.','Double Hung Window Replacement in Bucks County, PA'],
    ['/slider/','Slider Window Replacement Bucks County PA | Window Guardians','Premium horizontal slider windows for Bucks County homes. Energy efficient, low maintenance, lifetime warranty. Free in-home estimate from Window Guardians.','Slider Window Replacement in Bucks County, PA'],
    ['/casement/','Casement Window Replacement Bucks County PA | Window Guardians','Crank-out casement windows for maximum ventilation and energy efficiency in Bucks County homes. Lifetime warranty. Free in-home estimate.','Casement Window Replacement in Bucks County, PA'],
    ['/awning-window/','Awning Window Replacement Bucks County PA | Window Guardians','Premium awning windows for Bucks County PA homes. Top-hinged design for ventilation in any weather. Lifetime warranty. Free in-home consultation.','Awning Window Replacement in Bucks County, PA'],
    ['/bay-window/','Bay Window Replacement Bucks County PA | Window Guardians','Add light, space & elegance with custom bay windows in Bucks County PA. Premium materials, expert installation, lifetime warranty. Free estimate.','Bay Window Replacement in Bucks County, PA'],
    ['/bow-window/','Bow Window Replacement Bucks County PA | Window Guardians','Custom bow windows that expand views and curb appeal in Bucks County PA homes. Premium craftsmanship, lifetime warranty, free in-home estimate.','Bow Window Replacement in Bucks County, PA'],
    ['/hopper-window/','Hopper Window Replacement Bucks County PA | Window Guardians','Hopper windows for basements, bathrooms, and laundry rooms in Bucks County PA. Energy-efficient, easy to clean, lifetime warranty. Free estimate.','Hopper Window Replacement in Bucks County, PA'],
    ['/picture-window/','Picture Window Replacement Bucks County PA | Window Guardians','Stunning fixed-pane picture windows for Bucks County PA homes. Maximum natural light, energy efficient, lifetime warranty. Free in-home estimate.','Picture Window Replacement in Bucks County, PA'],
    ['/garden-window/','Garden Window Replacement Bucks County PA | Window Guardians','Custom kitchen garden windows for Bucks County PA. Bring in light, plants, and beauty. Premium materials, lifetime warranty, free in-home estimate.','Garden Window Replacement in Bucks County, PA'],
    ['/okna/','OKNA Windows in Bucks County PA | Authorized Dealer | Window Guardians','Premium OKNA 500 & 800 Series windows installed in Bucks County PA. Lifetime warranty, virgin vinyl, expert local installation. Free in-home estimate.','OKNA Windows in Bucks County, PA'],
    ['/provia/','ProVia Windows & Doors in Bucks County PA | Window Guardians','ProVia windows, entry doors, and storm doors installed across Bucks County PA. Premium materials, lifetime warranty, family-owned. Free estimate.','ProVia Windows & Doors in Bucks County, PA'],
    ['/pella/','Pella Windows & Patio Doors in Bucks County PA | Window Guardians','Pella replacement windows and patio doors installed across Bucks County PA. Timeless design, durable performance, expert local install. Free estimate.','Pella Windows & Patio Doors in Bucks County, PA'],
    ['/crystal-windows/','Crystal Windows in Bucks County PA | Window Guardians','Crystal Window & Door Systems installed in Bucks County PA. Made-to-order custom sizes, shapes, and finishes. Lifetime warranty. Free estimate.','Crystal Windows in Bucks County, PA'],
    ['/door-and-window-replacement-levittown-pa/','Window & Door Replacement Levittown PA | Window Guardians','Premium window, door, and roofing replacement for Levittown, PA homes. Family-owned, lifetime warranty, 4.9-star Google rating. Free in-home estimate.','Window & Door Replacement in Levittown, PA'],
    ['/window-replacement-quiz/','Find Your Perfect Window | Bucks County PA Quiz | Window Guardians','Take our 2-minute window quiz to find the perfect replacement windows for your Bucks County, PA home. Get a custom recommendation and free estimate.','Find Your Perfect Window in Under 2 Minutes']
  ],
  og:'On every page, update og:title, og:description, twitter:title and twitter:description to match the new title + meta — these are what show when a page is shared on Facebook, Instagram or text. They currently all repeat the “Philadelphia” framing.',
  altFormat:'Almost every image’s alt text is just the filename (“24B”, “1.A”). Rewrite all gallery + project image alt text as: “Window replacement before and after in [town], PA — [short description]”. This alone can drive 20–40% more image-search traffic.',
  altExamples:[
    'Window replacement before and after in Yardley, PA — white double-hung windows on colonial home',
    'New entry door installation in Newtown, PA — mahogany ProVia door with sidelights',
    'Roof replacement in Langhorne, PA — GAF Timberline HDZ shingles in Charcoal'
  ],
  schema:[
    'LocalBusiness schema on every page (NAP, hours, geo, areaServed, services).',
    'Service schema on each service page (Window Replacement, Door Replacement, Roofing, Siding).',
    'AggregateRating schema pulling from Google reviews.',
    'FAQPage schema on every page that has an FAQ section.',
    'BreadcrumbList schema sitewide.'
  ],
  nap:'Window Guardians LLC · 430 Fox Hollow Dr., Langhorne, PA 19053 · (215) 709-8793 · info@windowguardians.com (after Gmail switchover) · Hours: 24/7 · Service area: Bucks County PA, Montgomery County PA, parts of Philadelphia & South Jersey.'
};
const REF_CARDS=[
 {num:'01',icon:'🔧',bg:'#e6effb',title:'Technical SEO',line:'The plumbing under the website — speed, mobile, schema, indexing.',
  is:'Site speed, mobile rendering, schema markup, indexing, crawlability, URL structure. The invisible foundation.',
  does:'Without technical SEO your content is invisible. Doesn’t matter how good your pages are — if Google can’t crawl, render, or understand them, they won’t rank.',
  fund:[['Core Web Vitals','LCP under 2.5s, INP under 200ms, CLS under 0.1. Real-user mobile load times.'],['Mobile-first indexing','Google ranks your mobile site, not desktop. Mobile usability errors = ranking drops.'],['Schema markup','Tells Google what your business is + feeds AI Overviews + LLM citations.'],['Indexability','robots.txt, XML sitemap, canonical tags. Right pages crawlable, wrong ones not.'],['Site architecture','Clean URLs, breadcrumbs, internal linking — how content connects matters.']],
  ignore:'Most "200-point technical audits." PageSpeed scores below 90 if real-user data is fine. Domain Authority. Bounce rate as a ranking factor (it isn’t).',
  tools:[['PageSpeed Insights','Free','Real-user Core Web Vitals'],['Search Console','Free','Crawl errors, indexing, mobile usability'],['Rich Results Test','Free','Validates schema markup'],['Screaming Frog','$259/yr','Full site crawl (200 URLs free)']],
  wg:'Your site has zero schema markup. Weeks 4 & 6 add LocalBusiness/Review/Service schema — the biggest single technical leverage you have.'},
 {num:'02',icon:'📄',bg:'#e6effb',title:'On-Page SEO',line:'The text, tags, and structure on each individual page.',
  is:'Title tags, meta descriptions, H1/H2 headers, internal linking, content optimization. The signals that match a page to search queries.',
  does:'Tells Google exactly what each page is about and who it’s for. Done well, you outrank bigger competitors because your page matches intent more precisely.',
  fund:[['Title tag','Strongest on-page signal. "[Keyword] in [Location] | Brand". 55–60 chars.'],['Meta description','Drives click-through. 150–160 chars, keyword + USP + CTA.'],['H1 + H2 hierarchy','One H1 matching primary keyword; descriptive H2s for subtopics.'],['Internal linking','Every page links to 5–10 related pages — distributes authority.'],['Content depth + uniqueness','1,500+ words for service pages, original. Templated copy was hit hardest by March 2026.']],
  ignore:'Keyword density. Meta keywords tag (dead since 2009). LSI keywords (myth). Exact-match anchor text inside content.',
  tools:[['RankMath / Yoast','Free','WordPress on-page optimization'],['Surfer SEO','$99/mo','Content briefs + competitor analysis'],['Search Console','Free','Queries each page already ranks for'],['Ahrefs Webmaster','Free','On-page issue audit']],
  wg:'Your title tags say "Philadelphia" on a Langhorne business. Week 2 pivots the homepage; town pages fix the rest.'},
 {num:'03',icon:'✏️',bg:'#e1f1e8',title:'Content SEO',line:'What you publish — depth, freshness, EEAT, topical authority.',
  is:'The text, images, video, and structure that fills your pages. Quality, depth, relevance, originality, and EEAT.',
  does:'Makes your site the answer to customers’ questions before they know they’re searching. Content compounds — a great page earns links, ranks, and drives leads for years.',
  fund:[['Search intent match','Match what the searcher wants. "Window cost Bucks County" = price ranges, not a pitch.'],['Content depth','1,500–3,000 words service pages, 1,000+ blog. Depth signals authority.'],['EEAT','Named authors, real credentials, real photos, license numbers visible.'],['Topical authority','Cover the full topic: service + cost + comparisons + FAQs + case studies.'],['Freshness','Update old content, restart the dormant blog. Google rewards recency on commercial pages.']],
  ignore:'AI-generated bulk content (March 2026 flagged this). Word count for its own sake. Listicle "top 10" content for service queries.',
  tools:[['Surfer SEO','$99/mo','Briefs from top-ranking competitors'],['Frase','$45/mo','Topic research + outlines'],['Clearscope','$189/mo','Content optimization scoring'],['Google Docs','Free','Still the best writing tool — don’t over-engineer']],
  wg:'Blog dormant since Aug 2025. The 3-blogs/Tuesday engine restarts cadence; cost guides + comparisons come next.'},
 {num:'04',icon:'📍',bg:'#fde7da',title:'Local SEO',line:'GBP, map pack, citations, town pages — the biggest revenue lever.',
  is:'Google Business Profile, citations, NAP consistency, map-pack rankings, town landing pages, reviews. The geographic layer.',
  does:'Drives ~80% of contractor lead flow. Local-pack appearances convert 5–7× higher than organic links. For Window Guardians this is the highest-leverage category, period.',
  fund:[['Google Business Profile','32% of map-pack weight. Primary category is the #1 signal. Get it right first.'],['NAP consistency','Name, Address, Phone identical everywhere. One variation hurts the whole profile.'],['Citations','Tier 1–6 directories publishing your info. Foundation of local authority.'],['Town landing pages','One unique page per town — named neighborhoods, real case studies, town reviews.'],['Map-pack signals','Review velocity, photos, proximity, clicks/calls/directions move the 3-pack.']],
  ignore:'Cheap citation packages to spam directories. Geo-keyword stuffing in the business name. GBP posts as a ranking factor (they don’t move rankings).',
  tools:[['Google Business Profile','Free','Your single most important asset'],['BrightLocal','$35/mo','Citations + monitoring + rank tracking'],['Whitespark','$30/mo','Citation builder + local audit'],['Local Falcon','$24/mo','Map-pack rank tracking by grid']],
  wg:'GBP needs primary + secondary categories, services with prices, photo cadence, review automation. Category 1 of this whole plan.'},
 {num:'05',icon:'🔗',bg:'#e6effb',title:'Link Building',line:'Other reputable sites linking to yours — votes of confidence.',
  is:'Backlinks from local press, HOAs, chambers, manufacturer dealer pages, sponsorships, partnerships. Off-page authority.',
  does:'Each high-quality link is a vote of confidence. For contractors, ONE good local press feature beats 50 cheap directory links.',
  fund:[['Local press','Bucks County Courier Times, Patch, Bucks County Magazine. One feature = 3–5 leads + a link.'],['HOA newsletters','Vendor recommendation sections in 55+ community newsletters. Recurring.'],['Manufacturer dealer pages','OKNA, ProVia, Andersen, Pella, GAF "find a dealer" pages — high-DA easy wins.'],['Chamber + business orgs','Bucks County Chamber, NARI, NAHB — membership links + directory listings.'],['Sponsorships + community','Little League, school athletics, charity 5Ks — brand + link builder.']],
  ignore:'PBN links. Fiverr/"link seller" links. Reciprocal schemes. Generic guest posts on irrelevant sites. Anything with "cheap" in the pitch.',
  tools:[['Ahrefs Webmaster','Free','Your existing backlink profile'],['HARO / Connectively','Free','Journalist queries — pitch as the expert'],['BuzzStream','$24/mo','Outreach management'],['Hunter.io','$49/mo','Find decision-maker emails']],
  wg:'Start with manufacturer dealer pages (easy wins) + a Bucks County Courier Times pitch. A Q4 fast-follow once pages exist.'},
 {num:'06',icon:'⭐',bg:'#fbeed3',title:'Reviews & Reputation',line:'Trust signal + ranking signal + conversion lift, all at once.',
  is:'Reviews across Google, BBB, Houzz, Angi, Yelp. Star ratings, written content, response patterns, recency.',
  does:'The only SEO factor that ALSO directly converts traffic. Stars in the search result + GBP both lift click-through materially.',
  fund:[['Velocity','15+ Google reviews/month is the benchmark. Under 3/mo while competitors get 15+ = active ranking loss.'],['Recency','2 reviews this week beats 200 where the last was 6 months ago.'],['Response rate','Reply to 80%+ within 48 hours. Templates make it scalable.'],['Content quality','Coach customers to mention the service ("OKNA windows"), the town, and one detail.'],['Platform priority','Google >> BBB > Houzz > Angi > Yelp. Focus where buyers check trust.']],
  ignore:'Fake reviews (penalties + FTC fines). Review gating — using a survey to BLOCK unhappy customers from reaching Google (that’s illegal). Note: personally choosing to ask your satisfied customers for a review is normal and fine — that’s targeting, not gating. Buying reviews. Yelp drama.',
  tools:[['Podium','$249/mo','Review automation + SMS'],['NiceJob','$75/mo','Contractor-focused automation'],['Birdeye','$249/mo','Multi-platform monitoring'],['LeadConnector','Bundled','Built into GoHighLevel — you already have it']],
  wg:'Strong ratings (4.9 Google, 5.0 Houzz, 5.0 FB) but no velocity program. Bogdan’s reviews machine is the biggest unlock — runs every week.'},
 {num:'07',icon:'🤖',bg:'#e6effb',title:'AI Era SEO',line:'Getting cited in ChatGPT, Perplexity, Gemini, AI Overviews.',
  is:'Optimization for AI summary inclusion, LLM citation, voice search, knowledge panels. Where SEO is going.',
  does:'97% of informational queries now trigger AI overviews; click-through on those dropped 61%. If you’re not CITED inside the summary, you’re invisible for that query.',
  fund:[['Schema markup','HomeAndConstructionBusiness + AggregateRating + FAQPage are the entry ticket for LLM citation.'],['Direct-answer phrasing','"X is Y because Z" gets pulled into AI summaries. Lead with the answer.'],['EEAT signals','Named experts, credentials, original photos, license numbers — LLMs weight these.'],['Brand mentions','Being talked about (even without a link) is an entity signal. PR matters more.'],['Transactional/informational mix','Aim 70% transactional / 30% informational — transactional still gets clicks.']],
  ignore:'"Prompt hacking" to game LLMs. "AI-friendly" content from AI tools (flagged hardest March 2026). Treating "ChatGPT SEO" as a separate channel — it’s the same SEO.',
  tools:[['Schema.org','Free','Reference for structured data'],['Schema Pro / RankMath','WP plugin','Automate schema deployment'],['Profound','$199/mo','Tracks brand mentions in AI answers'],['Otterly.AI','$49/mo','LLM citation tracking']],
  wg:'Schema in Weeks 4 & 6 is the entry ticket. Once live, monitoring LLM citations becomes worth doing.'},
 {num:'08',icon:'📊',bg:'#e1f1e8',title:'Analytics & Measurement',line:'Knowing what works, proving ROI, spotting problems early.',
  is:'GA4, Search Console, rank tracking, call tracking, heatmaps, reporting. The proof layer.',
  does:'Without measurement you can’t tell if SEO is working or got hit by an update. Every dollar needs an attribution path to a lead or sale.',
  fund:[['GA4','Conversion events: form_submit, phone_click, email_click. Free, mandatory.'],['Search Console','Queries you rank for, indexing, penalties. The BEFORE side of every visit.'],['Rank tracker','Weekly position monitoring for priority keywords (BrightLocal/Whitespark).'],['Call tracking (CallRail)','Most contractor leads come by phone — attribute them to source. (GHL covers this too.)'],['Heatmaps (Clarity)','Free. See where visitors click, scroll, and quit.']],
  ignore:'Vanity metrics. Traffic without conversion context. Domain Authority. Bounce rate. Average time on page (skewed).',
  tools:[['Google Analytics 4','Free','Mandatory baseline'],['Search Console','Free','Mandatory baseline'],['CallRail','$45/mo+','Call tracking + attribution'],['Microsoft Clarity','Free','Heatmaps + recordings'],['BrightLocal','$35/mo','Rank tracking + citations']],
  wg:'Week 1 (GHL phone for call tracking) starts the measurement stack. Add GA4 + Search Console + Clarity alongside — all free.'}
];

/* ============================================================
   SOCIAL PROGRAM DATA  (Program 2 — the social-media game plan)
   Rebuilt from the WG Social Media Playbook (v1.0, 2026-05-31).
   Same Tuesday-noon cadence + render engine as SEO, but run by just
   two people: Sebastian (owner — captures + approves) and Ruth
   (executes — posts + the same-day Google review flow). Bogdan’s
   one-time setup (review link, account access, unified profiles) is a
   foundation note, not a weekly role — see SOCIAL_FOUNDATION.
   Core platforms: Google Business Profile · Facebook · Instagram, plus
   Nextdoor — with room to add more once the core three are consistent.
   Social’s job isn’t viral reach — it’s familiarity + trust, so WG makes
   the homeowner’s shortlist of 2–3 companies they actually call.
   ============================================================ */
const SOCIAL_ORDER=['sebastian','ruth'];

/* ---- The standing weekly engine (runs EVERY week, on top of the build) ---- */
const SOCIAL_ENGINE=[
  {who:'sebastian',txt:'Capture the <b>6-shot list</b> on every job this week (before · after · detail · context · crew · a 10–20s talk-to-camera) — about 2 minutes a job, straight from your phone into the shared Content Drive.'},
  {who:'sebastian',txt:'Run a short <b>weekly batch</b>: dump the photos, pick your best moments, paste the job details into the saved AI caption prompt and approve/tweak — aim to bank <b>5 posts</b> for the week so Ruth always has something ready. That’s the whole creative job.'},
  {who:'ruth',txt:'<b>Paste-and-post</b> the ready-made posts (media + caption + hashtags + geo-tag, exactly as written — no decisions): <b>5 a week, any 5 days</b> across the core channels + Nextdoor, and reply to <b>100% of comments + DMs within 24h</b>.'},
  {who:'ruth',txt:'Send the <b>same-day Google review text</b> after every finished job (one 3-day follow-up max, never offer anything in exchange) and fill the <b>Friday 5-minute scorecard</b>. This one habit compounds harder than anything else in the plan.'}
];

/* ---- 12-week plan (30/60/90, two operators) ---- */
const SOCIAL_PHASES=[
  {n:1,name:'Foundation · Days 1–30',dates:'Weeks 1–4 · Jun 2 – Jun 23'},
  {n:2,name:'Momentum · Days 31–60',dates:'Weeks 5–8 · Jun 30 – Jul 21'},
  {n:3,name:'Scale · Days 61–90',dates:'Weeks 9–12 · Jul 28 – Aug 18'}
];

const SOCIAL_WEEKS=[
 {id:1,phase:1,due:'2026-06-02',title:'Foundation — Cadence Live, Reviews Flowing',roles:{
   sebastian:{est:'1–2 hrs',sum:'Confirm the one-time foundation, tape the 6-shot list in the van, and run the first batch — seeded from the Yelp photo backlog.',
     steps:[
       'Confirm the one-time foundation is done: the direct Google review link, access to all accounts, and a unified name / logo / NAP across Google Business Profile, Facebook & Instagram (see the Foundation note on the Playbook tab).',
       'Tape the 6-shot list in the van and grab it on this week’s jobs (before · after · detail · context · crew · talk).',
       'Mine the 118 existing Yelp photos for an instant before/after backlog — pull the 6 best into the Content Drive.',
       'Run the first ~35-min batch: pick 3 moments, paste the job details into the saved AI caption prompt, approve the captions, and fill Ruth’s handoff sheet (1 Proof + 1 Customer Love + 1 Neighbors).'],
     handoff:'→ Ruth: 3 ready-to-post rows are in the handoff sheet and the review link is live — post them and switch on the same-day review text.'},
   ruth:{est:'2–3 hrs',sum:'Switch on the same-day review engine, join 5 town Groups, and publish the first consistent week.',
     steps:[
       'Turn on the same-day Google review text from the WG line in GoHighLevel — send it the day every job finishes (one 3-day follow-up max, never offer anything in exchange).',
       'Paste-and-post the 3 prepared rows across Facebook + Instagram and add the matching Google Business Profile post.',
       'Join 5 Bucks County town / community Facebook Groups and make sure Nextdoor is claimed + active.',
       'Log the baseline in the Friday scorecard: starting Instagram followers (~88), current review count, and posts published.'],
     handoff:'→ Sebastian: cadence is live and the review engine is on — baseline numbers are in the scorecard.'}}},
 {id:2,phase:1,due:'2026-06-09',title:'First Consistent Week',roles:{
   sebastian:{est:'~1 hr',sum:'Capture + batch a Proof-led week, with one Education post for the 2–4 week researcher.',
     steps:[
       'Capture the 6-shot list on every job; get at least one clean before/after set.',
       'Run the ~35-min batch and approve 3 posts: 1 Proof (before/after) + 1 Neighbors ("just finished in [town]" curb shot) + 1 Education ("why your windows fog up").',
       'Record one 10–20s talk-to-camera answer for the Education post.'],
     handoff:'→ Ruth: the 3 rows + the talk clip are in the sheet — post on cadence.'},
   ruth:{est:'~2 hrs',sum:'Hold the cadence, run the review text, and engage daily in the town Groups.',
     steps:[
       'Paste-and-post the 3 posts (FB + IG) + 1 Google Business Profile update; geo-tag each to its town.',
       'Send the same-day review text to every finished job; reply to 100% of comments + DMs within 24h.',
       'Add value (answer / comment, no spam) in the 5 town Groups a few times this week.',
       'Update the Friday scorecard (posts, reviews added, reach, new followers).'],
     handoff:'→ Sebastian: week 2 is out and reviews are flowing — scorecard updated.'}}},
 {id:3,phase:1,due:'2026-06-16',title:'Surface the Reputation',roles:{
   sebastian:{est:'~1 hr',sum:'Batch a Customer-Love-led week — turn the 5-star reputation you already have into posts.',
     steps:[
       'Capture the 6-shot list on this week’s jobs.',
       'Pick which recent 5-star reviews are OK to feature; paste the details into the caption prompt.',
       'Approve 3 posts: 1 Customer Love (review screenshot) + 1 Proof + 1 Sebastian & Crew (a quick "today’s job" talk).'],
     handoff:'→ Ruth: the review screenshots + 3 rows are in the sheet — post them.'},
   ruth:{est:'~2 hrs',sum:'Publish the social-proof week and keep the review engine running.',
     steps:[
       'Turn the 3 best recent reviews into testimonial posts (screenshot + the customer’s town) and post the week’s 3.',
       'Post 1 Google Business Profile update; send the same-day review text after every finished job.',
       'Reply to 100% of comments + DMs within 24h; keep engaging in the town Groups.',
       'Update the Friday scorecard.'],
     handoff:'→ Sebastian: the proof posts are live and reviews are logged.'}}},
 {id:4,phase:1,due:'2026-06-23',title:'Month-1 Check — Home Base',roles:{
   sebastian:{est:'~1 hr',sum:'Batch a Langhorne-anchored week and review month-1 numbers with Ruth.',
     steps:[
       'Capture the 6-shot list; get a strong Langhorne (home base) before/after.',
       'Approve 3 posts: 1 Neighbors ("born & based in Langhorne") + 1 Proof + 1 Education.',
       'Review the month-1 scorecard with Ruth — is cadence holding and are reviews flowing?'],
     handoff:'→ Ruth: 3 rows are in the sheet — post, then close out the month-1 numbers.'},
   ruth:{est:'~2 hrs',sum:'Publish, confirm the month-1 milestone, and tidy the content log.',
     steps:[
       'Paste-and-post the 3 posts + 1 Google Business Profile update; geo-tag to Langhorne / town.',
       'Send the same-day review text after every finished job; reply to all comments + DMs within 24h.',
       'Confirm the Phase-1 milestone in the scorecard: cadence live (zero missed weeks) and reviews flowing.',
       'Note which posts got the most saves / shares to guide month 2.'],
     handoff:'→ Sebastian: month-1 milestone hit — cadence live, reviews flowing.'}}},
 {id:5,phase:2,due:'2026-06-30',title:'Geo Push: Newtown & Yardley + Owner On-Camera',roles:{
   sebastian:{est:'1–1.5 hrs',sum:'Start the weekly on-camera habit and batch geo-content for Newtown & Yardley.',
     steps:[
       'Record 1 Sebastian & Crew talk-to-camera this week — the on-camera habit starts now (1/week).',
       'Capture before/after sets from Newtown and Yardley jobs (or pull from the backlog).',
       'Approve 3 posts: 1 Neighbors (Newtown) + 1 Neighbors/Proof (Yardley) + 1 Sebastian & Crew.',
       'When the Newtown or Yardley SEO town page goes live, post "just finished in [town]" so search + social compound on the same households.'],
     handoff:'→ Ruth: Newtown + Yardley rows + the owner clip are in the sheet.'},
   ruth:{est:'~2 hrs',sum:'Publish the geo week, geo-tag tightly, and keep reviews + replies fast.',
     steps:[
       'Paste-and-post the 3 posts (FB + IG + Nextdoor where it fits) + 1 Google Business Profile update; geo-tag Newtown / Yardley.',
       'Send the same-day review text after every finished job; reply to all comments + DMs within 24h.',
       'Cross-post the owner clip as a Reel; engage in the Newtown / Yardley Groups.',
       'Update the Friday scorecard.'],
     handoff:'→ Sebastian: Newtown + Yardley are in the feed and the first owner clip is live.'}}},
 {id:6,phase:2,due:'2026-07-07',title:'Geo Push: Lower Makefield & Richboro + Education',roles:{
   sebastian:{est:'1–1.5 hrs',sum:'Batch Lower Makefield + Richboro geo-content and one Education piece for researchers.',
     steps:[
       'Record 1 talk-to-camera with an Education angle ("what old windows cost you each summer").',
       'Capture a before/after + a detail close-up (caulk / trim) from Lower Makefield / Richboro jobs.',
       'Approve 3 posts: 1 Neighbors (Lower Makefield) + 1 Proof/detail (Richboro) + 1 Education.',
       'Post "just finished in [town]" if the Lower Makefield or Richboro SEO page ships this week.'],
     handoff:'→ Ruth: Lower Makefield + Richboro rows + the education clip are in the sheet.'},
   ruth:{est:'~2 hrs',sum:'Publish, keep the engine running, and watch what earns saves / shares.',
     steps:[
       'Paste-and-post the 3 posts + 1 Google Business Profile update; geo-tag Lower Makefield / Richboro.',
       'Send the same-day review text; reply to all comments + DMs within 24h.',
       'Note which Education topics get the most saves / shares for future posts.',
       'Update the Friday scorecard.'],
     handoff:'→ Sebastian: Lower Makefield + Richboro are in the feed; save/share notes logged.'}}},
 {id:7,phase:2,due:'2026-07-14',title:'Geo Push: Holland + First Lead-Gen Push',roles:{
   sebastian:{est:'1–1.5 hrs',sum:'Batch Holland geo-content and add a clear lead-gen CTA the team can respond to fast.',
     steps:[
       'Record 1 talk-to-camera with a soft "free estimate / what to expect" angle.',
       'Capture a Holland before/after + a full-home replacement set.',
       'Approve 3 posts: 1 Neighbors (Holland) + 1 Proof + 1 Education/CTA ("what to expect on install day").',
       'Agree the DM-response plan with Ruth — speed wins the job (~78% hire the first contractor to respond).'],
     handoff:'→ Ruth: Holland rows + the CTA post are in the sheet — be ready for fast DM replies.'},
   ruth:{est:'2–2.5 hrs',sum:'Publish, drive the first lead-gen CTA, and answer inbound fast.',
     steps:[
       'Paste-and-post the 3 posts + 1 Google Business Profile update; geo-tag Holland.',
       'Add a clear "DM us / free estimate" CTA to this week’s posts + stories.',
       'Reply to every DM / comment ASAP (same hour where possible) and tag each social-sourced inquiry in GoHighLevel by source ("FB DM," "IG," "GBP," "Group").',
       'Send the same-day review text; update the Friday scorecard.'],
     handoff:'→ Sebastian: Holland is live, the CTA is out, and inbound DMs are being tagged in GHL.'}}},
 {id:8,phase:2,due:'2026-07-21',title:'Geo Push: Feasterville + Month-2 Milestone',roles:{
   sebastian:{est:'1–1.5 hrs',sum:'Batch Feasterville geo-content — every one of the 7 towns is now in the feed.',
     steps:[
       'Record 1 talk-to-camera; capture a Feasterville before/after.',
       'Approve 3 posts: 1 Neighbors (Feasterville) + 1 Customer Love + 1 Sebastian & Crew.',
       'Review month-2 with Ruth: every town in the feed, and the first social-attributed estimate in?'],
     handoff:'→ Ruth: Feasterville rows are in the sheet — post, then confirm the month-2 numbers.'},
   ruth:{est:'~2 hrs',sum:'Publish, confirm the Phase-2 milestone, and log the first attributed lead.',
     steps:[
       'Paste-and-post the 3 posts + 1 Google Business Profile update; geo-tag Feasterville.',
       'Send the same-day review text; reply to all comments + DMs within 24h.',
       'Confirm the Phase-2 milestone: all 7 towns posted at least once + the first social-attributed estimate tagged in GHL.',
       'Update the Friday scorecard with month-2 totals.'],
     handoff:'→ Sebastian: all 7 towns are in the feed and the first social-attributed estimate is logged.'}}},
 {id:9,phase:3,due:'2026-07-28',title:'Double Down on What Works',roles:{
   sebastian:{est:'~1 hr',sum:'Lean the batch toward whatever format drove DMs / clicks — repeat the winners.',
     steps:[
       'With Ruth, pick the 3 best-performing posts so far (saves / shares / DMs) and shoot more of that format.',
       'Record 1 talk-to-camera; capture the usual 6-shot list.',
       'Approve 3 posts weighted to the winning pillar (likely Proof or Sebastian & Crew).'],
     handoff:'→ Ruth: 3 winner-format rows are in the sheet — post them.'},
   ruth:{est:'~2 hrs',sum:'Publish the winners, keep the engine on, and track intent metrics.',
     steps:[
       'Paste-and-post the 3 posts + 1 Google Business Profile update.',
       'Send the same-day review text; reply to all comments + DMs within 24h; tag leads in GHL.',
       'In the scorecard, watch saves / shares + profile / link clicks — are the winner formats trending up?'],
     handoff:'→ Sebastian: the winning formats are live and intent metrics are trending.'}}},
 {id:10,phase:3,due:'2026-08-04',title:'Referral Loop — Tag a Neighbor',roles:{
   sebastian:{est:'~1 hr',sum:'Batch a week that turns happy customers into reach — ask reviewers to tag a neighbor.',
     steps:[
       'Capture the 6-shot list; record 1 talk-to-camera thanking a town.',
       'Approve 3 posts: 1 Customer Love (a thank-you tagging a town) + 1 Proof + 1 Neighbors.',
       'Pick the happy customers / reviewers it’s OK for Ruth to invite to tag a neighbor.'],
     handoff:'→ Ruth: 3 rows + the list of reviewers to invite are in the sheet.'},
   ruth:{est:'~2 hrs',sum:'Publish, run the referral loop, and keep reviews compounding.',
     steps:[
       'Paste-and-post the 3 posts + 1 Google Business Profile update.',
       'Invite happy reviewers to tag a neighbor who’d love new windows (the referral loop) — friendly, never pushy.',
       'Send the same-day review text; reply to all comments + DMs within 24h.',
       'Update the Friday scorecard (reviews should be climbing toward 40+).'],
     handoff:'→ Sebastian: the referral loop is running and reviews are climbing.'}}},
 {id:11,phase:3,due:'2026-08-11',title:'Light Paid Boost (If Warranted)',roles:{
   sebastian:{est:'~1 hr',sum:'Decide whether to lightly boost one proven post, and approve the spend.',
     steps:[
       'Review the 3 proven organic performers Ruth shortlisted.',
       'Decide if a light boost is warranted (target 35–65, $75K+ households, the 7 ZIPs) — organic-first, only if it’s a clear winner.',
       'Approve the boost budget + audience, and approve this week’s 3 posts.'],
     handoff:'→ Ruth: boost decision made — set it up (or hold) and keep the cadence.'},
   ruth:{est:'~2 hrs',sum:'Set up the boost / retargeting if approved, and hold the organic cadence.',
     steps:[
       'If approved, boost the chosen post to 35–65 / $75K+ / the 7 ZIPs and build a website-visitor + engagement retargeting audience in Meta.',
       'Paste-and-post the week’s 3 posts + 1 Google Business Profile update.',
       'Send the same-day review text; reply to all comments + DMs within 24h; tag leads in GHL.',
       'Update the Friday scorecard (note any boost results separately from organic).'],
     handoff:'→ Sebastian: the boost is live (or held) and the organic cadence held.'}}},
 {id:12,phase:3,due:'2026-08-18',title:'90-Day Social Scorecard + Q4',roles:{
   sebastian:{est:'~1 hr',sum:'Review the 90-day numbers with Ruth and set the Q4 content priorities.',
     steps:[
       'Review the 90-day scorecard with Ruth: posts, reviews added, followers, DMs / inquiries, social-attributed estimates.',
       'Pick the 5 best-performing posts as the Q4 template.',
       'Approve the final 3 posts and the Q4 content priorities.'],
     handoff:'→ Ruth: Q4 priorities are set — compile the final 90-day scorecard.'},
   ruth:{est:'~2 hrs',sum:'Compile the 90-day scorecard and tidy the content library.',
     steps:[
       'Compile the 90-day totals: posts published, Google reviews added, new followers (Instagram 88 → target 250+), DMs / inquiries, social-attributed estimates.',
       'Note which channel ("FB DM," "IG," "GBP," "Group") booked the most estimates so Q4 can double down.',
       'Paste-and-post the final 3 posts + 1 Google Business Profile update; reply to all comments + DMs within 24h.',
       'Archive posted content by month and confirm the Phase-3 milestone: a repeatable engine + reviews toward 40+.'],
     handoff:'→ Sebastian: the 90-day social scorecard is ready to review with the team.'}}}
];

const SOCIAL_DELIVERIES={
 '1.sebastian':[{to:'ruth',need:'3 ready-to-post rows (media + caption + hashtags + geo-tag) + confirmation the Google review link is live'}],
 '1.ruth':[{to:'sebastian',need:'Baseline scorecard numbers — starting IG followers (~88), review count, posts published'}],

 '2.sebastian':[{to:'ruth',need:'3 prepared rows + the talk-to-camera clip for the Education post'}],
 '2.ruth':[{to:'sebastian',need:'Week-2 scorecard update (posts, reviews added, reach, new followers)'}],

 '3.sebastian':[{to:'ruth',need:'3 rows incl. which 5-star reviews are OK to feature (screenshots)'}],
 '3.ruth':[{to:'sebastian',need:'The social-proof week logged + the updated review count'}],

 '4.sebastian':[{to:'ruth',need:'3 Langhorne-anchored rows + month-1 review together'}],
 '4.ruth':[{to:'sebastian',need:'Month-1 milestone confirmation — cadence holding + reviews flowing'}],

 '5.sebastian':[{to:'ruth',need:'Newtown + Yardley rows + the owner talk-to-camera clip'}],
 '5.ruth':[{to:'sebastian',need:'Newtown + Yardley live + owner clip posted; scorecard updated'}],

 '6.sebastian':[{to:'ruth',need:'Lower Makefield + Richboro rows + the education clip'}],
 '6.ruth':[{to:'sebastian',need:'Lower Makefield + Richboro live + the save/share notes'}],

 '7.sebastian':[{to:'ruth',need:'Holland rows + the CTA post + the DM-response plan'}],
 '7.ruth':[{to:'sebastian',need:'First social-sourced inquiries tagged in GHL by source'}],

 '8.sebastian':[{to:'ruth',need:'Feasterville rows + month-2 review together'}],
 '8.ruth':[{to:'sebastian',need:'Month-2 totals + the first social-attributed estimate'}],

 '9.sebastian':[{to:'ruth',need:'3 winner-format rows (the best-performing pillar)'}],
 '9.ruth':[{to:'sebastian',need:'Saves/shares + profile/link-click trend for the winners'}],

 '10.sebastian':[{to:'ruth',need:'3 rows + the list of happy reviewers OK to invite to tag a neighbor'}],
 '10.ruth':[{to:'sebastian',need:'Referral loop running + the updated review count'}],

 '11.sebastian':[{to:'ruth',need:'The boost decision (budget + audience) + the week’s 3 posts'}],
 '11.ruth':[{to:'sebastian',need:'Boost set up (or held) + the retargeting audience built'}],

 '12.sebastian':[{to:'ruth',need:'Q4 content priorities + final batch approval'}],
 '12.ruth':[{to:'sebastian',need:'The compiled 90-day social scorecard'}]
};

const SOCIAL_KPIS=[
  {id:'posts',label:'Posts published',sub:'3/week × 12 · zero missed weeks',target:36,step:1,big:3},
  {id:'reviews',label:'Google reviews added',sub:'The big one · toward 40–75',target:20,step:1,big:5},
  {id:'followers',label:'New followers (Instagram)',sub:'88 → 250+',target:162,step:1,big:10},
  {id:'estimates',label:'Social-attributed estimates',sub:'Tagged by source in GHL',target:10,step:1,big:1}
];

/* ============================================================
   SOCIAL REFERENCE DATA  (feeds the Playbook / Strategy / Audit pages —
   the social mirror of the SEO Guides/Strategy/Audit library)
   Source: WG Social Media Playbook v1.0 (2026-05-31).
   ============================================================ */
const SOCIAL_FOUNDATION={
  title:'One-Time Foundation',
  sub:'Set up once — not weekly work',
  intro:'These are the only items that aren’t Sebastian-or-Ruth weekly work. Get them done once and the whole engine runs on just the two of you.',
  items:[
    {who:'Bogdan · one-time',t:'Direct Google review link',d:'Create the short direct-to-review link and load it into the GoHighLevel review text so Ruth can send it the same day a job finishes.'},
    {who:'Bogdan · one-time',t:'Account access',d:'Give Sebastian + Ruth access to Google Business Profile, Facebook, Instagram and Nextdoor (plus the scheduler + Content Drive).'},
    {who:'Bogdan · one-time',t:'Unified profiles',d:'Make the name, logo, cover image and NAP identical across Google Business Profile, Facebook & Instagram — matching the website exactly.'},
    {who:'Iwona · one-time',t:'Photo-release in the contract',d:'Add a simple photo / video release line to the job contract so every finished job is cleared to feature.'}
  ],
  note:'After this, it’s just the two of you: Sebastian captures + approves, Ruth posts + runs the reviews.'
};
const SOCIAL_PILLARS={
  intro:'Five content buckets — Proof, Neighbors, Customer Love, Sebastian & Crew, Education. Rotate through them so the feed stays varied without anyone deciding from scratch. Every post is one of these — so there’s never a "what do I post?" moment.',
  why:'Proof of craftsmanship + local familiarity + your real reviews, shown consistently, is exactly what gets WG onto the shortlist. The pillars turn that into a repeatable formula instead of a guessing game.',
  list:[
    {n:1,icon:'🛠️',t:'Proof',goal:'Trust → shortlist',d:'Before/afters & install-detail close-ups. The most credible, most-saved format.'},
    {n:2,icon:'📍',t:'Neighbors',goal:'Local awareness',d:'"Just finished in [Town]" + curb shots, geo-tagged to the 7 priority towns.'},
    {n:3,icon:'⭐',t:'Customer Love',goal:'Trust + reviews',d:'Review screenshots & testimonials — surfacing the 5-star reputation you already have.'},
    {n:4,icon:'👷',t:'Sebastian & Crew',goal:'Personality + trust',d:'Owner on camera, the team, behind-the-scenes. People hire people.'},
    {n:5,icon:'🎓',t:'Education',goal:'Leads',d:'Myth-busting, energy savings, "what to expect." Captures the 2–4 week researcher.'}
  ],
  mix:'3 posts/week: 1 Proof + 1 Neighbors or Customer Love + 1 Education or Sebastian. Rotate so all five cycle through every month.',
  avoid:'No discount / price-war language. No competitor mentions. No stock photos. No AI-generated images. Real WG jobs only — authenticity is the entire point.'
};
const SOCIAL_SHOTLIST={
  intro:'The whole content factory is Sebastian’s phone plus one weekly sit-down: capture-as-you-go on jobs (near-zero effort), then a single ~35-minute batch session to package + caption it all.',
  why:'Your time is the scarce resource. This costs ~2 min/job to capture + ~35 min/week to batch — and you approve AI-drafted captions instead of writing from scratch. Sustainable beats perfect.',
  shots:[
    {n:1,t:'Before',d:'The old window / door, wide, before touching anything. (3 sec)'},
    {n:2,t:'After',d:'Same angle, finished. (3 sec)'},
    {n:3,t:'Detail',d:'One close-up: caulk line, trim, flashing, or hardware. (3 sec)'},
    {n:4,t:'Context',d:'The house from the curb — shows the town’s home style. (3 sec)'},
    {n:5,t:'Crew',d:'5-sec clip of the team working. Optional but gold.'},
    {n:6,t:'Talk',d:'10–20 sec of you: "We’re in Yardley today, swapped 8 drafty windows for Okna — look at that." The highest-value 20 seconds you’ll spend.'}
  ],
  batch:['Dump photos to the shared folder (5m)','Pick the 3 best moments (5m)','Paste job details into the saved AI caption prompt, approve / tweak (10m)','Fill Ruth’s handoff sheet (10m)'],
  ignore:'No tripods, no lighting kits, no scripts, no daily posting fiddle. Don’t wait for the "perfect" job — every job has a usable before/after. Don’t let it become a second job.'
};
const SOCIAL_RUTHKIT={
  intro:'Ruth receives finished, copy-paste-ready content in a fill-in sheet and posts it — no writing, no decisions. She also runs the same-day Google review text after every job.',
  why:'Reviews drive both the shortlist and your Google Map Pack ranking. An SMS review request sent same-day converts highest (~8–12%). This one habit compounds harder than anything else in the plan.',
  steps:[
    'Open the row & upload the media file — everything’s pre-filled by Sebastian.',
    'Paste the caption, then the hashtags — exactly as written, no edits.',
    'Set the geo-tag, post (or schedule), check the box. Move to the next row.'
  ],
  rules:[
    'Send the direct Google review link the same day a job finishes.',
    'One follow-up after 3 days, never more.',
    'Ask every happy customer, not just the enthusiastic ones.',
    'Never offer anything in exchange (against Google policy).'
  ],
  reviewText:'"Hi [Name], thank you for choosing Window Guardians! If you’re happy with your new [windows/door], a quick Google review would mean a lot to our small family business — takes 30 seconds: [review link]. Thank you! — Ruth"'
};
const SOCIAL_HANDOFF={
  intro:'The fill-in row Sebastian completes and Ruth executes. One row per post — every cell pre-filled, so Ruth never makes a decision.',
  columns:[
    ['Post #','1'],
    ['Date','Tue 6/3'],
    ['Time','11:00a'],
    ['Platform(s)','Instagram + Facebook'],
    ['Media file','yardley_dblhung_after.jpg'],
    ['Caption (paste as-is)','"Eight drafty windows → gone. This Yardley home is quieter and cooler already. ☀ We do it once because we do it right. Free estimate → link in bio."'],
    ['Hashtags (paste)','#YardleyPA #BucksCountyPA #LowerMakefield #windowreplacement #OknaWindows #WindowGuardians #DoneRight'],
    ['Geo-tag','Yardley, PA'],
    ['Ruth’s instruction','Post to IG + FB at 11a. Set location to Yardley. Done.']
  ],
  promptTitle:'The Saved AI Caption Prompt',
  promptSub:'Sebastian pastes job details in',
  prompt:'"You write IG/FB captions for Window Guardians, a Lower Bucks County PA window & door specialist. Voice: confident, warm, local, no hype, no discounts, no competitor mentions. Today’s job: [town + what we did + product]. Write 3 caption options under 280 characters, each ending with a soft CTA, plus a hashtag set: 4 local, 3 project, 2 brand."'
};
const SOCIAL_BANK={
  intro:'A ready-made backlog of 33 posts mapped to the five pillars and the seven priority towns. Drop them straight into the handoff sheet.',
  groups:[
    {t:'Proof',icon:'🛠️',items:['B/A double-hung set — Langhorne','B/A sliding patio door — Newtown','B/A bay window — Yardley','Detail: caulk / trim close-up — Lower Makefield','B/A front entry door — Richboro','B/A full-home replacement — Holland','Roof B/A — Feasterville','Siding transformation — Langhorne']},
    {t:'Neighbors',icon:'📍',items:['"Just wrapped in Newtown 👋"','"Yardley friends — neighbors upgrading"','"Proud to work in Lower Makefield"','"Another happy Richboro home"','"All over Holland this month"','"Feasterville, new windows going in"','"Born & based in Langhorne — home"']},
    {t:'Customer Love',icon:'⭐',items:['5-star Google review screenshot','Facebook review (96% recommend!)','"Saved them thousands" testimonial','Quote about the clean, tidy crew','"10/10 would recommend" repost','Thank-you post tagging a town']},
    {t:'Sebastian & Crew',icon:'👷',items:['Sebastian 20-sec "today’s job" talk','"Meet the family behind WG"','Crew time-lapse Reel','"Why we’re specialists, not contractors"','Behind-the-scenes: the consultation']},
    {t:'Education',icon:'🎓',items:['"Why your windows fog up"','"What old windows cost you each summer"','"Okna windows: what’s different"','"Financing made simple" (if offered)','"What to expect on install day"','"Single vs. double vs. triple pane"','"Signs it’s time to replace your door"']}
  ],
  hashtags:[
    ['Local','#LanghornePA #NewtownPA #YardleyPA #BucksCountyPA #RichboroPA #HollandPA #FeastervillePA'],
    ['Project','#windowreplacement #windowinstallation #doorreplacement #energyefficientwindows #OknaWindows'],
    ['Brand','#WindowGuardians #WeDoItRight #DoneOnceDoneRight']
  ],
  moreTowns:'The 7 are the locked primary focus for deep lead-gen, but awareness posts are nearly free — when a job lands in a secondary town (Washington Crossing, Southampton, Morrisville, Warminster) or anywhere you’re working, post it and geo-tag it. Deep effort = the 7; awareness spread = wherever you are.'
};
const SOCIAL_JOURNEY={
  oneSentence:'The 2026 replacement buyer is mostly a Boomer / older Gen-X homeowner with a failing window or door. The trigger is functional. They research 2–4 weeks across Google, reviews, and social before calling just 2–3 companies.',
  honest:'Google leads discovery; social validates. Homeowners check your Facebook / Instagram to confirm you "look active and real" before reaching out. Social shapes the shortlist — it’s not where the first search happens. So social’s job is familiarity + trust, not viral reach.',
  fundamentals:[
    {t:'They research heavily first',d:'~30% spend 10+ hours; most spend 2–4 weeks across Google, YouTube, reviews, and social before any call.'},
    {t:'Reviews decide the shortlist',d:'75% always or regularly read reviews. Sparse or unanswered review profiles get filtered out before the call.'},
    {t:'Social is the trust check',d:'An active, local, proof-heavy feed signals "real and reliable." A dead feed signals the opposite.'},
    {t:'Speed wins the job',d:'~78% hire the first contractor to respond. Fast DM and call response is a conversion lever, not a nicety.'},
    {t:'Familiarity beats cold',d:'Homeowners call names they recognize from their neighborhood. Repetition in their town builds that recall.'}
  ],
  ignore:'Chasing viral reach or follower counts for their own sake. Posting on platforms this buyer doesn’t use. Polished ad-agency content that hides the real work. Vanity metrics over shortlist signals.',
  situation:'Your reputation is already shortlist-grade (5.0 Google, 4.8 Angi, 96% FB recommend, 118 Yelp photos). The gap is that it’s invisible behind a sporadic feed. Fix the cadence and surface the proof — that’s the whole game.'
};
const SOCIAL_COMPETITORS={
  lane:'Be the most active, most local, most proof-heavy window specialist in Lower Bucks — with a real owner (Sebastian) on camera. Two of three competitors barely post. Consistency is the weapon.',
  players:[
    {name:'Bucks County Windows',hook:'"Local. Woman-owned. Community-loved" + ProVia',social:'~358 FB likes, active IG, personal on Nextdoor',win:'More & higher-rated reviews; a named on-camera owner; broader services.'},
    {name:'Besco Windows & Doors',hook:'"Since 1958," sunrooms, heritage',social:'Weak / dated',win:'Look modern, active and visual vs. static.'},
    {name:'ACRE Windows & Doors',hook:'Andersen certified, 20k+ installs, SEO muscle',social:'Polished but regional / impersonal',win:'Local intimacy — a real Langhorne family vs. a faceless outfit.'}
  ],
  ignore:'Don’t try to out-"woman-owned / community" Bucks County Windows head-on — that’s their lane. Don’t compete on the Andersen brand name with ACRE. Win on your own ground: proof, craftsmanship detail, and a real local owner.',
  verdict:'Sebastian on camera is the wedge none of them have. Pair it with the best reviews in the county and town-by-town proof posts, and WG becomes the specialist homeowners recognize and trust first.'
};
const SOCIAL_ROADMAP={
  why:'Don’t try to do everything at once. Get the system + review engine running first (it compounds), then layer on Groups and geo-content, then double down on whatever the scorecard says is working.',
  phases:[
    {n:1,t:'Foundation · Days 1–30',actions:['One-time setup: review link + account access + unified profiles (Bogdan); photo-release in the contract (Iwona).','Launch 3×/week — seed from the 118 Yelp photos.','Turn on the same-day review text day one.','Ruth joins 5 town Groups.'],milestone:'Cadence live, reviews flowing.'},
    {n:2,t:'Momentum · Days 31–60',actions:['Rotate geo-content through all 7 towns; amplify each SEO town page as it goes live.','Start Sebastian on-camera (1/wk).','First lead-gen pushes + fast DM response.'],milestone:'Every town in the feed; first social-attributed estimate.'},
    {n:3,t:'Scale · Days 61–90',actions:['Double down on what drove DMs / clicks.','Light paid boost of a proven post (35–65, $75K+, the 7 ZIPs) only if warranted.','Referral loop: ask reviewers to tag a neighbor.'],milestone:'Repeatable engine; reviews toward 40+.'}
  ],
  ignore:'Don’t spend on paid ads in Phase 1 before the organic feed + a retargeting audience exist. Don’t chase a 4th platform before the core three are consistent. Don’t skip the review engine to "get to the fun content."',
  alignment:'Same 7 towns as the SEO plan (Langhorne, Newtown, Yardley, Lower Makefield, Richboro, Holland, Feasterville). When a town page ships, post "just finished in [Town]" — social and search compound on the same households.'
};
const SOCIAL_AUDIT={
  verdict:'Strong reputation, no pulse. The ratings are excellent but the feed reads "semi-abandoned" to a researcher checking if you’re active. Cadence is the #1 fix.',
  scores:[
    {prop:'Google Business Profile',status:'5.0, photo-rich, underused for posts',score:6,verdict:'Best asset, half-used'},
    {prop:'Facebook Page',status:'34 reviews / 96% rec, sporadic posts',score:4,verdict:'Reputation yes, pulse no'},
    {prop:'Instagram',status:'~88 followers, ~32 posts',score:3,verdict:'Tiny & quiet; needs cadence'},
    {prop:'Yelp',status:'118 photos, active listing',score:6,verdict:'Mine the photos for content'},
    {prop:'Houzz / Angi / Nextdoor',status:'5.0 / 4.8 ratings, idle',score:5,verdict:'Nextdoor is the sleeper'}
  ],
  gaps:'No posting cadence (reads as inactive). Reputation is buried, not surfaced. No geo-targeting to your towns. No review-generation system. Brand inconsistency across the three main profiles.',
  wins:[
    'Mine the 118 existing Yelp photos for an instant before/after backlog.',
    'Screenshot 5-star reviews → instant testimonial posts.',
    'Turn on the same-day review text → compounding from day one.'
  ]
};

/* ============================================================
   SOCIAL CONTENT ENGINE  (the production layer the playbook lacks)
   The Content Calendar composes "post" records; Ruth executes the
   approved ones. Posts live in S.prog.social.posts (added to the
   slice in freshSlice/migrate). Media uses the IndexedDB file store.
   BACKEND HOOK: posts → a `social_posts` table; media → app_files.
   ============================================================ */
const SOC_TOWNS=['Langhorne','Newtown','Yardley','Lower Makefield','Richboro','Holland','Feasterville'];
const SOC_PILLARS=[
  {id:'portfolio',icon:'🛠️',t:'Portfolio',d:'The work itself — before/after, clean installs, craftsmanship, the towns you serve.'},
  {id:'edu',icon:'🎓',t:'Education',d:'Quick tips + what homeowners should know before replacing windows or doors.'},
  {id:'fun',icon:'🎉',t:'Entertainment',d:'Lighter, scroll-stopping content — behind-the-scenes, the crew, day-in-the-life.'},
  {id:'customer',icon:'⭐',t:'Customer',d:'Reviews, happy homeowners, testimonials, thank-yous.'}
];
/* Ruth's posting tips — practical, platform-aware, kept short */
const SOC_RUTH_TIPS=[
  'Best times: 11am–1pm or 6–8pm — when locals actually scroll.',
  'Always set the location / geo-tag to the job’s town.',
  'Instagram: put the hashtags in the first comment. Facebook: in the caption.',
  'Reply to every comment + DM within 24h — speed wins the job.',
  'Google Business Profile: add the “Get a quote” / “Call” button.',
  'Re-share the post to your Story the same day for extra reach.',
  'Video beats a photo when you have it. One photo leads, carousel the rest.',
  'Don’t run the same town or category back-to-back — keep it varied.'
];
const SOC_PLATFORMS=[{id:'gbp',t:'Google'},{id:'fb',t:'Facebook'},{id:'ig',t:'Instagram'},{id:'nd',t:'Nextdoor'}];
/* THE CADENCE: post 5 times a week, any 5 days. Consistency is the whole game. */
const SOC_WEEKLY_GOAL=5;
/* legacy slot→pillar mapping kept for old saved posts; new posts use suggestPillar() */
function slotPillar(week,slot){
  if(slot===0)return 'proof';
  if(slot===1)return (week%2)?'neighbors':'love';
  return (week%2)?'edu':'crew';
}
/* variety helper: suggest the category used least so far this week */
function suggestPillar(week){
  const used={};SOC_PILLARS.forEach(p=>used[p.id]=0);
  weekPosts(week).forEach(p=>{if(used[p.pillar]!=null)used[p.pillar]++});
  return SOC_PILLARS.slice().sort((a,b)=>used[a.id]-used[b.id])[0].id;
}
function pillar(id){return SOC_PILLARS.find(p=>p.id===id)||SOC_PILLARS[0]}
/* the different KINDS of post (format) — keeps things dynamic */
const SOC_TYPES=[
  {id:'photo',icon:'📸',t:'Photo'},
  {id:'carousel',icon:'🖼️',t:'Carousel'},
  {id:'reel',icon:'🎬',t:'Reel / Video'},
  {id:'story',icon:'⚡',t:'Story'},
  {id:'beforeafter',icon:'✨',t:'Before / After'},
  {id:'tip',icon:'✍️',t:'Tip / Text'}
];
function postType(id){return SOC_TYPES.find(t=>t.id===id)||SOC_TYPES[0]}
const townSlug=t=>(t||'').replace(/[^a-z]/gi,'');
/* ---- post CRUD (operate on the active program's slice) ---- */
function socPosts(){return (ST&&Array.isArray(ST.posts))?ST.posts:[]}
function postById(id){return socPosts().find(p=>p.id===id)}
function newPost(week,slot){
  const p={id:'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    week:week||1,slot:(slot==null?0:slot),pillar:suggestPillar(week||1),type:'photo',
    town:SOC_TOWNS[0],jobNote:'',caption:'',hashtags:'',
    platforms:{ig:true,fb:true,gbp:true,nd:false},
    date:'',time:'11:00',status:'draft',ruthNote:'',media:[],by:S.role};
  return p;
}
/* media is an array of {id,name}; migrate legacy single mediaId on read */
function postMedia(p){
  if(!p)return [];
  if(!Array.isArray(p.media)){p.media = p.mediaId?[{id:p.mediaId,name:p.mediaName||'attached'}]:[];delete p.mediaId;delete p.mediaName;}
  return p.media;
}
function savePost(p){const arr=socPosts();const i=arr.findIndex(x=>x.id===p.id);if(i>=0)arr[i]=p;else arr.push(p);ST.posts=arr;commit()}
/* When a post goes to Ruth, make it self-contained: copy every photo into the shared
   cloud (Firestore) under its EXISTING id, so cloudFileGet resolves it on ANY device.
   Drive photos live in Sebastian's private Drive — Ruth can't reach those — so without
   this she sees blanks. Runs on the approver's device, which already holds the blob
   (Drive-synced or in-app). Videos are skipped (too big until Firebase Storage). */
async function publishPostMedia(post){
  if(!window.WG_FB_READY||!WG_AUTH.currentUser) return {done:0,skipped:0};
  let done=0, skipped=0;
  for(const m of postMedia(post)){
    const id=m.id; if(!id){skipped++;continue;}
    if(id.indexOf('pf_')===0||id.indexOf('hf_')===0){done++;continue;}      // already cloud
    try{ const ex=await WG_DB.collection('workspaces').doc('wg').collection('poolfiles').doc(id).get();
         if(ex.exists&&ex.data()&&ex.data().dataUrl){done++;continue;} }catch(e){}  // already published
    let rec=null; try{ rec=await fileGet(id); }catch(e){}
    if(!rec||!rec.blob){skipped++;continue;}                                 // no local blob to copy
    const isVid=/^video\//.test(rec.type||'')||/\.(mp4|mov|m4v|webm)$/i.test(rec.name||m.name||'');
    if(isVid){skipped++;continue;}                                          // video can't go in Firestore yet
    try{
      const dataUrl=await imgToWebp(rec.blob);
      const mime=dataUrl.slice(5,(dataUrl.indexOf(';')+0)||13)||'image/jpeg';
      await WG_DB.collection('workspaces').doc('wg').collection('poolfiles').doc(id)
        .set({name:(rec.name||m.name||'photo'),type:mime,dataUrl:dataUrl,by:(WG_AUTH.currentUser.email||''),at:Date.now(),fromPost:true});
      VTHUMB[id]=dataUrl; done++;
    }catch(e){ skipped++; }
  }
  return {done,skipped};
}
function delPostRec(id){ST.posts=socPosts().filter(p=>p.id!==id);commit()}
/* ---- CONTENT POOL: raw uploaded media, separate from posts ----
   Lifecycle: available → used (attached to a post) → archived (post got posted). */
function socPool(){return (ST&&Array.isArray(ST.pool))?ST.pool:[]}
function poolAvailable(){return socPool().filter(m=>m.status==='available')}
function poolIsMain(m){return !m.folder||m.folder==='Drive'} // sits directly in the synced folder
/* fetch a cloud-stored media file (WebP) by id — social pool photos (pf_) or handoff photos (hf_) */
async function cloudFileGet(id){
  if(!window.WG_DB||!id)return null;
  var cols = id.indexOf('hf_')===0?['hfiles']:id.indexOf('pf_')===0?['poolfiles']:['poolfiles','hfiles'];
  for(const c of cols){ try{ const d=await WG_DB.collection('workspaces').doc('wg').collection(c).doc(id).get(); if(d.exists&&d.data()&&d.data().dataUrl)return d.data(); }catch(e){} }
  return null;
}
/* read GPS lat/lng from a JPEG's EXIF so before/after location grouping still works on in-app uploads.
   Best-effort, JPEG only; returns null on anything unusual (HEIC, no GPS, parse issue). */
function exifGps(file){
  return new Promise(function(resolve){
    try{
      if(!/jpe?g/i.test(file.type||'')&&!/\.jpe?g$/i.test(file.name||''))return resolve(null);
      const fr=new FileReader();
      fr.onerror=function(){resolve(null)};
      fr.onload=function(){
        try{
          const dv=new DataView(fr.result);
          if(dv.getUint16(0)!==0xFFD8)return resolve(null);
          let off=2; const len=dv.byteLength;
          while(off+4<len){
            const marker=dv.getUint16(off); if((marker&0xFF00)!==0xFF00)return resolve(null);
            const size=dv.getUint16(off+2);
            if(marker===0xFFE1 && dv.getUint32(off+4)===0x45786966){ // APP1 + 'Exif'
              const tiff=off+10, little=dv.getUint16(tiff)===0x4949;
              const g16=o=>dv.getUint16(o,little), g32=o=>dv.getUint32(o,little);
              const ifd0=tiff+g32(tiff+4), n0=g16(ifd0); let gps=0;
              for(let i=0;i<n0;i++){const e=ifd0+2+i*12; if(g16(e)===0x8825){gps=tiff+g32(e+8);break;}}
              if(!gps)return resolve(null);
              const gn=g16(gps); let latR='',lngR='',lat=null,lng=null;
              const rats=(o,c)=>{const a=[];for(let k=0;k<c;k++){const num=g32(o+k*8),den=g32(o+k*8+4);a.push(den?num/den:0);}return a;};
              for(let i=0;i<gn;i++){const e=gps+2+i*12, tag=g16(e);
                if(tag===1)latR=String.fromCharCode(dv.getUint8(e+8));
                else if(tag===3)lngR=String.fromCharCode(dv.getUint8(e+8));
                else if(tag===2){const d=rats(tiff+g32(e+8),3);lat=d[0]+d[1]/60+d[2]/3600;}
                else if(tag===4){const d=rats(tiff+g32(e+8),3);lng=d[0]+d[1]/60+d[2]/3600;}
              }
              if(lat==null||lng==null)return resolve(null);
              if(latR==='S')lat=-lat; if(lngR==='W')lng=-lng;
              return resolve({lat:lat,lng:lng});
            }
            off+=2+size;
          }
          resolve(null);
        }catch(e){resolve(null)}
      };
      fr.readAsArrayBuffer(file.slice(0,256*1024)); // EXIF lives near the start
    }catch(e){resolve(null)}
  });
}
/* exifr (vendored) reads GPS from BOTH iPhone HEIC and JPEG — lazy-loaded on first use */
let _exifrLib=null;
function loadExifr(){
  if(window.exifr)return Promise.resolve(true);
  if(_exifrLib)return _exifrLib;
  _exifrLib=new Promise(function(res){const s=document.createElement('script');s.src='assets/js/exifr.js';s.onload=function(){res(true)};s.onerror=function(){res(false)};document.head.appendChild(s);});
  return _exifrLib;
}
async function readGps(file){
  try{ await loadExifr(); if(window.exifr){ const g=await exifr.gps(file); if(g&&typeof g.latitude==='number'&&typeof g.longitude==='number')return {lat:g.latitude,lng:g.longitude}; } }catch(e){}
  try{ const g2=await exifGps(file); if(g2)return g2; }catch(e){} // fallback for plain JPEG
  return null;
}
async function poolAddFiles(fileList,folder){
  const files=Array.from(fileList||[]).filter(f=>/^(image|video)\//.test(f.type)||/\.(heic|heif|mov|jpe?g|png|webp|gif)$/i.test(f.name||''));
  if(!files.length)return 0;
  if(files.some(isHeic))toast('iPhone photos — preparing…');
  const pool=socPool(); let localVid=false, imgFailed=0;
  for(const raw of files){
    const isImg=/^image\//.test(raw.type)||/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(raw.name||'');
    if(!isImg && window.WG_FB_READY && WG_AUTH.currentUser) localVid=true;
    if(isImg && window.WG_FB_READY && WG_AUTH.currentUser){
      try{
        const geo=await readGps(raw);            // location BEFORE compressing (exifr reads HEIC + JPEG)
        const norm=await normalizeImage(raw);    // HEIC -> JPEG if the browser needs it
        const dataUrl=await imgToWebp(norm);     // small webp (or jpeg on iOS) that fits Firestore
        const mime=dataUrl.slice(5,(dataUrl.indexOf(';')+0)||13)||'image/jpeg';
        const ext=mime==='image/webp'?'webp':mime==='image/png'?'png':'jpg';
        const id='pf_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
        const name=String(raw.name||'photo').replace(/\.[^.]+$/,'')+'.'+ext;
        await WG_DB.collection('workspaces').doc('wg').collection('poolfiles').doc(id).set({name:name,type:mime,dataUrl:dataUrl,by:(WG_AUTH.currentUser.email||''),at:Date.now()});
        const item={id:id,name:name,type:mime,status:'available',cloud:true,addedAt:Date.now()};
        if(geo){item.lat=geo.lat;item.lng=geo.lng;}
        if(folder)item.folder=folder;            // e.g. 'Before & After' — keeps it in its own group
        pool.push(item); VTHUMB[id]=dataUrl;     // cache so it shows instantly
      }catch(e){ imgFailed++; const f=await normalizeImage(raw); const rec=await fileAdd(f,'',S.role,'pool'); const it={id:rec.id,name:rec.name,type:rec.type,status:'available',addedAt:Date.now()}; if(folder)it.folder=folder; pool.push(it); }
    } else { // video (or offline image) -> local
      const f=await normalizeImage(raw); const rec=await fileAdd(f,'',S.role,'pool');
      const isVideo=/^video\//.test(raw.type)||/\.(mp4|mov|m4v|webm)$/i.test(raw.name||'');
      const it={id:rec.id,name:rec.name,type:rec.type,status:'available',addedAt:Date.now()};
      it.folder = isVideo ? 'Videos' : (folder||''); // videos always go to their own bulk area
      pool.push(it);
    }
  }
  ST.pool=pool;commit();
  if(localVid)setTimeout(function(){toast('📷 Photos shared with the team ✓. Heads-up: video stays on this device — for a shared video, add it to your Google Drive folder.')},700);
  if(imgFailed)setTimeout(function(){toast('⚠️ '+imgFailed+' photo'+(imgFailed>1?'s':'')+' couldn’t be shared to the team (saved on this device only). Try again, or use a smaller photo.')},900);
  return files.length;
}
function poolSetStatus(ids,status){const set=new Set(ids);socPool().forEach(m=>{if(set.has(m.id))m.status=status});}
function poolArchiveForPost(p){poolSetStatus((p.media||[]).map(m=>m.id),'archived');}
function poolReleaseForPost(p){ // a draft got deleted → its content returns to the pool (but keep photos a saved job still holds)
  const ids=new Set((p.media||[]).map(m=>m.id));
  const jobIds=new Set();socBaJobs().forEach(j=>jobItems(j).forEach(x=>jobIds.add(x.id)));
  socPool().forEach(m=>{if(ids.has(m.id)&&m.status==='used'&&!jobIds.has(m.id))m.status='available'});
}
/* free storage once a post is posted: delete its media BLOBS from IndexedDB unless
   another active (not-yet-posted) post or a saved job still needs them. The tiny pool
   record is kept + marked purged so a Drive re-sync won't re-download posted content. */
async function purgePostedMedia(post){
  const ids=(postMedia(post)||[]).map(m=>m.id);
  const keep=new Set();
  socPosts().forEach(p=>{if(p.id!==post.id&&p.status!=='posted')postMedia(p).forEach(m=>keep.add(m.id));});
  socBaJobs().forEach(j=>jobItems(j).forEach(x=>keep.add(x.id)));
  for(const id of ids){ if(keep.has(id))continue;
    try{await fileDel(id);}catch(e){}
    const pm=socPool().find(x=>x.id===id); if(pm){pm.status='archived';pm.purged=true;} }
  commit();
}
/* ---- BEFORE / AFTER JOBS: saved before+after pairings ---- */
function socBaJobs(){return (ST&&Array.isArray(ST.bajobs))?ST.bajobs:[]}
/* next "Job N" number, derived from existing job names so it always follows order */
function nextBaNum(){let max=0;socBaJobs().forEach(j=>{const m=/^job\s+(\d+)$/i.exec((j.name||'').trim());if(m){const n=+m[1];if(n>max)max=n;}});return max+1;}
function saveBaJob(j){const arr=socBaJobs();const i=arr.findIndex(x=>x.id===j.id);if(i>=0)arr[i]=j;else arr.unshift(j);ST.bajobs=arr;commit();}
function delBaJob(id){
  const j=socBaJobs().find(x=>x.id===id);
  if(j){const ids=new Set(jobItems(j).map(x=>x.id));socPool().forEach(m=>{if(ids.has(m.id)&&m.status==='used')m.status='available'});} // photos return to Your content
  ST.bajobs=socBaJobs().filter(x=>x.id!==id);commit();
}
/* builder: group photos into a job; tagging before/after is OPTIONAL */
function openBaBuilder(items){
  if(!items||!items.length)return;
  const role={}; items.forEach(m=>role[m.id]=''); // default: untagged
  const lbl=r=>r==='before'?'BEFORE':r==='after'?'AFTER':'＋ tag';
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';
  const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>New Before / After job</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);
  ov.onclick=e=>{if(e.target===ov)closeComposer()};
  $('#cmpX').onclick=closeComposer;
  const b=$('#cmpBody');
  const num=nextBaNum();
  const nf=el('div','cmp-field');nf.innerHTML='<label>Job name <span class="muted" style="font-weight:600">— auto-numbered; edit it if you want (e.g. an address)</span></label>';
  const ni=el('input','cmp-in');ni.value='Job '+num;ni.placeholder='Job '+num+' — or type an address';nf.appendChild(ni);b.appendChild(nf);
  const hint=el('div','cmp-field');hint.innerHTML='<label>Photos in this job <span class="muted" style="font-weight:600">— optional: tap a photo to flag it Before or After (Ruth will see the labels when she posts)</span></label>';
  const grid=el('div','bagrid');
  items.forEach(m=>{
    const cell=el('div','bacell');
    const img=el('img','poolimg');img.addEventListener('load',()=>img.style.display='block');
    if(VTHUMB[m.id])img.src=VTHUMB[m.id]; else thumbInto(img,m.id);
    cell.appendChild(img);
    const tog=el('button','batoggle '+(role[m.id]||'none'), lbl(role[m.id]));
    tog.onclick=()=>{role[m.id]=role[m.id]===''?'before':role[m.id]==='before'?'after':'';tog.className='batoggle '+(role[m.id]||'none');tog.textContent=lbl(role[m.id]);};
    cell.appendChild(tog);
    grid.appendChild(cell);
  });
  hint.appendChild(grid);b.appendChild(hint);
  const foot=el('div','cmp-foot');
  const sp=el('div');sp.style.flex='1';
  const save=el('button','btn-set primary','Save job');
  save.onclick=()=>{
    save.disabled=true;
    const jobItemsOut=items.map(m=>({id:m.id,name:m.name,role:role[m.id]||''}));
    poolSetStatus(jobItemsOut.map(x=>x.id),'used'); // pull them out of Your content into the job
    saveBaJob({id:'ba_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),name:ni.value.trim()||('Job '+num),items:jobItemsOut,createdAt:Date.now()});
    POOL_SEL.clear();closeComposer();toast('Saved — see the Before & After jobs section');rerenderCal();
  };
  foot.appendChild(sp);foot.appendChild(save);b.appendChild(foot);
}
/* job photos as an ordered list with roles (supports legacy before/after jobs) */
function jobItems(j){
  if(Array.isArray(j.items))return j.items;
  const out=[];(j.before||[]).forEach(m=>out.push({id:m.id,name:m.name,role:'before'}));(j.after||[]).forEach(m=>out.push({id:m.id,name:m.name,role:'after'}));
  return out;
}
/* manually drop a (usually no-location) photo into an existing job group */
function openJobPicker(item){
  const located=poolAvailable().filter(m=>(POOL_SRC==='main'?poolIsMain(m):m.folder===POOL_SRC)&&hasLoc(m)&&m.id!==item.id);
  const clusters=clusterByLocation(located,60);
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';
  const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>Add to a job</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);
  ov.onclick=e=>{if(e.target===ov)closeComposer()};
  $('#cmpX').onclick=closeComposer;
  const b=$('#cmpBody');
  if(!clusters.length){
    b.appendChild(el('div','muted','No location-based jobs in this folder yet to join. Pair this photo as a Before/After job instead, or sync more located photos first.'));
    return;
  }
  b.appendChild(el('div','cmp-field','<label>Pick the job this photo belongs to — it’ll join that stack</label>'));
  clusters.forEach((c,i)=>{
    const opt=el('button','jobpick');
    const thumb=el('img','jp-thumb');const first=c.items[0];if(first){if(VTHUMB[first.id])thumb.src=VTHUMB[first.id];else thumbInto(thumb,first.id);thumb.addEventListener('load',()=>thumb.style.display='block');}
    opt.appendChild(thumb);
    opt.appendChild(el('span','jp-label',`📍 Job ${i+1} · ${c.items.length} photo${c.items.length>1?'s':''}`));
    opt.onclick=()=>{item.lat=c.lat;item.lng=c.lng;item.locManual=true;commit();closeComposer();toast('Added to the job');rerenderCal();};
    b.appendChild(opt);
  });
}
/* render saved before/after jobs as collapsible stacks AT THE TOP of the content list.
   Photos show in one uniform grid; each has a Before/After pill you can tap to set/change. */
function renderSavedJobs(container){
  const jobs=socBaJobs();
  if(!jobs.length)return;
  jobs.forEach(j=>{
    const its=jobItems(j);
    const before=its.filter(x=>x.role==='before').length, after=its.filter(x=>x.role==='after').length, other=its.length-before-after;
    const counts=[];if(before)counts.push(before+' before');if(after)counts.push(after+' after');if(other)counts.push(other+' photo'+(other>1?'s':''));
    const d=el('details','jobgroup savedjob');
    d.appendChild(el('summary','jobsum',`🔀 ${esc(j.name||'Job')} · ${its.length} photo${its.length>1?'s':''}`));
    const body=el('div','savedbody');
    const grid=el('div','poolgrid');
    its.forEach(m=>{
      const pm=socPool().find(x=>x.id===m.id)||{};
      const isVid=/\.(mp4|mov|m4v|webm)$/i.test(m.name||'')||/^video\//.test(pm.type||'');
      const cell=el('div','poolcell');
      const img=el('img','poolimg');img.addEventListener('load',()=>img.style.display='block');
      if(VTHUMB[m.id])img.src=VTHUMB[m.id];
      else if(isVid&&pm.driveThumb){img.onerror=()=>{img.onerror=null;thumbInto(img,m.id)};img.src=pm.driveThumb;}
      else thumbInto(img,m.id);
      cell.appendChild(img);
      // tap-to-cycle Before/After pill (edit the labels right here)
      const pill=el('button','rolepill '+(m.role||'none'), m.role==='before'?'BEFORE':m.role==='after'?'AFTER':'＋ tag');
      pill.title='Tap to set Before / After';
      pill.onclick=(e)=>{e.stopPropagation();m.role=(!m.role)?'before':m.role==='before'?'after':'';pill.className='rolepill '+(m.role||'none');pill.textContent=m.role==='before'?'BEFORE':m.role==='after'?'AFTER':'＋ tag';saveBaJob(j);};
      cell.appendChild(pill);
      cell.onclick=()=>openMediaPreview(m.id,m.name); // tap the photo to preview
      grid.appendChild(cell);
    });
    body.appendChild(grid);
    const hint=el('div','muted','Tap a photo to preview · tap its pill to set Before / After');hint.style.cssText='font-size:11.5px;margin:8px 0 4px';
    body.appendChild(hint);
    const foot=el('div','rcactions');
    const post=el('button','btn-set primary','Make this post');post.onclick=()=>{post.disabled=true;const cw=currentWeek();const p=newPost(cw?cw.id:1);p.media=its.map(x=>({id:x.id,name:x.name,role:x.role||''}));p.type=(before||after)?'beforeafter':(its.length>1?'carousel':'photo');p.fromJob=j.id;if(j.name)p.jobNote=j.name;openComposer(p,true);};
    const del=el('button','btn-set danger','Delete');del.onclick=()=>{if(confirm('Delete this job?')){delBaJob(j.id);render();}};
    foot.appendChild(post);foot.appendChild(del);body.appendChild(foot);
    d.appendChild(body);
    container.appendChild(d);
  });
}

/* ============================================================
   GOOGLE DRIVE SYNC  (client-side: Google Identity Services for the
   token, plain Drive REST for list+download). Pulls new media from
   ONE folder into the content pool, polling while the page is open.
   Client ID is public-safe; no client secret is used. Only works on an
   authorized https origin — the LIVE DOMAIN must be listed in the OAuth client's
   "Authorized JavaScript origins" in Google Cloud (localhost is allowed by default).
   ============================================================ */
const GDRIVE_CLIENT_ID='922689253691-f58pv9jg0194es7ve9avc0di1ssan4i6.apps.googleusercontent.com';
const GDRIVE_FOLDER_ID='1hRescZ95VEr_mVPm8AkRAsq-gqDdoIFq';
const GDRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
let _gdToken=null,_gdExp=0,_gdClient=null,_gdTimer=null,_gdSyncing=false,_gdListErr=0;
function loadGsi(){
  if(window.google&&google.accounts&&google.accounts.oauth2)return Promise.resolve(true);
  return new Promise(res=>{
    const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=()=>res(true);s.onerror=()=>res(false);document.head.appendChild(s);
  });
}
function gdTokenValid(){return _gdToken&&Date.now()<_gdExp-60000}
function gdGetToken(interactive){
  return new Promise(resolve=>{
    if(gdTokenValid())return resolve(_gdToken);
    if(!interactive)return resolve(null); // never pop Google sign-in unless the user asked
    if(!_gdClient)return resolve(null);
    _gdClient.callback=(resp)=>{
      if(resp&&resp.access_token){_gdToken=resp.access_token;_gdExp=Date.now()+((resp.expires_in||3600)*1000);resolve(_gdToken);}
      else resolve(null);
    };
    try{_gdClient.requestAccessToken({prompt: ST.driveConnected?'':'consent'});}catch(e){resolve(null);}
  });
}
/* preload Google's script + client ahead of the click so the popup can open
   synchronously inside the click gesture (browsers block popups opened after an await) */
function gdInit(){
  if(_gdClient)return Promise.resolve(true);
  return loadGsi().then(ok=>{
    if(ok&&window.google&&google.accounts&&google.accounts.oauth2){
      _gdClient=google.accounts.oauth2.initTokenClient({client_id:GDRIVE_CLIENT_ID,scope:GDRIVE_SCOPE,callback:()=>{},
        error_callback:function(err){var t=(err&&err.type)||'';if(t==='popup_closed')return; // user just closed it
          toast('Google Drive sign-in failed'+(t?(' — '+t):'')+'. On the live site, this web address must be added to the Drive app’s Authorized JavaScript origins in Google Cloud, then retry.');}});
      return true;
    }
    return false;
  });
}
function gdConnect(){
  if(_gdClient){gdRequest();return;} // ready → open popup immediately (inside the gesture)
  gdInit().then(ok=>{ if(ok)gdRequest(); else toast('Couldn’t reach Google — check your connection, then tap Connect again.'); });
}
function gdRequest(){
  _gdClient.callback=(resp)=>{
    if(resp&&resp.access_token){
      _gdToken=resp.access_token;_gdExp=Date.now()+((resp.expires_in||3600)*1000);
      ST.driveConnected=true;commit();
      toast('Google Drive connected — pulling your folder…');
      gdSyncNow(false).then(()=>{gdStartPolling();render();});
    }else{
      toast('Google sign-in didn’t finish (cancelled or popup blocked).');
    }
  };
  try{_gdClient.requestAccessToken({prompt: ST.driveConnected?'':'consent'});}
  catch(e){toast('Could not open Google sign-in — allow pop-ups for this site and retry.');}
}
/* recursive list of all media (image+video) with location/time/source-folder */
async function gdListAllMedia(folderId,tok,folderName,out,depth){
  if((depth||0)>6)return;
  const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  let pageToken='';
  do{
    const url=`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,thumbnailLink,imageMediaMetadata(time,location))&pageSize=1000`+(pageToken?`&pageToken=${pageToken}`:'');
    const r=await fetch(url,{headers:{Authorization:'Bearer '+tok}});
    if(!r.ok){_gdListErr=r.status;return;} // capture HTTP error (404 folder-not-found, 403 no-access)
    const data=await r.json();
    for(const f of (data.files||[])){
      if(f.mimeType==='application/vnd.google-apps.folder') await gdListAllMedia(f.id,tok,f.name,out,(depth||0)+1);
      else if(/^(image|video)\//.test(f.mimeType||'')||/\.(heic|heif|mov)$/i.test(f.name||'')) out.push({id:f.id,name:f.name,mime:f.mimeType,folder:folderName,thumb:f.thumbnailLink,loc:f.imageMediaMetadata&&f.imageMediaMetadata.location,time:f.imageMediaMetadata&&f.imageMediaMetadata.time});
    }
    pageToken=data.nextPageToken||'';
  }while(pageToken);
}
async function gdSyncNow(interactive){
  if(_gdSyncing)return;_gdSyncing=true;
  try{
    const tok=await gdGetToken(!!interactive);
    if(!tok){if(interactive)toast('Google sign-in needed to sync.');else if(ST.driveConnected&&!ST.driveNeedsReconnect){ST.driveNeedsReconnect=true;commit();render();}return;}
    if(ST.driveNeedsReconnect){ST.driveNeedsReconnect=false;commit();render();} // token is good again
    const list=[]; _gdListErr=0; await gdListAllMedia(GDRIVE_FOLDER_ID,tok,'Drive',list,0); // recurse subfolders, capture location
    if(_gdListErr){ if(interactive)toast(_gdListErr===404?'Drive: that content folder wasn’t found for this Google account (404). Tap Connect and choose the account that OWNS the folder.':_gdListErr===403?'Drive: this Google account can’t access the folder (403). Connect the account that owns it.':('Drive couldn’t read the folder (error '+_gdListErr+'). Try Sync again shortly.')); return; }
    const pool=socPool();
    const byDrive=new Map(pool.filter(m=>m.driveId).map(m=>[m.driveId,m]));
    let added=0,backfilled=0;
    for(const f of list){
      const ex=byDrive.get(f.id);
      if(ex){ // already have it — backfill location/folder/time/thumb if missing
        if(f.loc&&typeof f.loc.latitude==='number'&&typeof f.loc.longitude==='number'&&ex.lat==null){ex.lat=f.loc.latitude;ex.lng=f.loc.longitude;backfilled++;}
        if(f.folder&&!ex.folder)ex.folder=f.folder;
        if(f.time&&!ex.taken)ex.taken=f.time;
        if(f.thumb&&!ex.driveThumb){ex.driveThumb=f.thumb;backfilled++;}
        continue;
      }
      const dl=await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,{headers:{Authorization:'Bearer '+tok}});
      if(!dl.ok)continue;
      const blob=await dl.blob();
      let file=new File([blob],f.name,{type:f.mime||blob.type});
      file=await normalizeImage(file);
      const rec=await fileAdd(file,'',S.role,'pool');
      const item={id:rec.id,name:rec.name,type:rec.type,status:'available',driveId:f.id,folder:f.folder,addedAt:Date.now()+added};
      if(f.loc&&typeof f.loc.latitude==='number'&&typeof f.loc.longitude==='number'){item.lat=f.loc.latitude;item.lng=f.loc.longitude;}
      if(f.time)item.taken=f.time;
      if(f.thumb)item.driveThumb=f.thumb; // Google's own thumbnail (works for HEVC video too)
      pool.push(item);added++;
    }
    if(added||backfilled){ST.pool=pool;commit();render();}
    if(added)toast(added+' new piece'+(added>1?'s':'')+' synced from Drive');
    else if(interactive){ if(list.length===0)toast('Connected to Google, but found 0 photos/videos in that folder. Tap Connect and pick the Google account that OWNS your content folder — and make sure the folder actually has photos in it.'); else toast(backfilled?('Synced — location added to '+backfilled+' photos'):('Drive is in sync — '+list.length+' item'+(list.length>1?'s':'')+' already here.')); }
  }catch(e){if(interactive)toast('Drive sync hit a snag — try again.');}
  finally{_gdSyncing=false;}
}
/* distance + greedy location clustering (same property ≈ within radius metres) */
function gdDist(aLat,aLng,bLat,bLng){const R=6371000,toR=d=>d*Math.PI/180;const dLa=toR(bLat-aLat),dLo=toR(bLng-aLng),la1=toR(aLat),la2=toR(bLat);const x=Math.sin(dLa/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function clusterByLocation(items,radius){
  const cl=[];
  items.forEach(m=>{
    if(!hasLoc(m))return;
    let best=null;for(const c of cl){if(gdDist(c.lat,c.lng,m.lat,m.lng)<=radius){best=c;break;}}
    if(best){best.items.push(m);best.lat=(best.lat*(best.items.length-1)+m.lat)/best.items.length;best.lng=(best.lng*(best.items.length-1)+m.lng)/best.items.length;}
    else cl.push({lat:m.lat,lng:m.lng,items:[m]});
  });
  // newest job first (by the most-recently-added photo in each)
  cl.forEach(c=>c.items.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)));
  return cl.sort((a,b)=>((b.items[0]&&b.items[0].addedAt)||0)-((a.items[0]&&a.items[0].addedAt)||0));
}
function gdStartPolling(){if(_gdTimer)return;_gdTimer=setInterval(()=>{if(!document.hidden)gdSyncNow(false);},60000);}
/* best-effort silent reconnect when the page loads if Drive was connected before */
async function gdAutoResume(){
  const ok=await gdInit();if(!ok)return;            // preload client so Connect opens instantly
  if(!ST||!ST.driveConnected||_gdTimer)return;
  const tok=await gdGetToken(false);
  if(tok){gdSyncNow(false);gdStartPolling();}
}
/* recursively list image metadata (no download) — used to test location grouping */
async function gdListMeta(folderId,tok,folderName,out,depth){
  if((depth||0)>6)return;
  const q=encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  let pageToken='';
  do{
    const url=`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,imageMediaMetadata(time,location))&pageSize=1000`+(pageToken?`&pageToken=${pageToken}`:'');
    const r=await fetch(url,{headers:{Authorization:'Bearer '+tok}});
    if(!r.ok)return;
    const data=await r.json();
    for(const f of (data.files||[])){
      if(f.mimeType==='application/vnd.google-apps.folder') await gdListMeta(f.id,tok,f.name,out,(depth||0)+1);
      else if(/^image\//.test(f.mimeType||'')) out.push({id:f.id,name:f.name,folder:folderName,loc:f.imageMediaMetadata&&f.imageMediaMetadata.location,time:f.imageMediaMetadata&&f.imageMediaMetadata.time});
    }
    pageToken=data.nextPageToken||'';
  }while(pageToken);
}
async function gdScan(){
  const tok=await gdGetToken(true);
  if(!tok){toast('Sign in to scan.');return;}
  toast('Scanning your Drive folder (no download)…');
  try{
    const out=[];await gdListMeta(GDRIVE_FOLDER_ID,tok,'Drive',out,0);
    const photos=out.length;
    const withLoc=out.filter(x=>x.loc&&typeof x.loc.latitude==='number').length;
    const withTime=out.filter(x=>x.time).length;
    const clusters=new Set(out.filter(x=>x.loc&&typeof x.loc.latitude==='number').map(x=>x.loc.latitude.toFixed(4)+','+x.loc.longitude.toFixed(4)));
    const pct=photos?Math.round(withLoc/photos*100):0;
    let verdict;
    if(!photos)verdict='No photos found in the folder (did you drop your before/after folder inside the synced folder?).';
    else if(pct>=50)verdict=`✅ Location grouping will work — about ${clusters.size} address-groups. I can build the auto-sort.`;
    else if(withLoc>0)verdict=`⚠️ Only ${pct}% have location — Google kept it on some but stripped most. Auto-sort would be partial; the full fix is the backend AI.`;
    else verdict='❌ No location on these photos — Google stripped it. Auto-sort by address isn’t possible; the real fix is the backend AI (or a quick manual pairing tool).';
    alert(`Drive scan\n\nPhotos found: ${photos}\nWith location: ${withLoc} (${pct}%)\nWith date taken: ${withTime}\nApprox address-groups: ${clusters.size}\n\n${verdict}`);
  }catch(e){toast('Scan failed — try Sync first, then Scan.');}
}

/* ============================================================
   SCRIPTED "SOCIAL MEDIA MANAGER" AI  (rule-based stand-in)
   Real generation arrives with the backend; these deterministic
   templates prove the workflow and kill the blank-page problem.
   ============================================================ */
function aiHashtags(town,pid){
  const t=townSlug(town);
  const local=t?`#${t}PA #BucksCountyPA`:'#BucksCountyPA';
  const proj={portfolio:'#windowreplacement #OknaWindows',edu:'#energyefficientwindows #homeimprovement',
    fun:'#familybusiness #behindthescenes',customer:'#5stars #customerreview'}[pid]||'#windowreplacement';
  return `${local} ${proj} #WindowGuardians #DoneRight`;
}
function aiCaption(town,pid,note){
  const where=town?` in ${town}`:'';
  const j=(note||'').trim();
  const tail='Free estimate → link in bio.';
  const tpl={
    portfolio:`Another one done right${where}. ${j||'Old, drafty windows out — clean, efficient, built-to-last in.'} We do it once because we do it right. ${tail}`,
    edu:`${j||'Wondering if it’s time to replace your windows?'} Here’s what to know before you do${where?` — straight from our ${town} jobs`:''}. ${tail}`,
    fun:`${j||`Behind the scenes with the crew${where} today.`} People hire people — here’s the team behind the work. 👋 ${tail}`,
    customer:`${j||'"Couldn’t be happier with the crew and the result."'} Reviews like this${where?` from ${town}`:''} are why we do this. ⭐ ${tail}`
  };
  return (tpl[pid]||tpl.portfolio);
}
/* expert suggestions — three caption angles + two hashtag sets the user can swap in.
   Service-industry tuned (results, local trust, clear CTA). Scripted now; real AI later. */
/* if you name a known town in the job note, that wins over the dropdown default */
function townInNote(note){const n=(note||'');return SOC_TOWNS.find(t=>new RegExp('\\b'+t.replace(/[-/\\^$*+?.()|[\]{}]/g,'')+'\\b','i').test(n));}
function effectiveTown(p){return townInNote(p&&p.jobNote)||(p&&p.town)||SOC_TOWNS[0];}
/* Polished, ready-to-post caption options per category + post type.
   NOTE: these are clean expert samples — they intentionally do NOT paste your
   raw note in verbatim (that produced garbage). The LIVE AI (after the backend)
   reads your note, writes a custom caption, fixes grammar, and keeps improving. */
function aiCaptionOptions(p){
  const town=effectiveTown(p), where=town?` in ${town}`:'';
  const cta='📲 Free, no-pressure estimate — link in bio.';
  const sets={
    portfolio:[
      `Another one done right${where}. Old, drafty windows out — clean, energy-saving, built-to-last in. We do it once because we do it right. ${cta}`,
      `Craftsmanship you can see${where}: tight lines, clean trim, and zero mess left behind. That’s the Window Guardians standard. ${cta}`,
      `${p.type==='beforeafter'||p.type==='carousel'?'Swipe for the transformation':'Fresh install'}${where} — quality products installed by a local crew that treats your home like our own. ${cta}`
    ],
    edu:[
      `Quick tip: if your windows fog up between the panes, the seal has failed — and a patch rarely lasts. Here’s what to check before you replace. ${cta}`,
      `Thinking about new windows${where}? Three things actually matter: the glass package, the install, and who stands behind it. We’ll walk you through all three. ${cta}`,
      `Energy bills creeping up? Drafty, single-pane windows are usually the culprit. Here’s how the right replacement pays you back. ${cta}`
    ],
    fun:[
      `${p.type==='reel'?'Watch the crew in action':'Behind the scenes with the crew'}${where} today 👷. People hire people — here’s the team that shows up, cleans up, and gets it done right. ${cta}`,
      `Good people, hard work, and a result the homeowner loves${where}. Proud of this crew. ${cta}`,
      `This is what “done right” looks like in motion${where}. ${cta}`
    ],
    customer:[
      `“Couldn’t be happier with the crew and the result.” Reviews like this${where?` from ${town}`:''} are exactly why we do this. ⭐ ${cta}`,
      `Another happy homeowner${where} 🙌. Nothing means more than a neighbor who’d recommend us — thank you! ${cta}`,
      `Real reviews from real local homeowners${where} — that trust is the whole job. ${cta}`
    ]
  };
  return sets[p.pillar]||sets.portfolio;
}
function aiHashtagOptions(p){
  const town=effectiveTown(p);
  return [aiHashtags(town,p.pillar), `#WindowGuardians #BucksCountyPA #${(town||'Langhorne').replace(/[^a-z]/gi,'')}PA #windowreplacement #homeupgrade #localbusiness`];
}
function aiRuthNote(p){
  const plats=SOC_PLATFORMS.filter(x=>p.platforms&&p.platforms[x.id]).map(x=>x.t).join(' + ')||'Instagram + Facebook';
  const when=p.time?` at ${p.time}`:'';
  return `Post to ${plats}${when}. Set location to ${p.town||'the job town'}. Paste caption + hashtags as written. Done.`;
}
/* completeness — which strategic fields are still missing on a post */
function postGaps(p){
  const g=[];
  if(!postMedia(p).length)g.push('media');
  if(!(p.caption||'').trim())g.push('caption');
  if(!(p.hashtags||'').trim())g.push('hashtags');
  if(!Object.values(p.platforms||{}).some(Boolean))g.push('platform');
  // date is intentionally optional — post any day, just stay consistent
  return g;
}
function postReady(p){return postGaps(p).length===0}
/* this-week pillar coverage + the assistant's single next suggestion */
function weekPosts(week){return socPosts().filter(p=>p.week===week)}
/* consistency math */
function weekGoalMet(week){return weekPosts(week).filter(p=>p.status==='posted').length>=SOC_WEEKLY_GOAL}
function socRunway(){return socPosts().filter(p=>p.status==='approved').length} // approved posts waiting = days covered
function socStreak(){ // consecutive COMPLETED weeks that hit the 5-post goal; the in-progress current week never breaks it
  const cw=currentWeek();const cur=cw?cw.id:0;
  const upto=cur||((WEEKS[WEEKS.length-1]&&WEEKS[WEEKS.length-1].id)||0);
  let s=0;for(let id=upto;id>=1;id--){if(weekGoalMet(id))s++;else if(id===cur)continue;else break;}return s;
}
function aiSuggest(week){
  const posts=weekPosts(week);
  const planned=posts.length;
  // still short of 5 this week → nudge the next one, varied category
  if(planned<SOC_WEEKLY_GOAL){
    const pid=suggestPillar(week);
    return {type:'add',week,pillar:pid,msg:`<b>${planned}/${SOC_WEEKLY_GOAL}</b> planned this week. A <b>${pillar(pid).t}</b> post would keep the mix fresh — use <b>＋ New post</b> or <b>Upload photos</b> below to add it.`};
  }
  // 5 planned — flag the first not-ready one
  const notReady=posts.find(p=>!postReady(p)&&p.status!=='posted');
  if(notReady){const m=postGaps(notReady).join(', ');return {type:'finish',post:notReady,msg:`Your <b>${pillar(notReady.pillar).t}</b> post still needs: ${m}. Finish it so Ruth can run it.`};}
  const draft=posts.find(p=>p.status==='draft');
  if(draft)return {type:'approve',post:draft,msg:`All ${SOC_WEEKLY_GOAL} posts are built — approve them so they drop into the ready queue.`};
  const st=socStreak();
  return {type:'done',msg:`This week’s ${SOC_WEEKLY_GOAL} are built and ready${st>1?` — <b>${st}-week</b> consistency streak`:''}. 🎯 Want to get ahead on next week?`};
}

/* ============================================================
   PROGRAM REGISTRY  (the Marketing hub holds these sub-dashboards)
   BACKEND HOOK: each program becomes a `program` row + its own
   weeks/steps/kpis/deliveries tables; S.prog[id] is the per-program
   progress. Add a program here (data only) → it shows in the hub.
   ============================================================ */
const PROGRAMS={
  seo:{id:'seo',name:'SEO Dashboard',short:'SEO',icon:'📍',tag:'SEO · Q3 2026',
    blurb:'Own the Bucks County map pack — fix the geo-targeting, build genuinely-local town pages, and run the reviews + blog engine.',
    home:'index.html',planFile:'plan.html',scorecardFile:'scorecard.html',
    nav:[ {ic:'🏠',label:'Home',file:'index.html'},
          {ic:'🎯',label:'Progress',file:'scorecard.html'},
          {ic:'📚',label:'Guide',file:'guides.html'} ],
    order:SEO_ORDER,engine:SEO_ENGINE,phases:SEO_PHASES,weeks:SEO_WEEKS,deliveries:SEO_DELIVERIES,kpis:SEO_KPIS,
    shipLine:'the week ships when the 3 blogs go out, reviews get requested + answered, and the build lands — all by Tuesday 12pm.',
    nudge:{
      sebastian:'Have you written this week’s 3 town blogs, and confirmed which completed jobs were happy so reviews can safely be requested?',
      bogdan:cw=>`Is this week’s build — ${esc((cw.roles.bogdan&&cw.roles.bogdan.sum)||'')} — on track, and did the reviews machine run (requests sent, every new review answered within 48h)?`,
    },
    scorecardOutcome:{title:'End-of-August target outcome',sub:'What "won" looks like',
      colA:['45+ new Google reviews (15/mo pace), 4.9 maintained.','7 genuinely-local Bucks town pages live — not templated.','~36 town-targeted blog posts published.','Schema live; duplicate/broken pages cleaned; NAP consistent.'],
      colB:['/roofing/, /siding/, /patio-doors/, /about/, /reviews/, /financing/ all exist.','Blog reactivated with a repeatable cadence.','One consistent phone number + branded email site-wide.','Movement into the Bucks map pack for the home town + 1–2 bullseye towns.']}
  },
  social:{id:'social',name:'Social Dashboard',short:'Social',icon:'📣',tag:'Social · Q3 2026',
    blurb:'Turn the buried 5-star reputation into local familiarity — a steady 5-posts-a-week engine of proof, neighbors, reviews and Sebastian on camera that puts WG on the shortlist.',
    home:'social.html',planFile:'social-plan.html',scorecardFile:'social-scorecard.html',
    platforms:'Core: Google Business Profile · Facebook · Instagram — plus Nextdoor. Room to add more once the core three are consistent.',
    nav:[ {ic:'🏠',label:'Home',file:'social.html'},
          {ic:'📊',label:'Numbers',file:'social-scorecard.html'},
          {ic:'📘',label:'Guide',file:'social-guides.html'} ],
    order:SOCIAL_ORDER,engine:SOCIAL_ENGINE,phases:SOCIAL_PHASES,weeks:SOCIAL_WEEKS,deliveries:SOCIAL_DELIVERIES,kpis:SOCIAL_KPIS,
    shipLine:'the week ships when 5 posts go out across the core channels — any 5 days — the same-day review texts went out, and every comment + DM is answered.',
    nudge:{
      sebastian:'Are you on pace for 5 posts this week? Dump a few job photos so Ruth always has something approved and ready to run.',
      ruth:'Are this week’s 5 posts going out across the core channels, the same-day review texts sent, and 100% of comments + DMs answered within 24h?'
    },
    scorecardOutcome:{title:'90-day social outcome',sub:'What "won" looks like',
      colA:['55+ posts published — 5 a week, zero missed weeks (consistency is the #1 fix).','+15–25 Google reviews, climbing toward 40–75 total.','Instagram 88 → 250+ followers; reach + saves trending up.','All 7 priority towns surfaced in the feed, geo-tagged.'],
      colB:['100% of comments + DMs answered within 24h (speed wins the job).','Same-day Google review text running after every finished job.','Social-attributed estimates tracked by source in GoHighLevel.','A repeatable engine + a proven post ready for a light Q4 boost.']}
  }
};
const PROGRAM_ORDER=['seo','social']; // display order in the hub + sidebar

/* ---- live bindings: the render engine reads these; bindProgram() points
   them at the active program (from <body data-program>). ---- */
let PROG, ORDER, ENGINE, PHASES, WEEKS, DELIVERIES, KPIS, ST;
function activeProgram(){const p=(document.body&&document.body.dataset.program)||'seo';return PROGRAMS[p]?p:'seo'}
function bindProgram(){
  PROG=PROGRAMS[activeProgram()];
  ORDER=PROG.order; ENGINE=PROG.engine; PHASES=PROG.phases; WEEKS=PROG.weeks; DELIVERIES=PROG.deliveries; KPIS=PROG.kpis;
  ST=S.prog[PROG.id];
}

/* ============================================================
   STATE  (per-program progress; the data above is the seed)
   ============================================================ */
function freshSlice(prog){
  const tasks={};
  prog.weeks.forEach(w=>prog.order.forEach(r=>{ if(w.roles[r]) tasks[w.id+'.'+r]={steps:{},roll:false,note:''} }));
  const kpis={}; prog.kpis.forEach(k=>kpis[k.id]=0);
  return {tasks,kpis,deliv:{},posts:[],pool:[],bajobs:[]};
}
function freshState(){
  const prog={}; Object.keys(PROGRAMS).forEach(id=>prog[id]=freshSlice(PROGRAMS[id]));
  return {prog,role:'all',view:'dashboard',files:[]};
}
let S=Store.load()||freshState();
// migrate: build the program structure + carry forward any legacy single-program (SEO) data
(function migrate(){
  if(!S.prog||typeof S.prog!=='object'){
    const legacyTasks=S.tasks,legacyKpis=S.kpis,legacyDeliv=S.deliv;
    S.prog={}; Object.keys(PROGRAMS).forEach(id=>S.prog[id]=freshSlice(PROGRAMS[id]));
    if(legacyTasks&&typeof legacyTasks==='object'){ // old flat state = the SEO program
      S.prog.seo.tasks=legacyTasks;
      if(legacyKpis&&typeof legacyKpis==='object')S.prog.seo.kpis=legacyKpis;
      if(legacyDeliv&&typeof legacyDeliv==='object')S.prog.seo.deliv=legacyDeliv;
    }
    delete S.tasks; delete S.kpis; delete S.deliv;
  }
  ensureAuth();
  // ensure every program slice exists, with all keys + the step-based shape
  Object.keys(PROGRAMS).forEach(id=>{
    const f=freshSlice(PROGRAMS[id]); const sl=S.prog[id]||(S.prog[id]=f);
    if(!sl.tasks||typeof sl.tasks!=='object')sl.tasks={};
    for(const k in f.tasks){ if(!sl.tasks[k])sl.tasks[k]=f.tasks[k];
      else if(!sl.tasks[k].steps||typeof sl.tasks[k].steps!=='object')sl.tasks[k].steps={}; }
    if(!sl.kpis||typeof sl.kpis!=='object')sl.kpis={};
    for(const k in f.kpis){ if(typeof sl.kpis[k]!=='number')sl.kpis[k]=f.kpis[k]; }
    if(!sl.deliv||typeof sl.deliv!=='object')sl.deliv={};
    if(!Array.isArray(sl.posts))sl.posts=[];
    if(!Array.isArray(sl.pool))sl.pool=[];
    if(!Array.isArray(sl.bajobs))sl.bajobs=[];
    // drop any base64 video thumbs an earlier build wrote into the pool — they bloat localStorage (now cached in-memory via VTHUMB)
    if(Array.isArray(sl.pool))sl.pool.forEach(m=>{if(m&&typeof m.thumb==='string'&&m.thumb.slice(0,5)==='data:')delete m.thumb;});
  });
  if(!S.role||(S.role!=='all'&&!PEOPLE[S.role]&&!userById(S.role)))S.role='all';
  if(!S.view)S.view='dashboard';
})();
bindProgram(); // set the live bindings for this page before anything renders
function commit(){Store.save(S);publishFeed();if(typeof fbStateSave==='function')fbStateSave();}
/* ============================================================
   Firestore LIVE SYNC (Path A). Shares only the shared state —
   S.prog (tasks/kpis/deliv/posts/pool/bajobs) and S.users (accounts).
   The session (S.uid / S.role / S.view) stays local to each device.
   Media stays in Google Drive; only records sync here.
   ============================================================ */
var _fbSync={on:false,unsub:null,applying:false,t:null,lastSavedAt:0,appliedAt:0};
function fbStateRef(){return WG_DB.collection('workspaces').doc('wg').collection('state').doc('main');}
function fbApplyRemote(data){
  if(!data)return;
  _fbSync.applying=true;
  if(data.prog&&typeof data.prog==='object')S.prog=data.prog;
  if(Array.isArray(data.users))S.users=data.users;
  ensureAuth(); bindProgram();      // re-seed/guard + rebind ST to the (possibly new) S.prog
  if(data.updatedAt)_fbSync.appliedAt=data.updatedAt;
  _fbSync.applying=false;
  try{Store.save(S);}catch(e){}      // refresh the local cache
}
async function fbSyncStart(){
  if(_fbSync.on||!window.WG_FB_READY||!WG_AUTH.currentUser)return;
  const ref=fbStateRef();
  try{
    const snap=await ref.get();
    if(snap.exists&&snap.data()){ fbApplyRemote(snap.data()); }
    else { _fbSync.lastSavedAt=Date.now(); _fbSync.appliedAt=_fbSync.lastSavedAt; await ref.set({prog:S.prog,users:S.users,updatedAt:_fbSync.lastSavedAt,by:(WG_AUTH.currentUser.email||'')}); }
    _fbSync.on=true;
    if(_fbSync.unsub)_fbSync.unsub();
    _fbSync.unsub=ref.onSnapshot(function(d){
      if(!d.exists||_fbSync.applying)return;
      const data=d.data(); if(!data)return;
      if(data.updatedAt&&_fbSync.appliedAt&&data.updatedAt<=_fbSync.appliedAt)return; // ignore our own echo AND any snapshot older/equal to what we already have (never wipe fresh local changes like a Drive sync)
      if(document.getElementById('cmpOv')||document.getElementById('mprevOv'))return; // don't disrupt an open editor
      fbApplyRemote(data);
      if(typeof render==='function')render();
    }, function(err){ _fbSync.on=false; if(_fbSync.unsub){try{_fbSync.unsub()}catch(e){}_fbSync.unsub=null;} }); // stop quietly if the session ends
    if(typeof render==='function')render();
  }catch(e){ /* network/rules issue — stay on the local cache */ }
}
function fbStateSave(){
  if(!_fbSync.on||_fbSync.applying||!window.WG_FB_READY||!WG_AUTH.currentUser)return;
  clearTimeout(_fbSync.t);
  _fbSync.t=setTimeout(function(){ try{ _fbSync.lastSavedAt=Date.now(); _fbSync.appliedAt=_fbSync.lastSavedAt;
    fbStateRef().set({prog:S.prog,users:S.users,updatedAt:_fbSync.lastSavedAt,by:(WG_AUTH.currentUser&&WG_AUTH.currentUser.email)||''}); }catch(e){} },400);
}
/* ---- Handoff PHOTOS that sync to the teammate: compress to Full-HD WebP @80%, store
   each as its own small Firestore doc (well under the 1MB doc limit). Free; no Storage. ---- */
/* Does THIS browser actually encode WebP? iOS Safari historically does NOT — it
   silently returns a (huge) PNG, which then blows past Firestore's 1MB doc limit.
   So we detect it once and fall back to JPEG, which every iPhone encodes + compresses well. */
var _webpOK=null;
function canEncodeWebp(){
  if(_webpOK!==null)return _webpOK;
  try{var c=document.createElement('canvas');c.width=c.height=2;_webpOK=(c.toDataURL('image/webp').indexOf('data:image/webp')===0);}catch(e){_webpOK=false;}
  return _webpOK;
}
/* Shrink + compress an image to a small dataURL that fits Firestore (under ~1MB).
   Returns a webp dataURL where supported, otherwise jpeg. Despite the name it is the
   single "make a shareable image" path used by both the pool and the SEO handoff. */
function imgToWebp(file){
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      try{
        var w=img.naturalWidth,h=img.naturalHeight,M=1920;
        if(!w||!h){URL.revokeObjectURL(url);return reject(new Error('empty image'));}
        if(w>M||h>M){ if(w>=h){h=Math.round(h*M/w);w=M;} else {w=Math.round(w*M/h);h=M;} }
        var mime=canEncodeWebp()?'image/webp':'image/jpeg';
        var enc=function(cw,ch,q){var c=document.createElement('canvas');c.width=cw;c.height=ch;var ctx=c.getContext('2d');
          if(mime==='image/jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cw,ch);} // jpeg has no alpha — white, not black
          ctx.drawImage(img,0,0,cw,ch);return c.toDataURL(mime,q);};
        var q=0.82, data=enc(w,h,q);
        while(data.length>950000 && q>0.4){ q-=0.12; data=enc(w,h,q); }          // 1) drop quality
        var s=1;
        while(data.length>950000 && s>0.35){ s-=0.2; data=enc(Math.round(w*s),Math.round(h*s),0.7); } // 2) shrink dimensions
        URL.revokeObjectURL(url);
        if(data.length>1010000) return reject(new Error('still too large for cloud'));
        resolve(data);
      }catch(e){URL.revokeObjectURL(url);reject(e);}
    };
    img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('decode failed'));};
    img.src=url;
  });
}
function hfRef(){return WG_DB.collection('workspaces').doc('wg').collection('hfiles');}
async function hfAdd(key,file){
  var norm=await normalizeImage(file);            // HEIC -> JPEG first if needed
  var dataUrl=await imgToWebp(norm);
  var id='hf_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
  var name=String(file.name||'image').replace(/\.[^.]+$/,'')+'.webp';
  await hfRef().doc(id).set({deliv:key,name:name,type:'image/webp',dataUrl:dataUrl,by:(WG_AUTH.currentUser&&WG_AUTH.currentUser.email)||'',at:Date.now()});
  return {id:id,name:name};
}
async function hfGet(id){ try{var d=await hfRef().doc(id).get(); return d.exists?d.data():null;}catch(e){return null;} }
async function hfDel(id){ try{await hfRef().doc(id).delete();}catch(e){} }
async function handleDelivAttach(files,wid,fromRole,key){
  for(const f of (files||[])){
    var isImg=/^image\//.test(f.type)||/\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(f.name||'');
    if(isImg && window.WG_FB_READY && WG_AUTH.currentUser){
      try{ var ref=await hfAdd(key,f); if(!ST.deliv[key])ST.deliv[key]={text:'',files:[],links:[],cf:[]}; if(!Array.isArray(ST.deliv[key].cf))ST.deliv[key].cf=[]; ST.deliv[key].cf.push(ref); commit(); }
      catch(e){ await fileAdd(f,wid,fromRole,key); } // fallback: keep local if compression fails
    } else { await fileAdd(f,wid,fromRole,key); } // video/PDF/other -> local
  }
}
function renderCloudFiles(container,key,editable,onChange){
  if(!container)return; container.innerHTML='';
  var cf=(ST.deliv[key]&&ST.deliv[key].cf)||[];
  cf.forEach(function(c,idx){
    var row=el('div','dfile');
    row.innerHTML='<img class="dcthumb" alt=""><span class="fn">'+esc(c.name||'photo.webp')+'</span><span class="fm">photo</span><button class="tbtn dl">⬇</button>'+(editable?'<button class="tbtn del">✕</button>':'');
    var im=row.querySelector('.dcthumb');
    hfGet(c.id).then(function(d){ if(d&&d.dataUrl){im.src=d.dataUrl; row.querySelector('.dl').onclick=function(){var a=document.createElement('a');a.href=d.dataUrl;a.download=c.name||'photo.webp';a.click();}; im.onclick=function(){var w=window.open();if(w)w.document.write('<img src="'+d.dataUrl+'" style="max-width:100%">');}; } });
    if(editable){var del=row.querySelector('.del'); if(del)del.onclick=async function(){ await hfDel(c.id); if(ST.deliv[key]&&ST.deliv[key].cf)ST.deliv[key].cf.splice(idx,1); commit(); renderCloudFiles(container,key,editable,onChange); if(onChange)onChange(); };}
    container.appendChild(row);
  });
}

/* ============================================================
   CROSS-APP FEED  (Marketing OS → Founder HQ dashboard)
   ------------------------------------------------------------
   The Founder dashboard is a SEPARATE app and cannot see the task
   definitions that live in this file. So we publish a fully-resolved,
   denormalized snapshot to a shared localStorage key it can read.
   BACKEND HOOK: in production this becomes a read-only API/SQL view
   (e.g. GET marketing_feed.php) that the Founder dashboard consumes —
   the shape below is the contract.
   ============================================================ */
const FEED_KEY='wg_mktg_feed_v1';
/* Resolve ONE program (its static def + its slice of S.prog) into the denormalized
   snapshot shape the Founder dashboard consumes. Pure of the live-bound globals so it
   can run for every program regardless of which one is currently active in the UI. */
function resolveProgram(prog){
  const slice=(S.prog&&S.prog[prog.id])||{tasks:{},kpis:{},deliv:{}};
  const T=slice.tasks||{}, K=slice.kpis||{}, D=slice.deliv||{};
  const weeks=prog.weeks.map(w=>{
    const roles={};
    prog.order.forEach(r=>{
      const def=w.roles&&w.roles[r];if(!def)return;
      const stp=((T[w.id+'.'+r]||{}).steps)||{};
      const steps=(def.steps||[]).map((txt,i)=>({txt,done:!!stp[i]}));
      const total=steps.length, done=steps.filter(s=>s.done).length;
      roles[r]={sum:def.sum,est:def.est,handoff:def.handoff,steps,total,done,
        note:((T[w.id+'.'+r]||{}).note)||''};
    });
    return {id:w.id,due:w.due,title:w.title,phase:w.phase,roles};
  });
  /* messages = whatever the team typed/dropped into the "Deliver to…" boxes */
  const messages=[];
  Object.keys(D).forEach(key=>{
    const d=D[key];if(!d)return;
    const text=(d.text||'').trim();
    const files=Array.isArray(d.files)?d.files.length:0;
    if(!text&&!files)return;
    const parts=key.split('.'),wid=+parts[0],from=parts[1];
    const tos=(prog.deliveries[key]||[]).map(x=>x.to);
    messages.push({week:wid,from,to:tos,text,files});
  });
  const kpis=prog.kpis.map(k=>({id:k.id,label:k.label,value:(K[k.id]||0),target:k.target}));
  return {id:prog.id,name:prog.name,icon:prog.icon,order:prog.order,
    people:Object.fromEntries(prog.order.map(r=>[r,{name:PEOPLE[r].name,c:PEOPLE[r].c,bg:PEOPLE[r].bg,av:PEOPLE[r].av,role:PEOPLE[r].role}])),
    weeks,messages,kpis};
}
function publishFeed(){
  try{
    const programs=PROGRAM_ORDER.filter(id=>PROGRAMS[id]).map(id=>resolveProgram(PROGRAMS[id]));
    const seo=programs.find(p=>p.id==='seo')||programs[0]||{order:[],people:{},weeks:[],messages:[],kpis:[]};
    /* v2 = multi-program. Top-level seo fields kept for back-compat with any
       consumer still reading the v1 shape (the Founder dashboard mirrors the
       full `programs[]` array but older code falls back to these). */
    const feed={v:2,generatedAt:Date.now(),programs,
      order:seo.order,people:seo.people,weeks:seo.weeks,messages:seo.messages,kpis:seo.kpis};
    localStorage.setItem(FEED_KEY,JSON.stringify(feed));
  }catch(e){/* non-fatal: feed is a convenience mirror */}
}
publishFeed(); // publish once on load so the Founder dashboard has fresh data

/* ---- helpers ---- */
const $=s=>document.querySelector(s);
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e};
function esc(s){return (s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2200)}
function av(role,cls){const p=personOf(role);return `<div class="${cls||'av'}" style="background:${p.bg};color:${p.c}">${p.av}</div>`}

/* ---- dates / current week ---- */
function todayMid(){const d=new Date();d.setHours(0,0,0,0);return d}
function dueDate(w){const d=new Date(w.due+'T12:00:00');return d}
/* the week a date falls in; past the 12-week plan it rolls forward with synthetic
   "Ongoing" weeks so the cadence tracker + streak never stop working after Aug 2026 */
function weekForDate(now){
  for(const w of WEEKS){if(dueDate(w).getTime()>=now.getTime())return w}
  const last=WEEKS[WEEKS.length-1]; if(!last)return null;
  const lastDue=dueDate(last).getTime(), wkMs=7*24*3600*1000;
  const n=Math.max(1,Math.ceil((now.getTime()-lastDue)/wkMs)); // 1,2,3… weeks past the last
  const due=new Date(lastDue+n*wkMs).toISOString().slice(0,10);
  const roles={}; Object.keys(last.roles||{}).forEach(r=>{roles[r]={est:(last.roles[r]||{}).est||'',sum:'Keep the weekly cadence going — 5 posts out, reviews flowing.',steps:[],handoff:''};});
  return {id:last.id+n, phase:last.phase, due, title:'Ongoing — keep the cadence', roles, virtual:true};
}
function currentWeek(){return weekForDate(new Date());}
function fmtDue(w){return new Date(w.due+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}

/* ---- progress math (step-based) ---- */
function stepsOf(w,r){return (w&&w.roles&&w.roles[r]&&w.roles[r].steps)||[]}
function checkedOf(w,r){const t=w&&ST.tasks[w.id+'.'+r];const s=(t&&t.steps)||{};return stepsOf(w,r).reduce((n,_,i)=>n+(s[i]?1:0),0)}
function taskDone(w,r){const t=stepsOf(w,r).length;return t>0&&checkedOf(w,r)>=t}
function weekPct(id){const w=WEEKS.find(x=>x.id===id);let d=0,t=0;ORDER.forEach(r=>{t+=stepsOf(w,r).length;d+=checkedOf(w,r)});return t?Math.round(d/t*100):0}
function overallPct(role){let d=0,t=0;WEEKS.forEach(w=>ORDER.forEach(r=>{if(role&&role!=='all'&&r!==role)return;t+=stepsOf(w,r).length;d+=checkedOf(w,r)}));return t?Math.round(d/t*100):0}
function roleDone(role){let d=0,t=0;WEEKS.forEach(w=>{t++;if(taskDone(w,role))d++});return{d,t}}
/* ---- program-agnostic math (for the Marketing hub, which sums ALL programs) ---- */
function progSlice(id){return (S.prog&&S.prog[id])||{tasks:{},kpis:{},deliv:{}}}
function progOverall(id,role){const prog=PROGRAMS[id];if(!prog)return 0;const T=progSlice(id).tasks||{};
  let d=0,t=0;prog.weeks.forEach(w=>prog.order.forEach(r=>{if(role&&role!=='all'&&r!==role)return;const def=w.roles[r];if(!def)return;
    const steps=(def.steps||[]).length;const st=(T[w.id+'.'+r]||{}).steps||{};t+=steps;for(let i=0;i<steps;i++)if(st[i])d++}));
  return t?Math.round(d/t*100):0}
function progCurrentWeek(id){const prog=PROGRAMS[id];if(!prog)return null;const now=Date.now();
  for(const w of prog.weeks){if(new Date(w.due+'T12:00:00').getTime()>=now)return w}return null}
/* live-update any progress bars currently on screen (without a full re-render) */
function syncBars(){
  document.querySelectorAll('[data-wkbar]').forEach(i=>{i.style.width=weekPct(+i.dataset.wkbar)+'%'});
  document.querySelectorAll('[data-wkpct]').forEach(s=>{s.textContent=weekPct(+s.dataset.wkpct)+'%'});
  const ov=document.querySelector('[data-overall]');if(ov)ov.style.width=overallPct('all')+'%';
  const ovn=document.querySelector('[data-overall-num]');if(ovn)ovn.textContent=overallPct('all')+'%';
  ORDER.forEach(r=>{const x=roleDone(r);const p=x.t?Math.round(x.d/x.t*100):0;
    const b=document.querySelector('[data-role-bar="'+r+'"]');if(b)b.style.width=p+'%';
    const c=document.querySelector('[data-role-count="'+r+'"]');if(c)c.textContent=x.d+'/'+x.t});
}

/* ============================================================
   INDEXEDDB  (file uploads)
   BACKEND HOOK: replace this whole block with PHP upload endpoints
   + a MySQL `files` table (id, name, type, size, week, by, deliv, ts)
   + blob storage on disk or S3.
   ============================================================ */
let _db;
function db(){return new Promise((res,rej)=>{
  if(_db)return res(_db);
  const r=indexedDB.open('wg_mktg_files',1);
  r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id'})};
  r.onsuccess=e=>{_db=e.target.result;res(_db)};
  r.onerror=e=>rej(e);
})}
/* iPhone HEIC/HEIF handling -------------------------------------------------
   iPhones save photos as .heic (and Live Photos as .heic + a .mov). Desktop
   Chrome can't decode HEIC, so we convert to JPEG on upload when the local
   converter is present. If it isn't, the original still uploads and stores
   fine — it just shows a labelled placeholder until it's on a phone/posted. */
function isHeic(f){return /image\/hei[cf]/i.test(f&&f.type||'')||/\.(heic|heif)$/i.test(f&&f.name||'')}
let _heicLib=null;
function loadHeicLib(){
  if(_heicLib)return _heicLib;
  _heicLib=new Promise((res)=>{
    if(window.heic2any)return res(window.heic2any);
    const s=document.createElement('script');s.src='assets/js/heic2any.min.js';
    s.onload=()=>res(window.heic2any||null);
    s.onerror=()=>res(null);
    document.head.appendChild(s);
  });
  return _heicLib;
}
async function normalizeImage(file){
  if(!isHeic(file))return file;
  try{
    const lib=await loadHeicLib();
    if(!lib)return file;
    const out=await lib({blob:file,toType:'image/jpeg',quality:0.9});
    const blob=Array.isArray(out)?out[0]:out;
    const name=(file.name||'photo').replace(/\.(heic|heif)$/i,'.jpg');
    return new File([blob],name,{type:'image/jpeg'});
  }catch(e){return file;}
}
async function fileAdd(file,week,by,deliv){
  const id='f_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
  const rec={id,name:file.name,type:file.type,size:file.size,week:week||'',by:by||S.role,deliv:deliv||'',ts:Date.now(),blob:file};
  const d=await db();await new Promise((res,rej)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').put(rec);tx.oncomplete=res;tx.onerror=rej});
  return rec;
}
async function fileList(){const d=await db();return new Promise((res)=>{const out=[];const tx=d.transaction('files','readonly');tx.objectStore('files').openCursor().onsuccess=e=>{const c=e.target.result;if(c){const v=c.value;out.push({id:v.id,name:v.name,type:v.type,size:v.size,week:v.week,by:v.by,deliv:v.deliv||'',ts:v.ts});c.continue()}else res(out.sort((a,b)=>b.ts-a.ts))}})}
async function filesForDeliv(key){const all=await fileList();return all.filter(f=>f.deliv===key)}
async function fileGet(id){const d=await db();return new Promise((res)=>{d.transaction('files','readonly').objectStore('files').get(id).onsuccess=e=>res(e.target.result)})}
async function fileDel(id){const d=await db();return new Promise((res)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').delete(id);tx.oncomplete=res})}
function humanSize(n){if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(0)+' KB';return (n/1048576).toFixed(1)+' MB'}
function fileIcon(t){if(/image/.test(t))return '🖼️';if(/pdf/.test(t))return '📕';if(/sheet|excel|csv/.test(t))return '📊';if(/word|document/.test(t))return '📝';if(/zip|compress/.test(t))return '🗜️';return '📎'}

/* ============================================================
   NAV  (multi-page: each item links to its own .html file)
   ============================================================ */
/* Sidebar is now PROGRAM-SCOPED to keep it uncluttered: it shows the Overview link,
   then ONLY the active program's pages (chosen via the top-bar dropdown), then the
   shared/admin/owner items. Active item is matched by FILENAME (not data-view) because
   programs share view names (plan.html and social-plan.html are both view="plan").
   BACKEND HOOK: this nav becomes a server-rendered include; the per-program section
   is generated from the selected `program` row. */
const SHARED_NAV=[
  {sec:'Shared'},
  {ic:'📁',label:'Files',file:'files.html'},
  {sec:'Admin'},
  {ic:'⚙️',label:'Settings',file:'settings.html'},
  /* OWNER-ONLY: Founder HQ. Front-end role gate only (visible/redirect by role).
     BACKEND HOOK: the PHP/MySQL programmer must enforce real owner auth server-side —
     the role check below is a UX deterrent, NOT security. */
  {sec:'Owner only',owner:true},
  {ic:'🔐',label:'Founder HQ',file:'founder.html',owner:true}
];
function currentFile(){const p=(location.pathname||'').split('/').pop();return p||'index.html'}
// "All dashboards" / combined hub mode (the Marketing Overview page)
function isHub(){return (document.body&&document.body.dataset.program==='hub')||currentView()==='marketing'}
/* Build the sidebar item list for the CURRENT context (hub = just the overview;
   a program = overview + that program's pages). Shared/admin/owner always appended. */
function navItems(){
  // Ruth on Social is locked to just her two screens — her own little app.
  if(!isHub() && activeProgram()==='social' && isPoster()){
    return [{sec:'Social'},
      {ic:'📤',label:'Post queue',file:'social.html'},
      {ic:'📊',label:'Numbers',file:'social-scorecard.html'},
      {ic:'📘',label:'Guide',file:'social-guides.html'}];
  }
  const items=[{sec:'Marketing'},{ic:'🛰️',label:'Overview',file:'marketing.html'}];
  if(!isHub()){
    const prog=PROGRAMS[activeProgram()];
    items.push({sec:prog.name});
    prog.nav.forEach(n=>items.push(Object.assign({planOf:n.plan?prog.id:null},n)));
  }
  return items.concat(SHARED_NAV);
}
/* ============================================================
   RENDER ROUTER  (view comes from <body data-view="...">)
   ============================================================ */
function currentView(){return (document.body&&document.body.dataset.view)||'dashboard'}
function render(){
  const v=$('#view');if(!v)return;v.innerHTML='';
  ({marketing:viewMarketingHub,dashboard:viewDashboard,plan:viewPlan,scorecard:viewScorecard,calendar:viewCalendar,guides:viewGuides,files:viewFiles,strategy:viewStrategy,audit:viewAudit,settings:viewSettings,upload:viewUploader}[currentView()]||viewDashboard)(v);
}
/* ---------- MARKETING HUB (birds-eye over every program) ---------- */
function viewMarketingHub(v){
  v.appendChild(el('div','page-head',`<h2>Marketing Overview</h2><p>One birds-eye view of every marketing program. Each dashboard runs the same Tuesday-12pm cadence — open one to see its plan, scorecard and this-week tasks.</p>`));

  // headline stat row across all programs
  const ids=PROGRAM_ORDER.filter(id=>PROGRAMS[id]);
  const avg=ids.length?Math.round(ids.reduce((s,id)=>s+progOverall(id,'all'),0)/ids.length):0;
  const top=el('div','grid cols-3');
  const s1=el('div','card pad kpi');s1.innerHTML=`<div class="eyebrow" style="color:var(--faint)">Active programs</div><div style="margin:4px 0 8px"><b class="num">${ids.length}</b></div><div class="muted" style="font-size:12.5px">${ids.map(id=>PROGRAMS[id].short).join(' · ')}</div>`;
  const s2=el('div','card pad kpi');s2.innerHTML=`<div class="eyebrow" style="color:var(--faint)">Combined progress</div><div style="margin:4px 0 8px"><b class="num">${avg}%</b> <span class="of">avg across programs</span></div><div class="bar green"><i style="width:${avg}%"></i></div>`;
  const cwk=progCurrentWeek(ids[0]);
  const s3=el('div','card pad kpi');s3.innerHTML=`<div class="eyebrow" style="color:var(--faint)">This week</div><div style="margin:4px 0 8px"><b class="num">${cwk?('Wk '+cwk.id):'—'}</b> <span class="of">of 12</span></div><div class="muted" style="font-size:12.5px">${cwk?('Due '+fmtDue(cwk)+' · 12pm'):'Q3 complete'}</div>`;
  top.appendChild(s1);top.appendChild(s2);top.appendChild(s3);
  v.appendChild(top);

  // one card per program
  const grid=el('div','grid cols-2');grid.style.marginTop='16px';
  ids.forEach(id=>{
    const prog=PROGRAMS[id];
    const pct=progOverall(id,'all');
    const cw=progCurrentWeek(id);
    const team=prog.order.map(r=>av(r,'av')).join('');
    const c=el('div','card pad');c.style.cursor='pointer';
    c.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">${prog.icon}</div>
        <div><h3>${esc(prog.name)}</h3><small>${esc(prog.tag)}</small></div>
        <span class="pill" style="margin-left:auto">${pct}%</span></div>
      <p class="muted" style="font-size:13px;line-height:1.5;margin:2px 0 12px">${esc(prog.blurb)}</p>
      <div class="bar green" style="margin-bottom:12px"><i style="width:${pct}%"></i></div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex" class="hubteam">${team}</div>
        <span class="muted" style="font-size:12.5px">${cw?('This week: Week '+cw.id+' · '+esc(cw.title)):'Quarter complete'}</span>
        <span style="margin-left:auto;display:flex;gap:6px">
          <a class="tbtn" href="${prog.home}">Open</a>
          <a class="tbtn" href="${prog.planFile}">Plan</a>
          <a class="tbtn" href="${prog.scorecardFile}">Scorecard</a>
        </span>
      </div>`;
    c.querySelectorAll('.hubteam .av').forEach(a=>{a.style.width='24px';a.style.height='24px';a.style.fontSize='11px';a.style.marginRight='-4px';a.style.border='2px solid #fff'});
    c.onclick=e=>{if(e.target.closest('a'))return;location.href=prog.home};
    grid.appendChild(c);
  });
  v.appendChild(grid);

  // gentle note about future programs
  const note=el('div','card pad');note.style.marginTop='16px';
  note.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">➕</div><div><h3>More programs coming</h3><small>Email, paid ads, partnerships…</small></div></div>
    <p class="muted" style="font-size:13px;line-height:1.5">Every new marketing program drops in here automatically and rolls into the combined progress above — same weekly cadence, same accountability, one place to see it all.</p>`;
  v.appendChild(note);
}
function roleNote(){return S.role==='all'?'':` · showing <b>${PEOPLE[S.role].name}</b>’s tasks first`}

/* ---------- DASHBOARD ---------- */
/* ---------- SOCIAL: a clean, metrics-first dashboard home ---------- */
function viewSocialDashboard(v){
  // A poster's whole world (e.g. Ruth): pick a ready post and run it.
  if(isPoster()){
    v.appendChild(el('div','page-head',`<h2>Ready to Post</h2><p>Everything here is approved and good to go. Pick one, copy the caption + hashtags, post it, mark it done. New to a step? Check your <b>Guide</b>.</p>`));
    ruthQueue(v);
    return;
  }
  // Sebastian's home: the consistency pulse, then his content library.
  v.appendChild(el('div','page-head',`<h2>Home</h2><p>Drop photos + a note, fill the post once, approve it — it lands in the posting queue. Make as many as you want; they all live below.</p>`));
  v.appendChild(cadenceBanner());
  socLibrary(v);
}
/* ============================================================
   SEO DASHBOARD — content hand-off + 90-day playbook.
   Replaces the weekly cadence as the SEO home. Sebastian/provider drops
   blog briefs (topic + town + keyword + notes + photos); Bogdan the
   builder pulls them and works an ordered 90-day plan (check off + notes).
   ============================================================ */
const SEO_TARGET='Publish 12 local blogs, optimize your Google Business Profile, build ~20 citations, and earn 15 new Google reviews — aiming for the Map Pack (top 3) in your core towns.';
const SEO_BLOG_GOAL=12;
const SEO_PLAYBOOK=[
  {id:'gbp',icon:'📍',title:'Google Business Profile',sub:'Your #1 local ranking lever — get this perfect first.',
   tasks:['Claim & verify the profile','Primary + all relevant secondary categories','Full services list with descriptions','Service-area towns added','15+ photos (logo, team, before/afters)','Hours, phone, website, booking link','Turn on messaging']},
  {id:'pages',icon:'🌐',title:'Core website pages',sub:'A clear page for every service Google can rank.',
   tasks:['A page per service (windows, roofing, siding, doors…)','Consistent name/address/phone in the footer','Title tag + meta description per page','Internal links between services','Fast + mobile-clean']},
  {id:'towns',icon:'🏘️',title:'Town pages',sub:'One genuinely-local page per target town.',
   tasks:['A page per core town (Langhorne, Newtown, Yardley…)','Real local detail — not templated','Town in the title, H1 and first paragraph','Local job photos + reviews on the page','Linked from the menu/footer']},
  {id:'blogs',icon:'✍️',title:'Blogs',sub:'Publish the briefs from your content folders below.',
   tasks:['Publish the 12 blog briefs','Keyword in title + first line + one H2','Town named naturally','Before/after photos with alt text','Internal link to the matching service page','Clear call-to-action + meta description']},
  {id:'citations',icon:'📒',title:'Citations',sub:'Get listed consistently across the web.',
   tasks:['~20 directories (Yelp, BBB, Angi, Houzz, Nextdoor…)','EXACT same name/address/phone everywhere','Categories + description filled in','Link back to the site']},
  {id:'reviews',icon:'⭐',title:'Reviews engine',sub:'Steady new Google reviews = trust + ranking.',
   tasks:['Same-day review request after every finished job','15+ new Google reviews','Reply to every review within 48h','Showcase reviews on the site']},
  {id:'links',icon:'🔗',title:'Local links',sub:'A few quality local backlinks.',
   tasks:['Suppliers / manufacturers','Local associations / chamber','Local press or sponsorships','Partner cross-links']}
];
const SEO_KEYWORD_HINTS=['window replacement {town}','{town} roofing company','siding contractor {town}','patio doors {town}','best windows near me'];
/* === MERGED RESEARCH BACKLOG — from Sebastian's SEO Targets doc + the live-site audit agents.
   Windows-first, anchored to the 7 priority towns. Gutters, off-site (citations/backlinks),
   and geographic expansion are intentionally held for the "After 90 days" overview (Guide). === */
const SEO_TOWNS7=['Langhorne','Newtown','Yardley','Lower Makefield','Richboro','Holland','Feasterville'];
const SECTION_ICON={'Google Business Profile':'📍','Core website pages':'🌐','Town pages':'🏘️','Blogs':'✍️','Citations':'📒','Reviews engine':'⭐','Local links':'🔗','Technical':'🔧','Custom':'•'};
function seoSlug(t){return t.toLowerCase().replace(/ /g,'-');}
const RESEARCH_TASKS=[
  {title:'Audit the site: list every page, title tag, H1 and body line that says "Philadelphia"',section:'Technical',est:2,why:'Find all the wrong geo-targeting before fixing it'},
  {title:'Rewrite all "Philadelphia" titles / H1 / copy to Langhorne / Bucks County',section:'Technical',est:3,why:'You serve Bucks, not Philly — it’s bleeding your focus'},
  {title:'Consolidate the duplicate Philadelphia pages into one + 301-redirect the rest',section:'Technical',est:2,why:'Kills keyword cannibalization'},
  {title:'Add HomeAndConstructionBusiness + GeneralContractor schema sitewide (not generic LocalBusiness)',section:'Technical',est:3,why:'Google ranks specific schema over generic; competitors run basic Yoast'},
  {title:'Add Service schema (itemListElement) to each service hub page',section:'Technical',est:2,why:'Powers the service catalog + rich results'},
  {title:'Add FAQPage schema (5–8 real FAQs) to every service + town page',section:'Technical',est:3,why:'Surfaces in AI Overviews + People Also Ask'},
  {title:'Add BreadcrumbList schema sitewide',section:'Technical',est:1,why:'Better SERP appearance + site hierarchy'},
  {title:'Add AggregateRating + 3 recent Review schema (from GBP) to town/service pages',section:'Technical',est:2,why:'Star-rich results + AI citation'},
  {title:'Rewrite image alt text sitewide as "[service] in [town], PA — [description]"',section:'Technical',est:2,why:'Image-search traffic + local relevance'},
  {title:'Rewrite weak / missing title tags + meta descriptions on all key pages',section:'Technical',est:3,why:'Click-through + on-page relevance'},
  {title:'Run PageSpeed Insights + Search Console; fix mobile/speed red flags',section:'Technical',est:3,why:'Core Web Vitals + indexing health'},
  {title:'Lock NAP (Window Guardians · 430 Fox Hollow Dr, Langhorne · (215) 709-8793) in footer + schema sitewide',section:'Technical',est:1,why:'Consistency is a core local ranking signal'},
  {title:'Set GBP primary category to "Window installation service"',section:'Google Business Profile',est:0.5,why:'#1 individual local-pack ranking factor'},
  {title:'Add all relevant GBP secondary categories (door/roofing/siding/window supplier, general contractor, home improvement)',section:'Google Business Profile',est:0.5,why:'Expands the queries you can show for'},
  {title:'Set accurate GBP hours (mark 24/7 if you run 24/7 phone coverage)',section:'Google Business Profile',est:0.5,why:'Hours are now a top-5 ranking factor'},
  {title:'Populate the GBP Services list with price ranges for every offering',section:'Google Business Profile',est:1,why:'"Starting at $X" signals premium tier'},
  {title:'Upload 15+ GBP photos across 5 categories (exterior, interior, team, product, at-work)',section:'Google Business Profile',est:1.5,why:'Recent photos move ranking'},
  {title:'Set a weekly GBP photo + 1–2x/week post cadence',section:'Google Business Profile',est:0.5,why:'Active-profile signal'},
  {title:'Add a GBP booking link + verify phone routing (Google AI starts calling businesses in 2026)',section:'Google Business Profile',est:1,why:'Agentic-search readiness'},
  {title:'Optimize the /windows/ hub for "window replacement Bucks County" + Okna/Andersen/Pella + FAQ + schema',section:'Core website pages',est:3,why:'Regional hub that feeds the town pages'},
  {title:'Optimize the /roofing/ hub (on-page + Service/FAQ schema)',section:'Core website pages',est:2.5,why:'Second-biggest revenue line'},
  {title:'Optimize the /siding/ hub (on-page + schema)',section:'Core website pages',est:2,why:'Full-exterior buyer signal'},
  {title:'Optimize the /entry-doors/ + /patio-doors/ hubs (on-page + schema)',section:'Core website pages',est:2.5,why:'High-ticket attach to window jobs'},
  {title:'Build a /why-us/ EEAT page (installer bios, license/insurance #, certifications, badges)',section:'Core website pages',est:3,why:'EEAT moat competitors can’t copy'},
  {title:'Build a /reviews/ page pulling your Google reviews',section:'Core website pages',est:2,why:'Owns "window guardians reviews" + builds trust'}
]
.concat(SEO_TOWNS7.map(t=>({title:'Build a deep /window-replacement-'+seoSlug(t)+'-pa/ page (real local project + photos + reviews + schema)',section:'Town pages',est:4,why:'Rank top-3 for "window replacement '+t+' PA" — the bullseye'})))
.concat([
  {title:'Write /cost/window-replacement-cost-bucks-county-pa/ (1,500+ words, real price ranges)',section:'Blogs',est:3,why:'Highest-intent gap — NO competitor owns cost guides'},
  {title:'Write /cost/roof-replacement-cost-bucks-county-pa/',section:'Blogs',est:2.5,why:'Middle-funnel intent, zero competition'}
])
.concat(SEO_TOWNS7.map(t=>({title:'Write the '+t+' window cost guide /cost/window-replacement-cost-'+seoSlug(t)+'-pa/',section:'Blogs',est:2.5,why:'Own "window cost/prices '+t+'" — uncontested'})))
.concat([
  {title:'Write /okna-window-repair-pa/ (Okna is your primary line — defensible)',section:'Blogs',est:2,why:'Brand-repair gap; Ardmor only owns Andersen/Marvin/Pella'},
  {title:'Write /provia-door-repair-pa/',section:'Blogs',est:1.5,why:'Open brand-repair query'},
  {title:'Write /sunrise-window-repair-pa/',section:'Blogs',est:1.5,why:'Open brand-repair query'},
  {title:'Write comparison guide: Okna vs Andersen vs Pella vs ProVia',section:'Blogs',est:2.5,why:'Bottom-funnel; no competitor has it'},
  {title:'Write comparison: triple-pane vs double-pane windows in PA',section:'Blogs',est:2,why:'High-intent buyer question'},
  {title:'Write comparison: James Hardie vs vinyl siding',section:'Blogs',est:2,why:'Siding buyer decision content'},
  {title:'Write comparison: architectural vs 3-tab shingles',section:'Blogs',est:2,why:'Roofing buyer decision content'},
  {title:'Blog: "5 signs your Bucks County home needs new windows"',section:'Blogs',est:1.5,why:'Top-of-funnel local pull'},
  {title:'Blog: "Best replacement windows for 1980s Bucks County colonials"',section:'Blogs',est:1.5,why:'Matches your housing-stock sweet spot'},
  {title:'Blog: "PA energy rebates + tax credits for new windows (2026)"',section:'Blogs',est:1.5,why:'High-intent + timely'},
  {title:'Build an SMS + email one-click Google-review workflow, sent 24–48h after install',section:'Reviews engine',est:2,why:'Review velocity = 16–20% of map rank'},
  {title:'Coach staff/customers to mention Okna + the town + one specific detail in reviews',section:'Reviews engine',est:1,why:'Google parses review CONTENT, not just stars'},
  {title:'Run 15+ Google reviews/month + reply to 80%+ within 48h',section:'Reviews engine',est:1,why:'Recency beats raw count in 2026'},
  {title:'Claim + optimize the BBB profile',section:'Reviews engine',est:1,why:'Homeowners vet $20–50K jobs on BBB'},
  {title:'Set up a Houzz profile with project photos',section:'Reviews engine',est:1,why:'Design-forward platform + citation'}
]);
function loadResearchOnce(){
  if(ST.researchLoaded)return;
  const cur=Array.isArray(ST.sprintTasks)?ST.sprintTasks:[];
  const keep=cur.filter(function(t){ return t.status!=='todo' || !/^spt_(gbp|pages|towns|blogs|citations|reviews|links)_\d+$/.test(t.id); });
  const have={}; keep.forEach(function(t){have[t.title]=1;});
  const add=RESEARCH_TASKS.filter(function(rt){return !have[rt.title];}).map(function(rt,i){return {id:'spt_r'+i,title:rt.title,section:rt.section,sectionIcon:SECTION_ICON[rt.section]||'•',est:rt.est||0,status:'todo',sprint:'backlog',why:rt.why||''};});
  ST.sprintTasks=keep.concat(add); ST.researchLoaded=true; commit();
}
/* one-time refinements after analysis: trim thin pages, add measurement, tag content-blocked, seed Sprint 1 */
function applySeoAdjustments(){
  if(ST.seoAdjV1 || !Array.isArray(ST.sprintTasks))return;
  // 1) trim the 7 thin per-town cost guides (keep the one Bucks County guide) — avoids the 2026 thin-page penalty
  ST.sprintTasks=ST.sprintTasks.filter(function(t){ return !/^Write the .+ window cost guide \/cost\/window-replacement-cost-/.test(t.title); });
  // 2) tag the tasks that are blocked until Sebastian provides content
  ST.sprintTasks.forEach(function(t){ if(t.section==='Town pages'||t.section==='Blogs') t.needs='content'; });
  // 3) add the measurement foundation (Month-1 per the doc)
  var meas=[
    {title:'Set up rank tracking + baseline all Tier 1/2 keywords (BrightLocal / Local Falcon)',section:'Technical',est:2,why:'Prove movement — the doc says baseline in Month 1'},
    {title:'Verify Google Search Console + GA4 and submit the sitemap',section:'Technical',est:1.5,why:'Measurement foundation + indexing'},
    {title:'Baseline the current map-pack + organic positions for the 7 towns',section:'Technical',est:1.5,why:'Know exactly where you started'}
  ];
  var have={}; ST.sprintTasks.forEach(function(t){have[t.title]=1;});
  meas.forEach(function(m,i){ if(!have[m.title]) ST.sprintTasks.push({id:'spt_m'+i,title:m.title,section:m.section,sectionIcon:SECTION_ICON[m.section]||'🔧',est:m.est,status:'todo',sprint:'backlog',why:m.why}); });
  // 4) pre-build a suggested Sprint 1 = the fast high-ROI wins (GBP + Philly fix + baseline)
  if(!(Array.isArray(ST.sprints)&&ST.sprints.length)){
    var s=addSprint(); s.name='Sprint 1 — Foundation';
    ST.sprintTasks.forEach(function(t){
      if(t.section==='Google Business Profile' || /Philadelphia/i.test(t.title) || /rank tracking|Search Console|map-pack/i.test(t.title)) t.sprint=s.id;
    });
  }
  ST.seoAdjV1=true; commit();
}
function seoBlogs(){ if(!Array.isArray(ST.blogs))ST.blogs=[]; return ST.blogs; }
function seoPB(){ if(!ST.pb||typeof ST.pb!=='object')ST.pb={}; return ST.pb; }
function seoPbStep(id){ const pb=seoPB(); if(!pb[id]||typeof pb[id]!=='object')pb[id]={tasks:{},note:''}; if(!pb[id].tasks)pb[id].tasks={}; return pb[id]; }
function seoBlogsDone(){ return seoBlogs().filter(b=>b.status==='done').length; }
function seoPbProgress(){ let t=0,d=0; SEO_PLAYBOOK.forEach(s=>{ const st=seoPbStep(s.id); s.tasks.forEach((_,i)=>{t++; if(st.tasks[i])d++;}); }); return t?Math.round(d/t*100):0; }
/* the build-side view (Bogdan = editor): receives briefs + works the plan, doesn't author content.
   owner can preview a teammate via the top-bar dropdown. */
function seoIsBuilder(){ const me=curUser(); const eff=(me&&me.perm==='owner')?userById(S.role):me; return !!(eff&&eff.perm==='editor'); }
/* ===== 90-day PROVIDE PLAN: what Sebastian owes Bogdan, by month, with soft due dates + rollover ===== */
const SEO_PLAN=[
 {m:1,title:'Month 1 — Foundation',goal:'Lock the basics and your first two towns so Google starts trusting the site.',
  items:[
   {id:'photos1',type:'media',label:'A first batch of job photos',why:'Bogdan uses these on the Google profile, service + town pages',target:8,day:10},
   {id:'town_Langhorne',type:'town',town:'Langhorne',label:'Langhorne local details',why:'Builds a real Langhorne town page (not templated)',day:12},
   {id:'town_Newtown',type:'town',town:'Newtown',label:'Newtown local details',why:'Builds the Newtown town page',day:24},
   {id:'blogs1',type:'blog',label:'3 blog briefs',why:'Your first 3 local blog posts',target:3,day:26}
  ]},
 {m:2,title:'Month 2 — Expand the map',goal:'More town pages live and the blog engine running.',
  items:[
   {id:'town_Yardley',type:'town',town:'Yardley',label:'Yardley local details',why:'Builds the Yardley town page',day:38},
   {id:'photos2',type:'media',label:'More job photos',why:'Fresh photos for the new pages',target:16,day:42},
   {id:'town_LowerMakefield',type:'town',town:'Lower Makefield',label:'Lower Makefield local details',why:'Builds the Lower Makefield page',day:48},
   {id:'town_Richboro',type:'town',town:'Richboro',label:'Richboro local details',why:'Builds the Richboro page',day:55},
   {id:'blogs2',type:'blog',label:'4 more blog briefs (7 total)',why:'Keep the blog cadence going',target:7,day:58}
  ]},
 {m:3,title:'Month 3 — Authority + reviews',goal:'Finish the towns and push reviews + local links.',
  items:[
   {id:'town_Holland',type:'town',town:'Holland',label:'Holland local details',why:'Builds the Holland page',day:70},
   {id:'town_Feasterville',type:'town',town:'Feasterville',label:'Feasterville local details',why:'Builds the Feasterville page',day:80},
   {id:'blogs3',type:'blog',label:'5 more blog briefs (12 total)',why:'Hit the 12-blog target',target:12,day:86}
  ]}
];
function seoStart(){ if(!ST.seoStart){ST.seoStart=Date.now();commit();} return ST.seoStart; }
function seoDueTs(it){ const o=(ST.dueOverride&&ST.dueOverride[it.id])||0; return o||(seoStart()+(it.day||30)*86400000); }
function fmtShort(ts){ try{return new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric'});}catch(e){return '';} }
function seoTownFacts(){ if(!ST.townFacts||typeof ST.townFacts!=='object')ST.townFacts={}; return ST.townFacts; }
/* a town's details now hold text + photos + links (migrates an old plain-string value) */
function townFact(town){ const all=seoTownFacts(); let t=all[town]; if(typeof t==='string')t={text:t}; if(!t||typeof t!=='object')t={}; ['text','neighborhoods','housing','story'].forEach(function(k){ if(typeof t[k]!=='string')t[k]=''; }); if(!Array.isArray(t.media))t.media=[]; if(!Array.isArray(t.links))t.links=[]; all[town]=t; return t; }
function townProvided(town){ const t=townFact(town); return !!(t.neighborhoods.trim()||t.housing.trim()||t.story.trim()||t.text.trim()||t.media.length); }
function seoMediaPool(){ if(!Array.isArray(ST.seoMedia))ST.seoMedia=[]; return ST.seoMedia; }
function seoAllItems(){ return SEO_PLAN.reduce((a,mo)=>a.concat(mo.items.map(it=>Object.assign({month:mo.m},it))),[]); }
function seoItemProvided(it){
  if(it.type==='town') return townProvided(it.town);
  if(it.type==='media') return seoMediaPool().length >= (it.target||1);
  if(it.type==='blog') return seoBlogs().length >= (it.target||1);
  return false;
}
function seoItemProgress(it){ if(it.type==='media')return {have:seoMediaPool().length,need:it.target}; if(it.type==='blog')return {have:seoBlogs().length,need:it.target}; return null; }
function seoItemOverdue(it){ return !seoItemProvided(it) && Date.now() > seoDueTs(it); }
/* per-SECTION deadlines for the playbook (Bogdan works section by section, not task by task) */
const SEO_STEP_DUE={gbp:14,pages:28,towns:55,blogs:75,citations:80,reviews:85,links:90};
function seoStepDueTs(id){ const o=(ST.pbDue&&ST.pbDue[id])||0; return o||(seoStart()+(SEO_STEP_DUE[id]||60)*86400000); }
function seoStepDone(step){ const st=seoPbStep(step.id); return step.tasks.every((_,i)=>st.tasks[i]); }
function seoStepOverdue(step){ return !seoStepDone(step) && Date.now()>seoStepDueTs(step.id); }
function seoStepRolled(id){ return !!(ST.pbRolled&&ST.pbRolled[id]); }
function rolloverStep(id){ openDateModal('New deadline for this section',seoStepDueTs(id),function(ms){ if(!ST.pbDue)ST.pbDue={}; ST.pbDue[id]=ms; if(!ST.pbRolled)ST.pbRolled={}; ST.pbRolled[id]=true; commit(); }); }
/* collapsible section shell for the Build Queue (all start collapsed) */
function seoAccordion(icon,title,sub,open,fill){
  const d=el('details','card seoacc'); if(open)d.open=true;
  const s=el('summary','seoacc-sum');s.innerHTML=`<div class="chip" style="background:var(--blue-soft)">${icon}</div><div class="seoacc-tt"><h3>${esc(title)}</h3><small>${esc(sub)}</small></div><span class="seoacc-ar">▾</span>`;
  d.appendChild(s);const body=el('div','seoacc-body');try{fill(body);}catch(e){}d.appendChild(body);return d;
}
/* the 7 plan sections — each its own deadline + roll-over — rendered into a container */
function seoPlaybookFill(box){
  SEO_PLAYBOOK.forEach(step=>{
    const st=seoPbStep(step.id);
    const doneN=()=>step.tasks.filter((_,i)=>st.tasks[i]).length;
    const allDone=()=>doneN()===step.tasks.length;
    const dueChip=()=>{ if(allDone())return '<span class="pst posted">✅ done</span>'; return Date.now()>seoStepDueTs(step.id)?'<span class="pst" style="background:#fde7e7;color:#cf3b3b">⚠ overdue</span>':`<span class="pst draft">⏳ ${fmtShort(seoStepDueTs(step.id))}</span>`; };
    const d=el('details','jobgroup');
    const summ=el('summary','jobsum');
    const refresh=()=>{summ.innerHTML=`${step.icon} ${esc(step.title)} · ${doneN()}/${step.tasks.length} ${dueChip()}${seoStepRolled(step.id)?' <span class="cb wait" style="margin-left:4px">↻ rolled</span>':''}`;};
    refresh();d.appendChild(summ);
    const body=el('div');body.style.cssText='padding:2px 10px 12px';
    body.appendChild(el('div','muted',esc(step.sub))).style.cssText='font-size:12.5px;margin:0 0 8px';
    step.tasks.forEach((t,i)=>{ const row=el('label','seochk'+(st.tasks[i]?' on':''));const cb=el('input');cb.type='checkbox';cb.checked=!!st.tasks[i];cb.onchange=()=>{st.tasks[i]=cb.checked;row.classList.toggle('on',cb.checked);commit();refresh();};row.appendChild(cb);row.appendChild(el('span','',esc(t)));body.appendChild(row); });
    const dl=el('div');dl.style.cssText='display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap';
    const dtxt=el('span','muted','Section deadline: '+fmtShort(seoStepDueTs(step.id)));dtxt.style.fontSize='12.5px';dl.appendChild(dtxt);
    const roll=el('button','btn-set','↻ Roll over — pick new date');roll.onclick=()=>rolloverStep(step.id);dl.appendChild(roll);
    body.appendChild(dl);
    const note=el('textarea','cmp-in');note.rows=2;note.placeholder='Notes / questions for the team…';note.value=st.note||'';note.style.marginTop='8px';note.oninput=()=>{st.note=note.value;};note.onblur=()=>commit();
    body.appendChild(note);d.appendChild(body);box.appendChild(d);
  });
}
function seoBlogsFill(box,builder){
  if(!builder){ const a=el('button','btn-set primary','＋ New blog brief');a.onclick=()=>openBlogEditor(null,true);box.appendChild(a); }
  const blogs=seoBlogs().slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!blogs.length){ box.appendChild(el('p','muted', builder?'No briefs yet — Sebastian hasn’t added one.':'No briefs yet — tap “＋ New blog brief”.')); }
  else { const list=el('div','library');list.style.marginTop='12px';blogs.forEach(b=>list.appendChild(seoBlogCard(b,builder)));box.appendChild(list); }
}
function seoItemRow(it,builder){
  const provided=seoItemProvided(it), overdue=seoItemOverdue(it), prog=seoItemProgress(it);
  const icon=it.type==='town'?'🏘️':it.type==='media'?'📷':'✍️';
  const row=el('div','seoitem'+(provided?' done':overdue?' over':''));
  const stat = provided ? '<span class="pst posted">✅ Provided</span>'
    : overdue ? '<span class="pst" style="background:#fde7e7;color:#cf3b3b">⚠ Rolled over — ASAP</span>'
    : `<span class="pst draft">⏳ Due ${fmtShort(seoDueTs(it))}</span>`;
  const progTxt = prog ? ` <span class="muted" style="font-size:12px">(${Math.min(prog.have,prog.need)}/${prog.need})</span>` : '';
  row.innerHTML=`<div class="si-ic">${icon}</div><div class="si-main"><div class="si-t">${esc(it.label)}${progTxt}</div><div class="si-why">${esc(it.why)}</div></div><div class="si-stat">${stat}</div>`;
  const act=el('button','btn-set'+(provided?'':' primary'));
  if(builder){ act.textContent = provided ? 'Open' : 'Waiting'; if(!provided)act.disabled=true; act.onclick=()=>seoOpenItem(it,true); }
  else { act.textContent = provided ? 'Edit' : (it.type==='blog'?'Add':it.type==='media'?'Upload':'Fill in'); act.onclick=()=>seoOpenItem(it,false); }
  if(!builder && !provided){ const dt=el('button','si-date','📅');dt.title='Change the due date';dt.onclick=()=>openDueEditor(it);row.appendChild(dt); }
  row.appendChild(act);
  return row;
}
/* small themed date editor — used for the plan start date + per-item due dates */
function openDateModal(title,currentMs,onSave,resetLabel,onReset){
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');box.style.maxWidth='360px';
  box.innerHTML=`<div class="cmp-head"><h3>${esc(title)}</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');const f=el('div','cmp-field');f.innerHTML='<label>Date</label>';const di=el('input','cmp-in');di.type='date';
  try{di.value=new Date(currentMs).toISOString().slice(0,10);}catch(e){}
  f.appendChild(di);bd.appendChild(f);
  const foot=el('div','cmp-foot');
  if(onReset){const r=el('button','btn-set',resetLabel||'Reset');r.onclick=()=>{onReset();closeComposer();render();toast('Reset to default');};foot.appendChild(r);}
  const sp=el('div');sp.style.flex='1';foot.appendChild(sp);
  const save=el('button','btn-set primary','Save');save.onclick=()=>{ if(!di.value){toast('Pick a date');return;} const ms=new Date(di.value+'T12:00:00').getTime(); onSave(ms); closeComposer(); render(); toast('Date updated'); };
  foot.appendChild(save);bd.appendChild(foot);
}
function openStartEditor(){ openDateModal('When does the 90-day plan start?',seoStart(),function(ms){ST.seoStart=ms;commit();}); }
function openDueEditor(it){ openDateModal('Due date — '+it.label,seoDueTs(it),function(ms){if(!ST.dueOverride)ST.dueOverride={};ST.dueOverride[it.id]=ms;commit();},'Use default',function(){if(ST.dueOverride)delete ST.dueOverride[it.id];commit();}); }
function seoOpenItem(it,builder){ if(it.type==='town')return openTownFacts(it.town,builder); if(it.type==='media')return openSeoMedia(builder); if(it.type==='blog')return openSeoBlogs(builder); }
function seoMonthCard(mo,builder){
  const card=el('div','card pad');card.style.marginTop='12px';
  const total=mo.items.length, done=mo.items.filter(seoItemProvided).length;
  card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">${mo.m}</div><div><h3>${esc(mo.title)}</h3><small>${esc(mo.goal)}</small></div><span class="pill" style="margin-left:auto">${done}/${total}</span></div>`;
  mo.items.forEach(it=>card.appendChild(seoItemRow(it,builder)));
  return card;
}
function seoBlogsCard(builder){
  const c=el('div','card pad');c.style.marginTop='12px';
  c.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">✍️</div><div><h3>${builder?'Blog briefs to build':'Your blog briefs'}</h3><small>${builder?'Open each for topic, keyword, notes + photos to download.':'Topic + town + keyword + your notes + photos. Bogdan builds from these.'}</small></div></div>`;
  if(!builder){ const a=el('button','btn-set primary','＋ New blog brief');a.onclick=()=>openBlogEditor(null,true);c.appendChild(a); }
  const blogs=seoBlogs().slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!blogs.length){ c.appendChild(el('p','muted', builder?'No briefs yet.':'No briefs yet — tap “＋ New blog brief”.')); }
  else { const list=el('div','library');list.style.marginTop='12px';blogs.forEach(b=>list.appendChild(seoBlogCard(b,builder)));c.appendChild(list); }
  return c;
}
/* ===================== SPRINT BOARD (Asana-style) =====================
   2-week sprints across the 90 days; hour estimates set live in planning.
   Tasks seed from the 7 plan sections (carry over any done state) + add live. */
function seoSprints(){ if(!Array.isArray(ST.sprints))ST.sprints=[]; return ST.sprints; }   // you create these — not pre-populated
function sprintById(id){ return seoSprints().find(s=>s.id===id)||null; }
function addSprint(){ const arr=seoSprints(); const last=arr[arr.length-1]; const start=last?last.end+86400000:seoStart(); const end=start+13*86400000; const s={id:'s_'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),name:'Sprint '+(arr.length+1),start:start,end:end}; arr.push(s); commit(); return s; }
function removeSprint(id){ sprintTasks().forEach(t=>{if(t.sprint===id)t.sprint='backlog';}); ST.sprints=seoSprints().filter(s=>s.id!==id); commit(); }
function editSprint(s){
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');box.style.maxWidth='400px';
  box.innerHTML=`<div class="cmp-head"><h3>Edit sprint</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');const fld=(l)=>{const f=el('div','cmp-field');f.innerHTML='<label>'+l+'</label>';return f;};
  const nf=fld('Name');const ni=el('input','cmp-in');ni.value=s.name||'';ni.oninput=()=>s.name=ni.value;nf.appendChild(ni);bd.appendChild(nf);
  const sf=fld('Start');const si=el('input','cmp-in');si.type='date';try{si.value=new Date(s.start).toISOString().slice(0,10);}catch(e){}si.onchange=()=>{s.start=new Date(si.value+'T12:00:00').getTime();};sf.appendChild(si);bd.appendChild(sf);
  const ef=fld('End');const ei=el('input','cmp-in');ei.type='date';try{ei.value=new Date(s.end).toISOString().slice(0,10);}catch(e){}ei.onchange=()=>{s.end=new Date(ei.value+'T12:00:00').getTime();};ef.appendChild(ei);bd.appendChild(ef);
  const foot=el('div','cmp-foot');const del=el('button','btn-set danger','Delete sprint');del.onclick=()=>{removeSprint(s.id);closeComposer();render();toast('Sprint removed — its tasks went to Backlog');};foot.appendChild(del);
  const sp=el('div');sp.style.flex='1';foot.appendChild(sp);
  const sv=el('button','btn-set primary','Save');sv.onclick=()=>{commit();closeComposer();render();toast('Saved');};foot.appendChild(sv);bd.appendChild(foot);
}
function seedSprintTasks(){ const out=[]; SEO_PLAYBOOK.forEach(step=>{ const pst=(ST.pb&&ST.pb[step.id])||{tasks:{}}; step.tasks.forEach((t,i)=>{ out.push({id:'spt_'+step.id+'_'+i,title:t,section:step.title,sectionIcon:step.icon,est:0,status:(pst.tasks&&pst.tasks[i])?'done':'todo',sprint:'backlog'}); }); }); return out; }
function sprintTasks(){ if(!Array.isArray(ST.sprintTasks)){ ST.sprintTasks=seedSprintTasks(); commit(); } loadResearchOnce(); applySeoAdjustments(); const ids=seoSprints().map(s=>s.id); ST.sprintTasks.forEach(t=>{ if(t.sprint&&t.sprint!=='backlog'&&ids.indexOf(t.sprint)<0)t.sprint='backlog'; }); return ST.sprintTasks; }
function sprintView(){ return ST.sprintView==='board'?'board':'list'; }
function sprintSel(){ const sp=seoSprints(); if(!sp.length)return null; const f=sp.find(s=>s.id===ST.sprintSel); if(f)return f.id; const now=Date.now(); const cur=sp.find(s=>now>=s.start&&now<=s.end); return cur?cur.id:sp[0].id; }
function renderSprintBoard(box){
  const bar=el('div','sprintbar');
  const seg=el('div','seg');[['list','☰ List'],['board','▦ Board']].forEach(([v,l])=>{const b=el('button','seg-b'+(sprintView()===v?' on':''),l);b.onclick=()=>{ST.sprintView=v;commit();render();};seg.appendChild(b);});
  bar.appendChild(seg);
  const ns=el('button','btn-set','＋ New sprint');ns.onclick=()=>{const s=addSprint();ST.sprintSel=s.id;commit();render();};bar.appendChild(ns);
  const add=el('button','btn-set primary','＋ Add task');add.onclick=()=>addSprintTask('backlog');bar.appendChild(add);
  box.appendChild(bar);
  if(sprintView()==='board')renderSprintBoardView(box); else renderSprintListView(box);
}
function renderSprintBoardView(box){
  const sprints=seoSprints();
  if(!sprints.length){ box.appendChild(el('p','muted','No sprints yet — tap “＋ New sprint”, then assign tasks from the List view’s Backlog.')); return; }
  const scope=sprintSel();
  const tabs=el('div','sprinttabs');
  sprints.forEach(s=>{const b=el('button','sprinttab'+(scope===s.id?' on':''),esc(s.name));b.onclick=()=>{ST.sprintSel=s.id;commit();render();};tabs.appendChild(b);});
  box.appendChild(tabs);
  const so=sprintById(scope); const inScope=sprintTasks().filter(t=>t.sprint===scope);
  const hrs=inScope.reduce((s,t)=>s+(+t.est||0),0),dn=inScope.filter(t=>t.status==='done').length;
  box.appendChild(el('div','sprintscope',(so?so.name+' · '+fmtShort(so.start)+'–'+fmtShort(so.end):'')+' · '+inScope.length+' tasks · '+hrs+'h · '+dn+' done'));
  renderSprintCols(box,inScope,scope);
}
function renderSprintListView(box){
  seoSprints().forEach(s=>box.appendChild(sprintAccordion(s,false)));
  box.appendChild(sprintAccordion({id:'backlog',name:'Backlog'},true));
}
function sprintAccordion(g,isBacklog){
  const tasks=sprintTasks().filter(t=>(t.sprint||'backlog')===g.id);
  const hrs=tasks.reduce((s,t)=>s+(+t.est||0),0),dn=tasks.filter(t=>t.status==='done').length;
  const d=el('details','card seoacc'); if((!isBacklog&&g.id===sprintSel())||(isBacklog&&!seoSprints().length))d.open=true;
  const sub=isBacklog?'Unscheduled':fmtShort(g.start)+' – '+fmtShort(g.end);
  const s=el('summary','seoacc-sum');
  s.innerHTML=`<div class="chip" style="background:${isBacklog?'var(--bg)':'var(--blue-soft)'}">${isBacklog?'📋':'🏃'}</div><div class="seoacc-tt"><h3>${esc(g.name)}</h3><small>${sub} · ${tasks.length} task${tasks.length===1?'':'s'} · ${hrs}h · ${dn} done</small></div><span class="seoacc-ar">▾</span>`;
  d.appendChild(s);
  const body=el('div','seoacc-body');
  if(!isBacklog){ const ed=el('button','tbtn','✎ Edit / dates / remove');ed.style.marginBottom='8px';ed.onclick=(e)=>{e.preventDefault();editSprint(g);};body.appendChild(ed); }
  if(!tasks.length)body.appendChild(el('p','muted',isBacklog?'Empty — finished or unassigned tasks live here.':'No tasks yet — add some, or move from Backlog.'));
  else { // group by category into collapsible sub-sections (keeps a big backlog tidy)
    const bySec={}, order=[]; tasks.forEach(t=>{const k=t.section||'Other'; if(!bySec[k]){bySec[k]=[];order.push(k);} bySec[k].push(t);});
    order.forEach(sec=>{ const grp=bySec[sec], gh=grp.reduce((a,t)=>a+(+t.est||0),0), gd=grp.filter(t=>t.status==='done').length;
      const sd=el('details','seosub'); if(!isBacklog)sd.open=true;
      sd.appendChild(el('summary','seosub-sum',`${SECTION_ICON[sec]||'•'} ${esc(sec)} <span class="muted">${grp.length} · ${gh}h${gd?(' · '+gd+' done'):''}</span>`));
      grp.forEach(t=>sd.appendChild(sprintRow(t,true)));
      body.appendChild(sd);
    });
  }
  const a=el('button','tbtn','＋ Add task');a.style.marginTop='6px';a.onclick=(e)=>{e.preventDefault();addSprintTask(g.id);};body.appendChild(a);
  d.appendChild(body);return d;
}
function sprintRow(t,showMove){
  const r=el('div','sprintrow');
  const st=el('button','sprintstat '+t.status,t.status==='done'?'✓':t.status==='doing'?'◐':'○');st.title='Change status';
  st.onclick=(e)=>{e.stopPropagation();t.status=t.status==='todo'?'doing':t.status==='doing'?'done':'todo';commit();render();};
  r.appendChild(st);
  const main=el('div','sprintmain');
  main.appendChild(el('div','sprinttitle'+(t.status==='done'?' done':''),esc(t.title||'(untitled)')));
  if(t.section&&t.section!=='Custom')main.appendChild(el('span','sprinttag',(t.sectionIcon?t.sectionIcon+' ':'')+esc(t.section)));
  if(t.needs==='content')main.appendChild(el('span','needbadge','⏳ needs your content'));
  main.onclick=()=>editSprintTask(t);r.appendChild(main);
  const h=el('input','sprinthr');h.type='number';h.min='0';h.step='0.5';h.value=(t.est||'');h.placeholder='h';h.onchange=()=>{t.est=+h.value||0;commit();render();};r.appendChild(h);
  if(showMove){const sel=el('select','sprintsel');[['backlog','Backlog']].concat(seoSprints().map(s=>[s.id,s.name])).forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;if((t.sprint||'backlog')===v)o.selected=true;sel.appendChild(o)});sel.onchange=()=>{t.sprint=sel.value;commit();render();};r.appendChild(sel);}
  const x=el('button','sprintx','✕');x.onclick=(e)=>{e.stopPropagation();ST.sprintTasks=sprintTasks().filter(z=>z.id!==t.id);commit();render();};r.appendChild(x);
  return r;
}
function renderSprintCols(box,tasks,scope){
  const wrap=el('div','sprintboardcols');
  [['todo','To do'],['doing','In progress'],['done','Done']].forEach(([sid,label])=>{
    const ct=tasks.filter(t=>t.status===sid);
    const col=el('div','sprintcol');col.dataset.status=sid;
    col.appendChild(el('div','sprintcol-h',`${esc(label)} <span class="muted">${ct.length}</span>`));
    ct.forEach(t=>col.appendChild(sprintCard(t,scope)));
    col.ondragover=e=>{e.preventDefault();col.classList.add('dragover');};
    col.ondragleave=()=>col.classList.remove('dragover');
    col.ondrop=e=>{e.preventDefault();col.classList.remove('dragover');const id=e.dataTransfer.getData('text/plain');const tk=sprintTasks().find(z=>z.id===id);if(tk&&tk.status!==sid){tk.status=sid;commit();render();}};
    wrap.appendChild(col);
  });
  box.appendChild(wrap);
}
function sprintCard(t,scope){
  const c=el('div','sprintcard');c.draggable=true;
  c.ondragstart=e=>{e.dataTransfer.setData('text/plain',t.id);c.classList.add('dragging');};
  c.ondragend=()=>c.classList.remove('dragging');
  const meta=[]; if(t.est)meta.push('<span class="sc-hr">'+t.est+'h</span>'); if(scope==='all'||scope==='backlog'){meta.push('<span class="sc-sprint">'+esc((sprintById(t.sprint)||{}).name||'Backlog')+'</span>');}
  c.innerHTML=`<div class="sc-t">${esc(t.title||'(untitled)')}</div>${t.needs==='content'?'<div class="needbadge" style="margin-top:5px">⏳ needs your content</div>':''}${meta.length?('<div class="sc-meta">'+meta.join('')+'</div>'):''}`;
  c.onclick=()=>editSprintTask(t);
  return c;
}
function addSprintTask(sprint){ editSprintTask({id:'spt_'+Date.now().toString(36)+Math.random().toString(36).slice(2,4),title:'',section:'Custom',sectionIcon:'•',est:0,status:'todo',sprint:sprint||'backlog'},true); }
function editSprintTask(t,isNew){
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');box.style.maxWidth='430px';
  box.innerHTML=`<div class="cmp-head"><h3>${isNew?'New task':'Edit task'}</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');const fld=(lab)=>{const f=el('div','cmp-field');f.innerHTML='<label>'+lab+'</label>';return f;};
  const tf=fld('Task');const ti=el('input','cmp-in');ti.value=t.title||'';ti.placeholder='What needs doing';ti.oninput=()=>t.title=ti.value;tf.appendChild(ti);bd.appendChild(tf);
  const sf=fld('Section');const ss=el('select','cmp-in');['Custom'].concat(SEO_PLAYBOOK.map(s=>s.title)).forEach(name=>{const o=document.createElement('option');o.value=name;o.textContent=name;if((t.section||'Custom')===name)o.selected=true;ss.appendChild(o)});ss.onchange=()=>{t.section=ss.value;const m=SEO_PLAYBOOK.find(s=>s.title===ss.value);t.sectionIcon=m?m.icon:'•';};sf.appendChild(ss);bd.appendChild(sf);
  const hf=fld('Estimate (hours) — set this live in planning');const hi=el('input','cmp-in');hi.type='number';hi.min='0';hi.step='0.5';hi.value=(t.est||'');hi.oninput=()=>t.est=+hi.value||0;hf.appendChild(hi);bd.appendChild(hf);
  const stf=fld('Status');const sts=el('select','cmp-in');[['todo','To do'],['doing','In progress'],['done','Done']].forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;if((t.status||'todo')===v)o.selected=true;sts.appendChild(o)});sts.onchange=()=>t.status=sts.value;stf.appendChild(sts);bd.appendChild(stf);
  const spf=fld('Sprint');const sps=el('select','cmp-in');[['backlog','Backlog']].concat(seoSprints().map(s=>[s.id,s.name+' ('+fmtShort(s.start)+'–'+fmtShort(s.end)+')'])).forEach(([v,l])=>{const o=document.createElement('option');o.value=v;o.textContent=l;if((t.sprint||'backlog')===v)o.selected=true;sps.appendChild(o)});sps.onchange=()=>t.sprint=sps.value;spf.appendChild(sps);bd.appendChild(spf);
  const foot=el('div','cmp-foot');
  if(!isNew){const del=el('button','btn-set danger','Delete');del.onclick=()=>{ST.sprintTasks=sprintTasks().filter(z=>z.id!==t.id);commit();closeComposer();render();toast('Task deleted');};foot.appendChild(del);}
  const sp2=el('div');sp2.style.flex='1';foot.appendChild(sp2);
  const save=el('button','btn-set primary','Save');save.onclick=()=>{ if(!(t.title||'').trim()){toast('Add a task name');return;} if(isNew)sprintTasks().push(t); commit(); closeComposer(); render(); toast(isNew?'Task added':'Saved'); };
  foot.appendChild(save);bd.appendChild(foot);
}
function viewSeoDashboard(v){ if(!Array.isArray(ST.blogs))ST.blogs=[]; return seoIsBuilder()?viewSeoBuilder(v):viewSeoProvider(v); }
function viewSeoProvider(v){
  v.appendChild(el('div','page-head',`<h2>What to give Bogdan</h2><p>Each month, provide these so Bogdan never waits. Fill it in or upload right here — he gets it instantly. Anything past its date is flagged so you know to send it ASAP.</p>`));
  const sMs=seoStart();const startRow=el('div','seostart');startRow.innerHTML=`<span>📅 90-day plan starts <b style="color:var(--ink)">${fmtShort(sMs)}, ${new Date(sMs).getFullYear()}</b></span>`;const chg=el('button','tbtn','Change');chg.onclick=()=>openStartEditor();startRow.appendChild(chg);v.appendChild(startRow);
  v.appendChild(seoAccordion('💡','Tips — content that actually ranks','Quick rules of thumb for whoever provides blogs, photos + town details',false,function(box){
    box.innerHTML=`<ol class="seotips">
      <li><b>Name the town + a real local detail</b> (a neighborhood, landmark, school). "Langhorne, near Flowers Mill" beats "your area." Generic = invisible.</li>
      <li><b>Real photos only</b> — your actual before/afters + crew, never stock.</li>
      <li><b>One real customer story per town</b> — first name, the problem, the result. The EEAT moat competitors can’t fake.</li>
      <li><b>Name the product + town in your notes</b> ("Okna, Langhorne colonial") — Bogdan weaves it into the page.</li>
      <li><b>Reviews: ask same-day</b>, and coach the customer to mention the <b>town + "Okna" + one detail</b> — Google reads the words, not just the stars.</li>
      <li><b>Provide a town’s details + photos BEFORE its sprint</b> — Bogdan can’t build what he doesn’t have. Speed of providing = speed of ranking.</li>
      <li><b>Deep beats thin</b> — one rich, true page per town beats five generic ones (Google now penalizes thin pages).</li>
    </ol>`;
  }));
  const over=seoAllItems().filter(seoItemOverdue);
  if(over.length){ const b=el('div','card pad');b.style.cssText='margin-bottom:4px;border-left:4px solid var(--red)';b.innerHTML=`<b style="color:var(--red)">⚠ ${over.length} item${over.length>1?'s':''} overdue</b> <span class="muted" style="font-size:13px">— Bogdan is waiting. Get ${over.length>1?'these':'this'} to him ASAP (marked “Rolled over” below).</span>`;v.appendChild(b); }
  SEO_PLAN.forEach(mo=>v.appendChild(seoMonthCard(mo,false)));
  v.appendChild(seoBlogsCard(false));
  v.appendChild(seoAccordion('🏃','Sprint plan','Plan the 2-week sprints + set hour estimates with Bogdan — live in your call',false,renderSprintBoard));
}
function viewSeoBuilder(v){
  v.appendChild(el('div','page-head',`<h2>Your Build Queue</h2><p>Your sprints are up top — work the board. The content Sebastian's provided is in the sections below.</p>`));
  const items=seoAllItems();
  const waiting=items.filter(it=>!seoItemProvided(it));
  const ready=items.filter(seoItemProvided);
  // sprint board — primary work surface (open)
  const sb=el('div','card pad');
  sb.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🏃</div><div><h3>Sprints</h3><small>2-week sprints. Estimates set live in planning; move tasks as you build.</small></div></div>`;
  renderSprintBoard(sb); v.appendChild(sb);
  v.appendChild(seoAccordion('✅','Ready to build',(ready.length||'No')+' item'+(ready.length===1?'':'s')+' provided — open to use + download',false,function(box){ if(!ready.length){box.appendChild(el('p','muted','Nothing provided yet.'));return;} ready.forEach(it=>box.appendChild(seoItemRow(it,true))); }));
  v.appendChild(seoAccordion('✍️','Blog briefs to build',seoBlogs().length+' brief'+(seoBlogs().length===1?'':'s'),false,function(box){ seoBlogsFill(box,true); }));
  v.appendChild(seoAccordion('⏳','Waiting on Sebastian',(waiting.length||'No')+' item'+(waiting.length===1?'':'s')+' still coming',false,function(box){ if(!waiting.length){box.appendChild(el('p','muted','Nothing outstanding — you have everything.'));return;} waiting.forEach(it=>box.appendChild(seoItemRow(it,true))); }));
}
function viewSeoProgress(v){
  v.appendChild(el('div','page-head',`<h2>Progress</h2><p>${esc(SEO_TARGET)}</p>`));
  const blogs=seoBlogsDone(), pb=seoPbProgress();
  const towns=SOC_TOWNS.filter(townProvided).length;
  const photos=seoMediaPool().length;
  const grid=el('div','grid cols-3');grid.style.marginTop='4px';
  const stat=(n,of,lab)=>{const c=el('div','card pad kpi');c.innerHTML=`<div class="eyebrow" style="color:var(--faint)">${lab}</div><div style="margin:4px 0 8px"><b class="num">${n}</b>${of?` <span class="of">/ ${of}</span>`:''}</div>`;return c;};
  grid.appendChild(stat(blogs,12,'Blogs published'));grid.appendChild(stat(towns,7,'Town details provided'));grid.appendChild(stat(photos,'','Job photos provided'));
  v.appendChild(grid);
  const pbc=el('div','card pad');pbc.style.marginTop='16px';pbc.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🗺️</div><div><h3>Playbook ${pb}% complete</h3><small>Across all 7 build steps.</small></div></div><div class="bar green" style="margin-top:6px"><i style="width:${pb}%"></i></div>`;v.appendChild(pbc);
  // sprint summary (you + Bogdan both track these)
  const dlc=el('div','card pad');dlc.style.marginTop='16px';
  dlc.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">🏃</div><div><h3>Sprints</h3><small>Each 2-week sprint, its hours + how far along.</small></div></div>`;
  const allT=sprintTasks();
  seoSprints().concat([{id:'backlog',name:'Backlog'}]).forEach(s=>{ const ts=allT.filter(t=>(t.sprint||'backlog')===s.id); if(!ts.length&&s.id==='backlog')return; const hrs=ts.reduce((a,t)=>a+(+t.est||0),0),dn=ts.filter(t=>t.status==='done').length,pct=ts.length?Math.round(dn/ts.length*100):0; const r=el('div','seoitem');
    r.innerHTML=`<div class="si-ic">🏃</div><div class="si-main"><div class="si-t">${esc(s.name)}${s.id!=='backlog'?` <span class="muted" style="font-weight:500;font-size:12px">${fmtShort(s.start)}–${fmtShort(s.end)}</span>`:''}</div><div class="si-why">${ts.length} task${ts.length===1?'':'s'} · ${hrs}h · ${dn}/${ts.length} done</div></div><div class="si-stat"><span class="pst ${(pct===100&&ts.length)?'posted':'draft'}">${pct}%</span></div>`;
    dlc.appendChild(r); });
  v.appendChild(dlc);
  const over=seoAllItems().filter(seoItemOverdue);
  const ob=el('div','card pad');ob.style.marginTop='16px';
  ob.innerHTML=`<div class="sec-title"><div class="chip" style="background:${over.length?'#fde7e7':'var(--green-soft)'}">${over.length?'⚠':'✅'}</div><div><h3>${over.length?over.length+' item(s) overdue':'Nothing overdue'}</h3><small>${over.length?'Provide these to Bogdan ASAP.':'You’re on schedule — nice.'}</small></div></div>`;
  over.forEach(it=>{const r=el('div','muted','• '+esc(it.label));r.style.cssText='font-size:13px;margin:2px 0';ob.appendChild(r);});
  v.appendChild(ob);
}
function openTownFacts(town,builder){
  closeComposer();
  const tf=townFact(town);
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>${esc(town)} — local details</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');
  if(builder){
    const ro=(lab,val)=>{const f=el('div','cmp-field');f.innerHTML='<label>'+lab+'</label>';f.appendChild(el('div','robox',esc(val||'— not provided yet —')));bd.appendChild(f);};
    ro('Neighborhoods & landmarks',tf.neighborhoods);
    ro('Housing stock + common problem',tf.housing);
    ro('Real customer story (name · problem · result)',tf.story);
    if(tf.text&&tf.text.trim())ro('Other notes',tf.text);
    if(tf.media.length){const pf=el('div','cmp-field');pf.innerHTML='<label>Photos — tap to download</label>';const g=el('div','medgrid');tf.media.forEach(m=>{const cell=el('div','medcell');cell.style.cursor='pointer';const img=el('img','medthumb');thumbInto(img,m.id);cell.appendChild(img);cell.appendChild(el('span','meddl','⬇'));cell.onclick=async()=>{const c=await cloudFileGet(m.id);if(c&&c.dataUrl){const a=document.createElement('a');a.href=c.dataUrl;a.download=c.name||'photo.webp';a.click();}};g.appendChild(cell);});pf.appendChild(g);bd.appendChild(pf);}
    if(tf.links.length){const lf=el('div','cmp-field');lf.innerHTML='<label>Links</label>';tf.links.forEach(l=>{const a=el('a','',esc(l.url));a.href=l.url;a.target='_blank';a.style.cssText='display:block;font-size:12.5px;margin:2px 0;color:var(--orange)';lf.appendChild(a);});bd.appendChild(lf);}
    return;
  }
  bd.appendChild(el('div','muted',`These are the ingredients of a deep ${esc(town)} page that competitors can’t copy. Real + specific beats long.`)).style.cssText='font-size:12.5px;margin-bottom:8px';
  const gf=(lab,hint,key,rows)=>{const f=el('div','cmp-field');f.innerHTML='<label>'+lab+(hint?' <span class="muted" style="font-weight:600">— '+hint+'</span>':'')+'</label>';const ta=el('textarea','cmp-in');ta.rows=rows||2;ta.value=tf[key]||'';ta.oninput=()=>tf[key]=ta.value;f.appendChild(ta);bd.appendChild(f);return ta;};
  gf('Neighborhoods & landmarks','name 2–3 real ones',`neighborhoods`,2).placeholder='e.g. Flowers Mill, Oxford Valley, near Core Creek Park';
  gf('Housing stock + the common problem','what the homes are like + what’s failing',`housing`,2).placeholder='e.g. lots of 1980s colonials with original drafty/fogging double-hungs';
  gf('ONE real customer story','first name · their problem · the result (your EEAT moat)',`story`,3).placeholder='e.g. The Riccis on Maple Ave — drafty 30-yr-old windows, freezing dining room. Installed 12 Okna double-hungs in a day; their Jan heating bill dropped noticeably.';
  // photos
  const pf=el('div','cmp-field');pf.innerHTML='<label>Photos <span class="muted" style="font-weight:600">— optional: a couple street/job shots from this town</span></label>';const media=el('div','mediabox');
  const drawM=()=>{ media.innerHTML='';const g=el('div','medgrid');
    tf.media.forEach((m,i)=>{const cell=el('div','medcell');const img=el('img','medthumb');thumbInto(img,m.id);const x=el('button','medx','✕');x.onclick=()=>{try{hfDel(m.id)}catch(_){}tf.media.splice(i,1);drawM();};cell.appendChild(img);cell.appendChild(x);g.appendChild(cell);});
    const drop=el('label','meddrop'+(tf.media.length?' small':''),tf.media.length?'＋ Add more':'📷 Add photos');const inp=el('input');inp.type='file';inp.accept='image/*,.heic,.heif';inp.multiple=true;inp.className='hidden';
    inp.onchange=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;if(files.some(isHeic))toast('Preparing…');for(const fl of files){try{const ref=await hfAdd('town_'+town,fl);tf.media.push(ref);}catch(_){}}drawM();};
    drop.appendChild(inp);g.appendChild(drop);media.appendChild(g); };
  drawM();pf.appendChild(media);bd.appendChild(pf);
  // optional links
  const lf=el('div','cmp-field');lf.innerHTML='<label>Links <span class="muted" style="font-weight:600">— optional</span></label>';const lwrap=el('div');const drawL=()=>{lwrap.innerHTML='';tf.links.forEach((l,i)=>{const row=el('div');row.style.cssText='display:flex;gap:8px;align-items:center;margin:4px 0';row.innerHTML='<a href="'+esc(l.url)+'" target="_blank" style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(l.url)+'</a>';const x=el('button','tbtn','✕');x.onclick=()=>{tf.links.splice(i,1);drawL();};row.appendChild(x);lwrap.appendChild(row);});};drawL();
  const lrow=el('div');lrow.style.cssText='display:flex;gap:8px;margin-top:4px';const li=el('input','cmp-in');li.placeholder='https://…';const lb=el('button','btn-set','Add');lb.onclick=()=>{const u=li.value.trim();if(!u)return;if(!/^https?:\/\//.test(u)){toast('Start with http');return;}tf.links.push({url:u});li.value='';drawL();};lrow.appendChild(li);lrow.appendChild(lb);
  lf.appendChild(lwrap);lf.appendChild(lrow);bd.appendChild(lf);
  const foot=el('div','cmp-foot');const sp=el('div');sp.style.flex='1';foot.appendChild(sp);
  const save=el('button','btn-set primary','Save details');save.onclick=()=>{commit();closeComposer();render();toast(townProvided(town)?'Saved — Bogdan has it':'Saved');};
  foot.appendChild(save);bd.appendChild(foot);
}
function openSeoMedia(builder){
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>Job photos for Bogdan</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');
  if(!builder){const h=el('div','muted','General job photos Bogdan can reuse on any page or your Google profile. Tap a photo to tag it (town + before/after + a line of alt text); tick a few and turn them into a blog brief.');h.style.cssText='font-size:12.5px;margin-bottom:8px';bd.appendChild(h);}
  const sel=new Set();
  const f=el('div','cmp-field');f.innerHTML='<label>'+(builder?'Photos Sebastian uploaded — tap to download':'Your job photos — tap to tag')+'</label>';
  const grid=el('div','medgrid');f.appendChild(grid);bd.appendChild(f);
  const makeBtn=el('button','btn-set primary','＋ Make a blog brief from selected');makeBtn.style.cssText='margin-top:10px;display:none';
  const updateMake=()=>{makeBtn.style.display=sel.size?'inline-flex':'none';makeBtn.textContent='＋ Make a blog brief from '+sel.size+' selected';};
  makeBtn.onclick=()=>{ const picks=seoMediaPool().filter(m=>sel.has(m.id)); if(!picks.length)return; const town=(picks.find(p=>p.town)||{}).town||SOC_TOWNS[0]; const desc=picks.map(p=>p.desc).filter(Boolean).join('; '); openBlogEditor({media:picks.map(p=>({id:p.id,name:p.name})),town:town,notes:desc?('Photos show: '+desc):''},true); };
  const draw=()=>{ grid.innerHTML='';
    seoMediaPool().forEach((m)=>{const cell=el('div','medcell'+(sel.has(m.id)?' sel':''));const img=el('img','medthumb');thumbInto(img,m.id);cell.appendChild(img);
      if(m.role||m.town){const tags=el('div','medtags');if(m.role)tags.appendChild(el('span','medtag '+m.role,m.role==='before'?'BEFORE':'AFTER'));if(m.town)tags.appendChild(el('span','medtag',esc(m.town)));cell.appendChild(tags);}
      if(builder){cell.style.cursor='pointer';cell.title='Download';cell.appendChild(el('span','meddl','⬇'));cell.onclick=async()=>{const c=await cloudFileGet(m.id);if(c&&c.dataUrl){const a=document.createElement('a');a.href=c.dataUrl;a.download=c.name||m.name||'photo.webp';a.click();toast('Downloading');}else toast('Photo not ready yet');};}
      else{
        const ck=el('span','medselck','✓');ck.onclick=(e)=>{e.stopPropagation();if(sel.has(m.id))sel.delete(m.id);else sel.add(m.id);cell.classList.toggle('sel');updateMake();};cell.appendChild(ck);
        const x=el('button','medx','✕');x.onclick=(e)=>{e.stopPropagation();try{hfDel(m.id)}catch(_){}sel.delete(m.id);const idx=seoMediaPool().findIndex(p=>p.id===m.id);if(idx>=0)seoMediaPool().splice(idx,1);commit();draw();updateMake();};cell.appendChild(x);
        cell.style.cursor='pointer';cell.title='Tap to tag';cell.onclick=()=>openPhotoTags([m]);
      }
      grid.appendChild(cell);});
    if(!builder){const drop=el('label','meddrop'+(seoMediaPool().length?' small':''),seoMediaPool().length?'＋ Add more':'📷 Upload job photos');const inp=el('input');inp.type='file';inp.accept='image/*,.heic,.heif';inp.multiple=true;inp.className='hidden';
      inp.onchange=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;if(files.some(isHeic))toast('Preparing…');const added=[];for(const fl of files){try{const ref=await hfAdd('seomedia',fl);ref.town='';ref.role='';ref.desc='';seoMediaPool().push(ref);added.push(ref);}catch(_){}}commit();draw();if(added.length)openPhotoTags(added);};
      drop.appendChild(inp);grid.appendChild(drop);} };
  draw();
  if(!builder)bd.appendChild(makeBtn);
}
/* tag newly-added (or tapped) photos: town + before/after + a one-line description (= alt text for Bogdan) */
function openPhotoTags(refs){
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>Tag ${refs.length} photo${refs.length>1?'s':''}</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');
  const hint=el('div','muted','Tag each so Bogdan knows the town, whether it’s a before or after, and gets ready-made alt text.');hint.style.cssText='font-size:12.5px;margin-bottom:8px';bd.appendChild(hint);
  refs.forEach(m=>{
    const card=el('div','tagrow');
    const img=el('img','tagthumb');thumbInto(img,m.id);card.appendChild(img);
    const fields=el('div','tagfields');
    const ts=el('select','cmp-in');[['','(no town)']].concat(SOC_TOWNS.map(t=>[t,t])).forEach(([val,lab])=>{const o=document.createElement('option');o.value=val;o.textContent=lab;if((m.town||'')===val)o.selected=true;ts.appendChild(o)});ts.onchange=()=>m.town=ts.value;
    const seg=el('div','seg');[['','—'],['before','Before'],['after','After']].forEach(([val,lab])=>{const bb=el('button','seg-b'+((m.role||'')===val?' on':''),lab);bb.onclick=()=>{m.role=val;seg.querySelectorAll('.seg-b').forEach(x=>x.classList.remove('on'));bb.classList.add('on');};seg.appendChild(bb);});
    const di=el('input','cmp-in');di.placeholder='One line: what does this show? (becomes alt text)';di.value=m.desc||'';di.oninput=()=>m.desc=di.value;
    fields.appendChild(ts);fields.appendChild(seg);fields.appendChild(di);card.appendChild(fields);
    bd.appendChild(card);
  });
  const foot=el('div','cmp-foot');const sp=el('div');sp.style.flex='1';foot.appendChild(sp);
  const save=el('button','btn-set primary','Save tags');save.onclick=()=>{commit();closeComposer();render();toast('Tagged — Bogdan has the context');};
  foot.appendChild(save);bd.appendChild(foot);
}
function openSeoBlogs(builder){ if(!builder){ openBlogEditor(null,true); return; } const b=seoBlogs().find(x=>x.status!=='done')||seoBlogs()[0]; if(b)openBlogBuilder(b); else toast('No briefs provided yet'); }
function __seoLegacyUnused(v){
  const builder=seoIsBuilder();
  // ---- THE PLAYBOOK (ordered, check off + note) ----
  const pbCard=el('div','card pad');pbCard.style.marginTop='12px';
  pbCard.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🗺️</div><div><h3>The Plan — do it in order</h3><small>Work top to bottom. Check off as you go; leave notes for the team.</small></div></div>`;
  SEO_PLAYBOOK.forEach(step=>{
    const st=seoPbStep(step.id);
    const doneN=()=>step.tasks.filter((_,i)=>st.tasks[i]).length;
    const d=el('details','jobgroup'); if(step.id==='gbp')d.open=true;
    const summ=el('summary','jobsum',`${step.icon} ${esc(step.title)} · ${doneN()}/${step.tasks.length}`);d.appendChild(summ);
    const body=el('div');body.style.cssText='padding:2px 10px 12px';
    body.appendChild(el('div','muted',esc(step.sub))).style.cssText='font-size:12.5px;margin:0 0 8px';
    step.tasks.forEach((t,i)=>{
      const row=el('label','seochk'+(st.tasks[i]?' on':''));
      const cb=el('input');cb.type='checkbox';cb.checked=!!st.tasks[i];
      cb.onchange=()=>{ st.tasks[i]=cb.checked; row.classList.toggle('on',cb.checked); commit(); summ.textContent=`${step.icon} ${step.title} · ${doneN()}/${step.tasks.length}`; };
      row.appendChild(cb);row.appendChild(el('span','',esc(t)));
      body.appendChild(row);
    });
    const note=el('textarea','cmp-in');note.rows=2;note.placeholder='Notes / questions for the team…';note.value=st.note||'';note.style.marginTop='8px';
    note.oninput=()=>{st.note=note.value;};note.onblur=()=>commit();
    body.appendChild(note);d.appendChild(body);pbCard.appendChild(d);
  });
  v.appendChild(pbCard);
  // ---- CONTENT HAND-OFF (blog briefs) ----
  const handoff=el('div','card pad');handoff.style.marginTop='12px';
  handoff.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">📁</div><div><h3>${builder?'Blog briefs to build':'Blog briefs for the builder'}</h3><small>${builder?'Open each one for the topic, keyword, notes + photos to download. Mark it Building → Done as you go.':'Each blog is a folder: topic, town, keyword, your notes + the photos. Bogdan builds from these.'}</small></div></div>`;
  if(!builder){ const addBtn=el('button','btn-set primary','＋ New blog brief');addBtn.onclick=()=>openBlogEditor(null,true);handoff.appendChild(addBtn); }
  const blogs=seoBlogs().slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  if(!blogs.length){ handoff.appendChild(el('p','muted', builder?'Nothing to build yet — Sebastian hasn’t added a brief.':'No blog briefs yet. Tap “＋ New blog brief” to hand Bogdan his first one.')); }
  else { const list=el('div','library');list.style.marginTop='12px';blogs.forEach(b=>list.appendChild(seoBlogCard(b,builder)));handoff.appendChild(list); }
  v.appendChild(handoff);
}
function seoStatusPill(s){const m={todo:['To do','draft'],building:['Building','approved'],done:['Done','posted']}[s||'todo']||['To do','draft'];return `<span class="pst ${m[1]}">${m[0]}</span>`;}
function seoBlogCard(b,builderMode){
  const card=el('div','postcard');card.style.position='relative';
  const mm=b.media||[];
  card.innerHTML=`<div class="pcimg"><img alt="" style="display:none"><span class="pcph">✍️</span>${mm.length?`<span class="pccount">📎 ${mm.length}</span>`:''}</div>
    <div class="pcbody">
      <div class="pcmeta">${seoStatusPill(b.status)}${b.town?`<span class="pchip">📍 ${esc(b.town)}</span>`:''}</div>
      <div class="pctown" style="font-weight:700;color:var(--ink)">${esc(b.title||'Untitled blog')}</div>
      <div class="pccap">${b.keyword?'🔑 '+esc(b.keyword):'<span class="muted">No keyword yet</span>'}</div>
    </div>`;
  if(mm[0])thumbInto(card.querySelector('img'),mm[0].id);
  if(!builderMode){ const rm=el('button','pcdel','✕');rm.onclick=async(e)=>{e.stopPropagation();const ok=await uiConfirm('This removes the blog brief and its photos.',{title:'Delete this brief?',confirmText:'Delete',danger:true});if(ok){(b.media||[]).forEach(m=>{try{hfDel(m.id)}catch(_){}});ST.blogs=seoBlogs().filter(x=>x.id!==b.id);commit();render();toast('Brief deleted');}};card.appendChild(rm); }
  card.onclick=()=>builderMode?openBlogBuilder(b):openBlogEditor(b,false);
  return card;
}
/* Bogdan's read-and-build view of a brief: read the content, download the photos,
   set status + leave a note back to Sebastian. He doesn't author the brief itself. */
function openBlogBuilder(blog){
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>Build: ${esc(blog.title||'blog')}</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');
  const ro=(label,val)=>{const f=el('div','cmp-field');f.innerHTML='<label>'+label+'</label>';const box2=el('div','robox',esc(val||'—'));f.appendChild(box2);return f;};
  bd.appendChild(ro('Target town',blog.town));
  bd.appendChild(ro('Target keyword',blog.keyword));
  bd.appendChild(ro('Notes from Sebastian',blog.notes));
  if((blog.media||[]).length){
    const pf=el('div','cmp-field');pf.innerHTML='<label>Photos — tap to download</label>';
    const grid=el('div','medgrid');
    (blog.media||[]).forEach(m=>{const cell=el('div','medcell');cell.style.cursor='pointer';cell.title='Download';const img=el('img','medthumb');thumbInto(img,m.id);cell.appendChild(img);cell.appendChild(el('span','meddl','⬇'));
      cell.onclick=async()=>{const c=await cloudFileGet(m.id);if(c&&c.dataUrl){const a=document.createElement('a');a.href=c.dataUrl;a.download=c.name||m.name||'photo.webp';a.click();toast('Downloading '+(m.name||'photo'));}else toast('Photo not ready — try again in a moment');};
      grid.appendChild(cell);});
    pf.appendChild(grid);bd.appendChild(pf);
  }
  if((blog.links||[]).length){ const lf=el('div','cmp-field');lf.innerHTML='<label>Links</label>';(blog.links||[]).forEach(l=>{const a=el('a','',esc(l.url));a.href=l.url;a.target='_blank';a.style.cssText='display:block;font-size:12.5px;margin:2px 0;color:var(--orange)';lf.appendChild(a);});bd.appendChild(lf); }
  const sf=el('div','cmp-field');sf.innerHTML='<label>Status</label>';const ss=el('select','cmp-in');[['todo','To do'],['building','Building'],['done','Done']].forEach(([val,lab])=>{const o=document.createElement('option');o.value=val;o.textContent=lab;if((blog.status||'todo')===val)o.selected=true;ss.appendChild(o)});sf.appendChild(ss);bd.appendChild(sf);
  const bf=el('div','cmp-field');bf.innerHTML='<label>Your note back to Sebastian <span class="muted" style="font-weight:600">— questions / status</span></label>';const bn=el('textarea','cmp-in');bn.rows=2;bn.value=blog.builderNote||'';bf.appendChild(bn);bd.appendChild(bf);
  const foot=el('div','cmp-foot');const sp=el('div');sp.style.flex='1';foot.appendChild(sp);
  const save=el('button','btn-set primary','Save');save.onclick=()=>{const arr=seoBlogs();const i=arr.findIndex(x=>x.id===blog.id);if(i>=0){arr[i].status=ss.value;arr[i].builderNote=bn.value;ST.blogs=arr;commit();}closeComposer();render();toast('Updated');};
  foot.appendChild(save);bd.appendChild(foot);
}
/* scripted "AI" suggestions — proven local-blog titles, keywords + a section outline */
function seoSuggest(b){
  const town=(b.town||'your town'), yr=(new Date()).getFullYear();
  return {
    titles:[`5 signs your ${town} home needs new windows`,`Window replacement in ${town}: what it really costs in ${yr}`,`Before & after: a ${town} window transformation`,`Why ${town} homeowners are upgrading to energy-efficient windows`],
    keywords:[`window replacement ${town}`,`${town} window company`,`energy efficient windows ${town}`,`new windows ${town} cost`],
    outline:[`Local hook — name ${town} + a common local problem (drafty 80s windows, fogging glass).`,`The job — the before/after, the product, how fast it went in.`,`Why it matters for ${town} homes specifically.`,`Simple cost + financing note.`,`Call to action — free in-home estimate + phone number.`]
  };
}
function openBlogEditor(blog,isNew){
  const base={id:'blog_'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),title:'',town:SOC_TOWNS[0],keyword:'',notes:'',links:[],media:[],status:'todo',builderNote:'',createdAt:Date.now()};
  const b = isNew ? Object.assign(base, blog||{}) : Object.assign({},blog);
  if(!Array.isArray(b.media))b.media=[]; if(!Array.isArray(b.links))b.links=[];
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>${isNew?'New blog brief':'Edit blog brief'}</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);ov.onclick=e=>{if(e.target===ov)closeComposer()};$('#cmpX').onclick=closeComposer;
  const bd=$('#cmpBody');
  const field=(label,hint)=>{const f=el('div','cmp-field');f.innerHTML='<label>'+label+(hint?' <span class="muted" style="font-weight:600">— '+hint+'</span>':'')+'</label>';return f;};
  const tf=field('Blog topic / title','what it’s about');const ti=el('input','cmp-in');ti.value=b.title;ti.placeholder='e.g. 5 signs your Langhorne home needs new windows';ti.oninput=()=>b.title=ti.value;tf.appendChild(ti);bd.appendChild(tf);
  const tw=field('Target town');const ts=el('select','cmp-in');SOC_TOWNS.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;if(t===b.town)o.selected=true;ts.appendChild(o)});ts.onchange=()=>b.town=ts.value;tw.appendChild(ts);bd.appendChild(tw);
  const kf=field('Target keyword','what people Google');const ki=el('input','cmp-in');ki.value=b.keyword;ki.placeholder='e.g. window replacement Langhorne';ki.oninput=()=>b.keyword=ki.value;kf.appendChild(ki);
  const chips=el('div');chips.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin-top:6px';
  SEO_KEYWORD_HINTS.forEach(h=>{const kw=h.replace('{town}',b.town||'your town');const c=el('button','sugopt',esc(kw));c.style.cssText='font-size:11.5px;padding:3px 9px';c.onclick=()=>{ki.value=kw;b.keyword=kw;};chips.appendChild(c);});
  kf.appendChild(chips);bd.appendChild(kf);
  const nf=field('Your notes / rough copy','tell Bogdan what to say — bullets are fine');const na=el('textarea','cmp-in');na.rows=4;na.value=b.notes;na.placeholder='e.g. full window job in Langhorne, customer hated the drafts, installed Okna, before/after photos attached…';na.oninput=()=>b.notes=na.value;nf.appendChild(na);bd.appendChild(nf);
  // ✨ Suggest — proven title, keyword + outline (so a thin brief still ranks)
  const sug=el('div','cmp-field');const sugBtn=el('button','btn-set ai-draft','✨ Suggest title, keyword & outline');const sugBox=el('div','sugbox');
  sugBtn.onclick=()=>{ if(sugBox.dataset.open==='1'){sugBox.innerHTML='';sugBox.dataset.open='0';return;} sugBox.dataset.open='1';sugBox.innerHTML='';
    const s=seoSuggest(b);
    const lbl=el('div','muted','Tap a title or keyword to drop it in:');lbl.style.cssText='font-size:12px;margin:4px 0';sugBox.appendChild(lbl);
    s.titles.forEach(t=>{const o=el('button','sugopt',esc(t));o.onclick=()=>{ti.value=t;b.title=t;toast('Title set');};sugBox.appendChild(o);});
    s.keywords.forEach(k=>{const o=el('button','sugopt','🔑 '+esc(k));o.onclick=()=>{ki.value=k;b.keyword=k;toast('Keyword set');};sugBox.appendChild(o);});
    const ob=el('button','sugopt','📝 Insert section outline into notes');ob.onclick=()=>{const ol=s.outline.map((x,i)=>(i+1)+'. '+x).join('\n');na.value=(na.value?na.value+'\n\n':'')+'Outline:\n'+ol;b.notes=na.value;toast('Outline added to notes');};sugBox.appendChild(ob);
  };
  sug.appendChild(sugBtn);sug.appendChild(sugBox);bd.appendChild(sug);
  const pf=field('Photos','before/after + job shots');const media=el('div','mediabox');
  const renderMedia=()=>{ media.innerHTML=''; const grid=el('div','medgrid');
    b.media.forEach((m,i)=>{const cell=el('div','medcell');const img=el('img','medthumb');thumbInto(img,m.id);const x=el('button','medx','✕');x.onclick=()=>{try{hfDel(m.id)}catch(_){}b.media.splice(i,1);renderMedia();};cell.appendChild(img);cell.appendChild(x);grid.appendChild(cell);});
    const drop=el('label','meddrop'+(b.media.length?' small':''),b.media.length?'＋ Add more':'📷 Add photos');const inp=el('input');inp.type='file';inp.accept='image/*,.heic,.heif';inp.multiple=true;inp.className='hidden';
    inp.onchange=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;if(files.some(isHeic))toast('Preparing photos…');for(const f of files){try{const ref=await hfAdd('blog_'+b.id,f);b.media.push(ref);}catch(_){toast('A photo could not be added')}}renderMedia();toast(files.length+' photo'+(files.length>1?'s':'')+' added');};
    drop.appendChild(inp);grid.appendChild(drop);media.appendChild(grid); };
  renderMedia();pf.appendChild(media);bd.appendChild(pf);
  const lf=field('Links to include','optional');const lwrap=el('div');const renderLinks=()=>{lwrap.innerHTML='';(b.links||[]).forEach((l,i)=>{const row=el('div');row.style.cssText='display:flex;gap:8px;align-items:center;margin:4px 0';row.innerHTML='<a href="'+esc(l.url)+'" target="_blank" style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(l.url)+'</a>';const x=el('button','tbtn','✕');x.onclick=()=>{b.links.splice(i,1);renderLinks();};row.appendChild(x);lwrap.appendChild(row);});};renderLinks();
  const lrow=el('div');lrow.style.cssText='display:flex;gap:8px;margin-top:4px';const li=el('input','cmp-in');li.placeholder='https://…';const lb=el('button','btn-set','Add');lb.onclick=()=>{const u=li.value.trim();if(!u)return;if(!/^https?:\/\//.test(u)){toast('Start the link with http');return;}b.links.push({url:u});li.value='';renderLinks();};lrow.appendChild(li);lrow.appendChild(lb);
  lf.appendChild(lwrap);lf.appendChild(lrow);bd.appendChild(lf);
  const sf=field('Status');const ss=el('select','cmp-in');[['todo','To do'],['building','Building'],['done','Done']].forEach(([val,lab])=>{const o=document.createElement('option');o.value=val;o.textContent=lab;if((b.status||'todo')===val)o.selected=true;ss.appendChild(o)});ss.onchange=()=>b.status=ss.value;sf.appendChild(ss);bd.appendChild(sf);
  const bf=field('Builder note (Bogdan)','questions / status back to Sebastian');const bn=el('textarea','cmp-in');bn.rows=2;bn.value=b.builderNote||'';bn.oninput=()=>b.builderNote=bn.value;bf.appendChild(bn);bd.appendChild(bf);
  const foot=el('div','cmp-foot');
  if(!isNew){const del=el('button','btn-set danger','Delete');del.onclick=async()=>{const ok=await uiConfirm('This removes the blog brief and its photos.',{title:'Delete this brief?',confirmText:'Delete',danger:true});if(ok){(b.media||[]).forEach(m=>{try{hfDel(m.id)}catch(_){}});ST.blogs=seoBlogs().filter(x=>x.id!==b.id);commit();closeComposer();render();toast('Brief deleted');}};foot.appendChild(del);}
  const sp=el('div');sp.style.flex='1';foot.appendChild(sp);
  const save=el('button','btn-set primary','Save brief');save.onclick=()=>{ if(!b.title.trim()){toast('Add a topic/title first');return;} const arr=seoBlogs();const i=arr.findIndex(x=>x.id===b.id);if(i>=0)arr[i]=b;else arr.unshift(b);ST.blogs=arr;commit();closeComposer();render();toast(isNew?'Brief added for Bogdan':'Saved'); };
  foot.appendChild(save);bd.appendChild(foot);
}
function viewDashboard(v){
  if(activeProgram()==='social')return viewSocialDashboard(v);
  if(activeProgram()==='seo')return viewSeoDashboard(v);
  const cw=currentWeek();
  if(isContributor()){const cb=el('div','card pad',`<b>👋 You're a Contributor.</b> Send blogs, content, images, videos &amp; links to the Builder by filling the <b>&ldquo;Deliver to&hellip;&rdquo;</b> boxes below. The Builder checks off the SEO work and updates the numbers.`);cb.style.cssText='border-top:3px solid var(--orange);margin-bottom:14px;font-size:13.5px';v.appendChild(cb);}
  const hero=el('div','hero');
  if(cw){
    hero.innerHTML=`<div class="duetag">Due Tue 12pm</div>
      <div class="eyebrow">This week · Week ${cw.id} of 12 · Phase ${cw.phase} · ${esc(PHASES[cw.phase-1].name)}</div>
      <h2>${esc(cw.title)}. <b>Due Tuesday ${fmtDue(cw)}.</b></h2>
      <div class="sub">Everything below is due ${fmtDue(cw)} by 12:00 PM. Monday is the work-ahead day.</div>
      <div class="count" id="count"></div>`;
  }else{
    hero.innerHTML=`<div class="eyebrow">Q3 complete</div><h2>12 weeks done. <b>Time for the Q4 scorecard.</b></h2>
      <div class="sub">Open the Scorecard to compile the 90-day numbers and set Q4 priorities.</div>`;
  }
  v.appendChild(hero);
  if(cw)startCountdown(cw);

  v.appendChild(nudgeCard());

  if(activeProgram()==='social'){const ps=socPostStrip();if(ps)v.appendChild(ps);}

  const gc=glanceCard(); if(gc)v.appendChild(gc);

  const grid=el('div','grid cols-3');grid.style.marginTop='16px';
  const left=el('div','card pad');left.style.gridColumn='span 2';
  left.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">📌</div><div><h3>This week’s deliverables</h3><small>Week ${cw?cw.id:'—'} · one-time tasks for this week (they change each week)${roleNote()}</small></div></div>`;
  if(cw){
    const order=S.role==='all'?ORDER:[S.role,...ORDER.filter(r=>r!==S.role)];
    order.forEach(r=>{const t=taskEl(cw,r);if(t)left.appendChild(t)});
  }else left.innerHTML+='<p class="muted">No active week.</p>';
  grid.appendChild(left);

  const right=el('div','grid');right.style.gap='16px';
  const prog=el('div','card pad');
  const op=overallPct('all');
  prog.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">📈</div><div><h3>Overall progress</h3><small>All roles · 12 weeks</small></div></div>
    <div style="display:flex;align-items:baseline;gap:8px"><b style="font-size:30px;font-weight:800" data-overall-num>${op}%</b><span class="muted">complete</span></div>
    <div class="bar green" style="margin:8px 0 14px"><i data-overall style="width:${op}%"></i></div>
    ${ORDER.map(r=>{const x=roleDone(r);const p=x.t?Math.round(x.d/x.t*100):0;return `<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:3px"><span>${av(r,'av').replace('width:26px;height:26px','')} ${PEOPLE[r].name}</span><span class="muted" data-role-count="${r}">${x.d}/${x.t}</span></div><div class="bar"><i data-role-bar="${r}" style="width:${p}%"></i></div></div>`}).join('')}`;
  prog.querySelectorAll('.av').forEach(a=>{a.style.width='18px';a.style.height='18px';a.style.display='inline-grid';a.style.verticalAlign='middle';a.style.fontSize='10px'});
  right.appendChild(prog);

  const eng=el('div','card pad');
  eng.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">⭐</div><div><h3>Weekly Commitments</h3><small>The same standing commitments every week — do these <b>in addition</b> to the Week ${cw?cw.id:'—'} tasks</small></div></div>`;
  ENGINE.forEach(e=>{const row=el('div','task');row.style.borderTop='1px solid var(--line)';
    row.innerHTML=`${av(e.who,'who-av')}<div class="body"><div class="who-nm">${PEOPLE[e.who].name}</div><div class="txt">${e.txt}</div></div>`;eng.appendChild(row)});
  eng.querySelector('.task').style.borderTop='none';
  right.appendChild(eng);
  grid.appendChild(right);
  v.appendChild(grid);

  const hb=el('div','grid cols-2');hb.style.marginTop='16px';
  const hand=el('div','card pad');
  hand.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">🤝</div><div><h3>Outstanding handoffs</h3><small>Week ${cw?cw.id:'—'}${roleNote()}</small></div></div>`;
  const handHost=el('div');hand.appendChild(handHost);
  renderHandoffs(handHost,null);
  hb.appendChild(hand);
  const bl=blockersCard(); if(bl)hb.appendChild(bl);
  v.appendChild(hb);
  fileList().then(files=>{const fkeys=new Set(files.filter(f=>f.deliv).map(f=>f.deliv)); renderHandoffs(handHost,fkeys);});

  const k=el('div','grid cols-4');k.style.marginTop='16px';
  KPIS.forEach(kp=>{const cur=ST.kpis[kp.id];const p=Math.min(100,Math.round(cur/kp.target*100));
    const pace=kpiPace(kp);
    const paceLine = pace.done ? `<div class="kpace ok">✓ Target hit</div>`
      : pace.onPace ? `<div class="kpace ok">On pace · ~${pace.perWeek}/wk to finish</div>`
      : `<div class="kpace behind">Behind · ~${pace.perWeek}/wk needed (≈${pace.expected} by now)</div>`;
    const c=el('div','card pad kpi');
    c.innerHTML=`<div class="eyebrow" style="color:var(--faint)">${esc(kp.label)}</div>
      <div style="margin:4px 0 8px"><b class="num">${cur}</b> <span class="of">/ ${kp.target}</span></div>
      <div class="bar"><i style="width:${p}%"></i></div>${paceLine}`;
    c.style.cursor='pointer';c.onclick=()=>{location.href=PROG.scorecardFile};
    k.appendChild(c)});
  v.appendChild(k);
}
function nudgeFoot(){return `<div class="nfoot">🔒 Scripted guide for now — a full AI assistant that reads your dashboard and asks smart questions arrives once the backend sync is turned on.</div>`}
function nudgeCard(){
  const card=el('div','card pad nudge');
  const cw=currentWeek();
  if(!cw){
    card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🧭</div><div><h3>Your guide</h3><small>Quarter complete</small></div></div>
      <p class="nq">All 12 weeks are done. Open the <b>Scorecard</b> to compile the 90-day numbers and set Q4 priorities.</p>${nudgeFoot()}`;
    return card;
  }
  const social=activeProgram()==='social';
  const ms=dueDate(cw).getTime()-Date.now();
  const days=Math.floor(ms/864e5);
  let when;
  if(social){const planned=weekPosts(cw.id).length;when=`Week ${cw.id} · <b>${planned}/${SOC_WEEKLY_GOAL}</b> posts planned — any 5 days, just stay consistent.`}
  else if(ms<=0)when='Deadline has passed — close it out today.';
  else if(days<1)when='It’s deadline day — everything’s due by <b>12:00 PM</b>.';
  else if(days<2)when='<b>Tomorrow</b> is the Tuesday 12pm deadline.';
  else when=`<b>${days} days</b> until Tuesday’s 12pm deadline.`;
  const r=S.role; let q,prog='';
  if(social){
    const n=PROG.nudge&&PROG.nudge[r];
    q=(typeof n==='function'?n(cw):n)||`Pick your name (top-right) for your role. Big picture: ${PROG.shipLine}`;
    const runway=socRunway(),streak=socStreak();
    prog=`<div class="nprog"><b>${runway}</b> posts approved &amp; ready${streak>=1?` · <b>${streak}-week</b> streak 🔥`:''}</div>`;
    card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🧭</div><div><h3>Your guide${r!=='all'?` · ${PEOPLE[r].name}`:''}</h3><small>${when}</small></div></div>
      <p class="nq">${q}</p>${prog}${nudgeFoot()}`;
    return card;
  }
  if(r==='all'){
    q=`Pick your name (top-right) to get your own checklist. Big picture: ${PROG.shipLine}`;
  }else if(!cw.roles[r]){
    // logged-in role isn't part of THIS program (e.g. Sebastian viewing a role-light program)
    q=`You don’t have assigned steps in ${PROG.short} this week — switch to “Everyone” to see the full picture, or check the other programs from the Marketing hub.`;
  }else{
    const done=checkedOf(cw,r),tot=stepsOf(cw,r).length;
    prog=tot?`<div class="nprog"><b>${done}/${tot}</b> of your Week ${cw.id} steps checked.</div>`:'';
    if(tot&&done>=tot){
      q=`All your Week ${cw.id} steps are checked — nice. Anything left to hand off to the others in the “Deliver to…” boxes below?`;
    }else{
      const n=PROG.nudge&&PROG.nudge[r];
      q=(typeof n==='function'?n(cw):n)||`What’s the one Week ${cw.id} thing you can move forward right now?`;
    }
  }
  card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🧭</div><div><h3>Your guide${r!=='all'?` · ${PEOPLE[r].name}`:''}</h3><small>${when}</small></div></div>
    <p class="nq">${q}</p>${prog}${nudgeFoot()}`;
  return card;
}
function glanceCard(){
  const cw=currentWeek(); if(!cw)return null;
  const days=Math.floor((dueDate(cw).getTime()-Date.now())/864e5);
  const card=el('div','card pad'); card.style.marginTop='16px';
  card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">📊</div><div><h3>This week at a glance</h3><small>Week ${cw.id} · everyone’s step progress</small></div></div>`;
  const wrap=el('div','glance');
  ORDER.forEach(r=>{
    const tot=stepsOf(cw,r).length, done=checkedOf(cw,r), left=tot-done;
    const pct=tot?Math.round(done/tot*100):0;
    let cls,label;
    if(tot&&done>=tot){cls='done';label='Done';}
    else if(left>0&&days<2){cls='behind';label='Behind';}
    else{cls='ok';label='On track';}
    const g=el('div','gperson');
    g.innerHTML=`<div class="gtop">${av(r,'av')} ${PEOPLE[r].name}<span class="gchip ${cls}">${label}</span></div>
      <div class="gbar"><i style="width:${pct}%"></i></div>
      <div class="gmeta">${done}/${tot} steps${left>0?` · ${left} left`:''}</div>`;
    wrap.appendChild(g);
  });
  wrap.querySelectorAll('.av').forEach(a=>{a.style.width='18px';a.style.height='18px';a.style.display='inline-grid';a.style.fontSize='10px';a.style.verticalAlign='middle'});
  card.appendChild(wrap);
  return card;
}
function blockersCard(){
  const rows=[];
  WEEKS.forEach(w=>ORDER.forEach(r=>{
    const st=ST.tasks[w.id+'.'+r]; if(!st)return;
    const note=(st.note||'').trim();
    if(st.roll||note) rows.push(`<div class="brow"><span class="bw">W${w.id} · ${PEOPLE[r].name}</span> — ${st.roll?'⏳ rolled over':'📝 note'}${note?' · '+esc(note):''}</div>`);
  }));
  if(!rows.length)return null;
  const card=el('div','card pad');
  card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--amber-soft)">⚠️</div><div><h3>Blockers &amp; rolled over</h3><small>${rows.length} item${rows.length>1?'s':''} need attention</small></div></div><div class="blist">${rows.join('')}</div>`;
  return card;
}
function kpiPace(kp){
  const cw=currentWeek(); const wk=cw?cw.id:12;
  const cur=ST.kpis[kp.id]||0;
  const expected=Math.round(kp.target*wk/12);
  const remaining=Math.max(0,kp.target-cur);
  const weeksLeft=Math.max(1,12-wk+1);
  return {cur,expected,onPace:cur>=expected,remaining,perWeek:Math.ceil(remaining/weeksLeft),done:cur>=kp.target};
}
function delivHasContent(key,fkeys){
  const t=((ST.deliv[key]&&ST.deliv[key].text)||'').trim();
  return !!t || (fkeys&&fkeys.has(key));
}
function renderHandoffs(host,fkeys){
  if(!host)return;
  const cw=currentWeek(); host.innerHTML='';
  if(!cw){host.innerHTML='<div class="hempty">Quarter complete — no handoffs.</div>';return;}
  const rows=[]; const r=S.role;
  if(r==='all'){
    ORDER.forEach(fr=>(DELIVERIES[cw.id+'.'+fr]||[]).forEach((dv,i)=>{
      const key=cw.id+'.'+fr+'.'+i, sent=delivHasContent(key,fkeys);
      rows.push(`<div class="hrow${sent?' sent':''}"><span class="hi">${sent?'✓':'📤'}</span><div><span class="hnm">${PEOPLE[fr].name} → ${PEOPLE[dv.to].name}</span> — ${esc(dv.need)}</div></div>`);
    }));
  }else{
    (DELIVERIES[cw.id+'.'+r]||[]).forEach((dv,i)=>{
      const key=cw.id+'.'+r+'.'+i, sent=delivHasContent(key,fkeys);
      rows.push(`<div class="hrow${sent?' sent':''}"><span class="hi">${sent?'✓':'📤'}</span><div><span class="hnm">You → ${PEOPLE[dv.to].name}</span> — ${esc(dv.need)}</div></div>`);
    });
    inboxFor(r,cw.id).forEach(item=>{
      const got=delivHasContent(item.dkey,fkeys);
      rows.push(`<div class="hrow${got?' sent':''}"><span class="hi">${got?'✓':'📥'}</span><div><span class="hnm">${PEOPLE[item.fromRole].name} → You</span> — ${esc(item.need)}</div></div>`);
    });
  }
  host.innerHTML = rows.length ? `<div class="hlist">${rows.join('')}</div>` : '<div class="hempty">No handoffs scheduled this week.</div>';
}
let _ctimer;
function startCountdown(cw){
  clearInterval(_ctimer);
  const tick=()=>{const box=$('#count');if(!box)return clearInterval(_ctimer);
    const diff=dueDate(cw).getTime()-Date.now();
    if(diff<=0){box.innerHTML='<div class="box" style="min-width:auto"><b>Due now</b><span>Tuesday 12pm</span></div>';return}
    const d=Math.floor(diff/864e5),h=Math.floor(diff%864e5/36e5),m=Math.floor(diff%36e5/6e4),s=Math.floor(diff%6e4/1e3);
    box.innerHTML=[[d,'days'],[h,'hrs'],[m,'min'],[s,'sec']].map(x=>`<div class="box"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');
  };
  tick();_ctimer=setInterval(tick,1000);
}

/* shared: one person's week as an expandable playbook */
function taskEl(w,r){
  const rd=w.roles[r]; if(!rd)return null; // role isn't part of this program's week — skip
  const key=w.id+'.'+r; const st=ST.tasks[key];
  const steps=stepsOf(w,r); const total=steps.length;
  const d=el('details','taskc'+(taskDone(w,r)?' done':''));
  d.innerHTML=`<summary>
      ${av(r,'who-av')}
      <div class="tc-head">
        <div class="who-nm">${PEOPLE[r].name}${rd.est?` <span class="est">${esc(rd.est)}</span>`:''}</div>
        <div class="tc-sum">${rd.sum}</div>
      </div>
      <div class="tc-prog"><span class="tc-count">${checkedOf(w,r)}/${total}</span><span class="chev">▾</span></div>
    </summary>
    <div class="playbook">
      <div class="fnline">${esc(PEOPLE[r].fn)}</div>
      <ol class="steps"></ol>
      ${rd.handoff?`<div class="handoff">${rd.handoff}</div>`:''}
      <div class="dboxes"></div>
      <div class="pb-acts">
        <button class="tbtn roll ${st.roll?'on':''}">${st.roll?'⏳ Rolled over':'Roll over'}</button>
        <button class="tbtn notebtn ${st.note?'on':''}">✎ Note</button>
      </div>
      <textarea class="note${st.note?' show':''}" placeholder="Note / why rolled over…">${esc(st.note)}</textarea>
    </div>`;
  const ol=d.querySelector('.steps');
  steps.forEach((s,i)=>{
    const li=el('li','step'+(st.steps[i]?' on':'')+(isContributor()?' ro':''));
    li.innerHTML=`<span class="sx">${st.steps[i]?'✓':(i+1)}</span><span class="stx">${s}</span>`;
    if(isContributor()){
      li.onclick=()=>toast('Contributors provide content — the Builder checks off the work.');
    }else{
      li.onclick=()=>{
        st.steps[i]=!st.steps[i];commit();
        li.classList.toggle('on',!!st.steps[i]);
        li.querySelector('.sx').textContent=st.steps[i]?'✓':(i+1);
        d.querySelector('.tc-count').textContent=checkedOf(w,r)+'/'+total;
        d.classList.toggle('done',taskDone(w,r));
        syncBars();buildNav();
      };
    }
    ol.appendChild(li);
  });
  const ta=d.querySelector('.note');
  d.querySelector('.roll').onclick=e=>{e.preventDefault();st.roll=!st.roll;commit();
    e.target.classList.toggle('on',st.roll);e.target.textContent=st.roll?'⏳ Rolled over':'Roll over';
    if(st.roll)ta.classList.add('show')};
  d.querySelector('.notebtn').onclick=e=>{e.preventDefault();ta.classList.toggle('show');if(ta.classList.contains('show'))ta.focus()};
  ta.oninput=()=>{st.note=ta.value};
  ta.onblur=()=>{commit();d.querySelector('.notebtn').classList.toggle('on',!!st.note)};
  renderDeliveries(d.querySelector('.dboxes'),w,r);
  return d;
}

function renderDeliveries(host,w,r){
  if(!host)return; host.innerHTML='';
  (DELIVERIES[w.id+'.'+r]||[]).forEach((dv,i)=>host.appendChild(deliverBox(w.id,r,dv,i)));
  inboxFor(r,w.id).forEach(item=>host.appendChild(inboxBox(item)));
}
function dlFile(f){return async()=>{const rec=await fileGet(f.id);const u=URL.createObjectURL(rec.blob);const a=document.createElement('a');a.href=u;a.download=rec.name;a.click();URL.revokeObjectURL(u)}}
function deliverBox(wid,fromRole,dv,i){
  const key=wid+'.'+fromRole+'.'+i;
  const box=el('details','dbox out');
  box.innerHTML=`<summary><span class="dto">📤 Deliver to ${PEOPLE[dv.to].name}</span><span class="dstat"></span><span class="dchev">▾</span></summary>
    <div class="dbody">
    <div class="dneed">${esc(dv.need)}</div>
    <textarea class="dtext" placeholder="Type it here — paste the blogs, the details, or the list…">${esc((ST.deliv[key]&&ST.deliv[key].text)||'')}</textarea>
    <div class="ddrop">📎 <b>Drag images, video, a PDF or doc here</b> or click to attach</div>
    <input type="file" multiple class="hidden">
    <div class="dfiles"></div>
    <div class="dcloud"></div>
    <div class="dlinkrow"><input class="dlinkin" type="url" placeholder="Paste a link — Google Doc, video URL, reference…"><button class="btn-set dlinkbtn">＋ Add link</button></div>
    <div class="dlinks"></div>
    <div class="dsync">${window.WG_FB_READY?('✅ Your note, links &amp; <b>photos</b> reach <b>'+esc(PEOPLE[dv.to].name)+'</b> live (photos sent Full-HD WebP). Big files like video/PDF stay on this device — share those as a <b>link</b>.'):('💾 Saved on <b>this device</b> for now — reaches '+esc(PEOPLE[dv.to].name)+' once the backend sync is turned on.')}</div>
    </div>`;
  const ta=box.querySelector('.dtext'), drop=box.querySelector('.ddrop'),
        inp=box.querySelector('input'), fl=box.querySelector('.dfiles'), stat=box.querySelector('.dstat'),
        linkin=box.querySelector('.dlinkin'), linkbtn=box.querySelector('.dlinkbtn'), linksEl=box.querySelector('.dlinks'),
        cloudEl=box.querySelector('.dcloud');
  const setStat=async()=>{const files=await filesForDeliv(key); const d=ST.deliv[key]||{};
    const has=((d.text&&d.text.trim())||files.length||(d.links&&d.links.length)||(d.cf&&d.cf.length));
    stat.textContent=has?'✓ Delivered':'⏳ Not sent yet'; stat.className='dstat'+(has?' on':'');};
  ta.oninput=()=>{ if(!ST.deliv[key])ST.deliv[key]={text:'',files:[],links:[]}; ST.deliv[key].text=ta.value; };
  ta.onblur=()=>{commit();setStat()};
  drop.onclick=()=>inp.click();
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};
  drop.ondragleave=()=>drop.classList.remove('over');
  const onAttached=()=>{refreshDFiles(fl,key,true,setStat);renderCloudFiles(cloudEl,key,true,setStat);setStat();};
  drop.ondrop=async e=>{e.preventDefault();drop.classList.remove('over');toast('Adding photo(s)…');await handleDelivAttach(e.dataTransfer.files,wid,fromRole,key);toast('Attached');onAttached();};
  inp.onchange=async e=>{toast('Adding photo(s)…');await handleDelivAttach(e.target.files,wid,fromRole,key);e.target.value='';toast('Attached');onAttached();};
  const addLink=()=>{let u2=(linkin.value||'').trim();if(!u2)return;if(!/^https?:\/\//i.test(u2))u2='https://'+u2;
    if(!ST.deliv[key])ST.deliv[key]={text:'',files:[],links:[]}; if(!Array.isArray(ST.deliv[key].links))ST.deliv[key].links=[];
    ST.deliv[key].links.push({url:u2}); linkin.value=''; commit(); renderDLinks(linksEl,key,true,setStat); setStat();};
  linkbtn.onclick=addLink; linkin.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();addLink();}};
  refreshDFiles(fl,key,true,setStat); renderCloudFiles(cloudEl,key,true,setStat); renderDLinks(linksEl,key,true,setStat); setStat();
  return box;
}
function linkLabel(u){try{const x=new URL(u);return x.hostname.replace(/^www\./,'')+(x.pathname&&x.pathname.length>1?x.pathname:'');}catch(e){return u}}
function renderDLinks(el2,key,editable,onChange){
  el2.innerHTML='';
  const links=(ST.deliv[key]&&ST.deliv[key].links)||[];
  links.forEach((lk,idx)=>{const row=el('div','dlink');
    row.innerHTML=`<span class="fi">🔗</span><a class="ln" href="${esc(lk.url)}" target="_blank" rel="noopener noreferrer">${esc(lk.label||linkLabel(lk.url))}</a>${editable?'<button class="tbtn del">✕</button>':''}`;
    if(editable){const d=row.querySelector('.del'); if(d)d.onclick=()=>{ST.deliv[key].links.splice(idx,1);commit();renderDLinks(el2,key,editable,onChange);if(onChange)onChange();};}
    el2.appendChild(row);});
}
function inboxBox(item){
  const key=item.dkey, fr=item.fromRole;
  const box=el('details','dbox in');
  const txt=(ST.deliv[key]&&ST.deliv[key].text)||'';
  box.innerHTML=`<summary><span class="dfrom">📥 From ${PEOPLE[fr].name}</span><span class="dstat"></span><span class="dchev">▾</span></summary>
    <div class="dbody">
    <div class="dneed">${esc(item.need)}</div>
    <div class="dintext"></div>
    <div class="dlinks"></div>
    <div class="dcloud"></div>
    <div class="dfiles"></div>
    </div>`;
  const body=box.querySelector('.dintext'), fl=box.querySelector('.dfiles'), stat=box.querySelector('.dstat');
  const linksEl=box.querySelector('.dlinks'), cloudEl=box.querySelector('.dcloud');
  const nLinks=((ST.deliv[key]&&ST.deliv[key].links&&ST.deliv[key].links.length)||0);
  const nCloud=((ST.deliv[key]&&ST.deliv[key].cf&&ST.deliv[key].cf.length)||0);
  renderDLinks(linksEl,key,false); renderCloudFiles(cloudEl,key,false);
  if(txt.trim()){body.className='dintext has';body.textContent=txt;box.open=true;}
  else if(nLinks||nCloud){body.style.display='none';box.open=true;} // links/photos speak for themselves
  else{body.className='dintext wait';body.textContent='⏳ Waiting on '+PEOPLE[fr].name+' — nothing delivered yet.';}
  filesForDeliv(key).then(files=>{
    const has=(txt.trim()||files.length||nLinks||nCloud);
    stat.textContent=has?'✓ Received':'⏳ Pending'; stat.className='dstat'+(has?' on':'');
    if(files.length||nLinks||nCloud)box.open=true;
    if(!files.length)return;
    files.forEach(f=>{const row=el('div','dfile');
      row.innerHTML=`<span class="fi">${fileIcon(f.type)}</span><span class="fn">${esc(f.name)}</span><span class="fm">${humanSize(f.size)}</span><button class="tbtn dl">⬇</button>`;
      row.querySelector('.dl').onclick=dlFile(f); fl.appendChild(row)});
  });
  return box;
}
function refreshDFiles(fl,key,editable,onChange){
  fl.innerHTML='';
  filesForDeliv(key).then(files=>{
    files.forEach(f=>{const row=el('div','dfile');
      row.innerHTML=`<span class="fi">${fileIcon(f.type)}</span><span class="fn">${esc(f.name)}</span><span class="fm">${humanSize(f.size)}</span><button class="tbtn dl">⬇</button>${editable?'<button class="tbtn del">✕</button>':''}`;
      row.querySelector('.dl').onclick=dlFile(f);
      if(editable)row.querySelector('.del').onclick=async()=>{await fileDel(f.id);toast('Removed');refreshDFiles(fl,key,editable,onChange);if(onChange)onChange()};
      fl.appendChild(row)});
  });
}

/* ---------- THE PLAN ---------- */
/* ---------- SOCIAL: Cadence & Consistency (replaces the 12-week task plan) ---------- */
function viewSocialPlan(v){
  v.appendChild(el('div','page-head',`<h2>Cadence</h2><p>Forget complicated. The whole plan is one habit: <b>post 5 times a week, any 5 days.</b> Consistency beats perfection — a steady feed is what puts Window Guardians on the shortlist.${roleNote()}</p>`));

  // the one rule
  const rule=el('div','card pad');rule.style.borderTop='3px solid var(--orange)';
  rule.innerHTML=`<div class="bigrule"><div class="brnum">5</div><div><div class="brt">posts a week</div><div class="brs">any 5 days — weekday or weekend, doesn’t matter. Bank a few ahead so a busy day never breaks the streak.</div></div></div>`;
  v.appendChild(rule);

  // live cadence banner (this week / streak / runway)
  v.appendChild(cadenceBanner());

  // weekly consistency tracker
  const cw=currentWeek();const cwId=cw?cw.id:((WEEKS[WEEKS.length-1]&&WEEKS[WEEKS.length-1].id)||1);
  const track=el('div','card pad');track.style.marginTop='12px';
  track.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">📈</div><div><h3>Consistency tracker</h3><small>Did we hit 5 each week? Green = goal met.</small></div></div>`;
  const rows=el('div','ctrack');
  WEEKS.filter(w=>w.id<=cwId+1).forEach(w=>{
    const posted=weekPosts(w.id).filter(p=>p.status==='posted').length;
    const planned=weekPosts(w.id).length;
    const met=posted>=SOC_WEEKLY_GOAL;
    const isNow=w.id===cwId;
    const cnt=Math.max(posted,planned);
    rows.appendChild(el('div','crow'+(met?' met':'')+(isNow?' now':''),
      `<span class="cwk">Week ${w.id}${isNow?' · this week':''}</span>
       <span class="cdots">${Array.from({length:SOC_WEEKLY_GOAL},(_,i)=>`<i class="${i<posted?'on':(i<planned?'plan':'')}"></i>`).join('')}</span>
       <span class="ccount">${posted}/${SOC_WEEKLY_GOAL}${met?' ✓':(planned>posted?` · ${planned} planned`:'')}</span>`));
  });
  track.appendChild(rows);
  v.appendChild(track);

  // starter categories
  const cats=el('div','card pad');cats.style.marginTop='12px';
  cats.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">🗂️</div><div><h3>What to post — starter categories</h3><small>Rotate through these so the feed stays varied. Rename or change these anytime.</small></div></div>`;
  SOC_PILLARS.forEach(p=>cats.appendChild(el('div','catrow',`<span class="cati">${p.icon}</span><span class="catt"><b>${esc(p.t)}</b><small>${esc(p.d||'')}</small></span>`)));
  v.appendChild(cats);

  // Ruth's posting tips
  v.appendChild(ruthTipsCard());
}
function ruthTipsCard(){
  const c=el('div','card pad');c.style.marginTop='12px';c.style.borderTop='3px solid var(--navy)';
  c.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">💡</div><div><h3>Posting tips</h3><small>Quick rules that make every post land better</small></div></div>`+
    SOC_RUTH_TIPS.map(t=>`<div class="chk"><span class="b" style="color:var(--navy)">✓</span><span>${esc(t)}</span></div>`).join('');
  return c;
}
function socTrackerCard(){
  const cw=currentWeek();const cwId=cw?cw.id:((WEEKS[WEEKS.length-1]&&WEEKS[WEEKS.length-1].id)||1);
  const track=el('div','card pad');track.style.marginTop='12px';
  track.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">📈</div><div><h3>Consistency tracker</h3><small>Did we hit 5 each week? Green = goal met.</small></div></div>`;
  const rows=el('div','ctrack');
  WEEKS.filter(w=>w.id<=cwId+1).forEach(w=>{
    const posted=weekPosts(w.id).filter(p=>p.status==='posted').length;
    const planned=weekPosts(w.id).length;
    const met=posted>=SOC_WEEKLY_GOAL;
    const isNow=w.id===cwId;
    rows.appendChild(el('div','crow'+(met?' met':'')+(isNow?' now':''),
      `<span class="cwk">Week ${w.id}${isNow?' · this week':''}</span>
       <span class="cdots">${Array.from({length:SOC_WEEKLY_GOAL},(_,i)=>`<i class="${i<posted?'on':(i<planned?'plan':'')}"></i>`).join('')}</span>
       <span class="ccount">${posted}/${SOC_WEEKLY_GOAL}${met?' ✓':(planned>posted?` · ${planned} planned`:'')}</span>`));
  });
  track.appendChild(rows);return track;
}
function socCategoriesCard(){
  const cats=el('div','card pad');cats.style.marginTop='12px';
  cats.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">🗂️</div><div><h3>Your categories</h3><small>Rotate through these so the feed stays varied.</small></div></div>`;
  SOC_PILLARS.forEach(p=>cats.appendChild(el('div','catrow',`<span class="cati">${p.icon}</span><span class="catt"><b>${esc(p.t)}</b><small>${esc(p.d||'')}</small></span>`)));
  return cats;
}
function viewPlan(v){
  if(activeProgram()==='social')return viewSocialPlan(v);
  v.appendChild(el('div','page-head',`<h2>The 12-Week Plan</h2><p>Every deliverable is due that week’s <b>Tuesday by 12:00 PM</b>. Mark <b>Done</b> when it’s live/sent/recorded — not "drafted." Roll over with a one-line reason; two rollovers on one task escalates to Sebastian.${roleNote()}</p>`));
  const cw=currentWeek();
  PHASES.forEach(ph=>{
    const head=el('div','phase-h',`<span class="tag">Phase ${ph.n}</span><h4>${ph.name}</h4><span class="dates">${ph.dates}</span>`);
    v.appendChild(head);
    WEEKS.filter(w=>w.phase===ph.n).forEach(w=>{
      const isCur=cw&&cw.id===w.id;
      const d=el('details','weekrow'+(isCur?' cur':''));if(isCur)d.open=true;
      const p=weekPct(w.id);
      d.innerHTML=`<summary>
        <div><div class="wk">Week ${w.id} · ${esc(w.title)} ${isCur?'<span class="curtag">THIS WEEK</span>':''}</div><div class="due">Due ${fmtDue(w)}</div></div>
        <div class="mini"><span data-wkpct="${w.id}">${p}%</span><div class="bar"><i data-wkbar="${w.id}" style="width:${p}%"></i></div></div>
      </summary>`;
      const list=el('div','tasklist');
      const order=S.role==='all'?ORDER:[S.role,...ORDER.filter(x=>x!==S.role)];
      order.forEach(r=>{ const tEl=taskEl(w,r); if(!tEl)return;
        if(S.role!=='all'&&r!==S.role)tEl.style.opacity='.5'; list.appendChild(tEl); });
      d.appendChild(list);
      v.appendChild(d);
    });
  });
}

/* ---------- SCORECARD ---------- */
function viewScorecard(v){
  if(activeProgram()==='seo')return viewSeoProgress(v);
  v.appendChild(el('div','page-head',`<h2>KPI Scorecard</h2><p>The numbers that prove it’s working. Tap +/− to update as results land. End-of-August targets baked in.</p>`));
  const grid=el('div','grid cols-2');
  KPIS.forEach(kp=>{
    const cur=ST.kpis[kp.id];const p=Math.min(100,Math.round(cur/kp.target*100));
    const c=el('div','card pad');
    c.innerHTML=`<div style="display:flex;align-items:flex-start"><div><div style="font-weight:800;font-size:15px">${esc(kp.label)}</div><div class="muted" style="font-size:12.5px">${esc(kp.sub)}</div></div>
      <div class="stepper"><button data-d="-${kp.step}">−</button><b id="v_${kp.id}">${cur}</b><button data-d="${kp.step}">+</button></div></div>
      <div style="display:flex;align-items:baseline;gap:8px;margin:14px 0 6px"><b class="num" style="font-size:30px;font-weight:800">${cur}</b><span class="of" style="color:var(--faint);font-weight:700">/ ${kp.target} target</span><span class="pill" style="margin-left:auto">${p}%</span></div>
      <div class="bar"><i id="b_${kp.id}" style="width:${p}%"></i></div>
      <div style="margin-top:8px"><button class="tbtn" data-big="${kp.big}">+${kp.big} (a week’s worth)</button></div>`;
    if(isContributor()){c.querySelectorAll('.stepper button,button[data-big]').forEach(b=>{b.disabled=true;b.title='Builders update the numbers';});}
    else{c.querySelectorAll('button[data-d]').forEach(b=>b.onclick=()=>bump(kp,+b.dataset.d));
      c.querySelector('button[data-big]').onclick=()=>bump(kp,kp.big);}
    grid.appendChild(c);
  });
  v.appendChild(grid);

  // social: the consistency tracker + categories live with the numbers
  if(activeProgram()==='social'){
    v.appendChild(socTrackerCard());
    v.appendChild(socCategoriesCard());
  }

  const oc=PROG.scorecardOutcome;
  const tgt=el('div','card pad');tgt.style.marginTop='16px';
  tgt.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🏁</div><div><h3>${esc(oc.title)}</h3><small>${esc(oc.sub)}</small></div></div>
    <div class="grid cols-2">
      <div>${oc.colA.map(x=>`<div class="chk"><span class="b">✓</span><span>${esc(x)}</span></div>`).join('')}</div>
      <div>${oc.colB.map(x=>`<div class="chk"><span class="b">✓</span><span>${esc(x)}</span></div>`).join('')}</div>
    </div>`;
  v.appendChild(tgt);
}
function bump(kp,d){if(isContributor()){toast('Builders update the numbers — Contributors provide the content.');return;}ST.kpis[kp.id]=Math.max(0,ST.kpis[kp.id]+d);commit();
  const cur=ST.kpis[kp.id],p=Math.min(100,Math.round(cur/kp.target*100));
  const vv=document.getElementById('v_'+kp.id),bb=document.getElementById('b_'+kp.id);
  if(vv)vv.textContent=cur; if(bb)bb.style.width=p+'%';
  render();
}

/* ---------- GUIDES ---------- */
function viewRuthGuide(v){
  v.appendChild(el('div','page-head',`<h2>Your Guide</h2><p>Everything you need to post like a pro — best times, where to tag the location, and the simple 3-step flow.</p>`));

  // how this works
  const how=el('div','card pad');how.style.borderTop='3px solid var(--orange)';
  how.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">✅</div><div><h3>How this works</h3><small>Three steps, every time</small></div></div>
    <div class="chk"><span class="b" style="color:var(--orange)">1</span><span>Open <b>Post queue</b> and pick a post that's ready.</span></div>
    <div class="chk"><span class="b" style="color:var(--orange)">2</span><span><b>Copy</b> the caption and hashtags, and <b>download</b> the photo(s)/video.</span></div>
    <div class="chk"><span class="b" style="color:var(--orange)">3</span><span>Post it on each platform, set the location, then tap the green <b>✅ Mark as posted</b> button — it disappears from your list so you always know what’s left.</span></div>`;
  v.appendChild(how);

  // best times by day
  const times=[['Monday','11am–1pm','Plan-the-week energy — tips & education do well.'],['Tuesday','11am–1pm','Strong all-around day. Portfolio / before-after.'],['Wednesday','11am–1pm or 6–8pm','Mid-week peak — your best reach.'],['Thursday','11am–1pm','Customer love / reviews land well.'],['Friday','11am–1pm','Lighter, fun / behind-the-scenes.'],['Sat / Sun','9–11am','Homeowners scrolling — portfolio + local.']];
  const tc=el('div','card pad');tc.style.marginTop='12px';
  tc.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🕐</div><div><h3>Best times to post</h3><small>When locals are actually scrolling</small></div></div>`;
  const tbl=el('div','timetbl');
  times.forEach(([d,t,n])=>tbl.appendChild(el('div','timerow',`<span class="tday">${d}</span><span class="ttime">${t}</span><span class="tnote">${esc(n)}</span>`)));
  tc.appendChild(tbl);v.appendChild(tc);

  // how to add location per platform
  const loc=el('div','card pad');loc.style.marginTop='12px';loc.style.borderTop='3px solid var(--green)';
  loc.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">📍</div><div><h3>How to add the location</h3><small>Local tags = local reach. Each post tells you the town.</small></div></div>
    <div class="chk"><span class="b" style="color:var(--green)">IG</span><span><b>Instagram:</b> on the final share screen, tap <b>Add location</b> → type the town (e.g. “Langhorne, PA”) → pick it.</span></div>
    <div class="chk"><span class="b" style="color:var(--green)">FB</span><span><b>Facebook:</b> in the post box tap <b>Check in / Add location</b> → search the town → select it.</span></div>
    <div class="chk"><span class="b" style="color:var(--green)">G</span><span><b>Google Business:</b> already tied to our address — no location step needed.</span></div>
    <div class="chk"><span class="b" style="color:var(--green)">ND</span><span><b>Nextdoor:</b> it's neighborhood-based automatically — just post.</span></div>`;
  v.appendChild(loc);

  // posting tips
  v.appendChild(ruthTipsCard());
}
/* content-dependency badge for a playbook step — shows if Sebastian still owes content */
function seoContentBadge(stepId){
  if(stepId==='gbp'){const n=seoMediaPool().length;return n>=1?`<span class="cb ok">📷 photos in (${n})</span>`:`<span class="cb wait">📷 needs job photos</span>`;}
  if(stepId==='towns'){const tot=SOC_TOWNS.length;const have=SOC_TOWNS.filter(townProvided).length;return have>=tot?`<span class="cb ok">🏘️ all ${tot} town details in</span>`:`<span class="cb wait">🏘️ town details ${have}/${tot}</span>`;}
  if(stepId==='blogs'){const have=seoBlogs().length;return have>=12?`<span class="cb ok">✍️ 12 briefs in</span>`:`<span class="cb wait">✍️ briefs ${have}/12</span>`;}
  return '<span class="cb none">Bogdan only · no content needed</span>';
}
/* birds-eye: every task top-to-bottom, each with a provided/needed badge. Read-only reference;
   the actual check-offs live on Home so the two never fight over state. */
function seoScopeSection(){
  const wrap=el('div');
  wrap.appendChild(el('div','nav-sec','📋 Full scope — every task (work top to bottom)'));
  const intro=el('div');intro.style.cssText='margin:0 0 8px';intro.innerHTML='<p class="muted" style="font-size:13px">The whole job at a glance. The badge shows whether the contributor still owes content for that step. Check things off on the <b>Home</b> tab.</p>';
  wrap.appendChild(intro);
  SEO_PLAYBOOK.forEach(step=>{
    const sdone=i=>{const tk=sprintTasks().find(x=>x.id==='spt_'+step.id+'_'+i);return !!(tk&&tk.status==='done');};
    const doneN=step.tasks.filter((_,i)=>sdone(i)).length, all=doneN===step.tasks.length;
    const dd=el('details','guide');
    dd.innerHTML=`<summary><div class="gi" style="background:${all?'var(--green-soft)':'var(--blue-soft)'}">${step.icon}</div><div><div class="gt">${esc(step.title)} ${seoContentBadge(step.id)}</div><div class="gd">${esc(step.sub)}</div></div><span class="num">${doneN}/${step.tasks.length}</span></summary>
      <div class="guide-body">${step.tasks.map((t,i)=>`<div class="chk"><span class="b">${sdone(i)?'✓':'○'}</span><span style="${sdone(i)?'color:var(--muted);text-decoration:line-through':''}">${esc(t)}</span></div>`).join('')}</div>`;
    wrap.appendChild(dd);
  });
  return wrap;
}
/* What to tackle AFTER the 90-day backlog is shipped — held out on purpose */
function seoAfter90Section(){
  const wrap=el('div');
  wrap.appendChild(el('div','nav-sec','🔭 After the 90 days — Phase 2 (once the backlog is shipped)'));
  const card=el('div','card pad');
  card.innerHTML=`<p class="muted" style="font-size:13px;margin:0 0 10px">Held out of the 90-day backlog on purpose. Tackle these once the on-site + Google Business Profile work is done.</p>
    <h6>Off-site authority</h6>
    <div class="chk"><span class="b">→</span><span><b>Citations</b> — lock NAP everywhere, then bulk-submit via BrightLocal (~$35/mo) or Moz Local. Tier 1 (Google, Bing, Apple Maps, BBB) first, then data aggregators.</span></div>
    <div class="chk"><span class="b">→</span><span><b>Backlinks (compound)</b> — local press (Bucks County Courier Times), chambers of commerce, manufacturer dealer pages (Okna/ProVia), HOA newsletters, local sponsorships. One press feature beats 50 directory citations.</span></div>
    <h6>New category to own</h6>
    <div class="chk"><span class="b">→</span><span><b>Gutters silo</b> — wide-open gap (only PJ Fitzpatrick + Munz cover it). Hub + town + cost + comparison pages. (Only if you add gutters as a service.)</span></div>
    <h6>Geographic expansion</h6>
    <div class="chk"><span class="b">→</span><span><b>Bonus Bucks towns</b> — Doylestown + Buckingham (high-value, surfaced in the research).</span></div>
    <div class="chk"><span class="b">→</span><span><b>Montgomery County</b> — Horsham, Maple Glen, Fort Washington, Huntingdon Valley, Jenkintown, Blue Bell.</span></div>
    <div class="chk"><span class="b">→</span><span><b>South Jersey</b> — Cherry Hill, Haddonfield, Moorestown, Princeton.</span></div>
    <h6>Deeper content</h6>
    <div class="chk"><span class="b">→</span><span>Per-town <b>roofing / siding / door</b> pages (beyond windows-first).</span></div>
    <div class="chk"><span class="b">→</span><span>More cost guides + comparison guides per service.</span></div>`;
  wrap.appendChild(card);
  return wrap;
}
/* the bar every town page must clear — the uncopyable moat */
function seoDeepTownSpec(){
  const wrap=el('div');
  wrap.appendChild(el('div','nav-sec','🏘️ Deep Town Page — the build spec (your moat)'));
  const card=el('div','card pad');
  card.innerHTML=`<p class="muted" style="font-size:13px;margin:0 0 10px">Google's 2026 update gutted thin, templated town pages (60–90% traffic loss). Each of your 7 town pages must clear this bar — that's the moat competitors can't copy. <b>Never</b> swap a city name into a template.</p>
    <h6>Every town page must have</h6>
    <div class="chk"><span class="b">✓</span><span><b>Unique 800–1,200 words</b> — genuinely different per town, not city-name swaps.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Local intro</b> — 2–3 real neighborhoods/landmarks + the housing stock + the common window problem there.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>ONE real project case study</b> — named neighborhood, before/after photos, the product (Okna), named installer, first-name customer + result.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>1–3 real local reviews</b> embedded (with Review schema).</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Town-specific FAQ</b> (5–8 Q&amp;A) + FAQPage schema.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Schema</b> — HomeAndConstructionBusiness + areaServed (this town) + AggregateRating + Review + FAQ.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Image alt text</b> — "window replacement before &amp; after in [town], PA — [detail]".</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Keyword placement</b> — "window replacement [town] PA" in the title, H1, first paragraph + one H2.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Internal links</b> — to the /windows/ hub, the Bucks County cost guide, and a related service page.</span></div>
    <div class="chk"><span class="b">✓</span><span><b>Clear CTA + phone</b> (215) 709-8793 + a "free in-home estimate" button.</span></div>`;
  wrap.appendChild(card);
  return wrap;
}
function viewGuides(v){
  if(activeProgram()==='social'&&isPoster())return viewRuthGuide(v);
  if(activeProgram()==='social')return viewSocialGuides(v);
  v.appendChild(el('div','page-head',`<h2>Guide</h2><p>Your full task list is right up top — every step, with a badge showing what content the contributor still owes. Below it: the blog-writing playbook, the page-fix sheet, and a background library explaining each type of SEO.</p>`));
  v.appendChild(seoScopeSection());
  v.appendChild(seoDeepTownSpec());
  v.appendChild(seoAfter90Section());
  const g=BLOG_GUIDE;
  const d=el('details','guide');d.open=true;
  d.innerHTML=`<summary><div class="gi" style="background:${g.bg}">${g.icon}</div><div><div class="gt">${esc(g.title)}</div><div class="gd">${esc(g.desc)}</div></div><span class="num">START HERE</span></summary>
    <div class="guide-body">
      <p style="color:var(--ink2)">${esc(g.intro)}</p>
      <h6>The 5 fundamentals</h6>${g.fundamentals.map((f,i)=>`<div class="fund"><div class="n">${i+1}</div><div><div class="ft">${esc(f.t)}</div><div class="fd">${esc(f.d)}</div></div></div>`).join('')}
      <h6>Every post checklist</h6>${g.checklist.map(x=>`<div class="chk"><span class="b">✓</span><span>${esc(x)}</span></div>`).join('')}
      <h6>Don’t</h6><div class="callout red"><p>${esc(g.avoid)}</p></div>
    </div>`;
  v.appendChild(d);

  const fs=FIX_SHEET;
  const fd=el('details','guide');
  fd.innerHTML=`<summary><div class="gi" style="background:${fs.bg}">${fs.icon}</div><div><div class="gt">${esc(fs.title)}</div><div class="gd">${esc(fs.desc)}</div></div><span class="num">FOR BOGDAN · REFERENCE</span></summary>
    <div class="guide-body">
      <p style="color:var(--ink2)">${esc(fs.intro)}</p>
      <h6>Fix these first — under 15 minutes total</h6>${fs.critical.map(x=>`<div class="chk"><span class="b">✓</span><span>${esc(x)}</span></div>`).join('')}
      <h6>Page-by-page rewrites (${fs.pages.length} pages)</h6>
      <table class="ref fixtbl"><tr><th>Page</th><th>New Title</th><th>New Meta</th><th>New H1</th></tr>${fs.pages.map(p=>`<tr><td class="tool">${esc(p[0])}</td><td>${esc(p[1])}</td><td>${esc(p[2])}</td><td>${esc(p[3])}</td></tr>`).join('')}</table>
      <h6>Open Graph & Twitter tags</h6><div class="callout blue"><p>${esc(fs.og)}</p></div>
      <h6>Image alt-text sweep</h6><div class="callout orange"><p>${esc(fs.altFormat)}</p></div>${fs.altExamples.map(x=>`<div class="chk"><span class="b">→</span><span>${esc(x)}</span></div>`).join('')}
      <h6>Schema to add sitewide</h6>${fs.schema.map((x,i)=>`<div class="fund"><div class="n">${i+1}</div><div><div class="ft">${esc(x)}</div></div></div>`).join('')}
      <h6>NAP for schema</h6><div class="callout green"><p>${esc(fs.nap)}</p></div>
    </div>`;
  v.appendChild(fd);

  v.appendChild(el('div','nav-sec','SEO background — what each type of SEO is (reference only, not your task list)'));
  REF_CARDS.forEach(c=>{
    const dd=el('details','guide');
    dd.innerHTML=`<summary><div class="gi" style="background:${c.bg}">${c.icon}</div><div><div class="gt">${esc(c.title)}</div><div class="gd">${esc(c.line)}</div></div><span class="num">${c.num} / 08</span></summary>
      <div class="guide-body">
        <h6>What it is</h6><div class="callout blue"><p>${esc(c.is)}</p></div>
        <h6>What it really does for you</h6><div class="callout orange"><p>${esc(c.does)}</p></div>
        <h6>The fundamentals</h6>${c.fund.map((f,i)=>`<div class="fund"><div class="n">${i+1}</div><div><div class="ft">${esc(f[0])}</div><div class="fd">${esc(f[1])}</div></div></div>`).join('')}
        <h6>What to ignore</h6><div class="callout red"><p>${esc(c.ignore)}</p></div>
        <h6>Tools that matter</h6>
        <table class="ref"><tr><th>Tool</th><th>Cost</th><th>What it’s for</th></tr>${c.tools.map(t=>`<tr><td class="tool">${esc(t[0])}</td><td>${esc(t[1])}</td><td>${esc(t[2])}</td></tr>`).join('')}</table>
        <h6>For Window Guardians</h6><div class="callout green"><p>${esc(c.wg)}</p></div>
      </div>`;
    v.appendChild(dd);
  });
}

/* ---------- SETTINGS / ADMIN ---------- */
async function exportBackup(){
  try{
    let fileMeta=[];try{fileMeta=await fileList();}catch(e){}
    const payload={app:'wg_mktg_os',version:1,exported:new Date().toISOString(),project:'seo_q3_2026',state:S,fileMeta};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='wg_marketing_backup_'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),2000);
    const onlyDevice=socPool().filter(m=>!m.driveId&&m.status!=='archived').length;
    toast('Backup saved (posts, captions, notes, progress). Photos & videos are NOT in this file — they live in your Google Drive folder.'+(onlyDevice?(' ⚠ '+onlyDevice+' item'+(onlyDevice>1?'s':'')+' you uploaded directly aren’t in Drive — keep those originals safe.'):''));
  }catch(e){toast('Backup failed — try again.')}
}
/* owner-only: add/remove team logins, set passwords, dashboards + permissions */
function optList(pairs,sel){return pairs.map(([v,l])=>`<option value="${v}"${sel===v?' selected':''}>${l}</option>`).join('');}
/* role choices DEPEND on the assigned dashboard — each dashboard has its own jobs.
   Social: Creator / Poster. SEO: Editor (the builder). "Poster" is a Social-only lock. */
function roleOptsFor(u){
  const owner=['owner','Owner — full access + manage team'];
  if(u.perm==='owner') return optList([owner,['editor','Editor — full access to both dashboards']], u.perm);
  const mode=(u.progs&&u.progs.length===2)?'both':((u.progs&&u.progs[0])||'social');
  let roles;
  if(mode==='social') roles=[['editor','Creator — uploads photos/videos & makes posts'],['poster','Poster — only publishes approved posts']];
  else if(mode==='seo') roles=[['editor','Builder — does the SEO work &amp; publishes (Bogdan)'],['contributor','Contributor — provides blogs, content &amp; info']];
  else roles=[['editor','Editor — full access to both dashboards']];
  return optList([owner].concat(roles), u.perm);
}
function progPick(u){ // which dashboard(s) this person works in
  if(u.perm==='owner') return '<span class="uprogstatic muted">All dashboards</span>';
  const cur=(u.progs&&u.progs.length===2)?'both':((u.progs&&u.progs[0])||'social');
  const o=[['social','📣 Social only'],['seo','📍 SEO only'],['both','Both dashboards']]
    .map(([v,l])=>`<option value="${v}"${cur===v?' selected':''}>${l}</option>`).join('');
  return `<select class="uprog cmp-in">${o}</select>`;
}
function setProgs(u,val){ u.progs = val==='both'?['seo','social'] : val==='seo'?['seo'] : ['social']; }
function usersAdminCard(){
  const card=el('div','card pad');card.style.marginBottom='16px';
  card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">👤</div><div><h3>Team &amp; logins</h3><small>Add people and pick each one's <b>dashboard</b> (Social or SEO) and <b>role</b>. ${window.WG_FB_READY?'Everyone sets their own password with the <b>🔑 Password</b> button in the top bar — to reset someone\'s, use Firebase → Authentication.':'Set their password below.'}</small></div></div>`;
  const wrap=el('div','usersadmin');
  (S.users||[]).forEach(u=>{
    const me=(u.id===S.uid);
    const row=el('div','urow');
    row.innerHTML=`<div class="uav">${av(u.id)}</div>
      <div class="uinfo"><input class="uname cmp-in" value="${esc(u.name)}"><input class="uemail cmp-in" type="email" placeholder="login email (for Firebase)" value="${esc(u.email||'')}"><div class="ulogin muted">login id: ${esc(u.id)}${me?' · <b>you</b>':''}</div></div>
      <div class="uprogwrap">${progPick(u)}</div>
      <select class="uperm cmp-in">${roleOptsFor(u)}</select>
      <label class="uact"><input type="checkbox" class="uactck" ${u.active!==false?'checked':''}> active</label>
      ${window.WG_FB_READY?'':'<button class="btn-set upw">Set password</button>'}
      <button class="btn-set danger urem">Remove</button>`;
    row.querySelector('.uname').onchange=e=>{u.name=e.target.value.trim()||u.name;commit();toast('Saved')};
    const em=row.querySelector('.uemail'); if(em)em.onchange=e=>{u.email=e.target.value.trim();commit();toast('Saved')};
    const pg=row.querySelector('.uprog'); if(pg)pg.onchange=e=>{const v=e.target.value;setProgs(u,v);
      const valid={social:['owner','editor','poster'],seo:['owner','editor','contributor'],both:['owner','editor']};
      if((valid[v]||[]).indexOf(u.perm)<0)u.perm='editor'; // keep the role valid for the chosen dashboard
      commit();render();};
    row.querySelector('.uperm').onchange=e=>{const val=e.target.value,was=u.perm;
      if(was==='owner'&&val!=='owner'&&activeOwners().length<=1){toast('You need at least one Owner.');e.target.value='owner';return;}
      u.perm=val;
      if(val==='poster')u.progs=['social'];          // Poster is Social-only
      else if(val==='contributor')u.progs=['seo'];   // Contributor is SEO-only
      else if(val!=='owner'&&(!u.progs||!u.progs.length))u.progs=(was==='owner'?['seo','social']:['social']);
      commit();render();};
    row.querySelector('.uactck').onchange=e=>{const on=e.target.checked;
      if(!on&&me){toast('You can’t deactivate yourself.');e.target.checked=true;return;}
      if(!on&&u.perm==='owner'&&activeOwners().length<=1){toast('Can’t deactivate the only Owner.');e.target.checked=true;return;}
      u.active=on;commit();};
    const _upw=row.querySelector('.upw'); if(_upw)_upw.onclick=()=>{const v=prompt('New password for '+u.name+':');if(v==null)return;u.pass=hashPw(v);u.seeded=false;commit();render();toast('Password updated for '+u.name);};
    row.querySelector('.urem').onclick=()=>{
      if(me){toast('You can’t remove yourself.');return;}
      if(u.perm==='owner'&&activeOwners().length<=1){toast('Can’t remove the only Owner.');return;}
      if(!confirm('Remove '+u.name+'? They won’t be able to log in anymore.'))return;
      S.users=(S.users||[]).filter(x=>x.id!==u.id);commit();render();toast('Removed '+u.name);};
    wrap.appendChild(row);
  });
  card.appendChild(wrap);
  const add=el('button','btn-set primary','＋ Add teammate');add.style.marginTop='12px';
  add.onclick=()=>{
    const name=prompt('New teammate’s name:');if(!name||!name.trim())return;
    const pwd=prompt('Set a password for '+name.trim()+':')||'wgteam';
    const COLORS=[['#7c3aed','#ede9fe'],['#0891b2','#cffafe'],['#c026d3','#fae8ff'],['#ca8a04','#fef9c3']];
    const ci=COLORS[(S.users||[]).length%COLORS.length];
    // default a new teammate to the Social dashboard as a Creator — adjust with the two dropdowns
    (S.users=S.users||[]).push({id:'u_'+Date.now().toString(36),name:name.trim(),title:'Team member',av:name.trim()[0].toUpperCase(),c:ci[0],bg:ci[1],perm:'editor',progs:['social'],pass:hashPw(pwd),active:true});
    commit();render();toast(name.trim()+' added as a Social Creator — change their dashboard/role with the dropdowns.');
  };
  card.appendChild(add);
  return card;
}
function viewSettings(v){
  v.appendChild(el('div','page-head',`<h2>Settings &amp; Admin</h2><p>Project info, your data backup, the go-live runbook, and what unlocks after sync.</p>`));

  const proj=el('div','card pad');proj.style.marginBottom='16px';
  proj.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">📋</div><div><h3>This project</h3><small>Project 1 of your Marketing OS</small></div></div>
    <div class="setrow"><span>Project</span><b>Q3 2026 Local SEO Gameplan</b></div>
    <div class="setrow"><span>Go-live</span><b>Tuesday, June 2 2026 · 12pm</b></div>
    <div class="setrow"><span>Cadence</span><b>Weekly · Tuesdays · 12 weeks</b></div>
    <div class="setrow"><span>Overall progress</span><b>${overallPct('all')}% complete</b></div>
    <div class="setrow"><span>Sync status</span><span class="syncbadge off">● Local only — not yet synced</span></div>`;
  v.appendChild(proj);

  const sync=el('div','card pad');sync.style.marginBottom='16px';
  sync.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">🚀</div><div><h3>Go-Live &amp; Sync runbook</h3><small>For the programmer — turn this front-end prototype into a live, shared team app</small></div></div>
    <p style="color:var(--ink2);font-size:13.5px;margin:2px 0 4px">Right now every person works in their own copy and data saves only on their device. To make all three share one live dataset and put it online, the programmer wires the PHP + MySQL backend behind the data layer.</p>
    <ol class="set-steps">
      <li><b>Phase 0 — Back up first.</b> Copy the build and confirm the go-live date. That copy is the instant rollback.</li>
      <li><b>Phase 1 — Stand up MySQL.</b> Create the database, run the schema (app_state + app_files tables), set up the file storage path.</li>
      <li><b>Phase 2 — Wire sync into the data layer.</b> Swap Store.load()/save() for PHP endpoints; route file uploads to the server. The data layer was built for exactly this — no UI rework.</li>
      <li class="req"><b>Phase 3 — Lock down access (Auth + sessions).</b> <span class="reqpill">Required</span> PHP session login + per-row access. This is what makes per-member project access a real lock, not cosmetic.</li>
      <li><b>Phase 4 — Host it.</b> Deploy to the server, password-protect or use the auth gate, optional custom domain.</li>
      <li><b>Phase 5 — Day-One, with Sebastian.</b> Two-device acceptance test, one clean reset together, send the team the URL.</li>
    </ol>
    <div class="callout green" style="margin-top:12px"><p><b>Safety rail:</b> never put database credentials or any secret key in the front-end files — they belong only in server-side PHP config.</p></div>`;
  v.appendChild(sync);

  const data=el('div','card pad');data.style.marginBottom='16px';
  data.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">💾</div><div><h3>Your data</h3><small>While you're local-only, keep your own backup</small></div></div>
    <p style="color:var(--ink2);font-size:13.5px;margin:2px 0 10px">Until the backend sync is on, everything lives only in this browser on this device. Download a backup before clearing your browser, switching computers, or any risky change.</p>
    <div style="background:var(--orange-soft);border-radius:10px;padding:10px 12px;margin:0 0 10px;font-size:13px"><b>📷 Your photos &amp; videos are NOT in the backup file.</b> They live in your <b>Google Drive folder</b> — that is your media backup. Keep your content in Drive and it’s always safe. Anything you add by drag-drop (not from Drive) only exists on this device, so keep those originals too.</div>`;
  const eb=el('button','btn-set primary','⬇ Export backup (.json)');eb.onclick=exportBackup;
  data.appendChild(eb);
  v.appendChild(data);
  if(isOwner())v.appendChild(usersAdminCard());

  const team=el('div','card pad');team.style.marginBottom='16px';
  team.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">👥</div><div><h3>Team on this project</h3><small>Assigned by Sebastian</small></div></div>`;
  ORDER.forEach(r=>{const p=PEOPLE[r];const row=el('div','setrow');
    row.innerHTML=`<span>${av(r,'av')} <b style="color:var(--ink)">${p.name}</b></span><span class="muted" style="font-size:13px;max-width:60%;text-align:right">${esc(p.role)}</span>`;
    team.appendChild(row);});
  team.querySelectorAll('.av').forEach(a=>{a.style.width='20px';a.style.height='20px';a.style.display='inline-grid';a.style.verticalAlign='middle';a.style.fontSize='10px'});
  v.appendChild(team);

  const reset=el('div','card pad');reset.style.marginBottom='16px';
  reset.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--red-soft)">↺</div><div><h3>Day-One reset</h3><small>Use ONCE — the morning you go live</small></div></div>
    <p style="color:var(--ink2);font-size:13.5px;margin:2px 0 10px">Wipes every checked step, all KPI numbers, notes, roll-overs, and everything typed or uploaded into the “Deliver to…” boxes — giving the whole team a clean slate for Tuesday. It cannot be undone.</p>`;
  const rb=el('button','btn-set danger','↺ Reset to a clean Day One');rb.onclick=resetAll;
  reset.appendChild(rb);
  v.appendChild(reset);

  const fut=el('div','card pad');
  fut.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--amber-soft)">🔓</div><div><h3>Unlocks after go-live</h3><small>What the backend sync turns on</small></div></div>
    <ul class="future-list">
      <li><span class="lk">🔗</span><div><b>Live shared data</b> — a change or upload by one person appears on everyone's dashboard in seconds.</div></li>
      <li><span class="lk">🗂️</span><div><b>Multiple projects</b> — this SEO build becomes Project 1; switch between marketing projects from one app.</div></li>
      <li><span class="lk">🔐</span><div><b>Per-member access</b> — you assign who's on each project; members only see what you assign them.</div></li>
      <li><span class="lk">✉️</span><div><b>Sign-in</b> — a real login per person instead of “pick your name.”</div></li>
      <li><span class="lk">🤖</span><div><b>Live AI assistant</b> — reads the real dashboard and asks smart questions (the scripted nudge becomes real).</div></li>
    </ul>`;
  v.appendChild(fut);
}

/* ---------- FILES ---------- */
let filesFilter='all';
function delivTag(key){
  if(!key)return '';
  const p=key.split('.');if(p.length<3)return '📎 handoff';
  const arr=DELIVERIES[p[0]+'.'+p[1]];const i=+p[2];
  if(arr&&arr[i]&&PEOPLE[arr[i].to])return '📎 → '+PEOPLE[arr[i].to].name;
  return '📎 handoff';
}
function fileRow(f){
  const row=el('div','filerow');
  const tag=f.deliv?`<div class="dtag">${delivTag(f.deliv)}</div>`:'';
  row.innerHTML=`<div class="fi">${fileIcon(f.type)}</div>
    <div style="flex:1;min-width:0"><div class="fn" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
    <div class="fm">${humanSize(f.size)} · ${PEOPLE[f.by]?PEOPLE[f.by].name:f.by||'—'} · ${new Date(f.ts).toLocaleDateString()}</div></div>
    ${tag}<button class="tbtn dl">⬇</button><button class="tbtn del">✕</button>`;
  row.querySelector('.dl').onclick=async()=>{const rec=await fileGet(f.id);const u=URL.createObjectURL(rec.blob);const a=document.createElement('a');a.href=u;a.download=rec.name;a.click();URL.revokeObjectURL(u)};
  row.querySelector('.del').onclick=async()=>{await fileDel(f.id);toast('Removed');viewFiles(refreshTarget())};
  return row;
}
function viewFiles(v){
  v.appendChild(el('div','page-head',`<h2>Shared Files</h2><p>Grouped by week so nothing gets buried. Files dropped into a “Deliver to…” box already sit on the right task — this is the catch-all for everything else. Stored on <b>this device</b> for now; when the backend is wired these sync to everyone.</p>`));
  const drop=el('div','drop','📂 <b>Drag files here</b> or click to choose<br><span style="font-size:12.5px">Photos, PDFs, spreadsheets, docs…</span>');
  const inp=el('input');inp.type='file';inp.multiple=true;inp.className='hidden';
  drop.onclick=()=>inp.click();
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')};
  drop.ondragleave=()=>drop.classList.remove('over');
  drop.ondrop=async e=>{e.preventDefault();drop.classList.remove('over');for(const f of e.dataTransfer.files)await fileAdd(f);toast('Added');viewFiles(refreshTarget())};
  inp.onchange=async e=>{for(const f of e.target.files)await fileAdd(f);toast('Added');viewFiles(refreshTarget())};
  v.appendChild(drop);v.appendChild(inp);

  const bar=el('div','fbar');bar.innerHTML='<span class="lbl">Show</span>';
  [['all','Everyone'],...ORDER.map(r=>[r,PEOPLE[r].name])].forEach(([val,label])=>{
    const c=el('div','fchip'+(filesFilter===val?' on':''),esc(label));
    c.onclick=()=>{filesFilter=val;viewFiles(refreshTarget())};
    bar.appendChild(c);
  });
  v.appendChild(bar);

  const wrap=el('div');wrap.innerHTML='<div class="muted" style="padding:14px">Loading…</div>';
  v.appendChild(wrap);
  fileList().then(all=>{
    const files=filesFilter==='all'?all:all.filter(f=>f.by===filesFilter);
    if(!files.length){wrap.innerHTML=`<div class="card pad"><div class="muted" style="text-align:center;padding:14px">${all.length?'No files for this person yet.':'No files yet.'}</div></div>`;return}
    const groups={};
    files.forEach(f=>{const k=(f.week&&+f.week)?+f.week:'gen';(groups[k]=groups[k]||[]).push(f)});
    wrap.innerHTML='';
    const weekNums=Object.keys(groups).filter(k=>k!=='gen').map(Number).sort((a,b)=>a-b);
    const renderGroup=(label,sub,arr)=>{
      const sec=el('div','fweek');
      sec.innerHTML=`<div class="fwhead"><b>${esc(label)}</b><span>${esc(sub||'')}</span><span class="cnt">${arr.length} file${arr.length>1?'s':''}</span></div>`;
      const card=el('div','card pad');
      arr.forEach(f=>card.appendChild(fileRow(f)));
      card.firstChild&&(card.firstChild.style.borderTop='none');
      sec.appendChild(card);wrap.appendChild(sec);
    };
    weekNums.forEach(n=>{const w=WEEKS.find(x=>x.id===n);renderGroup('Week '+n,w?w.title:'',groups[n])});
    if(groups.gen)renderGroup('General','Loose uploads, not tied to a week',groups.gen);
  });
}
function refreshTarget(){const v=$('#view');v.innerHTML='';return v}

/* ---------- STRATEGY ---------- */
function viewStrategy(v){
  if(activeProgram()==='social')return viewSocialStrategy(v);
  v.appendChild(el('div','page-head',`<h2>The Strategy</h2><p>Why these three, and only three. They compound, and they match the 2026 local-pack weighting (GBP 32%, on-page 19%, reviews ~18%, links 11%, citations 5–7%). Win these and you own the Bucks map pack.</p>`));
  const pun=el('div','callout orange');pun.style.padding='16px 18px';
  pun.innerHTML=`<div class="eyebrow">The punchline</div><p style="margin-top:6px">Window Guardians points its whole site at <b>Philadelphia</b> — a city it doesn’t really serve — while leaving the affluent Bucks towns it <i>does</i> serve wide open. Meanwhile the highest-value 2026 lever — GBP + fresh reviews — sits underused behind a 4.9 nobody is feeding. 90-day fix: <b>(1) turn GBP + reviews into a machine, (2) fix the geography and own the Bucks bullseye with real local pages, (3) lay the technical trust foundation that makes the first two rank.</b></p>`;
  v.appendChild(pun);
  const grid=el('div','grid');grid.style.marginTop='4px';
  CATS.forEach(c=>{const card=el('div','card pad');
    card.innerHTML=`<div style="display:flex;gap:13px;align-items:flex-start">
      <div class="n" style="width:40px;height:40px;border-radius:11px;background:var(--navy);color:var(--orange);font-weight:800;display:grid;place-items:center;font-size:18px;flex:0 0 auto">${c.n}</div>
      <div><div class="pill" style="background:var(--orange-soft);color:var(--orange);border-color:transparent">${esc(c.tag)}</div>
      <div style="font-weight:800;font-size:17px;margin:6px 0 4px">Category ${c.n} — ${esc(c.t)}</div>
      <div style="color:var(--ink2)">${c.why}</div></div></div>`;
    grid.appendChild(card)});
  v.appendChild(grid);
}

/* ---------- AUDIT ---------- */
function viewAudit(v){
  if(activeProgram()==='social')return viewSocialAudit(v);
  const counts={crit:0,high:0,med:0,low:0};AUDIT.forEach(a=>counts[a.s]++);
  const sevLabel={crit:'Critical',high:'High',med:'Medium',low:'Low'};
  v.appendChild(el('div','page-head',`<h2>The Technical Audit</h2><p>Live crawl of windowguardians.com on 2026-05-30 — homepage, services page, the full page + post sitemaps, and a sample town page. Everything standing between you and maximum local-SEO capacity, grouped by lever.</p>`));
  const strip=el('div','grid cols-4');strip.style.marginBottom='16px';
  [['crit','Critical','var(--red)','var(--red-soft)'],['high','High','#9a6a08','var(--amber-soft)'],['med','Medium','#2a548f','var(--blue-soft)'],['low','Low','var(--green)','var(--green-soft)']].forEach(([k,lbl,col,bg])=>{
    const c=el('div','card pad');c.style.textAlign='center';
    c.innerHTML=`<b style="font-size:30px;font-weight:800;color:${col}">${counts[k]}</b><div class="eyebrow" style="color:var(--faint)">${lbl}</div>`;
    c.style.borderTop=`3px solid ${col}`;strip.appendChild(c);
  });
  v.appendChild(strip);
  let mapped=0,q4=0; const gaps=[];
  AUDIT.forEach(a=>{const fw=AUDIT_FIX[a.h]; if(fw===undefined)gaps.push(a.h); else if(fw==='q4')q4++; else mapped++;});
  const tot=AUDIT.length, clean=gaps.length===0;
  const cov=el('div','card pad');cov.style.marginBottom='16px';
  cov.style.borderTop=`3px solid ${clean?'var(--green)':'var(--red)'}`;
  cov.innerHTML=`<div class="sec-title"><div class="chip" style="background:${clean?'var(--green-soft)':'var(--red-soft)'}">${clean?'✅':'⚠️'}</div><div><h3>Plan coverage</h3><small style="text-transform:none;letter-spacing:0;font-size:12px;color:var(--muted);font-weight:600">Every audit issue is tagged with the week of the plan that fixes it.</small></div></div>
    <div class="cover">
      <span class="cnum">${mapped} of ${tot} mapped to a week</span>
      ${q4?`<span class="cpill q4">${q4} deferred to Q4</span>`:''}
      <span class="cpill ${clean?'ok':'warn'}">${clean?'0 unscheduled gaps ✓':gaps.length+' unscheduled gap'+(gaps.length>1?'s':'')}</span>
    </div>
    <div class="coverbar">
      <i class="mapped" style="width:${Math.round(mapped/tot*100)}%"></i>
      <i class="q4" style="width:${Math.round(q4/tot*100)}%"></i>
      <i class="gap" style="width:${Math.round(gaps.length/tot*100)}%"></i>
    </div>
    ${gaps.length?`<div class="gaplist"><b>Not yet in the plan — slot these before go-live:</b><br>${gaps.map(g=>'• '+esc(g)).join('<br>')}</div>`:''}`;
  v.appendChild(cov);
  AUDIT_CATS.forEach(cat=>{
    const items=AUDIT.filter(a=>a.cat===cat.id);if(!items.length)return;
    const card=el('div','card pad');card.style.marginBottom='16px';
    card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--bg)">${cat.ic}</div><div><h3 style="font-size:16px">${esc(cat.t)}</h3><small style="text-transform:none;letter-spacing:0;font-size:12px;color:var(--muted);font-weight:600">${esc(cat.note)}</small></div></div>`;
    items.forEach(a=>{const row=el('div','issue'); const f=fixLabel(a.h);
      row.innerHTML=`<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap"><span class="sev ${a.s}">${sevLabel[a.s]}</span><h5 style="margin:0">${esc(a.h)}</h5><span class="fixtag ${f.cls}">${f.txt}</span></div><p>${esc(a.p)}</p></div>`;
      card.appendChild(row)});
    card.querySelector('.issue').style.borderTop='none';
    v.appendChild(card);
  });
  const as=el('div','card pad');as.style.marginBottom='16px';
  as.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">✅</div><div><h3>Assets to leverage</h3><small>Don’t rebuild — amplify</small></div></div>${ASSETS.map(x=>`<div class="chk"><span class="b" style="color:var(--green)">✓</span><span>${esc(x)}</span></div>`).join('')}`;
  v.appendChild(as);
  const cv=el('div','callout blue');
  cv.innerHTML=`<div class="eyebrow" style="color:var(--navy)">What this crawl couldn’t see</div><p style="margin-top:6px">${esc(VERIFY_NOTE)}</p>`;
  v.appendChild(cv);
}

/* ============================================================
   SOCIAL REFERENCE VIEWS  (program-aware branch from viewGuides/
   viewStrategy/viewAudit when activeProgram()==='social'). Same
   visual vocabulary as the SEO views, fed by the SOCIAL_* data.
   ============================================================ */
function socGuide(icon,bg,title,desc,badge,body,open){
  const d=el('details','guide');if(open)d.open=true;
  d.innerHTML=`<summary><div class="gi" style="background:${bg}">${icon}</div><div><div class="gt">${esc(title)}</div><div class="gd">${esc(desc)}</div></div>${badge?`<span class="num">${esc(badge)}</span>`:''}</summary><div class="guide-body">${body}</div>`;
  return d;
}
function viewSocialGuides(v){
  v.appendChild(el('div','page-head',`<h2>The Social Playbook</h2><p>The whole operating manual in one place — the five content pillars, Sebastian’s phone capture system, Ruth’s paste-and-post kit, the handoff sheet, and a 33-post content bank. Keep it open while you run the week.</p>`));

  // One-time foundation
  const f=SOCIAL_FOUNDATION;
  v.appendChild(socGuide('🧱','var(--amber-soft)',f.title,f.sub,'SET UP ONCE',
    `<p style="color:var(--ink2)">${esc(f.intro)}</p>
     ${f.items.map((it,i)=>`<div class="fund"><div class="n">${i+1}</div><div><div class="ft">${esc(it.t)} <span class="muted" style="font-weight:600;font-size:12px">· ${esc(it.who)}</span></div><div class="fd">${esc(it.d)}</div></div></div>`).join('')}
     <div class="callout green" style="margin-top:10px"><p>${esc(f.note)}</p></div>`,true));

  // 5 content pillars
  const p=SOCIAL_PILLARS;
  v.appendChild(socGuide('🗂️','var(--blue-soft)','The 5 Content Pillars','Proof · Neighbors · Customer Love · Sebastian & Crew · Education','THE FORMULA',
    `<p style="color:var(--ink2)">${esc(p.intro)}</p>
     <h6>Why it works</h6><div class="callout blue"><p>${esc(p.why)}</p></div>
     <h6>The five buckets</h6>${p.list.map(x=>`<div class="fund"><div class="n" style="background:var(--navy);color:var(--orange)">${x.icon}</div><div><div class="ft">${esc(x.t)} <span class="muted" style="font-weight:600;font-size:12px">→ ${esc(x.goal)}</span></div><div class="fd">${esc(x.d)}</div></div></div>`).join('')}
     <h6>The weekly mix</h6><div class="callout orange"><p>${esc(p.mix)}</p></div>
     <h6>Don’t</h6><div class="callout red"><p>${esc(p.avoid)}</p></div>`));

  // Owner shot list
  const s=SOCIAL_SHOTLIST;
  v.appendChild(socGuide('📸','var(--green-soft)','Sebastian’s Capture System','The 6-shot list + the ~35-minute weekly batch','FOR SEBASTIAN',
    `<p style="color:var(--ink2)">${esc(s.intro)}</p>
     <h6>Why it’s built this way</h6><div class="callout blue"><p>${esc(s.why)}</p></div>
     <h6>The 6-shot list — capture on every job</h6>${s.shots.map(x=>`<div class="fund"><div class="n">${x.n}</div><div><div class="ft">${esc(x.t)}</div><div class="fd">${esc(x.d)}</div></div></div>`).join('')}
     <h6>The weekly batch (~35 min)</h6>${s.batch.map(x=>`<div class="chk"><span class="b">✓</span><span>${esc(x)}</span></div>`).join('')}
     <h6>Don’t</h6><div class="callout red"><p>${esc(s.ignore)}</p></div>`));

  // Ruth kit
  const r=SOCIAL_RUTHKIT;
  v.appendChild(socGuide('🚀','var(--orange-soft)','Ruth’s Execution Kit','Paste-and-post + the same-day Google review engine','FOR RUTH',
    `<p style="color:var(--ink2)">${esc(r.intro)}</p>
     <h6>Why the review habit matters most</h6><div class="callout orange"><p>${esc(r.why)}</p></div>
     <h6>Posting — 3 steps per row</h6>${r.steps.map((x,i)=>`<div class="fund"><div class="n">${i+1}</div><div><div class="ft">${esc(x)}</div></div></div>`).join('')}
     <h6>Review rules</h6>${r.rules.map(x=>`<div class="chk"><span class="b">✓</span><span>${esc(x)}</span></div>`).join('')}
     <h6>The same-day review text</h6><div class="callout green"><p>${esc(r.reviewText)}</p></div>`));

  // Handoff sheet
  const h=SOCIAL_HANDOFF;
  v.appendChild(socGuide('📋','var(--blue-soft)','The Handoff Sheet','One pre-filled row per post — Sebastian fills, Ruth executes','APPENDIX A',
    `<p style="color:var(--ink2)">${esc(h.intro)}</p>
     <h6>Sample row</h6>
     <table class="ref"><tr><th>Field</th><th>Value</th></tr>${h.columns.map(c=>`<tr><td class="tool">${esc(c[0])}</td><td>${esc(c[1])}</td></tr>`).join('')}</table>
     <h6>${esc(h.promptTitle)}</h6><div class="callout orange"><div class="eyebrow">${esc(h.promptSub)}</div><p style="margin-top:6px">${esc(h.prompt)}</p></div>`));

  // Content bank
  const b=SOCIAL_BANK;
  v.appendChild(socGuide('🏦','var(--green-soft)','The 33-Post Content Bank','A ready backlog mapped to the pillars & the 7 towns','APPENDIX B',
    `<p style="color:var(--ink2)">${esc(b.intro)}</p>
     ${b.groups.map(gr=>`<h6>${gr.icon} ${esc(gr.t)}</h6>${gr.items.map(it=>`<div class="chk"><span class="b">→</span><span>${esc(it)}</span></div>`).join('')}`).join('')}
     <h6>Hashtag sets</h6>
     <table class="ref"><tr><th>Set</th><th>Tags</th></tr>${b.hashtags.map(hs=>`<tr><td class="tool">${esc(hs[0])}</td><td>${esc(hs[1])}</td></tr>`).join('')}</table>
     <h6>Beyond the 7 towns</h6><div class="callout blue"><p>${esc(b.moreTowns)}</p></div>`));
}
function viewSocialStrategy(v){
  v.appendChild(el('div','page-head',`<h2>The Strategy</h2><p>Who the 2026 window buyer is, what your competitors are (and aren’t) doing, and the 30/60/90 sequence that turns a strong-but-silent reputation into the name homeowners recognize first.</p>`));

  // The buyer journey
  const j=SOCIAL_JOURNEY;
  const pun=el('div','callout orange');pun.style.padding='16px 18px';
  pun.innerHTML=`<div class="eyebrow">The buyer in one sentence</div><p style="margin-top:6px">${esc(j.oneSentence)}</p>`;
  v.appendChild(pun);
  const hb=el('div','callout blue');hb.style.padding='16px 18px';hb.style.marginTop='4px';
  hb.innerHTML=`<div class="eyebrow" style="color:var(--navy)">Social’s actual job</div><p style="margin-top:6px">${esc(j.honest)}</p>`;
  v.appendChild(hb);
  v.appendChild(el('div','nav-sec','How they buy — five fundamentals'));
  const fg=el('div','grid');
  j.fundamentals.forEach((f,i)=>{const c=el('div','card pad');
    c.innerHTML=`<div style="display:flex;gap:13px;align-items:flex-start"><div class="n" style="width:36px;height:36px;border-radius:10px;background:var(--navy);color:var(--orange);font-weight:800;display:grid;place-items:center;font-size:16px;flex:0 0 auto">${i+1}</div><div><div style="font-weight:800;font-size:15.5px;margin-bottom:3px">${esc(f.t)}</div><div style="color:var(--ink2)">${esc(f.d)}</div></div></div>`;
    fg.appendChild(c)});
  v.appendChild(fg);
  const sit=el('div','card pad');sit.style.marginTop='12px';sit.style.borderTop='3px solid var(--green)';
  sit.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">✅</div><div><h3>Where you stand</h3><small>The gap is visibility, not reputation</small></div></div><p style="color:var(--ink2)">${esc(j.situation)}</p>`;
  v.appendChild(sit);
  const ig=el('div','callout red');ig.style.marginTop='12px';
  ig.innerHTML=`<div class="eyebrow" style="color:var(--red)">What to ignore</div><p style="margin-top:6px">${esc(j.ignore)}</p>`;
  v.appendChild(ig);

  // Competitors
  const co=SOCIAL_COMPETITORS;
  v.appendChild(el('div','nav-sec','The competitive lane'));
  const lane=el('div','callout orange');lane.style.padding='16px 18px';
  lane.innerHTML=`<div class="eyebrow">Your lane</div><p style="margin-top:6px">${esc(co.lane)}</p>`;
  v.appendChild(lane);
  const cg=el('div','grid');cg.style.marginTop='4px';
  co.players.forEach(pl=>{const c=el('div','card pad');
    c.innerHTML=`<div style="font-weight:800;font-size:16px;margin-bottom:6px">${esc(pl.name)}</div>
      <div class="setrow"><span>Hook</span><b style="text-align:right;max-width:62%">${esc(pl.hook)}</b></div>
      <div class="setrow"><span>Social</span><b style="text-align:right;max-width:62%">${esc(pl.social)}</b></div>
      <div class="callout green" style="margin-top:8px"><div class="eyebrow" style="color:var(--green)">How you win</div><p style="margin-top:4px">${esc(pl.win)}</p></div>`;
    cg.appendChild(c)});
  v.appendChild(cg);
  const cig=el('div','callout red');cig.style.marginTop='12px';
  cig.innerHTML=`<div class="eyebrow" style="color:var(--red)">Don’t fight on their ground</div><p style="margin-top:6px">${esc(co.ignore)}</p>`;
  v.appendChild(cig);
  const cvd=el('div','callout blue');cvd.style.marginTop='8px';
  cvd.innerHTML=`<div class="eyebrow" style="color:var(--navy)">The verdict</div><p style="margin-top:6px">${esc(co.verdict)}</p>`;
  v.appendChild(cvd);

  // 30/60/90 roadmap
  const rd=SOCIAL_ROADMAP;
  v.appendChild(el('div','nav-sec','The 30 / 60 / 90 roadmap'));
  const wb=el('div','callout orange');wb.style.padding='16px 18px';
  wb.innerHTML=`<div class="eyebrow">Why sequence it</div><p style="margin-top:6px">${esc(rd.why)}</p>`;
  v.appendChild(wb);
  rd.phases.forEach(ph=>{const c=el('div','card pad');c.style.marginTop='12px';
    c.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--navy);color:var(--orange)">${ph.n}</div><div><h3>${esc(ph.t)}</h3><small>${esc(ph.milestone)}</small></div></div>${ph.actions.map(a=>`<div class="chk"><span class="b">✓</span><span>${esc(a)}</span></div>`).join('')}`;
    v.appendChild(c)});
  const rig=el('div','callout red');rig.style.marginTop='12px';
  rig.innerHTML=`<div class="eyebrow" style="color:var(--red)">What to ignore</div><p style="margin-top:6px">${esc(rd.ignore)}</p>`;
  v.appendChild(rig);
  const ral=el('div','callout green');ral.style.marginTop='8px';
  ral.innerHTML=`<div class="eyebrow" style="color:var(--green)">Compounds with SEO</div><p style="margin-top:6px">${esc(rd.alignment)}</p>`;
  v.appendChild(ral);
}
function viewSocialAudit(v){
  const a=SOCIAL_AUDIT;
  v.appendChild(el('div','page-head',`<h2>The Social Audit</h2><p>A property-by-property read of where Window Guardians stands on social today — what’s strong, what’s idle, and the fastest wins available right now.</p>`));
  const vd=el('div','card pad');vd.style.marginBottom='16px';vd.style.borderTop='3px solid var(--orange)';
  vd.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">📊</div><div><h3>The verdict</h3><small>Where you stand today</small></div></div><p style="color:var(--ink2)">${esc(a.verdict)}</p>`;
  v.appendChild(vd);
  v.appendChild(el('div','nav-sec','Property-by-property'));
  a.scores.forEach(s=>{const col=s.score>=6?'var(--green)':s.score>=4?'#9a6a08':'var(--red)';
    const bg=s.score>=6?'var(--green-soft)':s.score>=4?'var(--amber-soft)':'var(--red-soft)';
    const c=el('div','card pad');c.style.marginBottom='12px';
    c.innerHTML=`<div style="display:flex;gap:13px;align-items:center">
      <div class="n" style="width:46px;height:46px;border-radius:12px;background:${bg};color:${col};font-weight:800;display:grid;place-items:center;font-size:18px;flex:0 0 auto">${s.score}<span style="font-size:11px;opacity:.7">/10</span></div>
      <div style="flex:1;min-width:0"><div style="font-weight:800;font-size:16px">${esc(s.prop)}</div><div style="color:var(--ink2);font-size:13.5px">${esc(s.status)}</div></div>
      <span class="pill" style="background:${bg};color:${col};border-color:transparent;white-space:nowrap">${esc(s.verdict)}</span></div>`;
    v.appendChild(c)});
  const gp=el('div','card pad');gp.style.margin='4px 0 16px';gp.style.borderTop='3px solid var(--red)';
  gp.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--red-soft)">⚠️</div><div><h3>The gaps</h3><small>What’s holding the reputation back</small></div></div><p style="color:var(--ink2)">${esc(a.gaps)}</p>`;
  v.appendChild(gp);
  const wn=el('div','card pad');wn.style.borderTop='3px solid var(--green)';
  wn.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">✅</div><div><h3>Fastest wins</h3><small>Available right now — no new content needed</small></div></div>${a.wins.map(x=>`<div class="chk"><span class="b" style="color:var(--green)">✓</span><span>${esc(x)}</span></div>`).join('')}`;
  v.appendChild(wn);
}

/* ============================================================
   CONTENT CALENDAR  (the production layer — Sebastian composes,
   Ruth executes). Week-ahead planner + post composer + Ruth's
   ready-to-post queue + the scripted assistant.
   ============================================================ */
/* Re-render whatever screen we're actually on (Home, Calendar, Upload, …) — NOT always
   the calendar. Composer actions call this; forcing the calendar made the Home dashboard
   look "stuck" after approve/pull-back because Home never redrew. */
function rerenderCal(){ render(); }
function calWeeks(){ // current + next (rolling 2-week buffer)
  const cw=currentWeek(); const out=[];
  if(cw){out.push(cw);const nx=WEEKS.find(w=>w.id===cw.id+1);if(nx)out.push(nx);}
  else if(WEEKS.length)out.push(WEEKS[WEEKS.length-1]);
  return out;
}
/* grab a single frame from a video blob as a JPEG data-URL (null if the browser
   can't decode it — e.g. iPhone HEVC .mov). */
function videoThumb(blob){
  return new Promise((resolve)=>{
    const url=URL.createObjectURL(blob);
    const v=document.createElement('video');
    v.muted=true;v.playsInline=true;v.preload='metadata';v.src=url;
    let done=false;
    const finish=(val)=>{if(done)return;done=true;try{URL.revokeObjectURL(url)}catch(e){}resolve(val)};
    const grab=()=>{
      try{const w=v.videoWidth,h=v.videoHeight; if(!w||!h)return finish(null);
        const c=document.createElement('canvas');c.width=240;c.height=Math.round(240*h/w);
        c.getContext('2d').drawImage(v,0,0,c.width,c.height);
        finish(c.toDataURL('image/jpeg',0.7));
      }catch(e){finish(null)}
    };
    v.onloadeddata=()=>{try{v.currentTime=Math.min(0.1,(v.duration||1)/3)}catch(e){grab()}};
    v.onseeked=grab; v.onerror=()=>finish(null);
    setTimeout(()=>finish(null),5000);
  });
}
async function thumbInto(img,mediaId){
  if(!mediaId)return;
  try{const rec=await fileGet(mediaId);
    if(!rec||!rec.blob){ // no local copy — try the cloud (synced WebP), cache it
      if(VTHUMB[mediaId]){img.onload=()=>{img.style.display='block'};img.src=VTHUMB[mediaId];return;}
      const c=await cloudFileGet(mediaId); if(c&&c.dataUrl){VTHUMB[mediaId]=c.dataUrl;img.onload=()=>{img.style.display='block'};img.src=c.dataUrl;} return; }
    if(/image/.test(rec.type)){
      // show only once the browser actually decodes it; HEIC etc. that Chrome
      // can't render fail silently to the emoji placeholder instead of a broken icon
      img.onload=()=>{img.style.display='block';try{URL.revokeObjectURL(img.src)}catch(e){}};
      img.onerror=()=>{img.style.display='none';try{URL.revokeObjectURL(img.src)}catch(e){}};
      img.src=URL.createObjectURL(rec.blob);
    } else if(/video/.test(rec.type)||/\.(mp4|mov|m4v|webm)$/i.test(rec.name||'')){
      const d=await videoThumb(rec.blob);
      if(d){img.src=d;img.style.display='block';}
    }
  }catch(e){}
}
/* full-size preview: play a video / view a photo large */
let _mprevUrl=null;
function closeMediaPreview(){const o=$('#mprevOv');if(o)o.remove();if(_mprevUrl){try{URL.revokeObjectURL(_mprevUrl)}catch(e){}_mprevUrl=null;}}
async function openMediaPreview(mediaId,name){
  closeMediaPreview();
  const ov=el('div','mprev-ov');ov.id='mprevOv';
  const box=el('div','mprev-box');
  const x=el('button','mprev-x','✕');x.onclick=closeMediaPreview;box.appendChild(x);
  const body=el('div','mprev-body','<div class="muted" style="padding:30px">Loading…</div>');box.appendChild(body);
  ov.appendChild(box);document.body.appendChild(ov);
  ov.onclick=e=>{if(e.target===ov)closeMediaPreview()};
  try{const rec=await fileGet(mediaId);
    body.innerHTML='';
    if(!rec||!rec.blob){ const c=await cloudFileGet(mediaId); if(c&&c.dataUrl){const im=document.createElement('img');im.src=c.dataUrl;im.className='mprev-media';body.appendChild(im);if(name)box.appendChild(el('div','mprev-cap',esc(name)));}else body.appendChild(el('div','muted','Preview unavailable.')); return; }
    const url=URL.createObjectURL(rec.blob);_mprevUrl=url;
    const isVid=/^video\//.test(rec.type||'')||/\.(mp4|mov|m4v|webm)$/i.test(name||'');
    if(isVid){
      const wrap=el('div');wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:12px';
      const vid=document.createElement('video');vid.src=url;vid.controls=true;vid.autoplay=true;vid.playsInline=true;vid.className='mprev-media';
      const note=el('div');note.style.cssText='color:#fff;opacity:.9;font-size:12.5px;max-width:540px;text-align:center;display:none';
      note.innerHTML='This looks like an iPhone <b>HEVC .mov</b> — desktop Chrome can’t preview that format. It still posts perfectly (watch it on your phone, or download it below). Instagram &amp; Facebook handle it natively.';
      const dl=el('button','btn-set','⬇ Download to watch');dl.onclick=()=>{const a=document.createElement('a');a.href=url;a.download=name||'video';a.click();};
      vid.onerror=()=>{note.style.display='block'};
      setTimeout(()=>{if(!vid.videoWidth)note.style.display='block'},2000); // no frame decoded → show the note
      wrap.appendChild(vid);wrap.appendChild(note);wrap.appendChild(dl);
      body.appendChild(wrap);
    }else{
      const img=document.createElement('img');img.src=url;img.className='mprev-media';body.appendChild(img);
    }
    if(name)box.appendChild(el('div','mprev-cap',esc(name)));
  }catch(e){body.innerHTML='<div class="muted">Preview unavailable.</div>';}
}
function statusPill(s){const m={draft:['Draft','draft'],approved:['Ready','approved'],posted:['Posted','posted']}[s]||['Draft','draft'];return `<span class="pst ${m[1]}">${m[0]}</span>`}
/* Themed confirm dialog (replaces the generic browser confirm) — matches the app's
   card/modal look. Returns a Promise<boolean>. Stacks above the composer. */
function uiConfirm(message, opts){
  opts = opts||{};
  return new Promise(function(resolve){
    const ov=el('div','conf-ov');
    const box=el('div','conf-box');
    box.innerHTML=`<div class="conf-title">${esc(opts.title||'Are you sure?')}</div><div class="conf-body">${esc(message||'')}</div>`;
    const foot=el('div','conf-foot');
    const cancel=el('button','btn-set',opts.cancelText||'Cancel');
    const ok=el('button','btn-set '+(opts.danger?'danger':'primary'),opts.confirmText||'Confirm');
    foot.appendChild(cancel);foot.appendChild(ok);box.appendChild(foot);
    ov.appendChild(box);document.body.appendChild(ov);
    let done=false;
    const close=(val)=>{ if(done)return; done=true; document.removeEventListener('keydown',onKey); ov.remove(); resolve(val); };
    function onKey(e){ if(e.key==='Escape')close(false); else if(e.key==='Enter')close(true); }
    cancel.onclick=()=>close(false);
    ok.onclick=()=>close(true);
    ov.onclick=e=>{ if(e.target===ov)close(false); };
    document.addEventListener('keydown',onKey);
    setTimeout(()=>{try{ok.focus()}catch(e){}},30);
  });
}
function postCard(p){
  const pl=pillar(p.pillar);const ty=postType(p.type);
  const card=el('div','postcard '+p.status);
  const plats=SOC_PLATFORMS.filter(x=>p.platforms&&p.platforms[x.id]).map(x=>x.t[0]).join(' ');
  const cap=(p.caption||'').trim();
  const mm=postMedia(p);
  card.innerHTML=`<div class="pcimg"><img alt="" style="display:none"><span class="pcph">${pl.icon}</span><span class="pctype">${ty.icon} ${esc(ty.t)}</span>${mm.length>1?`<span class="pccount">📎 ${mm.length}</span>`:''}</div>
    <div class="pcbody">
      <div class="pcmeta"><span class="pchip">${pl.icon} ${esc(pl.t)}</span>${statusPill(p.status)}</div>
      <div class="pctown">📍 ${esc(p.town||'—')}${p.date?` · ${esc(p.date)}${p.time?' '+esc(p.time):''}`:''}</div>
      <div class="pccap">${cap?esc(cap.slice(0,90))+(cap.length>90?'…':''):'<span class=\"muted\">No caption yet</span>'}</div>
      <div class="pcfoot"><span class="pcplats">${plats||'—'}</span><span class="pcgap">${postReady(p)?'<span class=\"rdy\">✓ ready</span>':postGaps(p).length+' to add'}</span></div>
    </div>`;
  thumbInto(card.querySelector('img'),mm[0]&&mm[0].id);
  card.style.position='relative';
  const rm=el('button','pcdel','✕');rm.title='Remove this post';
  rm.onclick=async(e)=>{e.stopPropagation();
    const ok=await uiConfirm((p.status==='approved'?'It leaves your posts AND the posting queue.':'It leaves your posts.')+' The photos stay safe in your content.',{title:'Remove this post?',confirmText:'Remove',danger:true});
    if(ok){ poolReleaseForPost(p); delPostRec(p.id); rerenderCal(); toast('Post removed — photos back in your content'); }
  };
  card.appendChild(rm);
  card.onclick=()=>openComposer(p.id);
  return card;
}
function addPostTile(week){
  const pid=suggestPillar(week); const pl=pillar(pid);
  const card=el('div','postcard empty');
  card.innerHTML=`<div class="emptywrap"><div class="eplus">＋</div><div class="eptxt">Add a post</div><div class="epsug">${pl.icon} ${esc(pl.t)} suggested</div></div>`;
  card.onclick=()=>{const p=newPost(week);p.pillar=pid;openComposer(p,true);};
  return card;
}
/* a slim progress banner: this week's X/5, streak, runway */
function cadenceBanner(){
  const cw=currentWeek();const wk=cw?cw.id:((WEEKS[WEEKS.length-1]&&WEEKS[WEEKS.length-1].id)||1);
  const planned=weekPosts(wk).length, posted=weekPosts(wk).filter(p=>p.status==='posted').length;
  const pct=Math.min(100,Math.round(planned/SOC_WEEKLY_GOAL*100));
  const runway=socRunway(), streak=socStreak();
  const card=el('div','card pad cadbar');
  card.innerHTML=`<div class="cadtop"><div><div class="cadnum"><b>${planned}</b> / ${SOC_WEEKLY_GOAL} <span>planned this week</span></div>
      <div class="cadbar-track"><i style="width:${pct}%"></i></div></div>
      <div class="cadstats">
        <div class="cadstat"><b>${posted}</b><span>posted</span></div>
        <div class="cadstat"><b>${runway}</b><span>days covered</span></div>
        <div class="cadstat"><b>${streak}</b><span>week streak${streak>=1?' 🔥':''}</span></div>
      </div></div>
    <div class="cadhint">5 posts a week — any 5 days. Banking a few ahead is how you never miss.</div>`;
  return card;
}
let CAL_FILTER='all';
/* Ruth's ready-to-post pool */
function ruthQueue(v){
  const ready=socPosts().filter(p=>p.status==='approved').sort((a,b)=>(a.date||'~').localeCompare(b.date||'~'));
  const posted=socPosts().filter(p=>p.status==='posted').length;
  const q=el('div','card pad');
  q.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">📤</div><div><h3>Ready to post</h3><small><b>${ready.length}</b> waiting to post${posted?` · <b>${posted}</b> posted ✓`:''}</small></div></div>
    <p class="muted" style="font-size:12.5px;margin:2px 0 6px">For each one: copy the caption + hashtags, download the photo/video, post it on your channels — then tap <b>✅ Mark as posted</b> and it leaves the list.</p>`;
  if(!ready.length)q.innerHTML+=`<p class="muted">🎉 All caught up — nothing waiting. New posts Sebastian approves will show up here.</p>`;
  ready.forEach(p=>q.appendChild(readyCard(p)));
  v.appendChild(q);
}
let POOL_SEL=new Set();
let POOL_KIND='all'; // content filter: all | photos | videos
let POOL_GROUP='off'; // off | job (group by location)
let POOL_SRC='main'; // which Drive source: main folder vs a subfolder (e.g. Before/After)
/* Sebastian's home: coach → add content → content pool (select → make a post) → posts */
function socLibrary(v){
  const cw=currentWeek();
  const wk=cw?cw.id:(WEEKS[0]&&WEEKS[0].id)||1;

  // coach
  if(cw){
    const sug=aiSuggest(cw.id);
    const ai=el('div','card pad aibox');
    ai.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🧭</div><div><h3>Your Social Media Coach</h3><small>Tells you where you stand · the AI that writes captions lives inside each post</small></div></div><p class="ai-msg">${sug.msg}</p>`;
    if(sug.type==='finish'||sug.type==='approve'){
      const act=el('button','btn-set primary',sug.type==='approve'?'Review & approve →':'Finish this one →');
      act.onclick=()=>openComposer(sug.post.id);ai.appendChild(act);
    }
    v.appendChild(ai);
  }

  // ---- ADD CONTENT (regular photos · before/after · video · optional Drive) ----
  const add=el('div','card pad');add.style.marginTop='12px';
  add.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">⬆️</div><div><h3>Add content</h3><small>Upload straight from your phone or computer — it syncs to the whole team. iPhone HEIC is fine.</small></div></div>`;
  const drop=el('label','dropzone');
  drop.innerHTML=`<div class="dz-i">📥</div><div><b>Drag photos here</b><div class="muted" style="font-size:12.5px">or use the buttons below</div></div>`;
  const dropInp=el('input');dropInp.type='file';dropInp.accept='image/*,video/*,.heic,.heif,.mov';dropInp.multiple=true;dropInp.className='hidden';
  dropInp.onchange=async e=>{const had=e.target.files&&e.target.files.length;const n=await poolAddFiles(e.target.files,'');dropInp.value='';if(n){toast(n+' added to your content');rerenderCal();}else if(had)toast('Pick photo or video files (HEIC & MOV are fine).');};
  drop.appendChild(dropInp);
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag')};
  drop.ondragleave=()=>drop.classList.remove('drag');
  drop.ondrop=async e=>{e.preventDefault();drop.classList.remove('drag');const n=await poolAddFiles(e.dataTransfer.files,'');if(n){toast(n+' added to your content');rerenderCal();}else toast('Nothing added — drop photo or video files (not a folder).');};
  add.appendChild(drop);
  // clear, separate upload options — before/after stays in its own group
  const mkUp=(label,accept,folder,after)=>{
    const b=el('button','btn-set',label);b.style.cssText='margin:10px 8px 0 0';
    const i=el('input');i.type='file';i.accept=accept;i.multiple=true;i.className='hidden';
    i.onchange=async e=>{const had=e.target.files&&e.target.files.length;const n=await poolAddFiles(e.target.files,folder);i.value='';if(n){toast(n+(folder?' before/after photo'+(n>1?'s':'')+' added — kept separate ✓':' added to your content'));if(after)after();rerenderCal();}else if(had)toast('Pick the right file type (photos, or HEIC/MOV).');};
    b.onclick=()=>i.click();
    const w=el('span');w.style.cssText='display:inline-flex';w.appendChild(b);w.appendChild(i);return w;
  };
  const btnrow=el('div');btnrow.style.cssText='display:flex;flex-wrap:wrap;align-items:center';
  btnrow.appendChild(mkUp('📷 Upload photos','image/*,.heic,.heif','',null));
  btnrow.appendChild(mkUp('🔀 Upload before/after','image/*,.heic,.heif','Before & After',()=>{POOL_SEL.clear();POOL_SRC='Before & After';}));
  btnrow.appendChild(mkUp('🎬 Upload video','video/*,.mov','',null));
  add.appendChild(btnrow);
  // optional: Google Drive bulk import (tucked small)
  if(ST.driveConnected){
    add.appendChild(el('div','muted',ST.driveNeedsReconnect?'⚠️ Google sign-in expired — tap Sync to reconnect.':'Optional — bulk-import from your Google Drive folder:')).style.cssText='font-size:11.5px;margin-top:16px';
    const gd=el('button','btn-set','🔄 Sync Google Drive');gd.style.cssText='margin-top:4px;font-size:12.5px;padding:6px 10px';
    gd.onclick=()=>gdSyncNow(true).then(()=>gdStartPolling());
    add.appendChild(gd);
  }else{
    add.appendChild(el('div','muted','Optional — connect Google Drive to bulk-import a folder:')).style.cssText='font-size:11.5px;margin-top:16px';
    const gd=el('button','btn-set','🟢 Connect Google Drive');gd.style.cssText='margin-top:4px;font-size:12.5px;padding:6px 10px';
    gd.onclick=()=>gdConnect();
    add.appendChild(gd);
  }
  v.appendChild(add);
  gdAutoResume();

  // ---- CONTENT POOL: tick pieces → make a post ----
  const isVidItem=m=>/\.(mp4|mov|m4v|webm)$/i.test(m.name||'')||/^video\//.test(m.type||'');
  const isMain=m=>!m.folder||m.folder==='Drive'; // files sitting directly in the synced folder = main content
  const poolAll=poolAvailable().slice().sort((a,b)=>(b.addedAt||0)-(a.addedAt||0)); // newest added first
  // source folders: Main + each Drive subfolder (e.g. your Before/After folder)
  const subfolders=[...new Set(poolAll.filter(m=>!isMain(m)).map(m=>m.folder))];
  if(POOL_SRC!=='main'&&subfolders.indexOf(POOL_SRC)===-1)POOL_SRC='main';
  const srcItems = POOL_SRC==='main' ? poolAll.filter(isMain) : poolAll.filter(m=>m.folder===POOL_SRC);
  const avail=srcItems;
  const allAvail=poolAll; // for resolving selections when making a post
  const grouped = (POOL_SRC!=='main' && POOL_SRC!=='Videos'); // before/after (and Drive subfolders) auto-group by GPS; Content + Videos stay flat
  const poolCard=el('div','card pad');poolCard.style.marginTop='12px';
  const sub = POOL_SRC==='main'?'Your everyday photos, newest first.':POOL_SRC==='Videos'?'Your videos.':'Grouped by job location — tap a photo to set Before / After.';
  poolCard.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">🗂️</div><div><h3>Your content</h3><small>${sub} Tap the ◯ corner to pick for a post.</small></div></div>`;
  // controls: just the area switcher (Content · Before & After · Videos)
  const ctrls=el('div','poolctrls');
  if(subfolders.length){
    const srcSel=el('select','cmp-in');
    const mainN=poolAll.filter(isMain).length;
    const opts=[['main',`📷 Content (${mainN})`]].concat(subfolders.map(f=>[f,`${f==='Before & After'?'🔀':f==='Videos'?'🎬':'📁'} ${f} (${poolAll.filter(m=>m.folder===f).length})`]));
    opts.forEach(([v2,label])=>{const o=document.createElement('option');o.value=v2;o.textContent=label;if(POOL_SRC===v2)o.selected=true;srcSel.appendChild(o)});
    srcSel.onchange=()=>{POOL_SEL.clear();POOL_SRC=srcSel.value;rerenderCal()};
    ctrls.appendChild(srcSel);
  }
  poolCard.appendChild(ctrls);

  const makeBtn=el('button','btn-set primary');makeBtn.style.marginTop='12px';
  const updateMakeBtn=()=>{makeBtn.textContent=POOL_SEL.size?`＋ Make a post from ${POOL_SEL.size} selected`:'＋ Make a post — tick content first';makeBtn.disabled=!POOL_SEL.size;};
  const buildCell=(m)=>{
    const isVid=/\.(mp4|mov|m4v|webm)$/i.test(m.name||'')||/^video\//.test(m.type||'');
    const cell=el('div','poolcell'+(POOL_SEL.has(m.id)?' sel':''));
    const img=el('img','poolimg');
    const ph=el('span','poolph',isVid?'🎬':'🖼️');
    img.addEventListener('load',()=>{img.style.display='block';ph.style.display='none';if(isVid&&(''+img.src).slice(0,5)==='data:')VTHUMB[m.id]=img.src;});
    if(VTHUMB[m.id])img.src=VTHUMB[m.id];
    else if(isVid&&m.driveThumb){img.onerror=()=>{img.onerror=null;thumbInto(img,m.id);};img.src=m.driveThumb;} // Google's video thumbnail (works for HEVC); fall back to a local frame-grab
    else thumbInto(img,m.id);
    cell.appendChild(img);cell.appendChild(ph);
    if(isVid)cell.appendChild(el('span','poolplay','▶'));
    const ck=el('span','poolck','✓');
    ck.onclick=(e)=>{e.stopPropagation();if(POOL_SEL.has(m.id))POOL_SEL.delete(m.id);else POOL_SEL.add(m.id);cell.classList.toggle('sel');updateMakeBtn();};
    cell.appendChild(ck);
    cell.onclick=()=>openMediaPreview(m.id,m.name);
    return cell;
  };
  if(grouped)renderSavedJobs(poolCard); // saved before/after jobs only show in the Before & After area
  if(!avail.length){
    if(!(grouped&&socBaJobs().length))poolCard.innerHTML+=`<p class="muted">${POOL_SRC==='Videos'?'No videos yet — add with “🎬 Upload video”.':POOL_SRC==='main'?'No content yet — add with “📷 Upload photos”.':'Nothing here yet — add with “🔀 Upload before/after”.'}</p>`;
  }else if(grouped){
    const located=avail.filter(hasLoc);
    const noloc=avail.filter(m=>!hasLoc(m));
    const clusters=clusterByLocation(located,60);
    clusters.forEach((c,i)=>{
      const d=el('details','jobgroup');if(i<2)d.open=true;
      d.appendChild(el('summary','jobsum',`📍 Job ${i+1} · ${c.items.length} photo${c.items.length>1?'s':''}`));
      const g=el('div','poolgrid');c.items.forEach(m=>g.appendChild(buildCell(m)));d.appendChild(g);
      poolCard.appendChild(d);
    });
    if(noloc.length){
      const d=el('details','jobgroup');
      d.appendChild(el('summary','jobsum',`📍 No location · ${noloc.length} — tap “Add to a job” to file them`));
      const g=el('div','poolgrid');
      noloc.forEach(m=>{const cell=buildCell(m);const add=el('button','addtojob','📍 Add to a job');add.onclick=(e)=>{e.stopPropagation();openJobPicker(m);};cell.appendChild(add);g.appendChild(cell);});
      d.appendChild(g);
      poolCard.appendChild(d);
    }
    if(!clusters.length&&!noloc.length)poolCard.innerHTML+=`<p class="muted">Nothing to group here.</p>`;
  }else{
    const grid=el('div','poolgrid');
    avail.forEach(m=>grid.appendChild(buildCell(m)));
    poolCard.appendChild(grid);
  }
  updateMakeBtn();
  makeBtn.onclick=()=>{
    const sel=allAvail.filter(m=>POOL_SEL.has(m.id));if(!sel.length)return;makeBtn.disabled=true;
    const p=newPost(wk);
    p.media=sel.map(m=>({id:m.id,name:m.name}));
    p.type=sel.length>1?'carousel':(/\.(mp4|mov|m4v|webm)$/i.test(sel[0].name||'')?'reel':'photo');
    poolSetStatus(sel.map(m=>m.id),'used');commit();
    POOL_SEL.clear();
    openComposer(p,true);
  };
  poolCard.appendChild(makeBtn);
  const baBtn=el('button','btn-set','🔀 Make Before/After job');baBtn.style.cssText='margin:12px 0 0 8px';
  baBtn.onclick=()=>{const sel=allAvail.filter(m=>POOL_SEL.has(m.id));if(sel.length<2){toast('Tick at least 2 — a before and an after.');return;}openBaBuilder(sel);};
  poolCard.appendChild(baBtn);
  const blank=el('button','btn-set','＋ Blank post');blank.style.cssText='margin:12px 0 0 8px';
  blank.onclick=()=>openComposer(newPost(wk),true);
  poolCard.appendChild(blank);
  v.appendChild(poolCard);

  // ---- POSTS: drafts + waiting queue (posted ones disappear into archive) ----
  const active=socPosts().filter(p=>p.status!=='posted');
  const drafts=active.filter(p=>p.status==='draft');
  const queued=active.filter(p=>p.status==='approved');
  const postsCard=el('div','card pad');postsCard.style.marginTop='12px';
  postsCard.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--green-soft)">📝</div><div><h3>Your posts</h3><small>${drafts.length} draft${drafts.length===1?'':'s'} · ${queued.length} waiting in the queue</small></div></div>`;
  if(!active.length){
    postsCard.innerHTML+=`<p class="muted">No posts yet. Tick some content above and tap “Make a post”.</p>`;
  }else{
    const grid=el('div','library');
    drafts.concat(queued).forEach(p=>grid.appendChild(postCard(p)));
    postsCard.appendChild(grid);
  }
  v.appendChild(postsCard);
}
/* social-calendar.html (if visited directly) mirrors Home */
function viewCalendar(v){return viewSocialDashboard(v);}
function readyCard(p){
  const pl=pillar(p.pillar);const ty=postType(p.type);
  const card=el('div','readycard');
  card.innerHTML=`<div class="rcimg"><img alt="" style="display:none"><span class="pcph">${pl.icon}</span><span class="pctype">${ty.icon} ${esc(ty.t)}</span></div>
    <div class="rcbody">
      <div class="pcmeta"><span class="pchip">${pl.icon} ${esc(pl.t)}</span><span class="muted" style="font-size:12px">${esc(ty.t)}${p.date?' · '+esc(p.date)+(p.time?' '+esc(p.time):''):''}</span></div>
      <div class="rcfield"><label>Caption</label><div class="rctext">${esc(p.caption||'—')}</div><button class="copybtn" data-copy="cap">Copy</button></div>
      <div class="rcfield"><label>Hashtags</label><div class="rctext">${esc(p.hashtags||'—')}</div><button class="copybtn" data-copy="tags">Copy</button></div>
      <div class="rcloc">📍 <b>Location: ${esc(p.town||'—')}</b> — on Instagram/Facebook tap <b>Add location</b> and choose “${esc(p.town||'your town')}, PA”. Google &amp; Nextdoor are already local.</div>
      <div class="rcnote">📋 ${esc(p.ruthNote||aiRuthNote(p))}</div>
    </div>`;
  const mm=postMedia(p);
  thumbInto(card.querySelector('img'),mm[0]&&mm[0].id);
  if(mm[0]){const rcimg=card.querySelector('.rcimg');rcimg.style.cursor='pointer';rcimg.title='Tap to preview';rcimg.onclick=()=>openMediaPreview(mm[0].id,mm[0].name);}
  // multi-media: show every photo in order with Before/After labels so Ruth posts them right
  if(mm.length>1){
    const body=card.querySelector('.rcbody');
    const sf=el('div','rcfield');sf.innerHTML='<label>Photos — post in this order'+(mm.some(m=>m.role)?' (labels shown)':'')+'</label>';
    const strip=el('div','rcstrip');
    mm.forEach((m,i)=>{const t=el('div','rcthumb'+(m.role?(' '+m.role):''));const im=document.createElement('img');im.style.display='none';im.addEventListener('load',()=>im.style.display='block');if(VTHUMB[m.id])im.src=VTHUMB[m.id];else thumbInto(im,m.id);t.appendChild(im);t.appendChild(el('span','rcnum',String(i+1)));if(m.role)t.appendChild(el('span','rcrolebadge '+m.role,m.role==='before'?'BEFORE':'AFTER'));t.onclick=()=>openMediaPreview(m.id,m.name);strip.appendChild(t);});
    sf.appendChild(strip);body.insertBefore(sf,body.querySelector('.rcloc'));
  }
  card.querySelector('[data-copy="cap"]').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(p.caption||'');toast('Caption copied')};
  card.querySelector('[data-copy="tags"]').onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(p.hashtags||'');toast('Hashtags copied')};
  const foot=el('div','rcactions');
  const dlb=el('button','btn-set',mm.length>1?`⬇ Download ${mm.length} files`:'⬇ Download media');
  dlb.onclick=async()=>{const arr=postMedia(p);if(!arr.length){toast('No media on this post');return}for(const m of arr){const rec=await fileGet(m.id);if(rec&&rec.blob){const u=URL.createObjectURL(rec.blob);const a=document.createElement('a');a.href=u;a.download=rec.name||m.name||'media';a.click();URL.revokeObjectURL(u);}else{const c=await cloudFileGet(m.id);if(c&&c.dataUrl){const a=document.createElement('a');a.href=c.dataUrl;a.download=c.name||m.name||'photo.webp';a.click();}}}toast(arr.length>1?'Downloading all '+arr.length:'Downloading')};
  const done=el('button','btn-set primary done-btn','✅ Mark as posted');done.onclick=async()=>{done.disabled=true;const post=postById(p.id);if(post){post.status='posted';poolArchiveForPost(post);if(post.fromJob)ST.bajobs=socBaJobs().filter(x=>x.id!==post.fromJob);savePost(post);bumpPostsKpi();toast('Posted ✓ — nice! It’s off your list.');await purgePostedMedia(post);rerenderCal()}};
  foot.appendChild(dlb);foot.appendChild(done);
  card.querySelector('.rcbody').appendChild(foot);
  return card;
}
function bumpPostsKpi(){ // keep the "Posts published" KPI in step with posted count
  const posted=socPosts().filter(p=>p.status==='posted').length;
  if(ST.kpis&&typeof ST.kpis.posts==='number'&&posted>ST.kpis.posts){ST.kpis.posts=posted;commit()}
}
/* this-week posting status, clocked on the Social dashboard home */
function socPostStrip(){
  const cw=currentWeek();if(!cw)return null;
  const posts=weekPosts(cw.id);
  const planned=posts.length, posted=posts.filter(p=>p.status==='posted').length;
  const pct=Math.min(100,Math.round(planned/SOC_WEEKLY_GOAL*100));
  const runway=socRunway(), streak=socStreak();
  const card=el('div','card pad');card.style.marginTop='16px';
  card.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--orange-soft)">🗓️</div><div><h3>This week’s posts</h3><small>5 a week — any 5 days. Consistency is the whole game.</small></div></div>
    <div class="cadnum" style="margin-top:6px"><b>${planned}</b> / ${SOC_WEEKLY_GOAL} <span>planned${posted?` · ${posted} posted`:''}</span></div>
    <div class="cadbar-track"><i style="width:${pct}%"></i></div>`;
  const foot=el('div');foot.style.cssText='display:flex;gap:16px;margin-top:12px;font-size:13px;color:var(--ink2);flex-wrap:wrap;align-items:center';
  foot.innerHTML=`<span><b>${runway}</b> days covered</span><span><b>${streak}</b> week streak${streak>=1?' 🔥':''}</span>`;
  const open=el('button','btn-set primary','Open Content Calendar');open.style.marginLeft='auto';open.onclick=()=>location.href='social-calendar.html';
  foot.appendChild(open);card.appendChild(foot);
  return card;
}

/* ---------- POST COMPOSER (modal) ---------- */
function openComposer(idOrPost,isNew){
  const p=(typeof idOrPost==='string')?Object.assign({},postById(idOrPost)):idOrPost;
  if(!p)return;
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';
  const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>${isNew?'New post':'Edit post'} · Week ${p.week}</h3><button class="cmp-x" id="cmpX">✕</button></div><div class="cmp-body" id="cmpBody"></div>`;
  ov.appendChild(box);document.body.appendChild(ov);
  ov.onclick=e=>{if(e.target===ov)closeComposer()};
  $('#cmpX').onclick=closeComposer;
  const b=$('#cmpBody');

  // post type segmented (the format)
  const tf0=el('div','cmp-field');tf0.innerHTML='<label>Post type</label>';
  const tseg=el('div','seg');
  if(!p.type)p.type='photo';
  SOC_TYPES.forEach(ty=>{const btn=el('button','seg-b'+(p.type===ty.id?' on':''),`${ty.icon} ${ty.t}`);btn.onclick=()=>{p.type=ty.id;tseg.querySelectorAll('.seg-b').forEach(x=>x.classList.remove('on'));btn.classList.add('on')};tseg.appendChild(btn)});
  tf0.appendChild(tseg);b.appendChild(tf0);

  // category segmented
  const pf=el('div','cmp-field');pf.innerHTML='<label>Category</label>';
  const seg=el('div','seg');
  SOC_PILLARS.forEach(pl=>{const btn=el('button','seg-b'+(p.pillar===pl.id?' on':''),`${pl.icon} ${pl.t}`);btn.onclick=()=>{p.pillar=pl.id;seg.querySelectorAll('.seg-b').forEach(x=>x.classList.remove('on'));btn.classList.add('on')};seg.appendChild(btn)});
  pf.appendChild(seg);b.appendChild(pf);

  // town (Ruth gets the "how to add the location" steps in her queue + guide)
  const tf=el('div','cmp-field');tf.innerHTML='<label>Town <span class="muted" style="font-weight:600">— Ruth tags this as the post location</span></label>';
  const sel=el('select','cmp-in');SOC_TOWNS.forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t;if(t===p.town)o.selected=true;sel.appendChild(o)});
  sel.onchange=()=>p.town=sel.value;tf.appendChild(sel);b.appendChild(tf);

  // media
  const mf=el('div','cmp-field');mf.innerHTML='<label>Media</label>';
  const media=el('div','mediabox');
  const renderMedia=()=>{
    media.innerHTML='';
    const arr=postMedia(p);
    const grid=el('div','medgrid');
    arr.forEach((m,i)=>{
      const cell=el('div','medcell');
      const img=el('img','medthumb');thumbInto(img,m.id);
      const ph=el('span','medph',/\.(mp4|mov|m4v|webm)$/i.test(m.name||'')?'🎬':'🖼️');
      const x=el('button','medx','✕');x.title='Remove';x.onclick=()=>{p.media.splice(i,1);renderMedia()};
      const nm=el('div','medname',esc(m.name||'attached'));
      cell.appendChild(img);cell.appendChild(ph);cell.appendChild(x);cell.appendChild(nm);grid.appendChild(cell);
    });
    // always-present add zone (multiple)
    const drop=el('label','meddrop'+(arr.length?' small':''),arr.length?'＋ Add more':'📷 Tap to add photos or videos — pick several at once');
    const inp=el('input');inp.type='file';inp.accept='image/*,video/*,.heic,.heif,.mov';inp.multiple=true;inp.className='hidden';
    inp.onchange=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;
      if(files.some(isHeic))toast('iPhone photo — converting…');
      for(const raw of files){const f=await normalizeImage(raw);const rec=await fileAdd(f,p.week,S.role,'post.'+p.id);p.media.push({id:rec.id,name:rec.name});}
      renderMedia();toast(files.length>1?files.length+' files attached':'Media attached')};
    drop.appendChild(inp);grid.appendChild(drop);
    media.appendChild(grid);
    // add from the existing dashboard library (where your uploaded / Drive photos live)
    const fromBtn=el('button','btn-set','🗂️ Add from your content');fromBtn.style.marginTop='8px';
    const picker=el('div');picker.style.cssText='display:none;margin-top:8px';
    fromBtn.onclick=()=>{
      if(picker.style.display!=='none'){picker.style.display='none';fromBtn.textContent='🗂️ Add from your content';return;}
      picker.innerHTML='';
      const used=new Set(postMedia(p).map(x=>x.id));
      const avail=poolAvailable().filter(m=>!used.has(m.id)).sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
      if(!avail.length){ picker.innerHTML='<div class="muted" style="font-size:12.5px;padding:6px 2px">Nothing in your library yet — upload photos on the Home screen first.</div>'; }
      else{
        const g=el('div','medgrid');
        avail.slice(0,60).forEach(m=>{
          const cell=el('div','medcell');cell.style.cursor='pointer';
          const img=el('img','medthumb');
          if(VTHUMB[m.id])img.src=VTHUMB[m.id]; else if(m.driveThumb){img.onerror=()=>{img.onerror=null;thumbInto(img,m.id);};img.src=m.driveThumb;} else thumbInto(img,m.id);
          cell.appendChild(img);cell.appendChild(el('div','medname',esc(m.name||'')));
          cell.onclick=()=>{ postMedia(p).push({id:m.id,name:m.name}); renderMedia(); toast('Added — tap “Add from your content” again for more'); };
          g.appendChild(cell);
        });
        picker.appendChild(g);
      }
      picker.style.display='';fromBtn.textContent='✕ Close library';
    };
    media.appendChild(fromBtn);media.appendChild(picker);
  };
  renderMedia();mf.appendChild(media);b.appendChild(mf);

  // job note
  const jf=el('div','cmp-field');jf.innerHTML='<label>Job note <span class="muted" style="font-weight:600">— what you did, in your words (feeds the AI)</span></label>';
  const jn=el('textarea','cmp-in');jn.rows=2;jn.value=p.jobNote||'';jn.placeholder='e.g. swapped 8 drafty double-hungs for Okna, whole job in a day';
  jn.oninput=()=>{p.jobNote=jn.value;const t=townInNote(jn.value);if(t&&t!==p.town){p.town=t;sel.value=t;}}; // name a town → Town field follows
  jf.appendChild(jn);b.appendChild(jf);

  // caption — you write it; the expert suggests options you can swap in
  const cf=el('div','cmp-field');cf.innerHTML='<label>Caption <span class="muted" style="font-weight:600">— write your own, or tap Suggest for expert options</span></label>';
  const ca=el('textarea','cmp-in');ca.rows=4;ca.value=p.caption||'';ca.placeholder='Write the caption in your voice…';ca.oninput=()=>p.caption=ca.value;
  const caAI=el('button','btn-set ai-draft','✨ Suggest captions');
  const caOpts=el('div','sugbox');
  caAI.onclick=()=>{
    caOpts.innerHTML='';
    if(caOpts.dataset.open==='1'){caOpts.dataset.open='0';return}
    caOpts.dataset.open='1';
    aiCaptionOptions(p).forEach(txt=>{const o=el('button','sugopt',esc(txt));o.onclick=()=>{ca.value=txt;p.caption=txt;caOpts.innerHTML='';caOpts.dataset.open='0';toast('Swapped in — tweak as you like')};caOpts.appendChild(o)});
  };
  cf.appendChild(ca);cf.appendChild(caAI);cf.appendChild(caOpts);b.appendChild(cf);

  // hashtags — same pattern
  const hf=el('div','cmp-field');hf.innerHTML='<label>Hashtags</label>';
  const ha=el('input','cmp-in');ha.value=p.hashtags||'';ha.placeholder='#WindowGuardians …';ha.oninput=()=>p.hashtags=ha.value;
  const haAI=el('button','btn-set ai-draft','✨ Suggest hashtags');
  const haOpts=el('div','sugbox');
  haAI.onclick=()=>{
    haOpts.innerHTML='';
    if(haOpts.dataset.open==='1'){haOpts.dataset.open='0';return}
    haOpts.dataset.open='1';
    aiHashtagOptions(p).forEach(txt=>{const o=el('button','sugopt',esc(txt));o.onclick=()=>{ha.value=txt;p.hashtags=txt;haOpts.innerHTML='';haOpts.dataset.open='0';toast('Hashtags swapped in')};haOpts.appendChild(o)});
  };
  hf.appendChild(ha);hf.appendChild(haAI);hf.appendChild(haOpts);b.appendChild(hf);

  // date + time
  const dr=el('div','cmp-row');
  const df=el('div','cmp-field');df.innerHTML='<label>Date</label>';const di=el('input','cmp-in');di.type='date';di.value=p.date||'';di.onchange=()=>p.date=di.value;df.appendChild(di);dr.appendChild(df);
  const tff=el('div','cmp-field');tff.innerHTML='<label>Time</label>';const ti=el('input','cmp-in');ti.type='time';ti.value=p.time||'11:00';ti.onchange=()=>p.time=ti.value;tff.appendChild(ti);dr.appendChild(tff);
  b.appendChild(dr);

  // footer
  const foot=el('div','cmp-foot');
  if(!isNew){const del=el('button','btn-set danger','Delete');del.onclick=async()=>{const ok=await uiConfirm('It’s removed everywhere (drafts + queue). The photos go back to your content so you can reuse them.',{title:'Delete this post?',confirmText:'Delete',danger:true});if(ok){poolReleaseForPost(p);delPostRec(p.id);closeComposer();rerenderCal();toast('Post deleted — photos back in your content')}};foot.appendChild(del);}
  const spacer=el('div');spacer.style.flex='1';foot.appendChild(spacer);
  const save=el('button','btn-set','Save draft');save.onclick=async()=>{const wasAppr=(p.status==='approved');p.status=p.status==='posted'?'posted':(wasAppr?'approved':'draft');p.ruthNote=aiRuthNote(p);if(wasAppr){save.disabled=true;toast('Saving + syncing photos…');await publishPostMedia(p);}savePost(p);closeComposer();rerenderCal();toast('Saved')};
  const appr=el('button','btn-set primary',p.status==='approved'?'✓ Approved — save':'Approve & send to queue');
  appr.onclick=async()=>{const g=postGaps(p);if(g.length){toast('Add '+g.join(', ')+' before approving');return}appr.disabled=true;toast('Sharing photos to the team…');const r=await publishPostMedia(p);p.status='approved';p.ruthNote=aiRuthNote(p);savePost(p);closeComposer();rerenderCal();toast(r&&r.skipped?('Approved → posting queue ('+r.skipped+' item'+(r.skipped>1?'s':'')+' couldn’t be shared)'):'Approved → posting queue ✓');};
  foot.appendChild(save);foot.appendChild(appr);b.appendChild(foot);
}
function closeComposer(){const o=$('#cmpOv');if(o)o.remove()}

/* ============================================================
   BOOT  (multi-page: nav uses real <a href> links to .html files;
   active item determined by currentView(); no SPA view-switching)
   ============================================================ */
/* ============================================================
   SIMPLE PHONE UPLOADER  (upload.html · data-view="upload")
   One job: get content off the phone and shared with the team in
   the fewest taps. Photos work now (free). Video lights up after
   the one-time Firebase Storage step — flip UPLOAD_VIDEO_READY.
   ============================================================ */
var UPLOAD_VIDEO_READY = false;   // set true once cloud video storage is wired
var UPLOAD_JUST = [];             // ids added THIS session — drives the "Just added" strip

function uploaderPick(accept, folder, isBA){
  const i=document.createElement('input');
  i.type='file'; i.accept=accept; i.multiple=true; i.style.display='none';
  document.body.appendChild(i);
  i.onchange=async e=>{
    const had=e.target.files&&e.target.files.length;
    const before=new Set(socPool().map(m=>m.id));
    const n=await poolAddFiles(e.target.files, folder);
    i.remove();
    if(!n){ if(had)toast('Pick photos — iPhone HEIC is fine.'); return; }
    const added=socPool().filter(m=>!before.has(m.id));
    UPLOAD_JUST = added.map(m=>m.id).concat(UPLOAD_JUST);   // newest first
    render();                                               // refresh the "Just added" strip
    if(isBA && added.length){ openBaBuilder(added); }       // tag before / after right on the phone
    else { toast('✓ '+n+' added — shared with the team'); }
  };
  i.click();
}

function viewUploader(v){
  // Posters (e.g. Ruth) post approved content — they don't add it, and the rules block their writes.
  if(amPoster()){
    v.appendChild(el('div','page-head',`<h2>Quick Upload</h2>`));
    const c=el('div','card pad');
    c.innerHTML=`<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">📤</div><div><h3>You're set up to post</h3><small>This quick uploader is for adding new content.</small></div></div><p class="muted" style="font-size:14px;line-height:1.5">Your job is posting the approved content — head to your queue to grab what's ready and post it.</p>`;
    const a=el('a','upfull','Open my post queue →');a.setAttribute('href','social.html');
    c.appendChild(a); v.appendChild(c); return;
  }

  v.appendChild(el('div','page-head',`<h2>Quick Upload</h2><p>Snap → upload → done. Photos go straight to the whole team. Open the full dashboard when you’re ready to make posts.</p>`));

  const card=el('div','card pad');
  const photo=el('button','upbtn','<span class="upic">📷</span><span class="uptx"><b>Photos</b><small>Everyday job photos</small></span>');
  photo.onclick=()=>uploaderPick('image/*,.heic,.heif','',false);
  const ba=el('button','upbtn','<span class="upic">🔀</span><span class="uptx"><b>Before / After</b><small>Pick the pair, then tap to label</small></span>');
  ba.onclick=()=>uploaderPick('image/*,.heic,.heif','Before & After',true);
  const vlabel = UPLOAD_VIDEO_READY ? 'Job videos' : 'Turns on after the storage step';
  const vid=el('button','upbtn'+(UPLOAD_VIDEO_READY?'':' locked'),'<span class="upic">🎬</span><span class="uptx"><b>Video</b><small>'+vlabel+'</small></span>');
  vid.onclick=()=>{ if(UPLOAD_VIDEO_READY)uploaderPick('video/*,.mov','Videos',false); else toast('🎬 Video turns on after the quick Firebase storage step — photos are ready to use right now.'); };
  card.appendChild(photo);card.appendChild(ba);card.appendChild(vid);
  v.appendChild(card);

  // "Just added" strip — ONLY this session's uploads, so it's honest reassurance (not old library content)
  const pool=socPool();
  const recent=UPLOAD_JUST.map(id=>pool.find(m=>m.id===id)).filter(Boolean).slice(0,12);
  if(recent.length){
    const rc=el('div','card pad');rc.style.marginTop='12px';
    rc.innerHTML='<div class="sec-title"><div class="chip" style="background:var(--blue-soft)">✅</div><div><h3>Just added</h3><small>Your latest uploads — already shared with the team.</small></div></div>';
    const g=el('div','upstrip');
    recent.forEach(m=>{
      const isVid=/\.(mp4|mov|m4v|webm)$/i.test(m.name||'')||/^video\//.test(m.type||'');
      const cell=el('div','upthumb');
      const img=el('img');img.addEventListener('load',()=>img.style.display='block');
      if(VTHUMB[m.id])img.src=VTHUMB[m.id]; else thumbInto(img,m.id);
      cell.appendChild(img);
      if(isVid)cell.appendChild(el('span','poolplay','▶'));
      if(m.folder==='Before & After')cell.appendChild(el('span','uptag','B/A'));
      cell.onclick=()=>openMediaPreview(m.id,m.name);
      g.appendChild(cell);
    });
    rc.appendChild(g);
    v.appendChild(rc);
  }

  const link=el('a','upfull','Open the full dashboard →');link.setAttribute('href','social.html');
  v.appendChild(link);
}

function renderGate(){
  const wrap=$('#whoBtns');if(!wrap)return;
  ensureAuth();
  const users=()=>(S.users||[]).filter(u=>u.active!==false);
  const showList=()=>{
    wrap.innerHTML=users().map(u=>
      `<button data-uid="${u.id}">${av(u.id)}<div><div class="nm">${esc(u.name)}</div><div class="rl">${esc(u.title||'')}</div></div></button>`).join('')
      +(window.WG_FB_READY?'':`<button data-uid="__guest" style="grid-column:1/-1;justify-content:center">👀 <div><div class="nm">Just looking — browse only</div></div></button>`);
    wrap.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      const id=b.dataset.uid;
      if(id==='__guest'){S.uid=null;S.role='all';commit();enterApp();return;}
      showPw(userById(id));
    });
  };
  const showPw=(u)=>{
    if(!u){showList();return;}
    wrap.innerHTML=`<div class="login-step">
      <div class="login-who">${av(u.id)}<div><div class="nm">${esc(u.name)}</div><div class="rl">${esc(u.title||'')}</div></div></div>
      <label class="login-lbl">Password</label>
      <input type="password" id="gatePw" class="login-pw" placeholder="Enter your password" autocomplete="current-password">
      <div class="login-actions"><button class="btn-set" id="gateBack">← Back</button><button class="btn-set primary" id="gateGo">Log in</button></div>
      <div class="login-hint">Prototype login — real security turns on with the backend.</div>
    </div>`;
    const pw=$('#gatePw'); if(pw)pw.focus();
    const enter=()=>{S.uid=u.id;S.role=PEOPLE[u.id]?u.id:'all';commit();enterApp();};
    const go=async()=>{ const val=($('#gatePw')||{}).value||''; const btn=$('#gateGo');
      if(window.WG_FB_READY){ // LOCKED: the app requires a real Firebase login
        if(!u.email){ toast('Your login isn’t set up yet — ask Sebastian to add your email in Team & logins.'); return; }
        if(!val){ toast('Enter your password first.'); const f=$('#gatePw'); if(f)f.focus(); return; }
        if(btn&&btn.disabled)return;                    // already signing in — ignore double-taps (mobile)
        if(btn){btn.disabled=true;btn.textContent='Signing in…';}
        try{ await WG_AUTH.signInWithEmailAndPassword(String(u.email).trim(),val); /* onAuthStateChanged finishes + hides the gate */ }
        catch(e){ const code=(e&&e.code)||'';
          let msg='Couldn’t sign in — try again.';
          if(code==='auth/wrong-password'||code==='auth/invalid-credential'||code==='auth/invalid-login-credentials')msg='Incorrect password — try again.';
          else if(code==='auth/user-not-found')msg='No login set up for this name yet — ask Sebastian.';
          else if(code==='auth/invalid-email')msg='The login email looks wrong — ask Sebastian to fix it.';
          else if(code==='auth/too-many-requests')msg='Too many tries — wait a minute, then try again.';
          else if(code==='auth/network-request-failed')msg='No connection — check your internet and try again.';
          else if(code==='auth/user-disabled')msg='This login is turned off — ask Sebastian.';
          toast(msg);
          if(btn){btn.disabled=false;btn.textContent='Log in';}
        }
        return;
      }
      if(!u.pass||hashPw(val)===u.pass){ enter(); }   // local-only mode (Firebase not configured)
      else toast('Incorrect password — try again.');
    };
    $('#gateGo').onclick=go; $('#gateBack').onclick=showList;
    if(pw)pw.onkeydown=e=>{if(e.key==='Enter')go();};
  };
  showList();
}
function logout(){ S.uid=null; S.role='all'; commit();
  _fbSync.on=false; if(_fbSync.unsub){try{_fbSync.unsub()}catch(e){}_fbSync.unsub=null;}
  if(window.WG_FB_READY&&WG_AUTH.currentUser){try{WG_AUTH.signOut()}catch(e){}}
  const app=$('#app'); if(app)app.style.display='none'; const g=$('#gate'); if(g)g.classList.remove('hidden'); renderGate(); }
function ensureLogoutBtn(){
  const bar=document.querySelector('.topbar'); if(!bar)return;
  let b=document.getElementById('btnLogout');
  if(S.uid){ if(!b){b=el('button','tb-btn','⎋ Log out');b.id='btnLogout';b.title='Log out';b.onclick=logout;const before=document.getElementById('btnReset');bar.insertBefore(b,before||null);} }
  else if(b){b.remove();}
}
/* self-service password change (Firebase) — available to everyone in the top bar */
function ensurePwBtn(){
  const bar=document.querySelector('.topbar'); if(!bar)return;
  let b=document.getElementById('btnPw');
  if(window.WG_FB_READY&&WG_AUTH.currentUser){ if(!b){b=el('button','tb-btn','🔑 Password');b.id='btnPw';b.title='Change your password';b.onclick=openPwChange;const before=document.getElementById('btnLogout')||document.getElementById('btnReset');bar.insertBefore(b,before||null);} }
  else if(b){b.remove();}
}
function openPwChange(){
  if(!window.WG_FB_READY||!WG_AUTH.currentUser){toast('Log in first.');return;}
  closeComposer();
  const ov=el('div','cmp-ov');ov.id='cmpOv';const box=el('div','cmp-box');
  box.innerHTML=`<div class="cmp-head"><h3>Change your password</h3><button class="cmp-x" id="cmpX">✕</button></div>
    <div class="cmp-body">
      <div class="cmp-field"><label>Current password</label><input type="password" class="cmp-in" id="pwCur" autocomplete="current-password"></div>
      <div class="cmp-field"><label>New password <span class="muted" style="font-weight:600">— at least 6 characters, only you know it</span></label><input type="password" class="cmp-in" id="pwNew" autocomplete="new-password"></div>
      <div class="cmp-field"><label>Confirm new password</label><input type="password" class="cmp-in" id="pwNew2" autocomplete="new-password"></div>
      <div class="cmp-foot"><div style="flex:1"></div><button class="btn-set primary" id="pwSave">Update password</button></div>
    </div>`;
  ov.appendChild(box);document.body.appendChild(ov);
  ov.onclick=e=>{if(e.target===ov)closeComposer()};
  $('#cmpX').onclick=closeComposer;
  $('#pwSave').onclick=async()=>{
    const cur=($('#pwCur')||{}).value||'', n1=($('#pwNew')||{}).value||'', n2=($('#pwNew2')||{}).value||'';
    if(!cur||!n1){toast('Fill in all three boxes.');return;}
    if(n1.length<6){toast('New password needs at least 6 characters.');return;}
    if(n1!==n2){toast('The two new passwords don’t match.');return;}
    const btn=$('#pwSave'); btn.disabled=true;
    try{
      const cred=firebase.auth.EmailAuthProvider.credential(WG_AUTH.currentUser.email,cur);
      await WG_AUTH.currentUser.reauthenticateWithCredential(cred);
      await WG_AUTH.currentUser.updatePassword(n1);
      closeComposer(); toast('✅ Password changed. Use your new password next time you log in.');
    }catch(e){ btn.disabled=false; const code=(e&&e.code)||'';
      if(code==='auth/wrong-password'||code==='auth/invalid-credential')toast('Your current password is wrong — try again.');
      else if(code==='auth/weak-password')toast('Pick a stronger password (6+ characters).');
      else toast('Couldn’t change password — '+((e&&e.message)||'try again.'));
    }
  };
  setTimeout(()=>{const f=$('#pwCur');if(f)f.focus();},50);
}
function enterApp(){
  const gate=$('#gate');if(gate)gate.classList.add('hidden');
  const app=$('#app');if(app)app.style.display='block';
  const sel=$('#roleSel');
  if(sel){
    if(amPoster()){ sel.style.display='none'; } // only an ACTUAL poster is locked out of the dropdown; an owner previewing one keeps it to switch back
    else{
      sel.style.display='';
      if(S.role!=='all' && ORDER.indexOf(S.role)===-1) S.role='all';
      sel.innerHTML='<option value="all">Everyone</option>'+ORDER.map(r=>`<option value="${r}">${esc(personOf(r).name)}</option>`).join('');
      sel.value=S.role;
    }
  }
  const a=document.getElementById('tbAv');
  if(a){
    if(!S.uid && S.role==='all'){a.style.background='#ffffff22';a.style.color='#fff';a.textContent='★'}
    else{const p=personOf(S.uid||S.role);a.style.background=p.bg;a.style.color=p.c;a.textContent=p.av}
  }
  // keep a member inside the dashboard(s) they're assigned to
  if(S.uid && !isOwner()){
    const allowed=userProgs(curUser());
    if(isHub()){ if(allowed.length<2){const home=(PROGRAMS[allowed[0]]||{}).home; if(home){location.href=home;return;}} }
    else if(allowed.indexOf(activeProgram())<0){ const home=(PROGRAMS[allowed[0]]||{}).home; if(home&&currentFile()!==home){location.href=home;return;} }
  }
  ensureLogoutBtn(); ensurePwBtn();
  buildNav();render();
}
function isOwner(){const u=curUser();return !!u&&u.perm==='owner'}
function navVisible(n){return !n.owner||isOwner()}
function buildNav(){
  mountProgSwitcher();
  const nav=$('#nav');if(!nav)return;nav.innerHTML='';
  const cur=currentFile();
  navItems().filter(navVisible).forEach(n=>{
    if(n.sec){nav.appendChild(el('div','nav-sec',n.sec));return}
    const a=el('a',cur===n.file?'active':'',`<span class="ic">${n.ic}</span>${n.label}`);
    a.setAttribute('href',n.file);
    if(n.planOf&&PROGRAMS[n.planOf]){const p=progOverall(n.planOf,S.role);a.insertAdjacentHTML('beforeend',`<span class="badge">${p}%</span>`)}
    nav.appendChild(a);
  });
  buildMob();
}
function buildMob(){
  const m=$('#mobnav');if(!m)return;m.innerHTML='';
  const cur=currentFile();
  navItems().filter(n=>!n.sec&&navVisible(n)).forEach(n=>{const a=el('a',cur===n.file?'active':'',n.label);
    a.setAttribute('href',n.file);m.appendChild(a)});
}
/* Program switcher — the topbar project pill with a native <select>, styled to
   match the role chip. Pick a dashboard, or "All dashboards" for the combined
   Marketing overview. */
function mountProgSwitcher(){
  const pill=document.querySelector('.proj-pill'); if(!pill)return;
  const curId = isHub() ? 'all' : activeProgram();
  const curIco = isHub() ? '🛰️' : (PROGRAMS[activeProgram()] ? PROGRAMS[activeProgram()].icon : '📣');
  const allowed = PROGRAM_ORDER.filter(id=>PROGRAMS[id] && (isOwner()||!S.uid||canProg(id)));
  const opts = ((isOwner()||!S.uid||allowed.length>1)?[`<option value="all"${curId==='all'?' selected':''}>All dashboards</option>`]:[])
    .concat(allowed.map(id=>
      `<option value="${id}"${curId===id?' selected':''}>${esc(PROGRAMS[id].name)}</option>`)).join('');
  pill.classList.add('progswitch');pill.classList.remove('open');pill.style.display='';
  pill.innerHTML=`<span class="ps-ico">${curIco}</span><select class="ps-sel" title="Switch dashboard">${opts}</select>`;
  const sel=pill.querySelector('.ps-sel');
  sel.onchange=()=>{const v=sel.value;location.href=(v==='all')?'marketing.html':PROGRAMS[v].home;};
}

/* top bar actions (all guarded — each page only has the shared chrome) */
(function wireTopbar(){
  const sel=$('#roleSel');if(sel)sel.onchange=e=>{S.role=e.target.value;commit();enterApp()};
  const bp=$('#btnPrint');if(bp)bp.onclick=()=>window.print();
  const be=$('#btnExport');if(be)be.onclick=async()=>{
    const files=await fileList();
    const data={app:'wg_mktg_os',version:1,exported:new Date().toISOString(),state:S,fileMeta:files};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const u=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=u;a.download='WG_Marketing_OS_backup_'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(u);
    toast('Backup saved (posts, captions, notes, progress). Photos & videos stay in your Google Drive folder — that’s your media backup, not this file.');
  };
  const br=$('#btnReset');if(br)br.onclick=resetAll;
  const bi=$('#btnImport');if(bi)bi.onclick=()=>{const f=$('#importFile');if(f)f.click()};
  const fi=$('#importFile');if(fi)fi.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
    r.onload=()=>{try{const d=JSON.parse(r.result);if(d.state){S=d.state;ensureAuth();commit();enterApp();toast('Backup restored')}else toast('Not a valid backup')}catch(x){toast('Could not read that file')}};
    r.readAsText(f);e.target.value='';};
})();

async function resetAll(){
  if(!confirm('Start fresh for Day One?\n\nThis clears EVERYTHING you touched while testing:\n• every checked step\n• all KPI numbers\n• all notes & roll-overs\n• everything typed or uploaded into the “Deliver to…” boxes (text + files)\n\nUse this ONCE — the morning you go live (Tuesday). It cannot be undone.'))return;
  if(!confirm('Last check — really wipe it all to a clean Day One?'))return;
  try{const files=await fileList();for(const f of files)await fileDel(f.id);}catch(e){}
  const role=S.role,users=S.users,uid=S.uid; S=freshState(); S.role=role; S.users=users; S.uid=uid; commit();
  enterApp(); toast('Reset to Day One — clean slate. Go win Tuesday.');
}

/* init */
if(window.WG_FB_READY){
  // No login flash on page loads: keep the gate hidden while Firebase resolves the
  // persisted session; onAuthStateChanged below shows the right screen.
  var _g0=$('#gate'); if(_g0)_g0.classList.add('hidden'); var _a0=$('#app'); if(_a0)_a0.style.display='none';
  // LOCKED MODE: the app requires an active Firebase login — no guest, no localStorage-only entry.
  try{ WG_AUTH.onAuthStateChanged(function(u){
    if(u){
      var acct=(S.users||[]).find(function(x){return x.email&&x.email.toLowerCase()===String(u.email||'').toLowerCase();});
      if(acct){ S.uid=acct.id; S.role=PEOPLE[acct.id]?acct.id:'all'; commit(); fbSyncStart(); enterApp(); }
      else { // signed in, but this email has no team account — don't drop into a broken half-logged-in state
        try{WG_AUTH.signOut()}catch(e){}
        S.uid=null; var g2=$('#gate'); if(g2)g2.classList.remove('hidden'); var ap2=$('#app'); if(ap2)ap2.style.display='none'; renderGate();
        toast('Signed in, but there’s no team account for '+(u.email||'this email')+'. Ask Sebastian to add it in Team & logins.');
      }
    } else {
      _fbSync.on=false; if(_fbSync.unsub){try{_fbSync.unsub()}catch(e){}_fbSync.unsub=null;} // stop live sync on sign-out
      S.uid=null;
      var g=$('#gate'); if(g)g.classList.remove('hidden');
      var ap=$('#app'); if(ap)ap.style.display='none';
      renderGate();
    }
  }); }catch(e){}
} else {
  // local-only mode (Firebase not configured): keep the prototype behavior
  renderGate();
  if(Store.load()&&S.uid){enterApp()}
}
