# Kitchen AI (working name)

Snap your fridge → get 3 high-protein recipes that fit your remaining macros.

- **Start here:** [SETUP.md](SETUP.md) (accounts, putting it online, testing on your iPhone)
- **Costs and knobs:** [supabase/admin-queries.sql](supabase/admin-queries.sql)

## How it fits together

| Part | Where | Notes |
|---|---|---|
| iPhone app | `src/app` (screens), `src/ui` (design system), `src/features`, `src/lib` | Expo + Expo Router. Photos are shrunk on the phone (1024px, JPEG 70%) before upload. |
| Database | `supabase/migrations` | Profiles, nutrition table (per 100 g), recipes (cached), saves, meal logs, AI usage log, limits and spending cap. Security rules on every table. |
| Server functions | `supabase/functions` | `scan-fridge`, `generate-recipes`, `delete-account`. The only place the Claude API key is used. |
| Shared server logic | `supabase/functions/_shared` | Nutrition matching, allergy/diet checks, USDA safe temperatures, ranking, Claude wrapper. |
| Nutrition data | `supabase/seed-data/foods.csv` → `node scripts/build-foods.mjs` | Edit the CSV, then rebuild. |
| Tests | `tests/` → `npm test` | Database rules and limits (on a real Postgres), plus macro, safety, and allergy logic. |

## Rules this code follows

- The AI only picks ingredients and grams. **Macros are calculated on the server** from the nutrition table. Anything unmatched is labelled "Estimated".
- **Safe internal temperatures** are set by the server (USDA) and fixed if the AI gets them wrong or leaves them out.
- **Allergies and diet** are re-checked on the server. Conflicting recipes are thrown away.
- **AI limits are enforced in the database**: per-user daily limits, a global daily $ cap, and an off switch. Every call is logged with tokens and cost.
- **No secrets in git**: `.env` holds only the public Supabase URL and anon key, and is git-ignored. The Anthropic key lives in Supabase secrets.
