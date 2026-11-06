---
name: adcreator
description: >
  Create Video Ads using AdCreator Studio's Video Ad editor via MCP.
  Trigger: "use adcreator", "make a video ad", "create a video ad about", or any request to produce a short-form video ad.
  Covers the full workflow: questionnaire → script → TTS → B-Roll → overlays → transitions → editor link → render.
  Also handles iterative editing in chat (update overlays, swap transitions, change voice, reorder beats).
  Not for editing existing rendered MP4 files, exporting captions only, single-image static ads, or custom HTML-based video; use HyperFrames for custom HTML compositions.
  Requires AdCreator Studio MCP connection (adcreatorstudio.com).
---

# Video Ads — MCP Workflow

DR Videos are 9:16 short-form video ads built from **beats** (script sections), each with voiceover, B-Roll, and optional overlay blocks.

**Length = the script.** A video is exactly as long as the script you write or the user provides — the sum of beat audio + tails. There is no target duration to hit and no template length. Never pad or trim copy to reach a number of seconds. Templates seed a starting *beat structure* only.

### Gates (when to stop and confirm)

- **Brief** — always. Collect required fields before any `dr_` tool (see HARD-GATE below).
- **Script** — always. Show the full monologue and get approval before `dr_video_create`.
- **Plan** — only when footage exists OR the ad is complex (beats ≥ 6). Show the per-beat Plan table (Step 4) and get a nod before placing media + overlays. For a simple stock-only ad, skip this gate and proceed.
- **Render** — always. Never auto-render; confirm first (Step 9).

Outside these, keep moving — don't block the user with needless check-ins.

---

## HARD-GATE: Session Questionnaire

<HARD-GATE>
Before calling ANY dr_ tool, collect all REQUIRED fields. Do NOT call dr_video_create with placeholder text.

**REQUIRED:**
1. `product_name` — name of the product
2. `one_liner` — what it does in ≤10 words
3. `target_audience` — who (age/gender/situation) + their primary pain
4. `mechanism` — specific, novel reason the product works (NOT generic benefits)
5. `social_proof` — followers, review count, or verbatim testimonial quote
6. `offer` — CTA offer: discount %, free trial, urgency ("only 48h")
7. `voice_preference` — tone: conversational/authority/energetic/calm; gender preference

