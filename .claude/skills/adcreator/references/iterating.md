# Editing in Chat After Creation

After a video is created, the user can request changes directly in the agent chat. Use the MCP edit tools instead of asking the user to open the web editor.

## Contents
- Edit loop pattern
- Common edit requests (with tool calls)
- What still requires the web editor

---

## Edit Loop Pattern

1. Get current state with `dr_video_get` or `dr_overlay_list` to retrieve stable IDs
2. Identify the target by ID
3. Patch with `dr_*_update` or remove with `dr_*_remove`
4. If VO text changed: call `dr_beat_tts` to regenerate audio
5. After any `dr_beat_tts` re-run, call `dr_video_recalculate_timings`
6. Run `dr_video_lint` and fix errors
7. Give user the updated editor URL to confirm visually
8. Render only after explicit confirmation

---

## Common Edit Requests

### "Change the hook text"

```typescript
// 1. Get overlay IDs
const { overlays } = await dr_overlay_list({ video_id })
// Find the hook overlay (beat-relative to hook beat_id or by block_id)

// 2. Update the headline
dr_overlay_update({
  video_id,
  overlay_id: "<hook overlay id>",
  props: { headline: "New hook text here" }
})
```

### "Remove a social proof/comment overlay"

```typescript
dr_overlay_list({ video_id })
// Find overlay by block_id from dr_blocks_list, e.g. "dr/instagram-comment"

dr_overlay_remove({ video_id, overlay_id: "<id>" })
```

### "Swap the transition between hook and problem"

```typescript
// Get transition ID from dr_video_get
dr_video_get({ video_id })
// Find transition between hook and problem in transitions[]

dr_transition_update({
  video_id,
  transition_id: "<id>",
  block_id: "hf/whip-pan",  // new transition style
  sound_effect: { presetId: "whoosh", volume: 0.32, offsetMs: -50 }
})
```

### "Remove the transition before the CTA"

```typescript
dr_transition_remove({ video_id, transition_id: "<id>" })
```

### "Change the voiceover on the proof beat"

```typescript
// 1. Update vo_text
dr_beat_update({
  video_id,
  beat_id: "<proof beat id>",
  vo_text: "Over twelve hundred people have reported the same — and they finally see results."
})

// 2. Regenerate TTS (mandatory after vo_text change)
dr_beat_tts({ video_id, beat_id: "<proof beat id>" })

// 3. Trim overlays to the new real duration, then lint
dr_video_recalculate_timings({ video_id })
dr_video_lint({ video_id })
```

### "Use a different voice for the whole ad"

```typescript
// 1. Show new voice options
dr_voice_list()
// Present 3 options; wait for user pick

// 2. Update video voice_id
dr_video_update({ video_id, voice_id: "<new voice id>" })

// 3. Regenerate TTS for every beat (sequential)
for (const beat_id of beat_ids) {
  dr_beat_tts({ video_id, beat_id })
}

// 4. Trim overlays to the new real durations, then lint
dr_video_recalculate_timings({ video_id })
dr_video_lint({ video_id })
```

### "Move the hook beat to second position"

```typescript
// Get current beat order from dr_video_get
const { beats } = await dr_video_get({ video_id })

// Reorder: put second beat first, hook second
dr_beats_reorder({
  video_id,
  beat_ids: [beats[1].id, beats[0].id, beats[2].id, /* ... rest in order */ ]
})
```

### "Add a word-anchor pop on the price word"

```typescript
// 1. Get caption_words for the CTA beat
dr_video_get({ video_id })
// Find caption_words on the CTA beat, locate the price word index

// 2. Add word-anchor overlay
dr_overlay_add({
  video_id,
  block_id: "dr/punctuation-pop",
  props: { text: "25%" },
  timing: { mode: "word-anchor", beat_id: "<cta id>", word_index: 5, duration_ms: 1800 },
  track_index: 2
})
```

### "Change the animation on the product reveal cutaway"

```typescript
// Get media_clip_id from dr_video_get → mediaClips[]
dr_media_clip_update({
  video_id,
  media_clip_id: "<id>",
  animation: "zoom_in"
})
```

---

## What Still Requires the Web Editor

These operations have no MCP tool yet — direct the user to the editor:

- Changing the base B-Roll video for a beat → use `dr_beat_broll_assign` (this one IS available)
- Adjusting caption burn-in position or font size
- Reordering overlays within the same track
- Fine-tuning overlay enter/exit animation keyframes

For all other changes, the agent handles it in chat.

---

## After Edits: Editor URL

After any edit session, give the user the current editor URL:

```
Changes applied. Review here: <editorUrl>
[List what changed]
Ready to render? Confirm and I'll start it.
```

The `editorUrl` format is `https://ai.adcreatorstudio.com/dr-videos/<video_id>/edit`.
