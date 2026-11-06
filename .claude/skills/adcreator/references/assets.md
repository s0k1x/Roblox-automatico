# Asset Library

## Three Kinds of Assets

A user's library now contains three distinct kinds of media, all returned by `dr_assets_list`:

| `source` field | What it is | Use it for |
|---|---|---|
| `upload` | Raw user upload (image or full-length video) | Hero shots, single-take footage |
| `google_drive` | Imported from the user's Drive | Same as `upload` |
| `auto-clip` | A short ~6s **smart clip** auto-cut from a parent video by the pipeline | First choice for any beat — pre-scored, pre-tagged, beat-routable |

Auto-clips are always children of a parent video (`parent_asset_id` is set). They carry their own `vision_tags`, `clip_score`, and rich `metadata.clip_metadata` (objects, shot_type, ad_use_cases, transcript_text, …).

---

## Smart Clip Pipeline (what happens on upload)

1. User uploads a video → `/api/workers/asset-vision-tag` dispatcher
2. Render worker downloads source → runs PySceneDetect (fallback: ffmpeg scene filter) → candidate windows
3. Per candidate: cuts mp4, builds a 5-keyframe contact sheet, runs GPT-4o-mini vision scoring, computes `clip_score`, generates an embedding, inserts an `auto-clip` row
4. Worker reports back → parent's `metadata.smart_clip_done = true`, `smart_clip_count = N`
5. Whisper transcribes audio when present so each clip carries a `transcript_text` aligned to its window

Hard caps: 12 candidates for videos ≤2 min, 20 for ≤5 min, hard cap 30.

While step 4 hasn't fired, the parent has `smart_clip_in_progress: true` in `dr_assets_list` output. **Do not** attach a parent video as base B-Roll while smart-clipping is in progress — the better clips are about to land. Poll `dr_assets_pending({ video_id, since_ts })` to know when they're ready:

```typescript
dr_assets_pending({ video_id, since_ts })
// → { processing, parents_in_progress, ready: [new clips/images], done }
// Call ~every 20-30s after sharing an upload link. When done && ready has items,
// call dr_assets_list({ video_id }) and continue. Tell the user it's processing.
```

---

## Checking Available Assets

Always check the library before suggesting stock. **Run this twice during a session**: once before scripting (to know what footage exists), and once before B-Roll selection per beat.

```typescript
dr_assets_list({ video_id })
// Returns assets with: source, clip_score, ad_use_cases, shot_type, product_visible,
// person_visible, hand_visible, face_visible, transcript, approved verdict,
// and smart_clip_in_progress / smart_clip_done / smart_clip_count for parent videos.
// With video_id: each row also gets used_in_video + used_in_beats (already placed in the cut).
```

**Scope.** With a `video_id`, results default to `scope: "video"` — ONLY the assets linked to this video (the exact pool the editor's Assets tab shows): footage dropped via the video's upload link, clips you assigned, and their auto-clips. Pass `scope: "all"` to browse the whole library and add more from it. Anything you assign with a `media_id` (and anything dropped via the per-video link) is auto-linked, so it appears here on the next call.

**Read before you assign.** Always read a clip's `description` / `user_description` / `transcript` / `ad_use_cases` / `shot_type` and pick from what it actually shows. If a clip you want is thin (no usable description, no tags), enrich it first — the same write Clip Studio performs:

```typescript
dr_asset_update({ asset_id, description: "Close-up: dropper releasing serum onto fingertip", tags: ["serum","dropper","closeup","application"] })
```

Never assign a clip you can't describe. Enriching improves `dr_broll_suggest` ranking and reuse in future ads.

**Filter for the beat you're solving:**

```typescript
// Get the best smart clips for a mechanism beat in one call
dr_assets_list({ video_id, kind: "smart_clips", beat_type: "mechanism" })
```

Trust these tags. Rank within the response by `clip_score` desc.

---

## Approval State (Human-in-the-Loop)

Each auto-clip carries an `approved` verdict:

| Value | Meaning | What you should do |
|---|---|---|
| `true` | User reviewed and approved | Prefer first — explicit human-validated pick |
| `null` | Pending — not yet reviewed | Usable; mention "I picked an unreviewed smart clip — open the Clip Studio to confirm" |
| `false` | Rejected | Filtered out automatically; agent never sees these |

If you assigned a pending clip to a beat, send the user a review link:

```typescript
dr_assets_review_link({ asset_id: "<parent_video_id>" })
// Returns a signed standalone URL: /clip-studio?asset=...&token=...
// User can approve, reject, trim handles, or regenerate at a different target length.
```

Use the **parent's** id (not the clip's). The review link opens that parent's full clip set.

