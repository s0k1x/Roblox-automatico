# Blocks Reference

## Contents
- You Do This Wrong
- Overlay Design System (props, presets, position, typography)
- Extensibility (dr_blocks_list)
- Sound Design Contract
- Edit / Remove Tools

---

## You Do This Wrong

- `dr/cta-button-pulse` on hook or proof beats — CTA beat only.
- `hf/cinematic-zoom` more than once — climax transition, one per ad.
- More than 3 overlays on one beat — looks cluttered.
- `xPercent`/`yPercent` while `position` is top/middle/bottom — custom coordinates only when `position:"custom"`.
- Using any block not returned by `dr_blocks_list` — hidden blocks are not agent-safe.
- Leaving placeholder text in content props (handle, displayName, offer, quote) — fill real data always. Style defaults are fine as-is.

---

## Overlay Design System

**Block defaults are applied automatically** by `dr_overlay_add`. Pass only props you want to override. See [block-schema.md](block-schema.md) for the full prop surface.

For DR-native overlays, these style props are the standard interface:

| Field | Good values | Rule |
|---|---|---|
| `accentColor` | brand accent hex, warm action color | One accent per ad. Use same across overlays. |
| `backgroundColor` | `#fff8f2`, `rgba(12,10,8,0.82)`, `rgba(255,255,255,0.72)` | Use solid for clarity, glass for premium, dark-card for authority. |
| `textColor` | high contrast foreground | Must read over video at phone size. |
| `mutedTextColor` | 65-80% contrast | Eyebrows, notes, attribution. |
| `opacity` | `0.86` to `1` | Lower than 0.80 usually weakens readability. |
| `scale` | `0.85` to `1.2` | Size the whole block for 9:16 instead of stuffing text. |
| `position` | `top`, `middle`, `bottom`, `custom` | Use custom only when exact `xPercent`/`yPercent` placement is needed. |
| `fontFamily` | selector values from `dr_blocks_list` | Keep one font identity across the ad. |
| `introAnimation` / `outroAnimation` | `fade`, `rise`, `pop`, `fall`, `shrink`, etc. | Whole overlay motion. |
| `internalAnimation` | `stagger`, `pop`, `none` | Motion inside the overlay, not the card itself. |

### Style Presets

| Preset | Use | Props |
|---|---|---|
| Premium Glass | beauty, finance, luxury | `backgroundColor: rgba(16,18,24,0.72)`, `textColor: #fffaf0`, `accentColor: #c9a84c`, `opacity: 0.94`, `scale: 0.92` |
| Clean DR Card | product-page ads, proof | `backgroundColor: #fff8f2`, `textColor: #191410`, `accentColor: #e85d04`, `opacity: 1`, `scale: 1` |
| Kinetic Dark | fitness, launches | `backgroundColor: rgba(10,10,10,0.88)`, `textColor: #fff`, `accentColor: #ff2f2f`, `opacity: 1`, `scale: 1.12` |
| Soft Wellness | skincare, wellness | `backgroundColor: rgba(255,248,236,0.82)`, `textColor: #34241c`, `accentColor: #d98b62`, `opacity: 0.96`, `scale: 0.95` |

### 9:16 Placement

- Top overlays: hook/kicker only. Keep below 120px unless the subject is lower in frame.
- Middle overlays: mechanisms, big claims, punch words. Keep faces/products visible.
- Bottom overlays: reviews, follow cards, CTA. Keep above bottom 180px.
- Never cover captions and CTA at the same time. If captions occupy bottom third, put overlay top/middle or shorten overlay duration.

### Typography Rules

- Headline overlays: 60px+ equivalent, 700-950 weight, max 8 words.
- Review/CTA body: 24px+ equivalent, short lines.
- Do not use tiny SaaS-card text. Social video is watched on phones.
- Avoid generic font choices in custom HTML blocks: Inter, Roboto, Open Sans, Poppins, Syne. Prefer one strong display voice plus restrained supporting text.

### Bad-Practice Filter

