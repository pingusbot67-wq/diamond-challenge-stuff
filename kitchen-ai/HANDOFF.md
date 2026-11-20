# Kitchen AI: handoff for a new session

Paste this file (or point the new session at it) to continue the work. Everything below is the state as of 2026-11-20.

## 1. The product
"Cal AI, but for what you cook next." Kitchen AI is the working name; never use "Cal AI" in the product.
- Snap a fridge photo → AI lists ingredients → user confirms → 3 high-protein recipes ranked by how well they fit the user's remaining macros for the day.
- Cook mode, saved recipes, recipe import from videos/websites, community feed.
- Target users: gym-goers and people on GLP-1 medication (smaller, protein-dense meals).
- Business model: freemium with a subscription (RevenueCat, Phase 4).

## 2. How the owner wants to work (important)
- Non-technical. Explain everything in plain words, with no unexplained jargon.
- Give a time estimate in minutes before each phase, and % progress updates while working.
- Ask before anything hard to undo or that costs money: deleting data, changing the database after launch, picking a paid service.
- Commit after every working step with a plain-English message.
- Never put secrets in committed code: `.env` files are git-ignored, and server keys go in Supabase secrets.
- Very cost-sensitive about AI. Rules:
  - Shrink photos on the phone first (1024px, JPEG 70%).
  - Never analyse video frames.
  - Cache everything.
  - Enforce per-user daily limits and a global daily $ cap on the server.
  - Keep a usage log with the cost of every call.
  - Keep prompts short.
- Models: `claude-haiku-5-5` with effort "low" for all text tasks. Fridge scans run on Haiku unless a side-by-side test shows Sonnet (`claude-sonnet-5-5`) is clearly better; the owner picks. Use structured JSON output, and handle the "refusal" stop reason and errors gracefully.
- Accuracy and safety rules:
  - The AI only picks ingredients and grams; macros come from the nutrition table.
  - The server enforces USDA safe temperatures: poultry 165°F, ground meat 160°F, whole cuts 145°F plus a 3-minute rest, fish 145°F, egg dishes 160°F.
  - The server double-checks allergies and diet.
  - GLP-1 mode always carries a "not medical advice" note. Make no medical claims anywhere.
- Don't move to the next phase until the owner says the current one works.

## 3. Where the code is
- GitHub: `pingusbot67-wq/diamond-challenge-stuff`, branch `claude/festive-ptolemy-rpup2n`, folder `kitchen-ai/`. The rest of that repository is an unrelated project (Lockette); leave it alone.
- `kitchen-ai/README.md` maps the folders. `kitchen-ai/SETUP.md` is the owner-facing setup and testing guide.