---

## Asset Gap Detection — Right Order

The correct order during a session:

1. **Pre-script discovery (Step 0/1 of SKILL.md)** — `dr_assets_list({ video_id })`. Inventory what the user already has. Mention it in your script confirmation message ("I'll use your 3 product closeups for mechanism + proof"). This shapes the script too — if proof footage exists, you can write a stronger proof beat.
2. **Pre-B-Roll selection (Step 4)** — re-check the library. The user may have uploaded between scripting and B-Roll. Detect gaps per beat:

| Beat | What to look for | When to ask the user to upload |
|---|---|---|
| `mechanism` | `shot_type: "detail"` or `"product"` AND `product_visible: true`, ideally with `hand_visible` | Always — stock never works for mechanism |
| `proof` | `shot_type: "product"` with customer/use context, or testimonial screenshot | When no proof asset found |
| `cta` | `shot_type: "product"` hero shot | Preferred — stock acceptable as fallback |
| `hook` | `shot_type: "closeup"` or dramatic product / face | Optional — bold stock is fine |

3. **If a gap exists** — offer an upload link instead of silently falling back to stock:

```typescript
dr_assets_upload_link({
  project_id: "<video_id>",
  slot_label: "Product closeup",
  hint: "Mechanism beat — product detail shot showing the key feature"
})
```

Tell the user clearly: "I need X for the mechanism beat. Upload here: [url]. Or say 'use stock' and I'll proceed with Pexels."

This link is **unique to this video** — anything the user drops (many clips/images at once) is auto-linked to it, and long videos are smart-clipped automatically. After sharing it, poll `dr_assets_pending({ video_id, since_ts })` until `done`, then `dr_assets_list({ video_id })` picks up the new clips. The user can also call `dr_assets_review_link` to approve / reject / trim — offer that link when the parent's `smart_clip_count` is ≥ 4 so there's meaningful curation to do.

---

## Why Smart Clips Beat Everything Else

`dr_broll_suggest` ranks results with:

```
own clips with approved=true → own clips with high clip_score + matching ad_use_cases
  → own clips (other) → curated library → Pexels/Unsplash
```

A well-scored smart clip with `ad_use_cases: ["mechanism"]` and `product_visible: true` will outrank a generic Pexels lifestyle shot by a wide margin. Always trust the ranking.

If the top results don't fit the beat (you can read the `reason` field), broaden:
- Try other `kind: "smart_clips"` from a different parent video
- Then `kind: "uploads"` (full-length user videos can still work for context beats)
- Only then accept stock

---

## When to Re-Check

Re-run `dr_assets_list` if:
- The user said they'd upload something — poll `dr_assets_pending` until `done`, then re-list
- A parent video's previous response had `smart_clip_in_progress: true` — poll `dr_assets_pending`, then re-list to pick up the new auto-clips
- The user asked you to "use the latest footage" — never trust stale results

---

## Quick Field Reference (`dr_assets_list` rows)

```json
{
  "id": "uuid",
  "name": "string",
  "source": "upload | google_drive | auto-clip",
  "file_type": "video/mp4 | image/jpeg | …",
  "url": "string",
  "thumb_url": "string",
  "contact_sheet_url": "string | null",
  "duration_ms": 6200,
  "parent_asset_id": "uuid | null",
  "clip_start_ms": 4200,
  "clip_end_ms": 10200,
  "clip_score": 0.86,
  "approved": true,
  "shot_type": "detail | closeup | medium | wide | product",
  "ad_use_cases": ["mechanism", "proof"],
  "product_visible": true,
  "person_visible": true,
  "hand_visible": true,
  "face_visible": false,
  "description": "AI vision summary of the clip",
  "user_description": "what the user typed in Clip Studio (authoritative when present)",
  "tags": ["serum", "dropper", "detail"],
  "transcript": "…spoken words inside this window…",
  "used_in_video": false,
  "used_in_beats": ["Mechanism", "Proof"],
  "has_smart_clips": false,
  "smart_clip_in_progress": false,
  "smart_clip_done": null,
  "smart_clip_count": null
}
```

Field notes:
- `user_description` + `tags` are human-edited (Clip Studio / Assets tab). When `user_description` is set, trust it over the AI `description`; the user is telling you when to use this clip.
- `used_in_video` / `used_in_beats` only appear when you pass `video_id`. `used_in_video: true` means the asset is already placed in the cut (on the listed beats, or as a `cutaway`). Don't re-assign the same clip to the same beat; pick a different one for variety.
- For parent videos (`has_smart_clips: true`), prefer the child auto-clips for assignment unless you need the full-length source.