Reject these before calling tools:
- Purple-blue gradient by default.
- Random glass card on every beat.
- Different transition style at every boundary.
- Five overlays on one beat.
- Placeholder defaults left in props.
- Centered everything with equal size.
- Proof overlay without real proof.
- Social-follow overlay on product-page CTA.

## Extensibility

Blocks are served dynamically by `dr_blocks_list`. Always call it before Step 5 — do NOT rely on memory of what blocks exist. New blocks appear with `drUseCase`, `recommendedFor`, `moodTags`, and `intensityLevel` in the slim response. Use those fields as the primary signal for candidate selection, then call `dr_block_get(block_id)` for defaults and fields:
- `drUseCase` — tells you which beat type and goal it serves
- `dr_block_get(block_id).defaultProps` — shows all settable fields with example values
- `dr_block_get(block_id).propFields` — exact controls, options, ranges, and defaults
- `transitionEngine: "shader"` vs `"css"` vs `null` — `null` = overlay block (not transition), `"shader"` = WebGL transition (more dramatic), `"css"` = lighter CSS transition
- `transitionFamily` — groups transitions by visual feel (dissolve, push, scale, distortion, light, etc.)
- `tags` — semantic hints for matching moments like social-proof, price, mechanism, CTA.
- `previewUrl` — optional preview media.

Only use block IDs returned by `dr_blocks_list`. If an example below names a block that is absent, pick the closest returned block by `category`, `tags`, and `drUseCase`.

---

## Sound Design Contract

HyperFrames treats audio as timeline media. Never try to play audio inside GSAP callbacks. Attach SFX through `sound_effect` on `dr_overlay_add` or `dr_transition_add`.

| Preset | Best moment | Volume |
|---|---|---|
| `soft-hit` | hook punch, product reveal, CTA | `0.32-0.45` |
| `pop-click` | bullets, comments, follow cards | `0.22-0.34` |
| `sub-tick` | proof ticker, countdown, receipt rows | `0.18-0.3` |
| `whoosh` | whip/push/slide transition | `0.3-0.42` |
| `flash-rise` | flash/light/overexposure transition | `0.28-0.4` |
| `glitch-tick` | glitch/problem interruption | `0.24-0.34` |
| `cash-tick` | price, savings, invoice/receipt | `0.22-0.34` |
| `breath` | blur/crossfade/proof-to-CTA | `0.2-0.3` |

Rules:
- SFX supports the edit, not every block. Use 3-6 SFX total in a 30s ad.
- Never stack SFX on every overlay in the same beat.
- For transitions, use `offsetMs: -80` to `-40` so the sound leads the visual slightly.
- If VO is emotional, quiet, or testimonial-style, prefer `breath` or no SFX.
- Music-led ads still need HyperFrames audio-reactive visual data separately; SFX presets are not a substitute for music-reactive animation.

## Block Selection Guide

Each block has a visual behavior. Know what it looks like before choosing it.

| Beat | Block ID | Props to set | What it looks like | Notes |
|---|---|---|---|---|
| hook | `dr/hook-bigtext-pop` | `headline`, `kicker` | Large headline punches onto screen with a quick scale pop. Kicker appears above in smaller weight. Full-frame text dominance. | Main text interrupt |
| hook (question) | `dr/hook-question-zoom` | `question`, `eyebrow` | Question text zooms in from slightly small, settles. Eyebrow above in subdued color. Conversational frame. | For question-style hooks |
| agitate | `dr/agitation-word-highlight` | `word` (pain word), `caption` | Single pain word with a yellow marker bar sweeping left-to-right (scaleX 0→1). Caption text below. Feels like a teacher underlining the most important word on a whiteboard. | Highlight the pain word |
| proof | `dr/instagram-comment` | `username`, `comment`, `meta` | Native comment bubble with real UGC proof or objection. | Real quote/comment only |
| proof | `dr/tiktok-comment` | `username`, `comment`, `meta` | TikTok-style comment bubble. | Real quote/comment only |
| value/data | `dr/receipt-breakdown` | `title`, row labels/values, total | Receipt-style value math. | Savings, bonuses, price anchoring |
| mechanism/value_prop | `dr/animated-bullet-list` | `title`, `item1`-`item4` | Staggered benefit/mechanism bullets. | 2-4 crisp bullets |
| cta | `dr/cta-button-pulse` | `cta`, `offer` | Rounded button with CTA text, pulsing glow ring expanding outward on loop. Offer text below in smaller size. Hard to ignore. | **Required on CTA** |

