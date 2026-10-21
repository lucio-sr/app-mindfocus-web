import { assert, assertFalse } from "jsr:@std/assert@1";
import { isAllowedOrigin } from "./http.ts";

Deno.test("origens permitidas: lista exata e sufixo do time na Vercel", () => {
  Deno.env.set(
    "ALLOWED_ORIGINS",
    "https://app.mindfocus.com.br,https://mindfocus.online,https://app-mindfocus-web.vercel.app,http://localhost:3000",
  );
  Deno.env.set("ALLOWED_ORIGIN_SUFFIXES", "-lucios-projects-11c4892e.vercel.app");

  assert(isAllowedOrigin("https://app.mindfocus.com.br"));
  assert(isAllowedOrigin("https://mindfocus.online"));
  assert(isAllowedOrigin("https://app-mindfocus-web.vercel.app"));
  assert(isAllowedOrigin("http://localhost:3000"));
  assert(isAllowedOrigin("https://app-mindfocus-web-ab12cd34e-lucios-projects-11c4892e.vercel.app"));
  assert(isAllowedOrigin("https://app-mindfocus-web-git-feature-x-lucios-projects-11c4892e.vercel.app"));

  assertFalse(isAllowedOrigin("http://app-mindfocus-web-ab12-lucios-projects-11c4892e.vercel.app")); // sem https
  assertFalse(isAllowedOrigin("https://evil.com"));
  assertFalse(isAllowedOrigin("https://x-lucios-projects-11c4892e.vercel.app.evil.com"));
  assertFalse(isAllowedOrigin("https://outro-time.vercel.app"));
  assertFalse(isAllowedOrigin("https://app-mindfocus-web-ab12-lucios-projects-11c4892e.vercel.app/caminho")); // não é origem
});
