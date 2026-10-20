// Resposta JSON, CORS e tratamento de erros comuns a todas as Edge Functions.

const DEFAULT_ORIGINS = [
  "https://mindfocus.online",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// Origens do frontend (CORS e destinos aceitos nos links de convite/recuperação).
// Secret ALLOWED_ORIGINS (lista separada por vírgula) substitui a lista padrão.
export function allowedOrigins(): string[] {
  const extra = Deno.env.get("ALLOWED_ORIGINS");
  return extra ? extra.split(",").map((o) => o.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // cai no erro abaixo
  }
  throw new HttpError(400, "invalid_json", "Corpo da requisição deve ser um objeto JSON.");
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") || "unknown";
}

// Converte erros do PostgREST (códigos SQLSTATE) em respostas HTTP.
export function fromPostgrestError(error: { code?: string; message: string }): HttpError {
  switch (error.code) {
    case "42501":
      return new HttpError(403, "forbidden", error.message);
    case "23505":
      return new HttpError(409, "conflict", error.message);
    case "23502":
    case "23503":
    case "23514":
    case "22023":
    case "22007":
    case "22008":
    case "22P02":
      return new HttpError(422, "invalid_data", error.message);
    default:
      return new HttpError(500, "database_error", "Erro ao gravar no banco.");
  }
}

// Envolve o handler: OPTIONS (preflight), só POST, erros viram JSON {error, message}.
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed", message: "Use POST." });
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, e.status, { error: e.code, message: e.message });
      console.error(e);
      return json(req, 500, { error: "internal_error", message: "Erro interno." });
    }
  });
}
