# Example: Fitness Supplement 45s — "RecoverPro"

**Product:** RecoverPro (recovery supplement)  
**Audience:** Men 28–42, 4–6x/week training, hitting plateau or slow recovery  
**Template:** `classic_dr` (7 beats, 45s)  
**Palette:** [fitness-energy](../palettes/fitness-energy.md)  
**Voice:** Confident direct male, `eleven_v3`, speed 1.05

---

## Script

```json
[
  {
    "beat_type": "hook",
    "vo_text": "You're not overtrained. You're under-recovered."
  },
  {
    "beat_type": "problem",
    "vo_text": "If you're training 5 days a week and still not building muscle, the problem isn't effort."
  },
  {
    "beat_type": "agitate",
    "vo_text": "Pre-workout, protein, creatine. You've tried it all. Still plateaued."
  },
  {
    "beat_type": "why_others_fail",
    "vo_text": "Mainstream supplements flood your system with stimulants. They skip cellular recovery entirely."
  },
  {
    "beat_type": "mechanism",
    "vo_text": "The Cellular Sync Protocol replenishes ATP reserves during sleep — when actual muscle growth happens."
  },
  {
    "beat_type": "proof",
    "vo_text": "32,000 athletes. 4.9 stars. Average 12% strength gain in the first 30 days."
  },
  {
    "beat_type": "cta",
    "vo_text": "Link in bio. Free shaker with first order. 48 hours only."
  }
]
```

---

## dr_video_create call

```typescript
dr_video_create({
  title: "RecoverPro — Hook: Under-Recovered",
  template: "classic_dr",
  beats: [ /* script above */ ],
  voice_id: "<confident-male-voice-id>",
  caption_style: "highlight"
})
```

---

## Overlays

**hook beat** — `dr/hook-bigtext-pop`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/hook-bigtext-pop",
  props: { headline: "You're under-recovered.", kicker: "Not overtrained." },
  timing: { mode: "beat-relative", beat_id: "<hook-id>", at_ms: 0, duration_ms: 2500 },
  track_index: 1
})
```

**agitate beat** — `dr/agitation-word-highlight`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/agitation-word-highlight",
  props: { word: "plateaued", caption: "Tried everything. Still stuck." },
  timing: { mode: "beat-relative", beat_id: "<agitate-id>", at_ms: 200, duration_ms: 2800 },
  track_index: 1
})
```

**mechanism beat** — `dr/animated-bullet-list`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/animated-bullet-list",
  props: {
    title: "Cellular Sync Protocol",
    item1: "Replenishes ATP during sleep",
    item2: "Triggers real muscle growth",
    item3: "No stimulants. No crash.",
    markerStyle: "checks"
  },
  timing: { mode: "beat-relative", beat_id: "<mechanism-id>", at_ms: 800, duration_ms: 5000 },
  track_index: 1
})
```

**proof beat** — `dr/tiktok-comment`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/tiktok-comment",
  props: {
    username: "@recoverpro",
    comment: "Two weeks in and recovery feels completely different.",
    meta: "Creator reply",
    blurIdentity: "false"
  },
  timing: { mode: "beat-relative", beat_id: "<proof-id>", at_ms: 300, duration_ms: 3500 },
  track_index: 1
})
```

**cta beat** — `dr/cta-button-pulse`
```typescript
dr_overlay_add({
  video_id: "...",
  block_id: "dr/cta-button-pulse",
  props: { cta: "Link in bio", offer: "Free shaker — 48h only" },
  timing: { mode: "beat-relative", beat_id: "<cta-id>", at_ms: 200, duration_ms: 3000 },
  track_index: 1
})
```

---

## Transitions (3 total)

```typescript
// hook → problem: spike
dr_transition_add({ video_id: "...", from_beat_id: "<hook-id>", to_beat_id: "<problem-id>", block_id: "hf/flash-through-white" })

// agitate → why_others_fail: escalation
dr_transition_add({ video_id: "...", from_beat_id: "<agitate-id>", to_beat_id: "<why-others-fail-id>", block_id: "hf/whip-pan" })

// mechanism → proof: trust, smooth
dr_transition_add({ video_id: "...", from_beat_id: "<mechanism-id>", to_beat_id: "<proof-id>", block_id: "hf/crossfade" })
```

---

## B-Roll Notes

| Beat | Source | What to find |
|---|---|---|
| hook | own B-Roll | Heavy training, gym close-up |
| problem | own B-Roll preferred | Tired after workout, plateau moment |
| agitate | Pexels | Supplement shelf, energy drink |
| why_others_fail | Pexels | Generic pill bottles |
| mechanism | **own B-Roll only** | Product in hand, capsule macro, pouring |
| proof | **own B-Roll only** | Physique transformation, athlete testimonial |
| cta | own B-Roll | Product hero, shaker in hand |
