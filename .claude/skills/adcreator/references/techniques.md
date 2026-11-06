# Techniques — reaching for range, deliberately

AdCreatorStudio builds ads from a curated block + caption + transition set (not free HTML). Within that, these are the levers that make an ad feel *crafted* instead of templated. Pick deliberately per beat — note your picks in the Plan table.

## Caption styles (the #1 motion surface for 9:16)

Captions are word-timed and burned in — they carry most of the kinetic energy of a DR ad. Choose the style to match the ad's tone (set on the video; `dr_video_create` / `dr_video_update` `caption_style`). Call **`dr_caption_styles`** for the live list (id, category, tone, `needs`).

Top picks are HyperFrames-designed components driven by our ElevenLabs word timing:

| Tone / niche | caption_style | Feel |
|---|---|---|
| UGC, social, lifestyle | `pill-karaoke` | Pill fills word-by-word — native TikTok feel |
| Hype, fitness, gaming, bold hook | `kinetic-slam` | Big punchy per-word slam (auto-accents brand/number words) |
| Clean overlay-light | `highlight` | Accent pill sweeps the active word |
| Bold statement | `gradient-fill` | Gradient sweeps across each word |
| Tech, neon, night | `neon-glow` | Glowing accent word (auto-accents brand/number words) |

Legacy inline styles still selectable: `pop` (soft bouncy, default), `classic` (dark subtitle plate), `glitch` (RGB-split), `editorial` (restrained weight-shift). Prefer the components above for new ads.

`needs: ['keyword']` styles auto-accent brand names, numbers and ALL-CAPS — no manual tagging. Rules: one caption style per video (hold it constant). Burned-in captions add 15–25% retention — keep them on unless the user opts out. Word-anchor content-bound overlays to land on the same word the caption emphasizes.

## Overlay motion

- **Block animation enums** — every overlay block exposes `animation` / `introAnimation` / `outroAnimation` / `internalAnimation`. Vary them across beats so overlays don't all enter the same way.
- **`easing`** prop (per overlay) sets the *feel* of the intro/outro motion: `smooth` (natural), `snappy` (quick/decisive), `bouncy` (overshoot), `springy` (oscillate), `dramatic` (fast then glide), `dreamy` (slow, symmetrical). Match it to the ad tone — snappy for hype, dreamy for wellness, smooth as the safe default.
- **One idea per beat.** An overlay delivers one readable fact in two seconds. Sometimes the strongest beat has no overlay — let footage + captions carry it.
- **Word-anchor** product name / price / claim so the overlay punches on the spoken word (`timing.mode: "word-anchor"`, indices from `caption_words`).

## B-roll / cutaway techniques

- **Cut on the claim.** Layer a cutaway (`dr_media_clip_add`, track ≥ 1) exactly when a feature is named or a number is said — not on a timer.
- **Ken-Burns on stills.** Never leave an image static; alternate `ken_burns` / `zoom_in` / `pan_left` across image clips.
- **Proof inserts.** Receipt / chart / screenshot cutaway on proof beats; reaction or before/after where the script earns it.
- **Blend user + stock** — user footage for mechanism/proof bases, stock cutaways for texture.

## Transitions

- One primary transition family + one accent at the emotional climax. Match energy (calm/medium/high) to the Visual Director Contract. `hf/cinematic-zoom` max once — it's the reveal.

## Sound design

- Subtle SFX on overlay entrances (`soft-hit`, `pop-click`, `whoosh`, `cash-tick`) at 0.2–0.45 volume. A `breath` under a calm transition. Keep it under the VO.

## Per-beat technique pick (add to the Plan table)

For a footage-rich or complex ad, name 1–2 techniques per beat alongside the clip + overlay choice — e.g. *"mechanism: own_clip #7 base + stock detail cutaway @‘twist’ + animated-bullet-list (rise) + karaoke captions"*. This is what turns a correct ad into a crafted one.
