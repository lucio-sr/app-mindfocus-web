# app-mindfocus-web

Nova plataforma MindFocus sobre o Supabase, **multi-tenant**: cada instituição tem os seus
pacientes, coletas, análises e laudos, isolados por Row Level Security. Substitui a API Flask
e o PostgreSQL próprio do repositório antigo.

O plano completo da migração está em [docs/MIGRACAO_SUPABASE.md](docs/MIGRACAO_SUPABASE.md).

## Estrutura

```
docs/                  plano de migração e decisões
design/brand/          guia de identidade visual, logo e mascote
web/                   frontend Next.js (ver web/README.md)
supabase/
  config.toml          configuração do projeto (cadastro público desligado)
  migrations/          schema, RLS, RPCs e Storage
  functions/           Edge Functions (Deno): login e recuperação por CPF, cadastros
  tests/database/      testes pgTAP (isolamento entre instituições, fluxo do jogo)
scripts/db-test-local/ roda migrations e testes sem Docker, num Postgres local
```

## Testes

Com Docker (caminho oficial):

```bash
supabase start
supabase db reset
supabase test db
```

Sem Docker (precisa de PostgreSQL 17 local, por exemplo `brew install postgresql@17`):

```bash
scripts/db-test-local/run.sh
```

Edge Functions (precisa do [Deno](https://deno.com)):

```bash
cd supabase/functions
deno check */index.ts
deno test _shared/
deno lint && deno fmt --check
```

## Deploy

```bash
supabase db push                      # migrations
supabase functions deploy --use-api   # Edge Functions (sem Docker)
supabase config push                  # Auth: site_url, redirecionamentos, limites
```
