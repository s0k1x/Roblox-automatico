# Overlays — Per-Block Guide + Routing

How to use this file: `dr_blocks_list({ for_beat_type })` to discover → `dr_block_get(block_id)` to read the **full schema + the block's real HTML + propDomMap** → `dr_overlay_add` to apply, always passing your Visual Director palette.

**Less is more.** One primary overlay idea per beat — at most. Sometimes the strongest beat has **no overlay** (let footage + burned-in captions carry it). An overlay exists to deliver one fact the viewer reads in two seconds, not to decorate. Word-anchor any content-bound overlay (product name, price, a specific claim) so it lands on the spoken word. Vary blocks across beats; never repeat the same block more than twice.

**Customize from the HTML.** `dr_block_get` returns the composition HTML and a `propDomMap`. Style props map to CSS custom properties on the host (`accentColor → --dr-accent`, `headlineSizePx → --dr-headline-size`, etc.); content props are read inside the block's `<script>` as `vars.<prop>`. Read it so you know exactly what each prop changes, then override with intent. `usedInHtml: false` means the block ignores that prop — don't bother setting it. Defaults are good; override only with purpose, and always pass `accentColor` / `backgroundColor` / `textColor`.

---

## Palette → styleVariant

Map niche + Visual Director `energy` to one styleVariant and pass it (its colors) on every overlay:

| styleVariant | Colors | Use for |
|---|---|---|
| `kinetic-dark` | bg `#0a0a0a`, text `#fff`, accent `#e85d04` | high energy: fitness, gaming, hype, bold hooks |
| `soft-signal` | bg `#fff8f2`, text `#191410`, accent `#e85d04` | warm/medium: wellness, beauty, UGC, lifestyle |
| `editorial-light` | bg `#fff`, text `#000`, accent `#000` | calm/premium: finance, coaching, minimal/editorial |

If `brand_colors` were given, use those as background/accent and pick the variant whose contrast matches. Hold the palette constant across the whole video.

---

## Per-overlay reference (agent-visible blocks)

### Hook

**`dr/hook-bigtext-pop`** — Big single-statement hook with a fast punch-in. Shines as a bold opener / pattern interrupt.
Props: `headline` (the claim), `kicker` (small label above, optional). Defaults to a custom position high on frame (`yPercent ~30`), huge `headlineSizePx` (~120). Keep headline to ≤6 words. High intensity.

**`dr/hook-question-zoom`** — Provocative question with a warm zoom. Shines when the hook IS a question, or to open a problem.
Props: `question`, `eyebrow` (optional small line). Middle position, `introAnimation: pop`. One question only — don't stack clauses.

**`dr/punctuation-pop`** — Giant `?`, `!`, or `?!` for reaction / doubt / reveal. Shines as a micro-accent on a beat already carried by VO.
Props: `symbol` (`?` / `!` / `?!`), `caption` (optional). **Word-anchor it** to the exact reaction word. Very short (~1.6s). Don't overuse — one per video.

**`dr/search-query-overlay`** — Animated search bar with typed query + results. Shines on intent-based / problem-aware openings ("why am I still…").
Props: `query`, `result1`, `result2`, `sourceLabel`. Typewriter animation. Keep the query in the customer's literal words.

### Problem / Agitate

**`dr/agitation-word-highlight`** — Huge punch-word with optional caption. Shines on the pain word during problem/agitate.
Props: `word` (one word, UPPERCASE reads strongest), `caption` (optional). **Word-anchor** to the pain word. High intensity; middle position.

**`dr/video-inset-card`** — Inset video card over the base. Shines to show a problem clip, demo, or testimonial B-roll without leaving the beat.
Props: `title`, `videoUrl`, `posterUrl`, `caption`. Use a user clip URL when you have one. (For most cutaways prefer `dr_media_clip_add`; use this when you want a framed card look.)

### Why-others-fail / Mechanism / Value

**`dr/animated-bullet-list`** — 1–4 staggered bullets. Shines for benefits, failure reasons, or a mechanism's steps.
Props: `title`, `item1..item4` (leave `item4` empty for 3), `markerStyle` (`checks` / `numbers` / `dots` / `none`). 2–4 crisp items, ≤5 words each. Don't write sentences.

**`dr/step-path-goal`** — Step-by-step path from current state → goal. Shines on a problem→solution bridge or mechanism journey.
Props: `startLabel`, `step1..step3`, `goalLabel`. Keep step labels to 1–2 words.

**`dr/media-swap-stack`** — Cycles 1–3 images in a styled frame at a paced rhythm. Shines for before/after or product variants on proof/mechanism/value.
Props: `title`, `imageUrl1..3`, `caption`. Feed the user's own product images when available.

### Proof / Objection

**`dr/instagram-comment`** — Native IG comment bubble. Shines on UGC proof, comment-led hooks, and objections.
Props: `username`, `comment`, `avatarUrl`, `meta`, `blurIdentity` (`true` by default for privacy). Quote real or realistic comments; keep one comment.

**`dr/tiktok-comment`** — TikTok reply/comment bubble. Same use as IG comment but TikTok-native; medium energy.
Props: `username`, `comment`, `avatarUrl`, `meta`, `blurIdentity`.

**`dr/dm-screenshot`** — DM/message thread reveal. Shines for testimonial proof or a creator reply.
Props: `sender`, `message1`, `message2`, `reply`, `avatarUrl`, `blurIdentity` (default `true`). Two inbound lines + one reply reads best.