---

## Timing Patterns

Prefer `word-anchor` for product names, prices, claim words, brand names, and quoted phrases. Use `beat-relative` for decorative/structural overlays after TTS exists. Appear 300–500ms after beat starts. Use `auto_fit_beat: true` when the overlay should fill the rest of the beat.

```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/instagram-comment",
  props: {
    username: "@customer",
    comment: "Real testimonial phrase here",
    meta: "Verified buyer"
  },
  timing: {
    mode: "beat-relative",
    beat_id: "<beat id>",
    at_ms: 500,        // appear 0.5s after beat starts
    duration_ms: 3500  // show for 3.5s
  },
  auto_fit_beat: true,
  track_index: 1
})
```

### Timing by block type

| Block type | at_ms | duration_ms |
|---|---|---|
| Hook text pop | 0 | full beat |
| Comment/testimonial | 500 | 3500 |
| Receipt/value proof | 300 | 4000 |
| Bullet mechanism | 800 | beat remaining |
| CTA pulse | 200 | full beat |
| Agitation highlight | 200 | 2000 |

---

## Transition Catalog

Call `dr_blocks_list` to see all available transitions (category = "transition"). The list is dynamic — always call it fresh, don't rely on memory.

Transitions belong on emotional pivots, not every beat boundary. Pick ONE primary family for consistency + one accent at the biggest moment.

### What each transition communicates

Understanding the visual feel and emotional meaning of each transition is required to choose correctly. Wrong transition = wrong emotion at the wrong moment.

#### High-energy (use for hook, interruptions, urgency)

| Block ID | Visual | Feel | DR Moment |
|---|---|---|---|
| `hf/flash-through-white` | Scene overexposes to pure white luminance burst. Nothing bleeds through. The viewer blinks. | Shock. Pattern interrupt. Aggression. | hook → problem. Most powerful opener. |
| `hf/flash-cut` | White flash at 1.8s. Brain barely registers the cut. | Ultra-fast disruption. Urgency. | Hook to anything when the hook is very short (<3s). |
| `hf/glitch` | RGB channels split apart (±30-60px), scene jitters, scan lines. Posterization. | Digital chaos. System instability. | Agitate beats. Use sparingly — once max. |
| `hf/whip-pan` | Horizontal motion blur sweeps like a camera snap. Creates velocity. | Kinetic shift. Things are moving fast. | problem → agitate. Escalation without break. |

#### Medium-energy (use for pivots, structural beat changes)

| Block ID | Visual | Feel | DR Moment |
|---|---|---|---|
| `hf/cinematic-zoom` | Old scene shrinks with blur, new zooms in from behind. Scale collapse. | Revelation. Dramatic. Time slows. | agitate → mechanism. **Use max 1x — this is the climax.** |
| `hf/chromatic-aberration` | RGB channels spread apart then converge on new scene. 0.3s. | Optical distortion. Edge, tension. | problem → agitate alternative. |
| `hf/push-slide` | Horizontal push: old exits left, new enters right. | Forward movement. Next chapter. | Between structured beats. |
| `hf/zoom-through` | Old zooms past camera + blurs, new zooms in from behind. | Forward thrust. Energy. | Problem → solution pivot. |

#### Low-energy (use for trust moments, proof, CTA approach)

