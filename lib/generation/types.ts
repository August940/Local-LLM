export type GenerationJob = {
  id: string;
  user_id: string;
  kind: "image" | "video";
  prompt: string;
  negative_prompt: string | null;
  style: string | null;
  aspect_ratio: string;
  input_path: string | null;
  provider_job_id: string | null;
};

export type GenerationOutput = {
  data: ArrayBuffer | Uint8Array;
  contentType: string;
  ext: string;
};

export type ProviderStep =
  | { state: "done"; output: GenerationOutput }
  | { state: "pending"; providerJobId: string }
  | { state: "failed"; error: string };

export type JobContext = {
  /** Signed URL to the user's uploaded reference image, if any. */
  inputUrl: string | null;
  /** Raw bytes of the uploaded reference image, if any. */
  inputBytes: ArrayBuffer | null;
};

export interface GenerationProvider {
  name: string;
  submit(job: GenerationJob, ctx: JobContext): Promise<ProviderStep>;
  poll(job: GenerationJob, providerJobId: string): Promise<ProviderStep>;
}
