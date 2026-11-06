# Beat Writing Rules

## You Do This Wrong

- You write the mechanism beat by naming the product ("ProductX fixes this"). Name the mechanism instead: "The [Barrier Reset Process] that..."
- You use filler phrases: "it's important to note", "discover the secret", "life-changing". Real copy talks like a person.
- You go over word count. At 2.5 wpm, 20 words = 8 seconds. Every beat over budget pushes the CTA off-screen.
- You write generic pain: "feel tired and sluggish". Write specific pain: "wake up at 3am and can't fall back asleep".
- You hedge the hook: "Have you ever wondered if..." The hook must be a statement or bold question, not a soft invitation.

---

## Word Counts and Timing

| Beat | Duration | Word count | Speaking rate |
|------|----------|------------|---------------|
| hook | 2–3s | 5–8 words | 2.5 wpm |
| problem | 3–5s | 8–12 words | 2.5 wpm |
| agitate | 3–4s | 8–10 words | 2.5 wpm |
| why_others_fail | 4–5s | 10–14 words | 2.5 wpm |
| mechanism | 5–6s | 12–16 words | 2.5 wpm |
| value_prop | 3–4s | 8–12 words | 2.5 wpm |
| proof | 4–5s | 10–14 words | 2.5 wpm |
| objection | 3–4s | 8–10 words | 2.5 wpm |
| cta | 2–3s | 5–8 words | 2.5 wpm |

**Override:** If voice speed is set above 1.3x, words per beat can increase by ~30%.

---

## Beat Rules

### hook
Pattern interrupt. The first word is a scroll-stopper. Options:
- **Bold claim**: "Your skincare routine is making it worse."
- **Counterintuitive**: "More sleep is why you're tired."
- **Directed question**: "Still washing your face twice a day?"
- **Number shock**: "97% of people get this wrong."

Never start with: "Have you ever...", "Imagine if...", "What if I told you..."

### problem
Mirror the customer's exact internal monologue. Speak AS them, not AT them.
- "If you're still [doing X] and [not getting Y], you're not alone."
- "Still struggling with [specific symptom]..."
- "Every morning it's the same thing — [pain]."

Use their words, not clinical language. If they say "bloated", say "bloated". Not "digestive discomfort".

### agitate
Escalate the consequence of the problem. Stack the failures.
- "You've tried X, Y, Z. Nothing worked."
- "The problem isn't willpower — it's [root cause]."
- "Every week you wait, [consequence escalates]."

### why_others_fail
Dismiss the category without naming competitors. Attack the approach, not a brand.
- "Generic [category] products treat symptoms, not the root cause."
- "Everything out there is designed to [wrong thing]."
- "The [industry] doesn't want you to know [uncomfortable truth]."

### mechanism
**DO NOT name the product here.** Name the mechanism — the specific biological, chemical, or systemic reason this works.
- "The [X Process] is the only way to [solve root cause]."
- "It comes down to [mechanism name] — most products skip this entirely."
- "[Ingredient/process] triggers [specific biological response]."

### value_prop
Concrete, measurable outcome + timeframe.
- "You get [specific result] in [timeframe]."
- "Most users see [result] within [X days]."
- "No [sacrifice], no [downside] — just [outcome]."

### proof
Specific numbers beat vague claims. Quote exactly if possible.
- "Over 12,000 customers. 4.8 stars. Here's why."
- "[Person] from [city]: '[direct quote].'"
- "Clinically tested. Published in [journal/outlet]."

### objection
Pre-empt the top 1–2 hesitations. Stack them in one beat.
- "No contract. Cancel anytime. Ships free."
- "Works on all [skin types/body types/etc]. Money-back guaranteed."
- "No [scary thing]. No [other scary thing]. Just [simple thing]."

### cta
Exact action + offer + urgency. Nothing vague.
- "Tap the link below. [Offer]. [Time limit]."
- "Click now — [Offer] ends [when]."
- "Link in bio. [Offer]. Only [X] left."

---

## Niche Examples

### Skincare / Female 25–40

```json
[
  { "beat_type": "hook",       "vo_text": "Your skincare routine is making it worse." },
  { "beat_type": "problem",    "vo_text": "If you're using 6 products and still breaking out, it's not your fault." },
  { "beat_type": "agitate",    "vo_text": "You've tried every cleanser, every serum. Nothing sticks." },
  { "beat_type": "mechanism",  "vo_text": "The Barrier Reset Process rebuilds your skin's natural pH shield — the thing every product skips." },
  { "beat_type": "proof",      "vo_text": "8,400 five-star reviews. Dermatologist-tested. 87% see results in 7 days." },
  { "beat_type": "objection",  "vo_text": "No fragrance. No parabens. 60-day money-back guarantee." },
  { "beat_type": "cta",        "vo_text": "Tap below. 20% off — today only." }
]
```

### Fitness Supplement / Male 28–45

```json
[
  { "beat_type": "hook",          "vo_text": "You're not overtrained. You're under-recovered." },
  { "beat_type": "problem",       "vo_text": "If you're training 5 days a week and still not building muscle, the problem isn't effort." },
  { "beat_type": "agitate",       "vo_text": "Pre-workout, protein, creatine. You've tried it all. Plateau." },
  { "beat_type": "why_others_fail", "vo_text": "Mainstream supplements flood your body with stimulants. They ignore cellular recovery." },
  { "beat_type": "mechanism",     "vo_text": "The Cellular Sync Protocol replenishes ATP reserves during sleep — when real growth actually happens." },
  { "beat_type": "proof",         "vo_text": "32,000 athletes. 4.9 stars. Average 12% strength gain in 30 days." },
  { "beat_type": "cta",           "vo_text": "Link in bio. Free shaker with first order. 48 hours only." }
]
```

### SaaS / Productivity / Any gender 30–50

```json
[
  { "beat_type": "hook",       "vo_text": "Your team is busy. Nothing's getting done." },
  { "beat_type": "problem",    "vo_text": "If your project meetings end with action items that disappear by Friday, you're not alone." },
  { "beat_type": "value_prop", "vo_text": "FlowDesk turns meeting notes into tracked tasks in 30 seconds — automatically." },
  { "beat_type": "proof",      "vo_text": "Used by 4,200 teams. Average 3 hours saved per manager per week." },
  { "beat_type": "objection",  "vo_text": "No integration setup. Works with Slack, Notion, Linear. Free 14-day trial." },
  { "beat_type": "cta",        "vo_text": "Try free. Link below. Starts in 90 seconds." }
]
```
