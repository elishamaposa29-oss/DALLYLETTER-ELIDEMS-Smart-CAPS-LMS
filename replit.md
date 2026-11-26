# DallyLetter Elidems — CAPS Education Platform

## Overview

Full-stack CAPS education support platform for primary and secondary school learners. Provides role-based dashboards for Students, Teachers, and the Owner/Admin.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (artifacts/dallyletter)
- **Backend**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: Custom JWT (base64 token stored in localStorage as `dallyletter_token`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/dallyletter run dev` — run frontend locally

## Architecture

### Frontend (artifacts/dallyletter)
- `src/contexts/AuthContext.tsx` — Auth state, JWT token management
- `src/pages/Login.tsx` — Login page
- `src/pages/Register.tsx` — Registration page
- `src/pages/student/` — All student dashboard pages
- `src/pages/teacher/` — All teacher dashboard pages
- `src/pages/admin/` — All owner/admin dashboard pages
- `src/components/` — Shared UI components

### Backend (artifacts/api-server)
- `src/routes/auth.ts` — Register, login, logout, /auth/me
- `src/routes/users.ts` — User management (owner only)
- `src/routes/lessons.ts` — Lesson CRUD
- `src/routes/classes.ts` — Live class CRUD
- `src/routes/messages.ts` — Chat (group + private)
- `src/routes/studyGroups.ts` — Study groups
- `src/routes/payments.ts` — Payment tracking
- `src/routes/notifications.ts` — Notifications
- `src/routes/handRaises.ts` — Hand raise during classes
- `src/routes/dashboard.ts` — Stats, activity feed, payment summary
- `src/lib/auth-middleware.ts` — JWT auth middleware

### Database Schema (lib/db/src/schema)
- `users.ts` — Students, teachers, owner
- `lessons.ts` — Educational content
- `classes.ts` — Google Meet live classes
- `messages.ts` — Group + private chat
- `studyGroups.ts` — Study groups + members
- `payments.ts` — School fee payments
- `notifications.ts` — Platform notifications
- `handRaises.ts` — Class hand raises
- `activityLog.ts` — Activity feed

## User Roles

1. **Student** — View lessons, join classes, chat, study groups, view payments
2. **Teacher** — Upload lessons, host classes, communicate with students
3. **Owner** — Full admin control: user management, payments, analytics

### Owner Accounts (predefined)
- Email: `elishamaposa29@gmail.com` — Password: `Admin@12345`
- Email: `maposadallyletter@gmail.com` — Password: `Admin@12345`

### Demo Accounts
- Teacher: `teacher.sarah@dallyletter.com` — Password: `password123`
- Teacher: `teacher.james@dallyletter.com` — Password: `password123`
- Teacher: `teacher.grace@dallyletter.com` — Password: `password123`
- Student (Prefect): `student.alice@dallyletter.com` — Password: `password123`
- Student: `student.bob@dallyletter.com` — Password: `password123`
- Student (Overdue): `student.chido@dallyletter.com` — Password: `password123`

## Auth Flow

- Token stored in `localStorage` as `dallyletter_token`
- Token is base64-encoded `{ userId, ts }` payload
- Token sent as `Authorization: Bearer <token>` header
- Role-based route protection in frontend (ProtectedRoute component)
- Blocked students see a suspension page

## Payment System

- Payments tracked per student per month
- Overdue payments trigger automatic notifications
- Students with 3+ months unpaid get a warning banner
- Owner can record, view, and manage all payments
