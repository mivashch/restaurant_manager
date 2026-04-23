# Restaurant Manager

Restaurant management system - fullstack web application.

## URLs:
- dev: restaurant-manager-git-dev-pol1budas-projects.vercel.app
- prod: restaurant-manager-psi.vercel.app

## Local setup

```bash
pnpm install
pnpm dev       # web: localhost:5173 | api: localhost:3001
```

## Tech stack

### TypeScript (frontend + backend)

The project uses TypeScript on both layers, which is not an arbitrary choice. A shared language eliminates the need to context-switch between syntaxes, enables sharing types between frontend and backend (the `packages/shared` package), and catches entire classes of errors at compile time before the code reaches the runtime. In a restaurant management system - where a bug in the structure of an order or table state can have real operational consequences - static typing is a justified choice.

### React (frontend)

React handles only the view layer. In a restaurant system the UI is relatively simple: lists, forms, statuses. React scales well from simple pages to complex dashboards without imposing architecture. The large ecosystem (React Query, React Hook Form) allows picking the right tool for each need instead of relying on all-in-one solutions.

Alternatives like Vue or Svelte would be equally justified at this scale. Next.js - a popular choice on Vercel - was deliberately rejected: its SSR/SSG is not needed for a restaurant admin panel and adds complexity. Next.js would be an excessive tool here.

### Hono (backend API)

Hono is a minimalist HTTP framework designed for edge/serverless environments. In the context of Vercel Serverless Functions this is a significant advantage - Hono's cold start is many times faster than Express. Hono has full TypeScript support with typed handlers and a built-in Vercel adapter.

Express would be a natural choice for an experienced Node.js developer, but its size and lack of native TypeScript support makes it suboptimal for serverless. Fastify would be a good alternative.

### Vite (build tool)

Vite provides an instant dev server via ESM and builds production bundles through Rollup. For a React + TypeScript project it is the standard that replaced Create React App. Zero configuration needed for basic use.

### pnpm + Turborepo (monorepo)

A monorepo with a single repository for frontend, backend and shared types eliminates the need to synchronize changes across repositories. Turborepo provides build result caching and executes tasks in the correct order (`shared` must be built before `api` and `web`). pnpm is faster and more memory-efficient than npm thanks to deduplication via hard links.

### Supabase (planned database)

Supabase provides PostgreSQL with REST and Realtime API, authentication and storage in one free plan. For a restaurant system the key feature is the ability to subscribe to real-time changes (order status updates). The Supabase JS SDK is fully typed - types can be generated from the database schema, which closes the type-safety loop from the database to the UI.

---

## Architecture

Architecture here is a full‑stack TypeScript monorepo managed with pnpm and Turborepo, where a Vite‑built React 19 frontend communicates via TanStack Query with a Hono API deployed as Vercel Serverless Functions. Shared types and validation schemas in a central packages/shared ensure end‑to‑end type safety. Supabase provides the PostgreSQL database and real‑time subscriptions that instantly synchronise table and order state across all connected devices. A GitHub Actions pipeline enforces linting, type‑checking, and build integrity before automatic deployment to Vercel preview and production environments.

Below is the file structure where directories corresponding to the architecure can be seen. Here, in /app/web is the React frontend part, in /apps/api the Hono API part that is deployed as Vercel Serverless Functions, and lastly the /packages/shared forder for sharing the types between the react and hono.

```
restaurant_manager/
├── api/[...route].ts        # Vercel Serverless entry (Hono catch-all)
├── apps/
│   ├── web/                 # Vite + React 19 + TypeScript + Tailwind CSS v4
│   └── api/                 # Hono API (business logic)
├── packages/
│   └── shared/              # Shared TypeScript types
├── .github/workflows/ci.yml # GitHub Actions: lint -> typecheck -> build
├── turbo.json               # Turborepo pipeline
└── vercel.json              # Deployment configuration
```

## CI/CD Pipeline

```
push to dev  ->  GitHub Actions (lint + typecheck + build)
                         |
PR to prod   ->  GitHub Actions (green status required)
                         |
merge to prod ->  Vercel autodeploy
```

## Branching strategy

The project uses a simplified Gitflow:

- `prod` - production branch, protected. Direct push blocked.
- `dev` - development and integration branch.
- Feature branches created from `dev`, merged via Pull Request.

Every merge to `prod` requires:
1. All CI checks passing (lint, typecheck, build)
2. Code review (minimum 1 approval)

## Environment variables

Copy `.env.example` to `.env.local` (file will be added when Supabase is integrated).

---

## Minimum Viable Product (MVP)

The MVP covers the functionality required to support the basic workflow of a restaurant:

**Table management**
- Floor view with a list of tables and their current status (free / occupied / waiting for bill)
- Table status change by a waiter

**Orders**
- Creating an order for a table
- Adding menu items to an order
- Changing order status (new -> in preparation -> ready -> served)

**Menu**
- Browsing the dish list by category
- Kitchen view: list of active orders in queue order

**Authentication**
- Login via Private ID
- Roles: waiter, kitchen, administrator

---

## Acceptance tests

### Login via Private ID
**Precondition:** user has an assigned Private ID  
**Expected result:** redirect to the view appropriate for the role (waiter -> floor, kitchen -> order queue)

### AT-02: Table status change
**Precondition:** logged-in waiter, floor view  
**Expected result:** table status updates immediately, change visible to other logged-in users without page refresh

### AT-03: Creating an order
**Precondition:** logged-in waiter, table occupied  
**Expected result:** order appears in the kitchen queue with status "new", assigned to the correct table

### AT-04: Order status update by kitchen
**Precondition:** logged-in kitchen staff, active order  
**Expected result:** waiter sees a notification / status change in real time

### AT-05: Serving an order
**Precondition:** logged-in waiter, order with status "served"  
**Expected result:** table returns to "free" status, order history is preserved in the system
