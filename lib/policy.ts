/**
 * Basic content policy for prompts. dressmaker.ai is a fashion design tool:
 * no sexual content, nothing involving minors, no deepfakes of real people,
 * no hate or violence. This keyword screen runs on the server before a job is
 * queued; swap in a moderation model later for better recall.
 */

type Rule = { category: string; message: string; patterns: RegExp[] };

const RULES: Rule[] = [
  {
    category: "sexual",
    message: "Sexual or nude content is not allowed on dressmaker.ai.",
    patterns: [
      /\bnud(e|es|ity)\b/i,
      /\bnaked\b/i,
      /\btopless\b/i,
      /\bporn\w*\b/i,
      /\bnsfw\b/i,
      /\bhentai\b/i,
      /\berotic\w*\b/i,
      /\bsex(y|ual|ually)?\b/i,
      /\bfetish\w*\b/i,
      /\bundress(ed|ing)?\b/i,
      /\bstrip(ping|tease)\b/i,
      /\bgenitals?\b/i,
      /\bnipples?\b/i,
      /\blingerie\b/i,
      /\bsee[- ]?through\b/i,
      /\bonlyfans\b/i,
    ],
  },
  {
    category: "minors",
    message: "Content depicting minors is not allowed. Models must be adults.",
    patterns: [
      /\b(child|children|kid|kids|minor|minors|toddler|teen|teens|teenager|underage|schoolgirl|schoolboy|loli|shota)\b/i,
      /\b(1[0-7]|[1-9])[- ]?(yo|y\/o|years?[- ]old)\b/i,
    ],
  },
  {
    category: "real-people",
    message: "Generating images of real, identifiable people (celebrities, politicians) is not allowed.",
    patterns: [/\bdeep ?fake\w*\b/i, /\bface ?swap\w*\b/i, /\bcelebrity\b/i],
  },
  {
    category: "violence-hate",
    message: "Violent, gory or hateful content is not allowed.",
    patterns: [/\bgore\b/i, /\bbeheading\b/i, /\bnazi\w*\b/i, /\bswastika\b/i, /\bdismember\w*\b/i],
  },
];

export type PolicyResult = { ok: true } | { ok: false; category: string; message: string };

export function checkPrompt(...texts: (string | null | undefined)[]): PolicyResult {
  const text = texts.filter(Boolean).join(" \n ");
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { ok: false, category: rule.category, message: rule.message };
    }
  }
  return { ok: true };
}

/** Always appended to the negative prompt sent to the model. */
export const SAFETY_NEGATIVE_PROMPT =
  "nsfw, nudity, naked, cleavage, sexual, child, minor, gore, blood, watermark, text, logo";
