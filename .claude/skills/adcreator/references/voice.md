# Voice Reference

## Selection by Niche

Call `dr_voice_list` to get available voices with their labels. Pick based on product + audience.

| Product type | Voice personality | Labels to look for |
|---|---|---|
| Beauty, skincare, wellness (women) | Warm conversational female | "conversational", "female", "warm", "young adult" |
| Fitness, supplements (men) | Confident direct male | "confident", "male", "direct", "energetic" |
| Finance, coaching, high-ticket | Authority male, serious | "authority", "male", "deep", "serious", "mature" |
| Youth, gaming, entertainment | Young energetic | "young", "energetic", "excited", "fast" |
| Medical, insurance, premium | Calm trustworthy | "calm", "clear", "trustworthy", "neutral" |
| Luxury, cinematic | Deep deliberate male | "deep", "slow", "male", "luxury", "cinematic" |
| SaaS, productivity, B2B | Professional neutral | "professional", "neutral", "clear", "mid-range" |

No audio preview in coding agent — describe the voice from its labels when reporting to user.

### Voice selection priority order

1. **User's own cloned voice** (`category: "cloned"`) in the target language — always present this first. Most authentic for UGC. The user's own voice = highest trust signal.
2. **Professional voices** (`category: "professional"`) in the target language — curated voices built for the platform.
3. **Premade voices** (`category: "premade"`) in the target language — fallback only.

When user has a cloned voice in the right language, say: *"I see you have a cloned voice ([name]) — this will sound the most authentic for UGC. I'll use it unless you prefer a different voice."*

If multiple candidates exist, present max 3 options with their DR guidance label. Don't list the full 20+ voice list.

---

## ElevenLabs Model Settings

### Models

| Model ID | Use case | Notes |
|---|---|---|
| `eleven_v3` | Best quality, emotion-aware | Supports audio tags for pacing. Recommended. |
| `eleven_multilingual_v2` | Fast, multilingual | Use if v3 unavailable or budget-sensitive |
| `eleven_flash_v2_5` | Lowest latency | For real-time or rapid iteration only |

Default: `eleven_v3` when available.

### Voice Speed

| Beat | Recommended speed | Notes |
|---|---|---|
| hook | 1.0–1.1 | Deliberate. Let the hook land. |
| problem | 0.95–1.0 | Slightly slower = empathetic, relatable |
| agitate | 1.1–1.2 | Faster = urgency building |
| why_others_fail | 1.0 | Confident dismissal |
| mechanism | 0.9–1.0 | Slower = explanation mode, trustworthy |
| value_prop | 1.0–1.05 | Clear and confident |
| proof | 1.0 | Measured delivery = credibility |
| objection | 1.05–1.1 | Quick reassurance stack |
| cta | 1.1–1.2 | Energy spike, urgency |

These are global speed settings. If the video has a consistent pace, use 1.0 as base and let the copywriting carry the pacing.

### Stability and Style

| Audience | Stability | Style |
|---|---|---|
| Premium, medical | 0.7–0.8 | 0.0 (neutral) |
| Lifestyle, conversational | 0.4–0.6 | 0.2–0.4 |
| Energetic, youth | 0.3–0.5 | 0.3–0.5 |

Higher stability = more consistent, less expressive. Lower = more dynamic, more varied.

### TTS Text Optimization (MANDATORY before dr_video_create)

The VO text you write in the script is NOT what gets sent to ElevenLabs verbatim. You must optimize it first. Do this before calling `dr_video_create`.

**Rules — apply to every beat:**

1. **Spell out numbers** — TTS reads digits inconsistently. "70%" → "siebzig Prozent" (DE) / "seventy percent" (EN). "25€" → "fünfundzwanzig Euro". "3 Wochen" → "drei Wochen".
2. **Remove em-dashes** — "X — Y" causes TTS to restart delivery. Replace with comma: "X, Y". Or restructure: "X und Y".
3. **No period-stacked fragments** — "X. Y. Z." = three hard stops. Connect: "X, Y und Z." or "X — aber Y" → "X, aber Y".
4. **Use ellipsis for deliberate pauses** — `...` works in v3. "Ich hab alles probiert... nichts hat geholfen." Max 1-2 per beat.
5. **No SSML break tags** — v3 doesn't support `<break time="1.5s"/>`. Use `...` instead.
6. **Expand abbreviations that TTS will stumble on** — "HCL" → "H-C-L". "mg" → "Milligramm". Product names: spell phonetically if unusual.
7. **Write as continuous speech** — Read every beat out loud. If it sounds like reading a list, rewrite it.

### Audio Tags (eleven_v3 only)

v3 supports `[tag]` inline audio cues that change delivery. Use them surgically — 1–2 per beat MAX. Overuse makes the voice erratic.

**DO NOT** use audio tags on every sentence. They must be contextually earned.

#### Tags by beat type

| Beat | Appropriate tags | Avoid |
|---|---|---|
| hook | `[curious]`, `[excited]`, `[direct]` | `[whispering]`, `[laughing]` |
| problem | `[empathetic]`, `[sighs]`, `[thoughtful]` | `[excited]`, `[laughing]` |
| agitate | `[frustrated]`, `[annoyed]` | `[happy]`, `[whispering]` |
| mechanism | `[confident]`, `[curious]` | `[excited]`, `[sighs]` |
| proof | `[warm]`, `[genuine]` | `[sarcastic]`, `[annoyed]` |
| objection | `[reassuring]`, `[direct]` | — |
| cta | `[excited]`, `[direct]` | `[whispering]`, `[sighs]` |

#### Placement rules

- Place the tag immediately before the segment it modifies
- A tag modifies everything after it until the next tag or end of text
- Don't open with a tag on every beat — sometimes let the voice handle it naturally

#### German-language note

Audio tags work in German v3 voices. Use English tags even for German VO — the tag controls delivery, not language. `[excited] Ich hab's nicht geglaubt...` works.

#### Examples

**Hook (German fitness):**
```
[curious] Du nimmst Kreatin und trotzdem stagnierst du... weißt du warum?
```

**Problem:**
```
Ich hab alles probiert, mehr Schlaf, mehr Protein, Deload-Wochen. [sighs] Immer das gleiche.
```

**Mechanism:**
```
[confident] Kreatin HCL wird siebzig Prozent schneller aufgenommen und geht direkt in die Zelle. Keine Ladephase, keine Wassereinlagerungen.
```

**CTA:**
```
[excited] Link unten. Fünfundzwanzig Prozent auf das Dreier-Pack... und die sind schnell weg.
```

---

## Voice Settings in dr_video_create

```typescript
dr_video_create({
  // ...
  voice_id: "21m00Tcm4TlvDq8ikWAM",  // from dr_voice_list
  // voice settings default to sensible values
  // user can adjust in editor per-video
})
```

Voice model, stability, style, speed are stored per-video and applied to all beats. They can be changed in the editor UI, then TTS regenerated.

---

## When TTS Sounds Wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Too fast, words blur | Speed > 1.2 | Reduce speed or shorten VO text |
| Monotone, no emotion | Stability too high | Lower to 0.4–0.5 |
| Inconsistent delivery | Stability too low | Raise to 0.6 |
| Wrong pacing mid-sentence | Word count over limit | Trim VO text to beat word count |
| Sounds robotic | Wrong model | Switch to `eleven_v3` |
| Audio too short, CTA cut off | Duration underestimated | Check `durationMs` from TTS response |
