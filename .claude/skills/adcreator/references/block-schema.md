# Block Schema Reference

Documents what `dr_blocks_list`, `dr_block_get`, and `dr_overlay_add` expect, so you can confidently pick blocks and set props without guessing.

## Contents
- Block object shape
- Overlay style props (shared across all DR-native blocks)
- How defaults work
- Block categories
- Concrete block example

---

## Slim Block Object Shape

`dr_blocks_list` returns an array of block objects:

```typescript
{
  id: string                    // e.g. "dr/hook-bigtext-pop", "dr/instagram-comment"
  label: string                 // Human name: "Hook: Big Text Pop"
  category: string              // See categories below
  description: string           // What the block does and when to use it
  tags: string[]                // Semantic tags for matching: ["social-proof", "review", "stars"]
  previewUrl: string | null     // Optional short preview gif/mp4
  defaultDurationMs: number     // Suggested duration in ms (use as duration_ms)
  recommendedFor: string[]      // Beat purposes this block fits
  moodTags: string[]            // Warm, premium, energetic, editorial, etc.
  intensityLevel: string | null // calm | medium | high
  source: "dr" | "hyperframes"  // "dr" = inline template, "hf" = HyperFrames iframe
  transitionEngine?: "shader" | "css"   // Only on transition blocks
  transitionFamily?: string     // Groups related transitions: dissolve, push, distortion, etc.
}
```

Call `dr_block_get(block_id)` for the full schema:

```typescript
{
  defaultProps: object
  propFields: { name, type, control, options, min, max, step, defaultValue }[]
  styleVariants: object
}
```

---

## Overlay Style Props (DR-native blocks)

All `dr/*` blocks share these standard style props. Pass only the ones you want to override — the rest come from `block.defaults`:

| Prop | Default | Description |
|---|---|---|
| `accentColor` | `"#e85d04"` | Brand/action color. Bullets, stars, CTA button, badges. |
| `backgroundColor` | `"#fff8f2"` | Card surface. Use `rgba(...)` for glass/transparency. |
| `textColor` | `"#191410"` | Primary readable text. |
| `mutedTextColor` | `"rgba(25,20,16,.62)"` | Eyebrow/supporting text. |
| `opacity` | `"1"` | Overall overlay opacity. `0.86–0.94` for glass. |
| `scale` | `"1"` | Whole overlay scale. `0.85–0.95` lower-thirds, `1.05–1.2` hook. |
| `position` | `"bottom"` | `"top"` / `"middle"` / `"bottom"` / `"custom"` |
| `align` | `"center"` | `"left"` / `"center"` / `"right"` |
| `widthPercent` | `"86"` | Overlay width as % of 1080px canvas. |
| `xPercent` | `"50"` | X center when `position: "custom"`. |
| `yPercent` | `"72"` | Y center when `position: "custom"`. |
| `paddingPx` | `"34"` | Inner padding in pixels. |
| `borderRadiusPx` | `"32"` | Corner radius. |
| `borderWidthPx` | `"1"` | Border width. |
| `borderColor` | `"rgba(255,255,255,.18)"` | Border color. |
| `fontFamily` | `"Plus Jakarta Sans"` | Use selector from `dr_blocks_list`; don't invent CSS stacks. |
| `headlineSizePx` | `"52"` | Main headline size in px. Social video: 60px+ minimum. |
| `bodySizePx` | `"30"` | Body text size. |
| `metaSizePx` | `"22"` | Meta/microcopy size. |
| `markerSizePx` | `"58"` | Icon/marker size. |
| `animation` | `"rise"` | Block animation variant: `pop`, `rise`, `slide-left`, `slide-right`, `zoom`, `typewriter`, `stagger`, `none` |
| `introAnimation` | `"none"` | Whole-overlay entrance: `fade`, `rise`, `pop`, `slide-left`, `slide-right`, `zoom`, `none` |
| `outroAnimation` | `"none"` | Whole-overlay exit: `fade`, `fall`, `slide-left`, `slide-right`, `shrink`, `none` |
| `internalAnimation` | `"none"` | Motion inside overlay: `stagger`, `pop`, `none` |

`hf/*` (HyperFrames) blocks have their own prop schemas — check `propFields` from `dr_block_get`.

---

## How Defaults Work

`dr_overlay_add` automatically merges `block.defaults` with your `props`. You only override what you want to change:

