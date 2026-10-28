import { comfyProvider } from "./comfyui";
import { httpProvider } from "./http";
import { mockProvider } from "./mock";
import type { GenerationProvider } from "./types";

/**
 * GENERATION_PROVIDER picks the backend:
 *   mock    - placeholder output, no GPU (default)
 *   api     - our serverless backend at GENERATION_API_URL (recommended)
 *   comfyui - talk to a ComfyUI server directly at COMFYUI_URL
 */
export function getProvider(): GenerationProvider {
  switch ((process.env.GENERATION_PROVIDER ?? "mock").toLowerCase()) {
    case "api":
      return httpProvider;
    case "comfyui":
      return comfyProvider;
    default:
      return mockProvider;
  }
}