| Part | Path | Status |
|---|---|---|
| iPhone app (Expo SDK 58, Expo Router, TypeScript) | `src/app`, `src/ui`, `src/features`, `src/lib` | Phase 1 built, type-checks, bundles for iOS. **Never run on a phone or against real servers.** |
| Database (Supabase / Postgres) | `supabase/migrations` | Tables, security rules, limits (`ai_reserve`), spending cap, usage log, cost views, nutrition table (209 foods). Tested on in-memory Postgres. **Not deployed.** |
| Server functions (Deno, Supabase Edge) | `supabase/functions/{scan-fridge,generate-recipes,delete-account}` | Pass `deno check`. **Not deployed.** The Anthropic SDK is pinned at 1.4.0 (Deno refuses packages under 24h old). |
| Shared server logic | `supabase/functions/_shared` | Nutrition matching, allergens, safety temps, ranking, Claude wrapper. Reused by the website. |
| Nutrition data | `supabase/seed-data/foods.csv` → `node scripts/build-foods.mjs` | Hand-entered USDA SR Legacy values (USDA's site was blocked). **Should be verified against the official USDA download.** |
| Haiku vs Sonnet scan test | `scripts/compare-scan-models.ts` (`npm run compare-scan`) | Works; needs 3–5 fridge photos in `test-photos/` and a key in `.env.local`. **Never run with a real key.** |
| Website version | `web/` → `node web/build.mjs` → `web/dist/kitchen-ai.html` | Live as a claude.ai artifact: https://claude.ai/artifact/FDhENhEVBS4dpXQRNSv9Ne |
| Tests | `tests/` → `npm test` | 54 passing (database rules and limits, macros, allergies, safety temps, ranking) |

### The website version (what the owner currently uses)
- A single HTML page published as a claude.ai artifact. Its AI runs on the viewer's own Claude account through the artifact runtime (`window.claude.use("sample")`), so it needs no Anthropic or Supabase accounts.
- **What's in it:**
  - an interactive Three.js welcome page: glossy produce, pointer-following light, ingredients dropping into a bowl as you scroll, "Shake the fridge"
  - onboarding, fridge photo scan, confirm list, 3 ranked recipe cards with animated dish illustrations, cook mode with timers, saved recipes
  - recipe import from pasted text (with creator credit and allergy warnings)
  - a community feed: post, like, follow, report, block, filters
  - a Haiku-vs-Sonnet compare button after each scan
- **Libraries:** Preact and Three.js load from CDNs, everything else is bundled. Fonts are Bricolage Grotesque and Instrument Serif, styled after the owner's reference site https://sunmist-fruit.netlify.app.
- **Storage:** private data lives under `data/users/<id>`; the shared collections are `posts/`, `likes/`, `reports/`.
- **Limits:** the page can't fetch other websites, so it can't read TikTok or YouTube links itself. Community posting probably only works for people on the owner's Claude team.
- **Republishing** needs the Artifact tool with the same URL. From a normal local session, the owner can open `web/dist/kitchen-ai.html` in a browser, but the AI and storage features only work inside claude.ai.

## 4. Decisions already made
- The app lives in `kitchen-ai/`, separate from the Lockette files.
- Generate 4 recipes and keep the best 3 that pass the allergy check.
- Default limits:
  - 15 scans and 25 generations per user per UTC day
  - $3/day global cap
  - the scan model is switchable in the `ai_settings` table without a redeploy
- Fridge photos are never stored.
- `com.kitchenai.app` is a placeholder bundle ID. Settle the real name before Phase 4; it's hard to change later.
- Dish pictures are drawn in code from the ingredients (`web/src/dish.ts`): no AI cost, and no copied photos.

## 5. Research done (2026-11-19): recommended next features
1. **Paste a video link → recipe, using only allowed methods.**
   - TikTok's official oEmbed endpoint returns the caption (`title`) and creator.
   - The YouTube Data API `videos.list` returns the description (free API key).
   - If the caption links to a blog, follow it and read the schema.org Recipe JSON-LD.
   - Fallback is pasted text.
   - Do **not** download audio or video to transcribe: YouTube's developer policies forbid downloading, and captions.download is owner-only.
   - Instagram: the caption only comes inside the oEmbed HTML, and Meta's docs disagree on whether a token is needed.
   - Cache per URL.
2. **Website import** via schema.org JSON-LD (no AI needed when present). Rewrite steps in our own words, always credit and link, never copy photos. Plain ingredient lists aren't copyrightable; prose and photos are.
3. **"Make it fit my macros"** on any imported recipe: scale or swap to a target such as 40 g protein / 450 kcal, plus a half-portion toggle and a protein-per-bite score. This is the differentiator; a dozen apps already do video import (ReciMe, Pestle, Plum, Wecipe, ReciReel…).
4. **"Buy ingredients" button** via the Instacart Developer Platform "create recipe page" endpoint (affiliate ID possible; pricing and approval not checked).
5. **Weekly high-protein meal plan** (paid tier).
- **Celebrities:** no names or faces without a signed deal. Start with fitness and GLP-1 micro-creators (10k–200k followers) on revenue share (market examples: StudioLink 80%, Digero 50% pool, Chefadora 55% of ads). Give them verified profiles and "Cook with @creator" collections, and embed their original video on the recipe.
- **Skip:** GLP-1 medication or dose tracking (medical territory).
- Items 1, 2 and 4 need the real Supabase backend, because the website can't fetch other sites. The iOS share sheet ("share from TikTok") needs a development build.

## 6. Open items / blocked on the owner
- Create Supabase and Anthropic accounts (the owner must do this; they can't be made for them). Set a monthly spending limit in the Anthropic Console. Then follow `SETUP.md` to deploy.
- Run the Haiku vs Sonnet test on real fridge photos and pick a scan model.
- Verify `foods.csv` against official USDA FoodData Central.
- Phase 1 sign-off on a real iPhone, then Phase 2 (video import), Phase 3 (community), Phase 4 (paywall, RevenueCat, App Store, $99 Apple Developer account).

## 7. Handy commands (run inside `kitchen-ai/`)
```bash
npm install                 # install packages
npm test                    # 54 automated tests
npx tsc --noEmit            # type-check the iPhone app
npx tsc -p web/tsconfig.json && node web/build.mjs   # build the website → web/dist/kitchen-ai.html
npx expo start              # run the iPhone app in Expo Go (needs .env with Supabase URL + anon key)
```
