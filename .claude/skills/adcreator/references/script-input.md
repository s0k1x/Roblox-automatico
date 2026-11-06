# Script-Provided Path

The user has already written a script. Parse it into beats and proceed to voice selection. Do NOT rewrite or improve their copy — the agent's job becomes assembly, not authorship.

## Contents
- Parsing the script
- Normalizing for TTS
- Beat assignment rules
- When to ask for clarification

---

## Step 1: Identify the Format

The user may provide the script in one of three formats:

**A. Plain monologue** (no markers)
> Your skin barrier is breaking down every single morning you wash your face with that soap. I spent three years trying every cleaner on the market — nothing worked. Then I found out about ceramide bonding...

→ You will segment it into beats yourself.

**B. Marked paragraphs** (rough beat hints)
> [hook] Your skin barrier is breaking...
> [problem] I spent three years...

→ Use the markers as guides, not gospel. If the marker is wrong for the content, note it and confirm.

**C. Beat-labeled JSON or list**
> - Hook: "Your skin barrier..."
> - Problem: "I spent three years..."

→ Direct assignment. Proceed without re-segmenting.

---

## Step 2: Validate and Propose Beat Assignment

Segment the monologue into logical beats. Rules:
- Each beat = one emotional or argumentative unit
- Use templates as starting structure only — **beat count follows the script**, not the template
- If the script has 9 natural emotional units, use 9 beats. Never merge beats to fit a template.
- Common range: 5–12 beats. Longer scripts (300+ words) naturally produce 8–10 beats.

Calculate rough duration: word count ÷ 2.5 = seconds per beat.

**Show the proposed beat assignment to the user:**
```
Here's how I'd structure your script into beats:

Hook (≈3s): "Your skin barrier is breaking down..."
Problem (≈6s): "I spent three years trying every cleaner..."
Mechanism (≈8s): "Then I found out about ceramide bonding..."
Proof (≈5s): "Over 800 people saw results in two weeks..."
CTA (≈4s): "Get the starter kit — link below."

Total: ~26s — 5 beats.

Any changes before I continue?
```

Wait for confirmation if any beat split is ambiguous. Proceed if the assignment is unambiguous.

---

## Step 3: TTS Normalization (mandatory)

Apply before calling `dr_video_create`. The user's copy may not be TTS-ready:

- **Em-dashes** (—) → replace with comma or restructure the sentence
- **Period-stacked fragments** "X. Y. Z." → connect with conjunctions: "X, Y, and Z."
- **Digits** → spell out: "70%" → "seventy percent", "25€" → "fünfundzwanzig Euro"
- **Abbreviations** → spell out if TTS reads them awkwardly: "Dr." → "Doctor", "kg" → "Kilogramm"
- **Brand names with odd spelling** → test in TTS; add phonetic spelling in props if needed

Show normalized changes if substantial. Skip if the original is already clean.

---

## Step 4: Audio Tags

Add 1–2 ElevenLabs v3 audio tags per beat as a prefix. See [references/voice.md](references/voice.md) for which tags suit which beats. Do NOT change the spoken content — tags only control delivery.

```
Before: "Your skin barrier is breaking down..."
After:  "[direct] Your skin barrier is breaking down..."
```

---

## Step 5: Proceed to Step 2 (Voice + Create)

The user's copy is now ready. Continue at Step 2 in SKILL.md:
- `dr_voice_list` → present 3 options → wait for confirmation
- `dr_video_create` with the normalized, tagged beats

---

## When to Ask for Clarification

- The script is ambiguous about the product name, offer, or CTA destination
- Total duration is under 12s or over 50s
- Beat split is genuinely unclear (one paragraph could be hook or problem)
- The script is in a language you cannot confidently normalize for TTS
