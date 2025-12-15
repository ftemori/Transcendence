📌 Project-wide Rules

The project is a website for Pong tournaments.

Must be a Single Page Application (SPA) and support browser Back/Forward.

Frontend is written in TypeScript (unless overridden by a module).

Backend defaults to pure PHP without frameworks, but is overridden by the Framework (Fastify + Node.js) module.

Must work in the latest stable Mozilla Firefox.

No unhandled errors/warnings in the browser.

Launch via Docker with a single command; runs in an isolated container.

Cluster quirks may apply: rootless mode, runtime under /goinfre, no bind mounts.

Forbidden: libraries/tools that provide an immediate, complete solution to an entire feature or module.

Allowed: small libraries solving a simple, isolated subtask.

Any third-party usage must be justified during defense; the evaluator can still deem it disallowed if it effectively solves a whole module.

⚙️ Mandatory Part

SPA site with Pong tournaments.

Local 1v1 on one keyboard must be possible.

Tournament mode: players take turns; system shows pairing and order.

At tournament start, players enter aliases.

Matchmaking: the system schedules/announces next match.

Identical rules for all players (e.g., same paddle speed) — includes AI.

Game should capture the spirit of original Pong (1972).

Security:

Store passwords hashed (strong algorithm).

Protect against SQL Injection / XSS.

HTTPS everywhere (e.g., wss instead of ws).

Validate all user input (on frontend if no backend, or server-side if backend).

Secrets/credentials/API keys go in .env, git-ignored. Public creds = fail.

📦 Selected Modules
🟢 Major

Backend Framework — Fastify + Node.js instead of PHP.

SQLite is the database (required by backend+DB modules).

Standard User Management

Registration & login.

Unique display name for tournaments.

Profile updates.

Avatar upload (with default).

Friends & online status.

Profile stats (wins/losses).

Match history (1v1, dates, details) for authenticated users.

AI Opponent

A\* is forbidden.

AI simulates keyboard input.

AI refreshes its view only once per second → must predict bounces.

Must be capable of winning sometimes (non-trivial).

Remote Players

1v1 over network on separate computers via the same website.

Handle lag/disconnects; deliver the best UX possible.

2FA + JWT

JWT for authN/authZ.

Two-Factor as an extra layer (SMS/email/authenticator app).

Backend as Microservices

Split backend into small, loosely-coupled services.

Clear boundaries/interfaces; independent deploy/scale.

Communication via REST or message queues.

Each service owns a single capability.

🟡 Minor

Frontend Framework/Toolkit — Tailwind CSS with TypeScript (and nothing else).

Database for Backend — SQLite for all DB instances.

(optional) GDPR Compliance — account deletion, anonymization, local data management.

(optional) User & Game Stats Dashboards — minimal, clear stats UIs.

⚠️ Forbidden

Frontend frameworks beyond Tailwind (e.g., React/Vue/Angular) — not allowed under the chosen frontend module.

Turnkey game engines (e.g., Phaser) or full 3D stacks to “solve” Pong.

Turnkey auth providers (Auth0, Keycloak, etc.).

Heavy ORMs that “solve” persistence end-to-end (Prisma/TypeORM/etc.).

AI libraries that effectively implement the opponent logic for you.

Prebuilt chat systems if you later add chat (premade modules/components).

⚡ Technical Constraints

Single-command startup (e.g., docker compose up).

With HTTPS and JWT, protect all sensitive routes.

Keep secrets/keys out of VCS.

SPA must preserve proper navigation behavior.

Code must be maintainable; during defense you may be asked to modify a small piece quickly.

✅ Evaluation

Mandatory must be perfect (fully complete, no issues) — otherwise modules/bonuses are not graded.

To reach 100%, you need ≥ 7 major modules.
(We have 6 major + 2 minor ≈ 7 major equivalent.)

During defense, you may be asked to:

Tweak a function, display, or data structure.

Do it in minutes to prove understanding.