| Block ID | Visual | Feel | DR Moment |
|---|---|---|---|
| `hf/blur-through` | Scene fully abstracts (30px blur + 8% scale) before resolving. Heaviest blur. | "Drift with me." Calm transition. Soft thought. | proof → CTA. The exhale before the ask. |
| `hf/crossfade` | Opacity dissolve. Both scenes visible for 0.4s. No motion. | "This continues." Continuity. Trust. | mechanism → proof. Smooth trust pass. |
| `hf/blur-crossfade` | Opacity dissolve with slight blur. Softer than crossfade. | Gentle. Emotional. Soft handoff. | Any calm moment. |
| `hf/color-dip` | Dip to a color between beats. Clean, minimal pause. | Intentional pause. Breath. Structure. | Formal topic change. |
| `hf/focus-pull` | Blur in, color shift, blur out. Like racking focus on a camera. | Cinematic calm. Premium. | Beauty/wellness/premium products. |

#### Dramatic / rare (use maximum once — reserved for hero moments)

| Block ID | Visual | Feel | DR Moment |
|---|---|---|---|
| `hf/gravity-drop` | Old scene falls straight down (y +1200px, slight 4° rotation), new enters from above. Heavy physical weight. | Collapse. Gravity taking over. Final. | Extreme agitate → mechanism when the failure feels physical and total. Rare. |
| `hf/page-burn` | Organic fire front creeps across the frame, consuming the old scene. New scene revealed underneath as ash. No falling debris — pure edge geometry. | Destruction. Maximum drama. Catharsis. | Reserve for the single most dramatic pivot in the entire video. One use ever. Never on calm ads. |
| `hf/morph-circle` | A circle scales from center: 0 → fills entire frame → collapses to reveal new scene. | Playful, bold, graphic. Confident pop. | Youth/gaming/entertainment. Energetic product reveals. Not for serious DR. |
| `hf/3d-card-flip` | Frame rotates 180° on Y-axis like flipping a physical card. Physical, tactile. | "The other side of the story." Reveal. Before/after. | Objection handling. Can flip from "the problem" to "the fix" literally. 1x max. |

#### Structured / designed (use for editorial or high-design ads)

| Block ID | Visual | Feel | DR Moment |
|---|---|---|---|
| `hf/push-slide` | Horizontal push: old exits left, new enters right together. Both move at same time. | "Next chapter." Forward movement. Clean. | Between structured beats in finance/coaching templates. |
| `hf/staggered-blocks` | Color panels slide across the frame in staggered sequence, then wipe away in reverse. Rhythmic, designed. | "This was designed." Structure. Craft. | Mechanism or proof beat when the product has a designed/premium feel. Not for UGC style. |
| `hf/shutter` | Two horizontal halves close from top and bottom, meet in middle, then open to reveal new scene. Like a camera shutter or stage curtain. | Mechanical reveal. Anticipation. | Mechanism reveal when you want theatrical buildup. Finance/tech. |
| `hf/clock-wipe` | Radial wipe sweeps clockwise from 12 o'clock across the frame. Feels like time moving. | Transition of time. "Meanwhile." | Before/after time-gap beats. "After 30 days..." |
| `hf/circle-iris` | Circle grows from center, iris-in style, to reveal new scene. Classic film technique. | Warm. Familiar. Cinematic. | Proof beats with heritage/nostalgia feel. Wellness, food. |
| `hf/diagonal-split` | Frame splits diagonally — old scene slides off one corner, new slides in from opposite. | Bold. Dynamic. Angled energy. | Hook to problem in high-energy fitness/gaming ads. Alternative to flash. |
| `hf/grid-dissolve` | Frame breaks into grid cells; cells fade out staggered revealing new scene. Like pixels dissolving. | Technical. Digital. Disintegration. | Tech/SaaS/AI ads. Agitate to mechanism when the old system is broken. |

### Visual Style × DR Niche

The HyperFrames visual style system maps directly to DR ad niches. When selecting overlays and transitions, match the style energy to the niche.