**OPTIONAL but improves quality:**
8. `brand_colors` — primary hex, accent hex
9. `product_image_url` — hero product shot (public URL)
10. `own_broll_available` — does user have B-Roll? If yes, get URLs (or run `dr_assets_list` to discover what's already uploaded)
11. `instagram_handle` + `instagram_followers` — for social proof overlays

### Pre-script asset discovery

Before drafting the script, call `dr_assets_list({ video_id })` once (the create call comes later, so omit `video_id` if you don't have one yet — it'll return all user assets). This is intelligence, not a tool call to wait on:

- If smart clips exist for what the user described (e.g., the product they named), mention them in your script confirmation: "I see you have 12 smart clips from your product demo — I'll use them on mechanism + proof."
- If nothing usable exists for mechanism/proof beats, surface that gap **now** so the user can upload while you're scripting: send `dr_assets_upload_link` with a specific slot_label. The link is unique to this video — anything the user drops there (many clips/images at once) is auto-linked to it and long videos are smart-clipped.
- If a parent video has `smart_clip_in_progress: true`, mention "your last upload is still being analyzed" and poll `dr_assets_pending({ video_id, since_ts })` to know when the clips land.

This pre-flight catches asset gaps before they slow Step 4.

If the user provides a description implying most fields, infer and proceed. Ask only for missing REQUIRED fields, in a single message.
</HARD-GATE>

---

## GATE: Script Source

**Does the user already have a script?**

→ **Yes** — read [references/script-input.md](references/script-input.md) to parse it into beats. Skip to Step 2. Do **NOT** rewrite or "improve" the user's copy.

→ **No** — continue to Step 1 to draft the script.

---

## Step 0 — Pick a Visual Palette

Before scripting, pick a palette based on niche:

| Niche | Palette |
|---|---|
| Beauty, skincare, wellness | [palettes/beauty-wellness.md](palettes/beauty-wellness.md) |
| Fitness, supplements, sport | [palettes/fitness-energy.md](palettes/fitness-energy.md) |
| Finance, coaching, high-ticket | [palettes/finance-coaching.md](palettes/finance-coaching.md) |
| Tech, SaaS, productivity | [palettes/tech-saas.md](palettes/tech-saas.md) |
| Youth, gaming, entertainment | [palettes/youth-entertainment.md](palettes/youth-entertainment.md) |

If `brand_colors` were provided, use those as primary + accent. Derive a matching palette.

### Visual Director Contract

Define this **before any overlay or transition calls** and hold it constant through all calls:

```json
{
  "style_name": "Soft Signal | Velvet Standard | Swiss Pulse | Maximalist Type | Deconstructed | Data Drift | Folk Frequency | Shadow Cut",
  "energy": "calm | medium | high",
  "palette": {
    "backgroundColor": "#...",
    "textColor": "#...",
    "mutedTextColor": "#...",
    "accentColor": "#..."
  },
  "overlayStyle": {
    "surface": "solid | glass | dark-card | editorial-label",
    "position": "top | middle | bottom",
    "scale": "0.85-1.25",
    "opacity": "0.80-1.00"
  },
  "transitionLanguage": {
    "primary": "crossfade | blur-through | whip-pan | flash-through-white | cinematic-zoom | glitch",
    "accent": "one transition used once at the emotional climax"
  }
}
```

Design rules:
- One visual identity, repeated. Do not invent new colors per overlay.
- One primary transition family + one accent. Never randomize every boundary.
- Video text readable in two seconds: fewer words, bigger type.
- 9:16 safe zones: text within 64px left/right, avoid top 120px and bottom 180px except for deliberate lower-thirds.
- No AI tells: no generic purple-blue gradients, no centered-everything, no empty cards, no placeholder copy.

---

## Step 1 — Write the Script

**MANDATORY before scripting:** Read [references/beats.md](references/beats.md) and [references/copywriting.md](references/copywriting.md).

**Language:** Match target market. German product = German script, colloquial not formal.

### Templates (starting suggestions — not hard constraints)

Templates seed a default beat structure. **Add or remove beats freely based on script structure.** If the user's script has 9 natural emotional units, use 9 beats. Do not merge beats to fit a template.

| Template | Starting beat sequence |
|---|---|
| `classic_dr` | hook → problem → agitate → why_others_fail → mechanism → proof → cta |
| `problem_solution` | hook → problem → value_prop → proof → objection → cta |
| `ugc_style` | hook → problem → mechanism → proof → cta |
| `short_hook` | hook → mechanism → cta |

### Script Process

1. **Full monologue first** — one continuous story, no beat labels, natural spoken language
2. **Read aloud** — fix anything choppy or announcement-style before proceeding
3. **TTS normalization** — no em-dashes (→ comma), no period stacks (→ conjunctions), spell numbers, spell currency
4. **Assign beats** — label paragraphs by beat type. Do NOT rewrite sentences during this step.
5. **Add audio tags** — 1–2 ElevenLabs v3 audio tags per beat. See [references/voice.md](references/voice.md).

**Show the user the full monologue BEFORE calling any tool. Get confirmation.**

For a complete worked example with beat assignment and audio tags, see [examples/kreatin-ugc-30s.md](examples/kreatin-ugc-30s.md).

### Ad Goal

- **Product page CTA** (to shop/landing page): No social-follow blocks. CTA is "link below / tap here / swipe up."
- **Social follow CTA**: Use only social-follow blocks returned by `dr_blocks_list`. CTA is "follow for more."
- When unsure: ask the user. A discount + shop URL = always product-page CTA.

---

## Step 2 — Select Voice + Create Video

Call `dr_voice_list`. Filter by target language. Priority: cloned > professional > premade. See [references/voice.md](references/voice.md).

Present max 3 options (name, category, preview URL). Wait for user confirmation. Then:

```typescript
dr_video_create({
  title: "Product Name — Hook Variant 1",
  template: "ugc_style",
  beats: [ /* approved beats with audio tags */ ],
  voice_id: "...",
  caption_style: "pill-karaoke"  // tone-matched — call dr_caption_styles; components: pill-karaoke | kinetic-slam | highlight | gradient-fill | neon-glow (legacy inline: pop | classic | glitch | editorial)
})
// Returns: videoId, editorUrl, beats[] with IDs — store all for next steps
```

---

## Step 3 — Generate TTS

Call `dr_beat_tts` for each beat **sequentially** (not parallel — rate limits):

```typescript
dr_beat_tts({ video_id: "...", beat_id: "..." })
// Returns: audioUrl, durationMs — total follows approved script length
```

<HARD-GATE>
Before any `dr_overlay_add` or `dr_transition_add`, every beat MUST have TTS (`audio_url` set on the beat).
Run `dr_beat_tts` for each beat ID first. If TTS fails (model bug, quota, voice error), STOP and tell the user. Do NOT add overlays against estimated beat durations; they will drift.
</HARD-GATE>

---

## Step 4 — B-Roll

Read [references/broll.md](references/broll.md) and [references/assets.md](references/assets.md) for strategy and priority.

**Asset tool rule (hard):** for DR videos use `dr_assets_list` ONLY. Never use the generic `list_assets` — it is library-wide and leaks unrelated/other-project clips. `dr_assets_list({ video_id })` is the correct, video-scoped source.

**Upload-first branch.** If the user signals they'll provide their own footage (intake said so, or you asked and they chose "I'll upload"), do this FIRST and do NOT pull stock yet:
1. Share `dr_assets_upload_link({ project_id })`. Tell them what to drop.
2. Poll `dr_assets_pending({ video_id, since_ts })` (~20–30s) until `done`. Tell them it's processing.
3. Then `dr_assets_list({ video_id })` and build from their clips.
Only call `dr_broll_suggest` (stock) if the user declines uploading or explicitly says "use stock." Never assume stock for beats the user didn't rule on, and never narrate "I'll assign stock to the rest" and act on it without confirmation.

### 4a. Inventory the library (do this BEFORE per-beat suggestion)

```typescript
dr_assets_list({ video_id })
```

With a `video_id`, this returns the **video-scoped pool** (`scope: "video"` by default): only assets linked to this video — footage dropped for it, clips you assigned, and their auto-clips.

**Use the user's OTHER footage too.** You are NOT limited to this video's dropper uploads. To pull from their earlier uploads, generated images, or clips from other videos, call `dr_assets_list({ video_id, scope: "all" })`, pick what fits, and assign it with `media_id` — that auto-links it to this video (it then appears in `scope: "video"` and the editor).

**Read metadata, always.** Before choosing any clip, read its `description` / `user_description` / `transcript` / `ad_use_cases` / `shot_type`. Pick from what the clip actually shows, never from the filename. If a clip you want is thin (no usable description or tags), enrich it first so ranking + reuse improve:

```typescript
dr_asset_update({ asset_id, description: "Hand squeezing serum onto fingertip, close-up", tags: ["serum","closeup","hand","application"] })
```

Look at the response and answer three questions:

1. **Is smart-clipping in progress?** If any row has `smart_clip_in_progress: true`, better clips are about to land. Poll `dr_assets_pending({ video_id, since_ts })` (~every 20–30s, tell the user it's processing) until `done`, or move on to overlay work and come back.
2. **Are there pending smart clips?** Rows with `source: "auto-clip"` and `approved: null` are usable but un-reviewed. Note the parent ids — you'll send a Clip Studio review link at the end.
3. **Are there obvious gaps?** Per beat, can you find a high-`clip_score` smart clip whose `ad_use_cases` matches the beat type and whose flags match the beat purpose (mechanism → `hand_visible`, proof → `face_visible`, etc.)? If not, hold open a "needs upload" note.

If gaps exist on mechanism/proof/cta, send an upload link **before** calling `dr_broll_suggest`:

```typescript
dr_assets_upload_link({
  project_id: "<video_id>",
  slot_label: "Product closeup",
  hint: "Mechanism beat — product detail shot showing the key feature"
})
```

Tell the user: "I need X for the mechanism beat. Upload here: [url]. Or say 'use stock' and I'll proceed with Pexels." Give them the choice; don't block waiting indefinitely. If they upload during the session, poll `dr_assets_pending({ video_id, since_ts })` (~20–30s) until `done`, then `dr_assets_list({ video_id })` picks up the new clips automatically (they're already linked to this video). If the user declines, blend stock and say so.

### 4b. Per-beat: pick the asset

For each beat, prefer smart clips filtered to the beat type:

```typescript
dr_assets_list({ video_id, kind: "smart_clips", beat_type: "mechanism" })
// Top clip_score wins. approved=true beats approved=null.
```

If nothing matches, fall back to `dr_broll_suggest`:

```typescript
dr_broll_suggest({ beat_type: "mechanism", vo_text: "...", locale: "de-DE" })
// locale: always pass the VO language locale to get locale-correct Pexels results
// Returns own_clip / own_upload (your library) before unsplash / pexels — trust the order.
```

Assign — **pass `media_id` whenever the media is the user's own asset/clip** so it links to this video and shows in the editor's Assets tab (stock has no id, just omit it):

```typescript
dr_beat_broll_assign({ video_id, beat_id, media_url, thumb_url, media_type: "video", media_id: "<asset id from dr_assets_list>" })
```

### 4b-plan. Per-beat Plan (gate when footage exists or beats ≥ 6)

Before placing media + overlays on a footage-rich or complex ad, lay out a Plan table and confirm with the user:

| Beat | Base clip (one-line why) | Cutaways | Overlay (≤1 primary, or "none") | Transition out |
|---|---|---|---|---|
| hook | own_clip #3 — face to camera, strong eye contact | — | hook-bigtext-pop | flash-through-white |
| mechanism | own_clip #7 — hand showing the feature | stock detail insert @ "twist" | animated-bullet-list | crossfade |
| proof | own_clip #2 — testimonial face | receipt insert on the number | instagram-comment | blur-through |

For a simple stock-only ad, skip this gate.

### 4c-cutaways. Layer cutaways where the script earns them

Beyond each beat's base B-Roll, proactively layer **cutaways** with `dr_media_clip_add` (track ≥ 1, sits above base, below captions/overlays) at the exact moments that strengthen the beat: a product closeup as a feature is named, a proof insert (receipt/chart/screenshot) on a claim, a reaction, a before/after, a hook jump-cut.

- **Blend user + stock.** Cutaways can be the user's own clips (pass `media_id`) OR stock from `dr_broll_suggest`. Prefer the user's own footage for mechanism/proof *bases*; stock cutaways are welcome to add texture and energy.
- **No fixed cadence.** Do not place cutaways on a timer. Place them where a specific word/claim makes them land. Use `used_in_video` / `used_in_beats` from `dr_assets_list` to avoid repeating a clip.
- See [references/broll.md](references/broll.md) for `fill_policy` and animation rules (short sources must `loop`/`freeze_last`; images always get a motion `animation`).

### 4c. Hand-off note

After all beats have B-Roll, if any assignment used an unreviewed smart clip (`approved: null`), send a review link for each parent video involved:

```typescript
dr_assets_review_link({ asset_id: "<parent_video_id>" })
// Returns standalone /clip-studio?asset=...&token=... URL the user can open
// to approve / reject / trim / regenerate without re-logging in.
```

Wrap the message: "I used 4 of your smart clips on this video. Review them here: [url] — you can approve, reject, trim, or regenerate at a different target length. Approved clips will rank highest in future ads automatically."

---

## Step 5 — Overlay Blocks

Read [references/blocks.md](references/blocks.md) before adding overlays. For timing details, read [references/timing.md](references/timing.md). For routing suggestions by beat purpose, read [references/overlays.md](references/overlays.md).

### Block Discovery (mandatory)

**Never invent block IDs.** Discover in three steps:

```typescript
// Step 0 (ONCE per video): survey the FULL catalog so you know every overlay available
dr_blocks_list()
// → all agent-visible blocks. Learn the palette before you commit to any single one.

// Step 1: discover blocks ranked for this beat
dr_blocks_list({ for_beat_type: "proof" })
// → slim list with id, label, recommendedFor, moodTags, intensityLevel

// Step 2: for each candidate you want to use — fetch full schema + the block's real HTML
dr_block_get("dr/instagram-comment")
// → defaultProps, propFields, styleVariants, html (composition source), propDomMap
// Read the html + propDomMap to see exactly what each prop drives (CSS var for style
// props, vars.<prop> content binding in the <script>). Customize with intent — headline,
// accent, sizes, position, animation — don't just accept defaults. usedInHtml=false means
// this block ignores that prop.

// Step 3: compose overlay with palette from Visual Director Contract
dr_overlay_add({
  video_id: "...",
  block_id: "dr/instagram-comment",
  props: {
    username: "@customer",
    comment: "This literally changed everything for me.",
    // S3: ALWAYS pass palette from Visual Director Contract:
    accentColor: "#e85d04",
    backgroundColor: "#fff8f2",
    textColor: "#191410",
  },
  timing: { mode: "beat-relative", beat_id: "<proof beat id>", at_ms: 0, duration_ms: 4200 },
  track_index: 1,
})
```

### Authoring a custom overlay (escape hatch)

When no registry block fits and the beat genuinely earns something bespoke, author one in raw HyperFrames HTML with `dr_overlay_custom_html`. Submit a self-contained sub-composition: a root with `data-composition-id`, scoped `<style>`, and a `<script>` that builds a **paused** GSAP timeline registered on `window.__timelines["<your-id>"]`. It is validated + sandboxed; on any violation it's rejected with reasons (fix + resubmit).

Contract: 1080×1920 (or omit dims); paused GSAP timeline under your exact composition id; no `fetch`/XHR/WebSocket/`setInterval`/`requestAnimationFrame`/`Math.random`; no `<audio>`, `<video>` muted; external URLs only from `cdn.adcreatorstudio.com` / Google Fonts / the GSAP CDN (else inline). Read `--dr-accent` / `--dr-text` / `--dr-surface` for the palette. Prefer a registry block first; author only with purpose, one idea per beat. After authoring, `dr_video_snapshot` to confirm it renders.

### Visual Director Contract — Color Rule (non-negotiable)

Every `dr_overlay_add` call **MUST** pass `accentColor`, `backgroundColor`, and `textColor` from the active Visual Director Contract palette. Server defaults are fine structurally but won't match the brand palette. Override them every time.

### Word-Anchor Timing

To sync an overlay to a specific spoken word (product name, price, claim word), use word-anchor mode. Word indices come from `caption_words` in `dr_video_get`:

```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/punctuation-pop",
  props: { symbol: "!", accentColor: "#e85d04", backgroundColor: "rgba(10,10,10,.72)", textColor: "#fff" },
  timing: { mode: "word-anchor", beat_id: "<cta beat id>", word_index: 4, duration_ms: 1800 },
  track_index: 2
})
```

### Less Is More

One primary overlay idea per beat — at most. Sometimes the strongest choice is **no overlay**: let strong footage + burned-in captions carry the beat. An overlay should add one piece of information the viewer can read in two seconds, not decorate. Word-anchor content-bound overlays (product name, price, a specific claim) so they land on the spoken word.

### Overlay Variety

Aim for visual variety across beats. Vary block choice per beat purpose — do not repeat the same block more than twice. Check `dr_video_lint` for `low_overlay_variety` warnings and rebalance with alternatives from [references/overlays.md](references/overlays.md).

For full styling props, style presets, position rules, and block catalog: [references/blocks.md](references/blocks.md).

---

## Step 6 — Transitions

Add transitions after overlays. Transitions serve **emotional pivots** — find the real shifts in viewer state, then choose a matching transition. Use the energy routing table in [references/overlays.md](references/overlays.md) to pick the right family.

```typescript
dr_transition_add({
  video_id: "...",
  from_beat_id: "<hook beat id>",
  to_beat_id: "<problem beat id>",
  block_id: "hf/flash-through-white",
  sound_effect: { presetId: "flash-rise", volume: 0.36, offsetMs: -50 }
})
```

| Emotional shift | Suggested transition |
|---|---|
| Hook → Problem ("that's me") | `hf/flash-through-white` |
| Problem → Agitate (pain deepens) | `hf/whip-pan` |
| Stuck → Revelation (the turn) | `hf/cinematic-zoom` — use max **once** as the climax |
| Mechanism → Proof (belief builds) | `hf/crossfade` |
| Proof → CTA (exhale into the ask) | `hf/blur-through` |

Pick ONE primary transition family per video + ONE accent at the emotional climax. Avoid adjacent high-energy transitions (flash + whip-pan in sequence = chaos).

For full transition catalog: [references/blocks.md](references/blocks.md).

---

## Step 7 — Lint

```typescript
dr_video_lint({ video_id: "..." })
```

Resolve all errors before review or render: missing TTS, hidden block, overlay overrun, invalid word_index. Warnings are judgment calls; surface them to user if they affect quality.

---

## Step 7b — Review pass (look at it)

Don't ship blind. Run the static audit, then look at real frames:

```typescript
dr_video_inspect({ video_id })    // fast structured checks: safe zones, too-brief overlays, over-stacking
dr_video_snapshot({ video_id })   // one frame per beat midpoint → JPEG URLs
```

Fix anything `dr_video_inspect` flags first (it gives a `fix` per finding), then eyeball the snapshots.

Open each frame and judge it like a viewer:
- Is the overlay readable in two seconds? Not overlapping captions or the safe zones?
- Do captions land on the right words, not crowding the lower third?
- Is the footage on-brand and the right shot for the beat?
- Does the palette hold across beats?

Fix the **weakest beat** (swap a clip, retime/word-anchor an overlay, change caption emphasis, drop a redundant overlay), then `dr_video_snapshot` again or move on. This is what turns a correct ad into a good one — the agent that reviews its own frames produces far better ads than one that doesn't.

---

## Step 8 — Editor Link

After video + TTS + overlays + transitions, give the user the link. **Do NOT auto-render.**

```
Video ready for review: <editorUrl>
Built: [X] beats with voiceover (~Xs) | [X] B-Roll | [X] overlays | [X] transitions
Ready to render? Confirm and I'll start it.
```

---

## Step 9 — Render (confirmed only)

```typescript
dr_video_render({ video_id: "..." })
// Poll dr_video_get every 10s until status = "rendered". Return render_url.
```

---

## Step 10 — Editing in Chat

After creation, users can request changes without opening the web editor. Always call `dr_video_get` or `dr_overlay_list` first to get current IDs.

```typescript
dr_overlay_list({ video_id })                // see existing overlays + IDs
dr_overlay_update({ video_id, overlay_id, props: { headline: "New text" } })
dr_overlay_remove({ video_id, overlay_id })
dr_transition_update({ video_id, transition_id, block_id: "hf/crossfade" })
dr_transition_remove({ video_id, transition_id })
dr_beat_update({ video_id, beat_id, vo_text: "New voiceover..." }) // then call dr_beat_tts
dr_video_update({ video_id, voice_id: "..." })   // then dr_beat_tts for each beat
dr_beats_reorder({ video_id, beat_ids: ["id1","id2","id3"] })
dr_media_clip_update({ video_id, media_clip_id, animation: "zoom_in" })
dr_media_clip_remove({ video_id, media_clip_id })
```

See [references/iterating.md](references/iterating.md) for worked examples of common edit requests.

---

## Non-Negotiable Rules

- Never render without explicit user confirmation
- `hf/cinematic-zoom` max once per ad — it is the climax; use as accent transition only
- `dr/cta-button-pulse` always on CTA beat
- Name the mechanism, never the product, in the mechanism beat
- Mechanism/proof beats: prefer user's own B-Roll or library — stock only as fallback
- Smart clips (source=auto-clip) always beat raw uploads, which beat stock — trust the dr_assets_list / dr_broll_suggest ranking
- If any assigned smart clip is `approved: null`, end the session message with a `dr_assets_review_link` URL for the user to confirm
- Never attach a parent video as base B-Roll while its `smart_clip_in_progress: true` — wait for the smart clips
- `dr_beat_tts` must run for every beat before adding overlays
- TTS calls are sequential — never parallel
- Only use block IDs returned by `dr_blocks_list` — never invent IDs from memory
- Always call `dr_block_get(block_id)` before `dr_overlay_add` to read the full schema
- Every `dr_overlay_add` MUST pass `accentColor`, `backgroundColor`, `textColor` from the Visual Director Contract
- Run `dr_video_lint` before render and fix every error
- Always get IDs from `dr_video_get` or `dr_overlay_list` before update/remove calls
- For images in `dr_media_clip_add`: always set `animation` explicitly (use `ken_burns`, `zoom_in`, `pan_left`, or `zoom_out` — never leave as `none`)
- For short video clips: set `fill_policy` to `loop` or `freeze_last` to prevent dead frames
- Length = the script. Never pad/trim copy to hit a duration; templates seed beat structure only, never length
- For DR videos use `dr_assets_list` only — never `list_assets` (library-wide, leaks other projects' clips)
- If the user will upload footage: share the dropper, poll `dr_assets_pending` to `done`, THEN build — no stock until they decline. Never narrate-then-act on an unconfirmed "I'll use stock for the rest"
- You can use the user's other library assets via `dr_assets_list({ scope: "all" })` + assign with `media_id` — not limited to this video's dropper uploads
- Survey all overlay blocks once (`dr_blocks_list()` no filter) before picking per-beat
- Pass `media_id` on `dr_beat_broll_assign` / `dr_media_clip_add` whenever the media is the user's own asset, so it links to the video
- Read a clip's metadata before assigning it; if thin, enrich with `dr_asset_update` first — never assign a clip you can't describe
- Layer cutaways where the script earns them (proof inserts, detail shots), blending user + stock — no fixed cadence
- One primary overlay per beat at most; sometimes none is the right answer

---

## Fallbacks

- **Weak / no proof** — don't fake testimonials. Lead with the mechanism, use specific factual claims, soften CTA. Skip social-proof blocks.
- **No footage and user won't upload** — blend stock (`dr_broll_suggest`) and say so plainly. Prefer the most concrete, on-topic clips; keep cuts tight.
- **Clip still processing** — poll `dr_assets_pending`; if it stalls, proceed with what's ready or stock, and tell the user you'll swap when their clips land.
- **TTS drift / timing uncertain** — word-anchor content-bound overlays instead of guessing ms; never add overlays before TTS exists on the beat.

---

## You Do This Wrong

- Writing English for a German-market product (domain .de or German IG = German script)
- Adding social-follow overlays for product-page CTA ads or weak follower counts
- Adjacent high-energy transitions: flash + whip-pan in sequence = chaos
- Period-stacked fragments "X. Y. Z." — connect with commas
- Em-dashes in VO (TTS restarts at the dash)
- Numbers as digits — spell out before dr_video_create
- Skipping audio tags (every beat: 1–2 ElevenLabs v3 tags)
- Not checking for user's cloned voice before listing other options
- More transitions than the beat count warrants

---

## References (loaded on demand)

- **[references/beats.md](references/beats.md)** — Beat types, niche examples. Read before scripting.
- **[references/copywriting.md](references/copywriting.md)** — DR formulas, hooks, mechanism naming, proof formats. Read "You Write This Wrong" section before starting.
- **[references/blocks.md](references/blocks.md)** — Block catalog, overlay props, style presets, transition catalog. Read before Steps 5–6.
- **[references/overlays.md](references/overlays.md)** — Per-overlay guide (what each block is, when it shines, key props, position), palette→styleVariant map, routing by beat purpose, transition energy table, less-is-more rule. Read before Step 5.
- **[references/timing.md](references/timing.md)** — Beat-relative, word-anchor, absolute timing with examples. Read when setting overlay timing.
- **[references/script-input.md](references/script-input.md)** — How to parse a user-provided script into beats. Read when user already has a script.
- **[references/iterating.md](references/iterating.md)** — Edit loop: update/remove overlays, transitions, beats, voice after creation. Read when user requests changes.
- **[references/broll.md](references/broll.md)** — B-Roll strategy, fill_policy, animation rules, locale search. Read before Step 4.
- **[references/assets.md](references/assets.md)** — Asset library: how to check user uploads, request missing assets, understand auto-tags. Read before Step 4.
- **[references/techniques.md](references/techniques.md)** — Craft levers: caption-style→tone map, overlay motion, cutaway timing, transitions, sound design, per-beat technique picks. Read before Steps 4–6.
- **[references/voice.md](references/voice.md)** — Voice selection, audio tags, TTS settings. Read before Step 2.
- **[palettes/beauty-wellness.md](palettes/beauty-wellness.md)** — Pastel, clean, skin tones.
- **[palettes/fitness-energy.md](palettes/fitness-energy.md)** — Bold, high-contrast, red/black.
- **[palettes/finance-coaching.md](palettes/finance-coaching.md)** — Dark, premium, navy/gold.
- **[palettes/tech-saas.md](palettes/tech-saas.md)** — Dark, minimal, accent neon.
- **[palettes/youth-entertainment.md](palettes/youth-entertainment.md)** — Electric, loud, saturated.
- **[examples/kreatin-ugc-30s.md](examples/kreatin-ugc-30s.md)** — Full worked example: 30s supplement, German UGC style, with script + beat assignment + overlays.
- **[examples/skincare-30s.md](examples/skincare-30s.md)** — Full worked example: 30s skincare, female audience.
- **[examples/fitness-45s.md](examples/fitness-45s.md)** — Full worked example: 45s supplement, male audience.
