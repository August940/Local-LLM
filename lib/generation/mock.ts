import type { GenerationProvider, ProviderStep } from "./types";

function escapeXml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}

function size(aspect: string) {
  const [w, h] = aspect.split(":").map(Number);
  if (!w || !h) return { w: 768, h: 1024 };
  const scale = 1024 / Math.max(w, h);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

function wrap(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line += " " + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 6);
}

/**
 * Placeholder backend: renders a branded SVG "design card" from the prompt so
 * the whole queue -> storage -> gallery flow works without a GPU.
 */
export const mockProvider: GenerationProvider = {
  name: "mock",
  async submit(job): Promise<ProviderStep> {
    await new Promise((r) => setTimeout(r, 2500));
    const { w, h } = size(job.aspect_ratio);
    const seed = [...job.id].reduce((a, c) => a + c.charCodeAt(0), 0);
    const hue = seed % 60;
    const lines = wrap(job.prompt, 28)
      .map((l, i) => `<tspan x="${w / 2}" dy="${i === 0 ? 0 : 34}">${escapeXml(l)}</tspan>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${325 - hue / 3},100%,55%)"/>
      <stop offset="1" stop-color="hsl(${272 + hue / 3},75%,52%)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#0b0b0f"/>
  <path d="M${w / 2} ${h * 0.14} q${w * 0.08} ${h * 0.05} ${w * 0.14} ${h * 0.02} l${w * 0.05} ${h * 0.14} q-${w * 0.05} ${h * 0.03} -${w * 0.06} ${h * 0.08} l${w * 0.2} ${h * 0.4} h-${w * 0.66} l${w * 0.2} -${h * 0.4} q-${w * 0.01} -${h * 0.05} -${w * 0.06} -${h * 0.08} l${w * 0.05} -${h * 0.14} q${w * 0.06} ${h * 0.03} ${w * 0.14} -${h * 0.02} z" fill="url(#g)" opacity="0.95"/>
  <text x="${w / 2}" y="${h * 0.86}" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="26" text-anchor="middle">${lines}</text>
  <text x="24" y="40" fill="#ffffff" opacity="0.6" font-family="Helvetica, Arial, sans-serif" font-size="20">dressmaker.ai · preview</text>
</svg>`;
    return { state: "done", output: { data: new TextEncoder().encode(svg), contentType: "image/svg+xml", ext: "svg" } };
  },
  async poll() {
    return { state: "failed", error: "mock provider has no pending jobs" };
  },
};
