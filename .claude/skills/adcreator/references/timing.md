# Overlay Timing Reference

Three timing modes for `dr_overlay_add`, `dr_overlay_update`, and `dr_media_clip_add`.

## Contents
- Beat-relative timing
- Word-anchor timing
- Absolute timing
- When to use which
- Timing examples by beat type

---

## Beat-Relative Timing

Offset from the **start of a beat**. Best for decorative or structural overlays after TTS exists. If beat duration changes, run `dr_video_recalculate_timings`.

```typescript
timing: {
  mode: "beat-relative",
  beat_id: "<beat UUID>",
  at_ms: 300,      // start 300ms after beat begins
  duration_ms: 3500 // show for 3.5 seconds
}
```

`at_ms: 0` = overlay appears at the exact beat start.

**Recommended offset by use:**
- Hook text reveal: `at_ms: 0` (immediate)
- Proof/review card: `at_ms: 500–800` (let B-Roll settle first)
- Product reveal: `at_ms: 1200–2000` (after setup)
- CTA button: `at_ms: 0` (whole CTA beat)

---

## Word-Anchor Timing

Pins an overlay to a **specific spoken word**. The overlay starts when that word starts. When TTS regenerates, word-anchor overlays auto-recalculate — no manual ms math needed.

```typescript
timing: {
  mode: "word-anchor",
  beat_id: "<beat UUID>",
  word_index: 4,    // index into caption_words array (from dr_video_get)
  duration_ms: 2000
}
```

**How to find word_index:**
1. Call `dr_video_get({ video_id })` after TTS is generated
2. In each beat's `caption_words` array, find the target word
3. Its array index is the `word_index` to pass

**Use word-anchor for:**
- Product name / mechanism name (first mention)
- Price or discount ("FREE", "25%", "nur heute")
- Key claim word (the punchline word)
- Brand name
- Any quoted testimonial phrase
- Punctuation-pop or word-highlight overlays that should sync frame-perfectly

Default to word-anchor for content-bound overlays. Beat-relative is for decorative/structural overlays only.

Drift example: estimated beat is 10s, real TTS at 1.15x is 8.2s. A beat-relative 9s overlay overruns/clips; a word-anchor overlay stays glued to the spoken product name or claim word.

**Example — CTA price reveal:**
```typescript
// Beat VO: "Right now you can get the bundle for just free — link below"
// caption_words[3] = "free"
dr_overlay_add({
  video_id: "...",
  block_id: "dr/punctuation-pop",
  props: { text: "FREE" },
  timing: { mode: "word-anchor", beat_id: "<cta id>", word_index: 3, duration_ms: 1800 },
  track_index: 2
})
```

**Example — mechanism name emphasis:**
```typescript
// Beat VO: "Kreatin HCL löst sich komplett auf..."
// caption_words[1] = "HCL"
dr_overlay_add({
  video_id: "...",
  block_id: "dr/agitation-word-highlight",
  props: { text: "Kreatin HCL" },
  timing: { mode: "word-anchor", beat_id: "<mechanism id>", word_index: 1, duration_ms: 2200 },
  track_index: 1
})
```

---

## Absolute Timing

Raw milliseconds across the full video timeline. Use only for:
- Transitions (automatically calculated by `dr_transition_add`)
- Full-timeline FX like grain overlays spanning the whole video
- When you know exact ms from the timeline

```typescript
timing: {
  mode: "absolute",
  start_ms: 12000,
  end_ms: 15500
}
```

Avoid for content overlays — beat durations change when TTS regenerates, making absolute times drift.

---

## When to Use Which

| Situation | Mode |
|---|---|
| Product name, brand name, price, claim, quote phrase | `word-anchor` |
| Decorative/structural overlays after TTS exists | `beat-relative` |
| Full-timeline FX grain | `absolute` |
| Transitions (set by dr_transition_add automatically) | `absolute` |

---

## Duration Guidelines by Overlay Type

| Overlay type | Typical duration_ms |
|---|---|
| Hook big-text / statement | 2000–4000 |
| Punctuation pop / word highlight | 1200–2000 |
| Social proof card (review, badge) | 3000–5000 |
| Instagram / follow card | 3500–5000 |
| Product reveal | 3000–5000 |
| CTA button | Full CTA beat duration |
| Scarcity countdown | 2000–4000 |
| Grain FX overlay | Full beat or full video |

---

## Media Clip Animations

Always pass `animation` explicitly on every `dr_media_clip_add` call. Never leave it as `"none"` for images.

### Images
Default to alternating animations based on beat index to create visual momentum:

| Beat index (0-based) | Default animation |
|---|---|
| 0, 3, 6, … | `ken_burns` — slow zoom + lateral drift (most cinematic) |
| 1, 4, 7, … | `zoom_in` — gentle push forward |
| 2, 5, 8, … | `pan_left` — horizontal drift |

Other options: `zoom_out`, `pan_right`. Use `"none"` only for intentional freeze frames.

```typescript
// Example — image clip with animation
dr_media_clip_add({
  video_id: "...",
  beat_id: "<mechanism-beat>",
  media_url: "https://...",
  media_type: "image",
  animation: "ken_burns",   // always set explicitly
})
```

### Videos

Videos play once by default. When source video is shorter than beat audio, set `fill_policy`:

| Situation | fill_policy | Effect |
|---|---|---|
| Short loop footage (textures, patterns) | `loop` | Video loops seamlessly to fill beat |
| Single-take footage | `freeze_last` | Video plays once, last frame holds |
| Slightly short (< 20% gap) | `speed_down` | Playback rate reduced to fill duration |
| Source matches beat duration | `none` (default) | No adjustment needed |

```typescript
// Example — looping short texture clip
dr_media_clip_add({
  video_id: "...",
  beat_id: "<hook-beat>",
  media_url: "https://...",
  media_type: "video",
  animation: "none",        // let video play naturally
  fill_policy: "loop",      // loop to fill the beat
})
```

**Lint warning:** `dr_video_lint` surfaces `broll_too_short` when source B-roll is shorter than beat audio. Fix by setting `fill_policy` or adding a cutaway media clip.