```typescript
// This is all you need for a hook overlay — everything else is default
dr_overlay_add({
  video_id,
  block_id: "dr/hook-bigtext-pop",
  props: {
    headline: "Your skin barrier is broken.",
    accentColor: "#e22c3e"  // brand red
  },
  timing: { mode: "beat-relative", beat_id: "<id>", at_ms: 0, duration_ms: 3500 },
  track_index: 1
})
// Result: headline = "Your skin barrier is broken.", accentColor = "#e22c3e"
// Everything else (position, scale, opacity, animation, etc.) from block defaults
```

To use block defaults unchanged and only pass content:
```typescript
props: { headline: "Your text here" }  // One prop override
```

To match brand palette while keeping block layout defaults:
```typescript
props: {
  headline: "Your text here",
  accentColor: "#c9a84c",
  backgroundColor: "rgba(16,18,24,0.72)",
  textColor: "#fffaf0"
}
```

---

## Block Categories

| Category | Blocks | When to add |
|---|---|---|
| `hook` | bigtext-pop, question-zoom | Hook beat — always |
| `problem` | split-compare, macOS-notification | Problem/agitate beats |
| `social-proof` | badge, reviews, instagram-comment, tiktok-comment, proof-ticker, receipt-breakdown, map-pin, DM-screenshot | Proof beat |
| `solution` | product-reveal, animated-bullet-list, step-path, media-swap-stack, video-inset-card | Mechanism beat |
| `cta` | button-pulse, scarcity-countdown | CTA beat only |
| `fx` | grain-overlay, punctuation-pop | Hook/CTA, word-anchor moments |
| `data` | animated-chart, flowchart | Data/proof beats |
| `showcase` | logo-outro, app-showcase, 3D-UI-reveal | Product/CTA beats |
| `transition` | (all hf/ transitions) | Beat boundaries — via dr_transition_add |

---

## Concrete Example: dr/hook-bigtext-pop

From `dr_block_get("dr/hook-bigtext-pop")`:

```json
{
  "id": "dr/hook-bigtext-pop",
  "label": "Hook: Big Text Pop",
  "category": "hook",
  "defaultDurationMs": 3500,
  "source": "dr",
  "defaultProps": {
    "headline": "Wait a Minute!",
    "kicker": "",
    "accentColor": "#e85d04",
    "backgroundColor": "#fff8f2",
    "textColor": "#191410",
    "opacity": "1",
    "scale": "1",
    "position": "middle",
    "headlineSizePx": "120",
    "animation": "pop",
    "introAnimation": "none"
  }
}
```

Three `dr_overlay_add` calls with different brand styles, all passing minimal props:

```typescript
// Fitness / high-energy
dr_overlay_add({
  video_id, block_id: "dr/hook-bigtext-pop",
  props: { headline: "Du verlierst Muskeln ohne es zu merken.", accentColor: "#ff2f2f", backgroundColor: "rgba(10,10,10,0.88)", textColor: "#fff" },
  timing: { mode: "beat-relative", beat_id, at_ms: 0, duration_ms: 3500 }, track_index: 1
})

// Skincare / wellness
dr_overlay_add({
  video_id, block_id: "dr/hook-bigtext-pop",
  props: { headline: "Your skin barrier is breaking down.", accentColor: "#d98b62", backgroundColor: "rgba(255,248,236,0.82)", textColor: "#34241c" },
  timing: { mode: "beat-relative", beat_id, at_ms: 0, duration_ms: 3800 }, track_index: 1
})

// Finance / premium
dr_overlay_add({
  video_id, block_id: "dr/hook-bigtext-pop",
  props: { headline: "Most traders lose because of this one pattern.", accentColor: "#c9a84c", backgroundColor: "rgba(16,18,24,0.72)", textColor: "#fffaf0" },
  timing: { mode: "beat-relative", beat_id, at_ms: 0, duration_ms: 3200 }, track_index: 1
})
```

All three call the same block, pass only 3–4 props, and rely on defaults for everything else.

---

## Duration Defaults by Category

Use `block.defaultDurationMs` as a starting point:

| Category | Typical defaultDurationMs |
|---|---|
| Hook text | 3000–4000 |
| Social proof card | 3500–5000 |
| Product reveal | 3000–5000 |
| CTA button | 4000–6000 |
| FX grain | 4000–8000 |
| Punctuation pop | 1200–1800 |
| Transitions | 600–1200 |
