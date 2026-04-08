# Restaurant Manager

System zarządzania restauracją - fullstack web application.

## URLs:
dev: restaurant-manager-git-dev-pol1budas-projects.vercel.app
prod: restaurant-manager-psi.vercel.app


## Stack technologiczny

### TypeScript (frontend + backend)

Projekt używa TypeScript na obu warstwach, co nie jest przypadkowym wyborem. Wspólny język eliminuje konieczność mentalnego przełączania się między składniami, umożliwia współdzielenie typów między frontendem a backendem (pakiet `packages/shared`) i wychwytuje całą klasę błędów na etapie kompilacji, zanim kod trafi do środowiska uruchomieniowego. Przy systemie zarządzania restauracją - gdzie błąd w strukturze zamówienia lub stanu stolika może mieć realne konsekwencje operacyjne - statyczne typowanie jest uzasadnionym wyborem.


### React (frontend)

React - odpowiada wyłącznie za warstwę widoku. W systemie restauracyjnym UI jest stosunkowo prosty: listy, formularze, statusy. React dobrze skaluje się od prostych stron do złożonych dashboardów bez narzucania architektury. Duży ekosystem (React Query, React Hook Form) pozwala dobierać narzędzia do konkretnych potrzeb zamiast korzystać z gotowych rozwiązań "all-in-one".

Alternatywy jak Vue czy Svelte byłyby równie uzasadnione dla tej skali projektu. Next.js - popularny wybór na Vercel - odrzucono celowo: jego SSR/SSG nie jest potrzebne dla panelu administracyjnego restauracji, a dodaje złożoność. Next.js byłby tu nadmiernym narzędziem.

### Hono (backend API)

Hono to minimalistyczny framework HTTP zaprojektowany z myślą o środowiskach edge/serverless. W kontekście Vercel Serverless Functions jest to istotna zaleta - zimny start Hono jest wielokrotnie szybszy niż Express. Hono ma pełne wsparcie TypeScript z typowanymi handlerami i wbudowany adapter dla Vercel.

Express byłby wyborem naturalnym dla doświadczonego Node.js developera, ale jego rozmiar i brak natywnego wsparcia TypeScript czyni go suboptymalnym dla serverless. Fastify byłby dobrą alternatywą.

### Vite (build tool)

Vite zapewnia natychmiastowy dev server dzięki ESM i buduje produkcję przez Rollup. Dla projektu React + TypeScript jest standard, który zastapił Create React App. Brak konfiguracji "zero-config" dla podstawowego zastosowania.

### pnpm + Turborepo (monorepo)

Monorepo z jednym repozytorium dla frontendu, backendu i współdzielonych typów eliminuje synchronizację zmian między repozytoriami. Turborepo zapewnia cache'owanie wyników buildu i wykonywanie zadań w odpowiedniej kolejności (`shared` musi być zbudowany przed `api` i `web`). pnpm jest szybszy i bardziej oszczędny pamięcią niż npm dzięki deduplikacji przez dowiązania twarde.

### Supabase (planowana baza danych)

Supabase oferuje PostgreSQL z REST i Realtime API, uwierzytelnianie oraz storage w jednym, darmowym planie. Dla systemu restauracyjnego kluczowa jest możliwość subskrypcji zmian w czasie rzeczywistym (aktualizacje statusów zamówień). Supabase JS SDK jest w pełni typowany - typy można wygenerować z schematu bazy, co zamyka pętlę bezpieczeństwa typów od bazy do UI.

---

## Architektura

```
restaurant_manager/
├── api/[...route].ts        # Vercel Serverless entry (Hono catch-all)
├── apps/
│   ├── web/                 # Vite + React 19 + TypeScript + Tailwind CSS v4
│   └── api/                 # Hono API (logika biznesowa)
├── packages/
│   └── shared/              # Wspólne typy TypeScript (ApiResponse itp.)
├── .github/workflows/ci.yml # GitHub Actions: lint → typecheck → build
├── turbo.json               # Turborepo pipeline
└── vercel.json              # Konfiguracja deploymentu
```

## CI/CD Pipeline

```
push do dev  ->  GitHub Actions (lint + typecheck + build)
                         ↓
PR do prod   -.  GitHub Actions (wymagany zielony status)
                         ↓
merge do prod ->  Vercel autodeploy
```

## Metodyka pracy

Projekt stosuje uproszczony Gitflow:

- `prod` - gałąź produkcyjna, chroniona. Bezpośredni push zablokowany.
- `dev` - gałąź deweloperska, integracyjna.
- Feature branche tworzone od `dev`, mergowane przez Pull Request.

Każdy merge do `prod` wymaga:
1. Przejścia wszystkich statusów CI (lint, typecheck, build)
2. Code review (minimum 1 zatwierdzenie)

## Uruchomienie lokalne

```bash
pnpm install
pnpm dev       # web: localhost:5173 | api: localhost:3001
```

## Zmienne środowiskowe

Skopiuj `.env.example` do `.env.local` (plik zostanie dodany przy integracji Supabase).