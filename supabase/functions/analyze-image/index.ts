import { handleAnalyze } from './handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
}

const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

Deno.serve((request) =>
  handleAnalyze(request, {
    apiKey: Deno.env.get('GEMINI_API_KEY'),
    model: Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL,
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    supabaseKey:
      Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),
    fetchFn: fetch,
    timeoutMs: 25_000,
  })
)
