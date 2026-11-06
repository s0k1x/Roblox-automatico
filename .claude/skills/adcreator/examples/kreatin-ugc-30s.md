# Example: Kreatin HCL Supplement — 30s UGC Style (German)

Full worked example showing the script-agent path: agent drafts script → beat assignment → audio tags → tool calls → overlays → transitions.

**Product:** Kreatin HCL supplement
**Template:** `ugc_style` (5 beats, ~25s)
**Language:** German, colloquial
**Audience:** Male, 22–35, trained before with Monohydrat, experienced bloating/puffiness

---

## Step 0 — Visual Director Contract

```json
{
  "style_name": "Kinetic Dark",
  "energy": "high",
  "palette": {
    "backgroundColor": "rgba(10,10,10,0.88)",
    "textColor": "#ffffff",
    "mutedTextColor": "rgba(255,255,255,0.72)",
    "accentColor": "#ff2f2f"
  },
  "overlayStyle": {
    "surface": "dark-card",
    "position": "bottom",
    "scale": "1.05",
    "opacity": "1"
  },
  "transitionLanguage": {
    "primary": "whip-pan",
    "accent": "cinematic-zoom (mechanism reveal)"
  }
}
```

---

## Step 1 — Full Monologue

> Ich hab Kreatin genommen und hab ausgesehen als hätte mich jemand mit einer Fahrradpumpe aufgepumpt. Gesicht aufgedunsen, Bauch gebläht, und irgendwann hab ich's einfach sein lassen.
>
> Dabei hab ich echt alles probiert. Mehr Wasser trinken, mit dem Essen nehmen... Hat alles nix gebracht. Weil keiner dieser Tipps das eigentliche Problem angeht.
>
> Normales Monohydrat löst sich kaum auf. Es liegt im Magen, zieht Wasser, und ein Großteil verlässt deinen Körper bevor überhaupt was in der Muskulatur ankommt. Kreatin HCL dagegen löst sich komplett auf, direkte Aufnahme, kein Blähbauch, kein aufgedunsenes Gesicht. Und statt fünf Gramm reichen vier Kapseln.
>
> Über tausend zweihundert Leute berichten genau dasselbe und sehen jetzt zum ersten Mal wirklich Ergebnisse.
>
> Wenn du Kreatin schon mal aufgegeben hast, dann ist das der Grund. Gerade gibt's das Dreier-Bundle mit fünfundzwanzig Prozent Rabatt. Link unten.

---

## Step 1 — Beat Assignment + Audio Tags

```json
[
  {
    "beat_type": "hook",
    "vo_text": "[direct] Ich hab Kreatin genommen und hab ausgesehen als hätte mich jemand mit einer Fahrradpumpe aufgepumpt. Gesicht aufgedunsen, Bauch gebläht, und irgendwann hab ich's einfach sein lassen."
  },
  {
    "beat_type": "problem",
    "vo_text": "[empathetic] Dabei hab ich echt alles probiert. Mehr Wasser trinken, mit dem Essen nehmen... Hat alles nix gebracht. Weil keiner dieser Tipps das eigentliche Problem angeht."
  },
  {
    "beat_type": "mechanism",
    "vo_text": "[confident] Normales Monohydrat löst sich kaum auf. Es liegt im Magen, zieht Wasser, und ein Großteil verlässt deinen Körper bevor überhaupt was in der Muskulatur ankommt. Kreatin HCL dagegen löst sich komplett auf, direkte Aufnahme, kein Blähbauch, kein aufgedunsenes Gesicht. Und statt fünf Gramm reichen vier Kapseln."
  },
  {
    "beat_type": "proof",
    "vo_text": "[warm] Über tausend zweihundert Leute berichten genau dasselbe und sehen jetzt zum ersten Mal wirklich Ergebnisse."
  },
  {
    "beat_type": "cta",
    "vo_text": "[excited] Wenn du Kreatin schon mal aufgegeben hast, dann ist das der Grund. Gerade gibt's das Dreier-Bundle mit fünfundzwanzig Prozent Rabatt. Link unten."
  }
]
```

---