| DR Niche | Visual Style | Energy | Avoid |
|---|---|---|---|
| Fitness / supplements | Maximalist Type | High — kinetic, full-frame type, hard cuts | Soft dissolves, pastel |
| Beauty / skincare / wellness | Soft Signal | Medium-low — drifts, floats, warmth | Glitch, hard flash, glitch |
| Finance / coaching / high-ticket | Velvet Standard or Shadow Cut | Medium — slow reveals, dark premium, authority | Flash-cut, glitch, morph-circle |
| Tech / SaaS / AI | Swiss Pulse or Data Drift | Medium — geometric, precision, accent neon | Page-burn, morph-circle |
| Youth / gaming / entertainment | Deconstructed or maximalist | High — glitch artifacts, electric, oversaturated | Focus-pull, blur-crossfade |
| Food / consumer / lifestyle | Folk Frequency | Medium — bounce, warmth, organic | Grid-dissolve, 3D-card-flip |

Use this to choose: which blocks look right (grain overlay fits Maximalist Type, focus-pull fits Soft Signal), which transitions fit (glitch + flash for Deconstructed, crossfade + focus-pull for Soft Signal).

### Recommended per beat boundary

| Boundary | Primary | Alternative | Avoid |
|---|---|---|---|
| hook → problem | `hf/flash-through-white` | `hf/flash-cut` | Slow dissolves (wrong energy) |
| problem → agitate | `hf/whip-pan` | `hf/chromatic-aberration` | `hf/cinematic-zoom` (save for climax) |
| agitate → mechanism | `hf/cinematic-zoom` (**max 1x**) | `hf/zoom-through` | Any dissolve (too soft) |
| mechanism → proof | `hf/crossfade` | `hf/blur-crossfade` | Glitch (wrong tone for trust) |
| proof → cta | `hf/blur-through` | `hf/crossfade` | Flash (too aggressive) |

### Transition selection by ad energy

| Ad type | Energy | Primary | Accent |
|---|---|---|---|
| High-conversion fitness/supplement | High | `hf/flash-through-white` | `hf/cinematic-zoom` |
| Beauty/wellness | Medium | `hf/crossfade` | `hf/focus-pull` |
| Finance/coaching/premium | Medium | `hf/blur-through` | `hf/cinematic-zoom` |
| Gaming/youth | High | `hf/glitch` | `hf/flash-cut` |

### Transition call

```typescript
dr_transition_add({
  video_id: "...",
  from_beat_id: "<beat id>",
  to_beat_id: "<next beat id>",
  block_id: "hf/flash-through-white"  // choose based on visual/emotional need above
})
```

---

## Props Reference by Block

### `dr/hook-bigtext-pop`
```typescript
{
  headline: "Your skincare routine is making it worse",
  kicker: "⚠ Stop scrolling"  // optional
}
```

### `dr/instagram-comment`
```typescript
{
  username: "@customer",
  comment: "I tried it for two weeks and finally felt the difference.",
  meta: "Verified buyer",
  blurIdentity: "true"
}
```

### `dr/tiktok-comment`
```typescript
{
  username: "@viewer",
  comment: "Wait, does this actually work?",
  meta: "Reply to comment",
  blurIdentity: "true"
}
```

### `dr/receipt-breakdown`
```typescript
{
  title: "What you get",
  line1Label: "Bundle",
  line1Value: "Forty nine euros",
  line2Label: "Bonus",
  line2Value: "Included",
  totalLabel: "Today",
  totalValue: "Twenty nine euros"
}
```

### `dr/animated-bullet-list`
```typescript
{
  title: "The Barrier Reset Process",
  item1: "Rebuilds natural pH shield",
  item2: "Works in seven days",
  item3: "No harsh chemicals",
  markerStyle: "checks"
}
```

### `dr/cta-button-pulse`
```typescript
{
  cta: "Tap below to shop",
  offer: "20% off — today only"
}
```

### `dr/agitation-word-highlight`
```typescript
{
  word: "tired",       // single pain word from VO
  caption: "So tired of trying everything"
}
```

## New Flexible Overlay Blocks

These are agent-friendly DR-native overlays. They all accept the standard styling contract from `dr_blocks_list`.

