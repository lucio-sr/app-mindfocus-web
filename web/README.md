# web — frontend MindFocus (Next.js)

Next.js 16 (App Router, Cache Components) + Tailwind CSS 4 + Supabase (`@supabase/ssr`).
Identidade visual em `../design/brand/` (cores e fontes em `src/app/globals.css`).

```bash
cp .env.example .env.local   # URL do projeto e chave publishable
npm install
npm run dev                  # http://localhost:3000
npm run build && npm run lint
```

## Acesso

| Rota | O que faz |
|---|---|
| `/entrar` | Login por CPF (Edge Function `auth-login-cpf`, chamada do navegador) |
| `/esqueci-senha` | Recuperação por CPF (`auth-recover-cpf`) |
| `/definir-senha` | Destino do convite: cria a sessão a partir do link e define a senha |
| `/redefinir-senha` | Destino do link de recuperação |
| `/inicio` | Redireciona para a área do perfil: `/painel`, `/admin`, `/responsavel` ou `/sem-acesso` |

| `/admin` | Superadmin: instituições (números agregados), nova instituição, detalhe com equipe e suspensão |
| `/painel` | Colaborador: início, pacientes (lista, cadastro com responsável, ficha com PIN do jogo), equipe, instituição |
| `/responsavel` | Área do responsável (provisória) |

`src/proxy.ts` renova a sessão (cookies) e manda para `/entrar` quem não está logado nas áreas
protegidas. A proteção dos dados é o RLS do Supabase; o front só evita telas sem sentido para o perfil.

Convenções (Next 16 com Cache Components):
- Página = cabeçalho estático + dados dentro de `<Suspense>` (navegação instantânea).
- Leituras em Server Components com `lib/supabase/server.ts`; gravações em Client Components:
  Edge Functions via `callFunctionAsUser` ou tabelas/RPCs com o cliente do navegador (RLS), e depois
  `router.refresh()`.
- Tipos do banco em `src/lib/database.types.ts`: `supabase gen types typescript --linked --schema public`.
- Instituição em uso no painel: cookie `mf_institution` (seletor no cabeçalho).