## Step 2 — dr_video_create

```typescript
dr_video_create({
  title: "Kreatin HCL — Bloating Hook",
  template: "ugc_style",
  beats: [ /* beats array above */ ],
  voice_id: "<confirmed voice id>",
  caption_style: "pop"
})
```

---

## Step 5 — Overlays

```typescript
// Hook: big text punch
dr_overlay_add({
  video_id,
  block_id: "dr/hook-bigtext-pop",
  props: {
    headline: "Aufgedunsen vom Kreatin?",
    accentColor: "#ff2f2f",
    backgroundColor: "rgba(10,10,10,0.88)",
    textColor: "#ffffff"
  },
  timing: { mode: "beat-relative", beat_id: "<hook id>", at_ms: 0, duration_ms: 3200 },
  track_index: 1,
  sound_effect: { presetId: "soft-hit", volume: 0.30, offsetMs: 0 }
})

// Mechanism: HCL bullet points
dr_overlay_add({
  video_id,
  block_id: "dr/animated-bullet-list",
  props: {
    title: "Kreatin HCL",
    item1: "Löst sich komplett auf",
    item2: "Kein Blähbauch, kein aufgedunsenes Gesicht",
    item3: "Vier Kapseln statt fünf Gramm",
    markerStyle: "checks",
    accentColor: "#ff2f2f"
  },
  timing: { mode: "beat-relative", beat_id: "<mechanism id>", at_ms: 1800, duration_ms: 4500 },
  track_index: 1,
  sound_effect: { presetId: "pop-click", volume: 0.28, offsetMs: 0 }
})

// Proof: social proof comment
dr_overlay_add({
  video_id,
  block_id: "dr/instagram-comment",
  props: {
    username: "@kunde",
    comment: "Endlich kein Blähbauch mehr. Direkt mehr Kraft nach zwei Wochen.",
    meta: "Verifizierter Käufer",
    blurIdentity: "true"
  },
  timing: { mode: "beat-relative", beat_id: "<proof id>", at_ms: 500, duration_ms: 4000 },
  track_index: 1,
  sound_effect: { presetId: "pop-click", volume: 0.25, offsetMs: 0 }
})

// CTA: button + discount word-anchor pop
dr_overlay_add({
  video_id,
  block_id: "dr/cta-button-pulse",
  props: {
    cta: "Jetzt bestellen",
    offer: "25% Rabatt — Dreier-Bundle",
    accentColor: "#ff2f2f"
  },
  timing: { mode: "beat-relative", beat_id: "<cta id>", at_ms: 0, duration_ms: 5000 },
  track_index: 1,
  sound_effect: { presetId: "soft-hit", volume: 0.35, offsetMs: 0 }
})

// CTA: word-anchor pop on "fünfundzwanzig Prozent"
// caption_words[8] = "fünfundzwanzig" (verify index from dr_video_get)
dr_overlay_add({
  video_id,
  block_id: "dr/punctuation-pop",
  props: { text: "25% RABATT" },
  timing: { mode: "word-anchor", beat_id: "<cta id>", word_index: 8, duration_ms: 1600 },
  track_index: 2
})
```

---

## Step 6 — Transitions

```typescript
// Hook → Problem: shock recognition
dr_transition_add({
  video_id,
  from_beat_id: "<hook id>",
  to_beat_id: "<problem id>",
  block_id: "hf/flash-through-white",
  sound_effect: { presetId: "flash-rise", volume: 0.36, offsetMs: -50 }
})

// Problem → Mechanism: the climax turn (use max ONCE)
dr_transition_add({
  video_id,
  from_beat_id: "<problem id>",
  to_beat_id: "<mechanism id>",
  block_id: "hf/cinematic-zoom",
  sound_effect: { presetId: "soft-hit", volume: 0.40, offsetMs: -80 }
})

// Proof → CTA: soft exhale into the ask
dr_transition_add({
  video_id,
  from_beat_id: "<proof id>",
  to_beat_id: "<cta id>",
  block_id: "hf/blur-through",
  sound_effect: { presetId: "breath", volume: 0.28, offsetMs: -40 }
})
```