| Beat goal | Block ID | Use it for | Key props |
|---|---|---|---|
| benefits / objections | `dr/animated-bullet-list` | 2-4 animated bullets, numbered list, checks, dots, or no markers | `title`, `item1`-`item4`, `markerStyle`, style props |
| transformation path | `dr/step-path-goal` | Step-by-step way from current state to desired result | `startLabel`, `step1`-`step3`, `goalLabel`, style props |
| product proof / examples | `dr/media-swap-stack` | 1-3 images swapping in a paced frame | `title`, `imageUrl1`-`imageUrl3`, `caption`, style props |
| problem/demo video | `dr/video-inset-card` | Inset video or poster image for problem clip, product detail, testimonial B-roll | `title`, `videoUrl`, `posterUrl`, `caption`, style props |
| comment-led proof | `dr/instagram-comment` | Instagram-style comment when the VO mentions a comment, DM, creator reply, or customer objection | `username`, `comment`, `avatarUrl`, `meta`, `blurIdentity`, style props |
| comment-led hook | `dr/tiktok-comment` | TikTok reply/comment bubble for native UGC hooks and objection handling | `username`, `comment`, `avatarUrl`, `meta`, `blurIdentity`, style props |
| value math | `dr/receipt-breakdown` | Receipt/invoice breakdown for price, savings, bonuses, time saved | `title`, line labels/values, `totalLabel`, `totalValue`, style props |
| local proof | `dr/map-pin-proof` | Map pin + local/community count when location matters | `location`, `proof`, `subline`, style props |
| problem intent | `dr/search-query-overlay` | Animated search query for buyer-intent hooks and common questions | `query`, `result1`, `result2`, `sourceLabel`, style props |
| testimonial DM | `dr/dm-screenshot` | Native message screenshot for private proof or creator replies | `sender`, `message1`, `message2`, `reply`, `avatarUrl`, `blurIdentity`, style props |
| real urgency | `dr/scarcity-countdown` | Clean typographic countdown for true deadlines | `label`, `time`, style props |
| reaction / pattern interrupt | `dr/punctuation-pop` | Huge `?`, `!`, or `?!` in the middle of the 9:16 frame | `symbol`, `caption`, style props |

Placement recipes:
- Comment proof in the middle: `dr/instagram-comment` with `position:"middle"`, `widthPercent:"78"`, `headlineSizePx:"44"`, `backgroundColor:"rgba(255,248,242,.94)"`.
- Premium glass review: `position:"middle"`, `backgroundColor:"rgba(12,14,18,.72)"`, `textColor:"#fffaf0"`, `mutedTextColor:"rgba(255,250,240,.72)"`, `borderColor:"rgba(255,255,255,.22)"`, `borderRadiusPx:"36"`.
- Big question: `dr/punctuation-pop` with `position:"middle"`, `headlineSizePx:"220"`, `widthPercent:"58"`, `animation:"pop"`.
- Benefit stack: `dr/animated-bullet-list` with `position:"middle"`, `markerStyle:"numbers"`, `animation:"stagger"`, `widthPercent:"84"`.
- Demo inset: `dr/video-inset-card` with `position:"middle"`, `widthPercent:"78"`, `borderRadiusPx:"36"`, `animation:"pop"`.
- Receipt value stack: `dr/receipt-breakdown` with concrete line items; never fake savings.
- Search hook: `dr/search-query-overlay` with the exact question the buyer would type.
- Scarcity timer: `dr/scarcity-countdown` only when the deadline is real; pair separately with `dr/cta-button-pulse` for the CTA.

Design guardrails:
- Do not use more than one large center overlay at the same time.
- Do not put a review card and CTA in the same screen region.
- Do not shrink text below readable phone size to fit long copy. Shorten copy instead.
- Do not use `custom` placement as a default; first try top/middle/bottom.
- Use `dr_block_get(block_id).propFields` every time. It returns exact controls, options, ranges, and defaults.


### Motion Graphics Overlay Ideas

Use these as future-ready patterns when choosing or requesting overlays. They feel like edited social ads, not web cards:

