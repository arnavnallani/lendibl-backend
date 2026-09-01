# lendibl — Backend

API server for lendibl, a peer-to-peer rental marketplace. Handles listings, bookings, payments, messaging, and the trust and safety layer that makes renting a stranger's stuff actually work.

Built with Express and TypeScript on top of PostgreSQL via Drizzle ORM.

---

## Table of contents

- [Stack](#stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Core domain](#core-domain)
- [API surface](#api-surface)
- [Services](#services)
- [Payments](#payments)
- [Real time](#real-time)
- [Database](#database)
- [Conventions](#conventions)

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js + TypeScript | Type safety across the API boundary, shared types with the frontend |
| Framework | Express | Small surface, no ceremony |
| ORM | Drizzle | Type-safe queries generated from the schema, no runtime magic |
| Database | PostgreSQL | Relational data with real constraints — bookings and payments need them |
| Payments | Stripe (Connect + Payment Intents) | Marketplace payouts, platform fees, and dispute handling out of the box |
| Real time | `ws` WebSocket server | In-rental messaging and live notifications |
| Auth | JWT + bcrypt | Stateless sessions, simple to scale horizontally |

Schema and types live in `@shared/schema` so the frontend and backend never disagree about the shape of an item or a booking.

---

## Quick start

**Requirements:** Node 18+, a PostgreSQL instance, a Stripe account in test mode.

```bash
npm install
cp .env.example .env          # fill in the values below
npm run db:push               # push the Drizzle schema to your database
npm run dev                   # start with hot reload
```

Production:

```bash
npm run build
npm start
```

---

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Signing secret for auth tokens |
| `STRIPE_SECRET_KEY` | Server-side Stripe key |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming Stripe webhook signatures |
| `SENDGRID_API_KEY` | Transactional email (verification, resets, reminders) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Phone verification |
| `OPENAI_API_KEY` | AI pricing, search, and chatbot services |
| `PORT` | Defaults to 5000 |

Never commit `.env`. Rotate any key that has been pasted into a chat, a screenshot, or a support ticket.

---

## Project structure

```
server/
├── index.ts                        # Express app, middleware, server bootstrap
├── routes.ts                       # Route definitions
├── auth.ts                         # Hashing, JWT issue/verify, auth middleware
├── db.ts                           # Drizzle client
├── storage.ts                      # Repository layer (IStorage) — all DB access goes here
├── stripe-service.ts               # Payment intents, Connect onboarding, transfers
├── refund-service.ts               # Refunds and partial refunds
├── payment-scheduler.ts            # Scheduled charges for multi-period rentals
├── payment-reminder-service.ts     # Upcoming and overdue payment notices
├── recommendation-engine.ts        # Personalized item ranking from interaction history
├── ai-pricing-service.ts           # Suggested daily rate from category and comparables
├── ai-search-service.ts            # Natural-language search and query completion
├── chatbot-service.ts              # In-app support assistant
├── notification-service.ts         # Fan-out to in-app, email, and push
├── review-prompt-service.ts        # Post-rental review nudges
├── response-tracking-service.ts    # Lister response time metrics
├── email-service.ts                # Templates and delivery
├── email-verification-service.ts
└── phone-verification-service.ts
shared/
└── schema.ts                       # Drizzle tables + Zod insert schemas + inferred types
```

---

## Core domain

| Table | Role |
|---|---|
| `users` | Accounts, profile, verification state, Stripe Connect account id |
| `categories` | Item taxonomy |
| `items` | Listings — price, location, availability, photos, owner |
| `bookings` | The central object. Rental period, status, amounts, both parties |
| `reviews` | Two-sided reviews tied to completed bookings |
| `rentalMessages` | Per-booking conversation thread |
| `userInteractions` | Views, saves, and clicks feeding the recommendation engine |
| `userPreferences` | Derived taste profile |
| `damageReports` | Dispute evidence attached to a booking |
| `paymentReminders` / `reviewPrompts` | Scheduled outbound nudges |
| `itemScans` | Condition capture at handoff and return |
| `phoneVerifications` / `passwordResetTokens` | Short-lived credential flows |
| `earlyAccessSignups` / `first100Users` | Launch waitlist and founding-user cohort |

---

## API surface

Grouped by concern. All authenticated routes expect `Authorization: Bearer <token>`.

**Auth** — register, login, refresh, password reset request and confirm, email verification, phone verification send and confirm.

**Items** — list with filters (`categoryId`, `search`, `minPrice`, `maxPrice`, `location`), get by id, create, update, delete, owner's listings.

**Bookings** — create a booking request, accept or decline as owner, cancel, mark picked up, mark returned, list as renter, list as owner.

**Payments** — create payment intent, Stripe Connect onboarding link, payout status, refund, Stripe webhook receiver.

**Reviews** — create for a completed booking, list by item, list by user.

**Messaging** — fetch thread for a booking, send message, mark read.

**Recommendations and search** — personalized feed, similar items, AI search, search completions, AI price suggestion for a draft listing.

**Growth** — early access signup, Epic Mode eligibility.

---

## Services

The route layer stays thin. Anything with real logic lives in a service module and is called from the route, which keeps routes readable and services testable in isolation.

**Recommendation engine.** Scores items against a user's interaction history and preferences, with a cold-start fallback to popularity and proximity.

**AI pricing.** Given category, condition, and location, suggests a daily rate. Mispriced listings are the fastest way to kill supply-side confidence, so this runs at listing creation rather than as an afterthought.

**AI search.** Turns natural language into structured filters — "a drill for a weekend project under $20" becomes a category, a price ceiling, and a duration.

**Payment scheduler and reminders.** Long rentals bill on a schedule instead of one large upfront charge. The scheduler creates the charges; the reminder service warns both parties before and after each one.

**Response tracking.** Measures how fast listers reply. Slow response is the main reason a marketplace request dies, so it's tracked explicitly and surfaced on profiles.

---

## Payments

Money moves through Stripe Connect:

1. Renter confirms a booking → payment intent is created and authorized
2. Funds are held until pickup is confirmed
3. On successful return, the platform fee is retained and the remainder transfers to the lister's connected account
4. Damage reports pause the transfer and open a dispute path handled through the refund service

Webhooks are the source of truth for payment state. Never mark a booking paid from a client-side callback — wait for the webhook.

---

## Real time

A `ws` server is attached to the same HTTP server. Clients authenticate with their JWT on connect and subscribe to booking threads. Messages and notifications are pushed over the socket and also persisted, so a client that was offline gets them on next fetch.

---

## Database

Drizzle owns the schema. To change it:

1. Edit `shared/schema.ts`
2. Run `npm run db:push` in development, or generate and review a migration for anything running in production
3. Update the corresponding methods in `storage.ts`

All database access goes through the `IStorage` interface. Routes should never import `db` directly — that separation is what makes it possible to change the query layer without touching route logic.

---

## Conventions

- Validate every request body with the Zod insert schemas exported from `shared/schema`. If it isn't validated, it doesn't reach the database.
- Return consistent error shapes: `{ message: string }` with a meaningful status code.
- Keep secrets in environment variables and out of the repo.
- Any new table gets a matching `IStorage` method rather than an inline query.
