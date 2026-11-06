# Example: Skincare 30s — "Balanced Barrier Serum"

**Product:** Balanced Barrier Serum  
**Audience:** Women 25–38, oily/combination skin, frustrated with breakouts  
**Template:** `problem_solution` (6 beats, 30s)  
**Palette:** [beauty-wellness](../palettes/beauty-wellness.md)  
**Voice:** Warm conversational female, `eleven_v3`, speed 1.0

---

## Script

```json
[
  {
    "beat_type": "hook",
    "vo_text": "Your skincare routine is making it worse."
  },
  {
    "beat_type": "problem",
    "vo_text": "If you're washing your face twice a day and still breaking out, it's not your fault."
  },
  {
    "beat_type": "value_prop",
    "vo_text": "Balanced Barrier Serum resets your skin's pH in 7 days — no harsh chemicals."
  },
  {
    "beat_type": "proof",
    "vo_text": "8,400 five-star reviews. Dermatologist-tested. And it shows."
  },
  {
    "beat_type": "objection",
    "vo_text": "No fragrance. No parabens. 60-day money-back guarantee."
  },
  {
    "beat_type": "cta",
    "vo_text": "Tap below. 20% off your first order — today only."
  }
]
```

---

## dr_video_create call

```typescript
dr_video_create({
  title: "Balanced Barrier Serum — Hook: Routine is Wrong",
  template: "problem_solution",
  beats: [ /* script above */ ],
  voice_id: "<warm-female-voice-id>",
  caption_style: "pop"
})
```

---

## Overlays

**hook beat** — `dr/hook-bigtext-pop`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/hook-bigtext-pop",
  props: { headline: "Your routine is making it worse", kicker: "⚠ Dermatologists say" },
  timing: { mode: "beat-relative", beat_id: "<hook-id>", at_ms: 0, duration_ms: 2800 },
  track_index: 1
})
```

**proof beat** — `dr/instagram-comment`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/instagram-comment",
  props: {
    username: "@emma",
    comment: "Cleared my skin in twelve days. I've tried everything.",
    meta: "Verified buyer",
    blurIdentity: "true"
  },
  timing: { mode: "beat-relative", beat_id: "<proof-id>", at_ms: 500, duration_ms: 3500 },
  track_index: 1
})
```

**cta beat** — `dr/cta-button-pulse`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/cta-button-pulse",
  props: { cta: "Shop now", offer: "20% off — today only" },
  timing: { mode: "beat-relative", beat_id: "<cta-id>", at_ms: 200, duration_ms: 3000 },
  track_index: 1
})
```

---

## Transitions (2 total)

```typescript
// hook → problem: energy spike
dr_transition_add({ video_id: "...", from_beat_id: "<hook-id>", to_beat_id: "<problem-id>", block_id: "hf/flash-through-white" })

// proof → cta: soft into action
dr_transition_add({ video_id: "...", from_beat_id: "<proof-id>", to_beat_id: "<cta-id>", block_id: "hf/blur-through" })
```

---

## B-Roll Notes

| Beat | Source | What to find |
|---|---|---|
| hook | own B-Roll | Close-up skin texture, morning routine |
| problem | own B-Roll preferred | Frustrated face, cluttered bathroom |
| value_prop | Unsplash | Clean serum drop on skin |
| proof | own B-Roll | Real customer reaction, before/after |
| objection | Pexels | Clean packaging close-up |
| cta | own B-Roll | Product hero shot |