- Curvy path / journey line: animated route draws from step one to two to three, then lands on goal. Best for transformation and mechanism beats.
- Native comment overlays: Instagram/TikTok comment bubble for comment-led hooks, objections, and proof. Blur avatar/name when identity should be anonymous.
- Spec dial / product orbit: product reveal with orbit rings and three specs, not another bullet card. Best for mechanism/value prop.
- Kinetic proof ticker: use only if `dr_blocks_list` returns a ticker block; otherwise use comment proof or receipt proof.
- Receipt / invoice breakdown: use `dr/receipt-breakdown` for price, time saved, or cost comparison. Good for finance, SaaS, coaching.
- Map pin / local proof: use `dr/map-pin-proof` for location or audience proof. Good for local services and event ads.
- Search query overlay: use `dr/search-query-overlay` when the user types the problem into a native search bar. Good for problem-aware hooks.
- DM screenshot reveal: use `dr/dm-screenshot` for message proof with anonymized avatar. Good for coaching/service proof.
- Before-after slider handle: vertical wipe with draggable-handle styling. Good for skincare, fitness, renovation.
- Countdown / scarcity badge: animated timer or stock count. Use only on real urgency.

Selection rules:
- If VO says “someone commented”, use `dr/instagram-comment` or `dr/tiktok-comment`, not a generic review card.
- If VO cites public social/community proof, use a returned comment/proof block; do not invent native public-post blocks.
- If VO makes a savings/revenue/value claim, use `dr/receipt-breakdown`.
- If VO explains a process, use `dr/step-path-goal`, not bullets.
- If VO lists benefits, use `dr/animated-bullet-list`.
- If VO reveals the mechanism, use `dr/step-path-goal` or `dr/animated-bullet-list`.
- If VO shows footage or a screenshot, use `dr/video-inset-card` with `posterUrl` or `videoUrl`.
- If VO says "people near you", "in Berlin", "local", or "nearby", use `dr/map-pin-proof`.
- If VO says "costs", "saves", "included", "bonus", or "today only", use `dr/receipt-breakdown`.
- If VO says "limited", "ends", "stock", or a real deadline, use `dr/scarcity-countdown`.
- If VO starts with a question a buyer would search, use `dr/search-query-overlay`.

### VSL-Style Component Logic

VSL overlays should support argument flow, not decorate randomly:

- **Open loop:** `dr/search-query-overlay`, `dr/punctuation-pop`, or `dr/hook-question-zoom` for the first unresolved question.
- **Pain proof:** `dr/dm-screenshot`, `dr/instagram-comment`, or `dr/tiktok-comment` when returned by `dr_blocks_list` and evidence is real.
- **Mechanism:** `dr/step-path-goal` for process, `dr/animated-bullet-list` for compact benefits.
- **Proof escalation:** `dr/instagram-comment` or `dr/tiktok-comment` for one verbatim testimonial, `dr/receipt-breakdown` for value proof.
- **Value justification:** `dr/receipt-breakdown` before the offer to explain price/value.
- **Close:** `dr/scarcity-countdown` as a clean timer plus `dr/cta-button-pulse` when urgency is real; otherwise only use CTA.

VSL anti-patterns:
- Do not show proof before the audience understands the mechanism.
- Do not use countdowns without real deadlines.
- Do not turn the whole ad into cards. Use overlays as beats in an argument.
- Every overlay must answer: hook, intensify pain, reveal mechanism, prove, reduce risk, or close.


---

## Editing Overlays After Creation

Use these tools to update or remove overlays without reopening the web editor. Always call `dr_overlay_list` first to get IDs:

```typescript
dr_overlay_list({ video_id })                           // get overlay IDs
dr_overlay_update({ video_id, overlay_id, props: { headline: "New text" } })
dr_overlay_remove({ video_id, overlay_id })
dr_transition_update({ video_id, transition_id, block_id: "hf/crossfade" })
dr_transition_remove({ video_id, transition_id })
```

For full editing workflow examples, see [iterating.md](iterating.md).