**`dr/map-pin-proof`** — Animated map pin + nearby-customer count. Shines for local/community proof.
Props: `location`, `proof` (e.g. "238 customers nearby"), `subline`. Only when location/community is real and relevant.

**`dr/receipt-breakdown`** — Receipt/invoice value breakdown. Shines for pricing, savings, bonuses, price anchoring, time/cost comparison (proof/value/CTA).
Props: `title`, `line1Label/Value`, `line2Label/Value`, `line3Label/Value`, `totalLabel/totalValue`. Lines stagger; total lands last. Use real numbers.

### CTA

**`dr/cta-button-pulse`** — Pulsing CTA button with offer line. **Always on the CTA beat.**
Props: `cta` (button text), `offer` (line above/below). Custom position (~`yPercent 65`). Match `cta` to the ad goal (shop vs. follow).

**`dr/scarcity-countdown`** — Urgency countdown with timer. Shines on CTA only when urgency is REAL (launch window, stock limit).
Props: `label`, `time` (HH:MM:SS). Never fake urgency. **Word-anchor** the deadline phrase if spoken.

### FX

**`dr/fx-grain-overlay`** *(usually hidden from the picker)* — Subtle film grain for a premium look on hook/CTA. Props: `label` (internal). No text shown; purely texture.

### HyperFrames catalog overlays (`hf/…`)

These are realistic platform UI cards — use when the brand actually has that presence, and pass your palette where the card allows.

- **`hf/instagram-follow`** / **`hf/tiktok-follow`** — Follow badge (display name, handle, followers, avatar). Proof beats, **social-follow CTAs only** — never on product-page CTA ads, and only with a real follower count.
- **`hf/yt-lower-third`** — Lower-third name/title strip over interview/testimonial B-roll. Proof.
- **`hf/macos-notification`** — Realistic system notification as a pattern interrupt. Problem beats; top position.
- **`hf/spotify-card`** — Now-playing card for lifestyle/music association. Hook for youth/lifestyle brands.
- **`hf/x-post`** — Editable X/Twitter post card (replies, reposts, likes, views). Social proof.
- **`hf/reddit-post`** — Editable Reddit post card (upvotes, comments). Proof; reads as candid/community.
- **`hf/apple-money-count`** — Apple-style money counter from `startAmount` → `endAmount` with a green flash. Value/finance beats only.

---

## Block Routing by Beat Purpose

| Beat purpose | Suggested blocks (ranked) | Mood note |
|---|---|---|
| `hook` | `dr/hook-bigtext-pop`, `dr/hook-question-zoom`, `dr/punctuation-pop`, `dr/search-query-overlay` | Big, single statement. Word-anchor the key noun. |
| `problem` | `dr/agitation-word-highlight`, `hf/macos-notification`, `dr/search-query-overlay`, `dr/video-inset-card` | Make pain visible. Notification/search if relatable. |
| `agitate` | `dr/agitation-word-highlight`, `dr/punctuation-pop`, `dr/hook-question-zoom` | Punch-words synced to VO. |
| `why_others_fail` | `dr/animated-bullet-list`, `dr/step-path-goal` | 2–3 failure reasons, tight copy. |
| `mechanism` | `dr/animated-bullet-list`, `dr/step-path-goal`, `dr/media-swap-stack` | Steps or 3 bullets. Product-specific. |
| `value_prop` | `dr/animated-bullet-list`, `dr/receipt-breakdown`, `hf/apple-money-count` | Clear outcome or savings. |
| `proof` | `dr/map-pin-proof`, `dr/receipt-breakdown`, `dr/instagram-comment`, `dr/tiktok-comment`, `hf/reddit-post`, `hf/x-post`, `dr/dm-screenshot`, `hf/yt-lower-third` | Vary platform by audience. Never the same twice. |
| `objection` | `dr/instagram-comment`, `dr/tiktok-comment`, `dr/dm-screenshot`, `hf/x-post` | Real objection + response. |
| `cta` | `dr/cta-button-pulse`, `dr/scarcity-countdown`, `dr/punctuation-pop` | Pulse button always. Countdown only for real urgency. Word-anchor the price. |

---

## Transition Energy Table

Pick ONE primary transition family per video + ONE accent at the emotional climax. Match `energy` to the Visual Director Contract.

| Energy | Primary transition | Accent | When |
|---|---|---|---|
| `calm` | `hf/blur-through`, `hf/focus-pull`, `hf/crossfade` | `hf/light-leak` | UGC, wellness, emotional, longer beats |
| `medium` | `hf/whip-pan`, `hf/push-slide`, `hf/cinematic-zoom` | `hf/chromatic-aberration` | SaaS, finance, coaching |
| `high` | `hf/flash-through-white`, `hf/glitch` | `hf/chromatic-aberration` | Fitness, gaming, hype, high-energy hook |

**`hf/cinematic-zoom`**: the climax transition — use max once per video, at the emotional peak (Stuck → Revelation). Avoid adjacent high-energy transitions (flash + whip-pan back-to-back = chaos).

---

## Positioning Guidelines

- `position: "bottom"` — lower thirds, badges, CTAs
- `position: "middle"` — comments, DMs, search overlays, full-card overlays
- `position: "top"` — notifications (macOS, system alerts)
- `position: "custom"` with `yPercent` — precise placement (CTA button ≈ `yPercent: 65`)

Safe zones (9:16): keep text within 64px left/right, avoid top 120px and bottom 180px except for deliberate lower-thirds.
