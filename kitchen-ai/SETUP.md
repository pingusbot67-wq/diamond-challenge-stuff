# Kitchen AI — setup & testing guide (Phase 1)

Plain-English steps. Allow about **45 minutes** the first time. You only do this once.

---

## 1. Accounts you need

| Account | What it's for | Cost | When |
|---|---|---|---|
| **Supabase** (supabase.com) | Login, database, server functions | **Free** tier is enough for testing. Free projects pause after 7 days of no use (one click to wake). ~$25/month "Pro" when you launch. | Now |
| **Anthropic Console** (console.anthropic.com) | The Claude AI key | Pay-as-you-go. Buy the minimum credit (about $5). Phase 1 testing should cost cents. | Now |
| **Expo Go** app (App Store) | Runs the app on your iPhone while we build | Free | Now |
| **Expo account** (expo.dev) | Cloud builds later | Free tier | Phase 2/4 |
| **Apple Developer Program** | TestFlight, App Store, real in-app purchases | **$99/year** | Phase 4 (I'll ask first) |
| **RevenueCat** | Subscriptions | Free until $2,500/month in revenue, then 1% | Phase 4 (I'll ask first) |

Prices are what I know as of late 2026. Check each site before paying.

---

## 2. Anthropic key + spending limit (do this first)

1. Go to **console.anthropic.com**, sign up, and add billing (buy the minimum credit).
2. **Set a monthly spending limit right away:** in the Console go to Settings → Limits and set something like **$10/month**. This is your safety net if anything goes wrong.
3. Settings → API Keys → **Create Key**. Copy it somewhere private for a minute (it starts with `sk-ant-`).
   - Never paste it into chat, email, or any file inside the project. It goes into Supabase only (step 4).

The app also has its own protections:
- a daily per-user limit
- a global daily dollar cap (default **$3/day**) that switches AI off automatically
- an emergency off switch

You can change all three in `supabase/admin-queries.sql`.

---

## 3. Supabase project

1. **supabase.com → New project.** Name it `kitchen-ai`, choose a strong database password (save it in your password manager), and pick the region closest to you.
2. When it's ready, go to **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon / publishable key**. This one is safe to put in the app.
   - The **project ref**: the `abcd1234` part of the URL.
   - Do **not** copy the `service_role` / secret key anywhere. The server already has it.
3. **Authentication → Sign In / Providers:**
   - **Email**: on. For easy testing you can turn **"Confirm email" off**. If you leave it on, you'll need to tap the link in a confirmation email before signing in.
   - **Apple**: turn it on. In **Client IDs** enter `host.exp.Exponent` (that's Expo Go's ID, used for testing). Leave the secret fields empty; the iPhone sign-in doesn't need them. We'll add the real app ID (`com.kitchenai.app`) in Phase 4.
4. **Edge Functions → Secrets → Add new secret:**
   - Name: `ANTHROPIC_API_KEY`
   - Value: your `sk-ant-...` key from step 2.

---

## 4. Get the code onto your computer (Mac)

1. Install **Node.js LTS** from nodejs.org (just click through the installer).
2. Open the **Terminal** app and paste these one at a time. If macOS asks to install "command line developer tools", say yes, wait, then run the command again.

```bash
git clone https://github.com/pingusbot67-wq/diamond-challenge-stuff.git
```

```bash
cd diamond-challenge-stuff
```

```bash
git checkout claude/festive-ptolemy-rpup2n
```

```bash
cd kitchen-ai
```

```bash
npm install
```

If `git clone` asks you to log in, use **GitHub Desktop** (desktop.github.com) → File → Clone repository instead, then open Terminal in that folder.

---

## 5. Put the server online (database + functions)

Still in Terminal, inside the `kitchen-ai` folder:

```bash
npx supabase login
```
(opens your browser. Approve it.)

```bash
npx supabase link --project-ref YOUR-PROJECT-REF
```
(asks for the database password from step 3.1)

```bash
npx supabase db push
```
This creates all the tables, security rules, limits, and the nutrition table. Type `y` if asked.

```bash
npx supabase functions deploy scan-fridge generate-recipes delete-account
```
If it mentions Docker, run the same command with `--use-api` added at the end.

---

## 6. Connect the app and open it on your iPhone

1. In the `kitchen-ai` folder, make a copy of `.env.example` named `.env` (in Terminal: `cp .env.example .env`). Open `.env` in TextEdit and paste your **Project URL** and **anon key**. This file is never uploaded to GitHub.
2. Install **Expo Go** from the App Store on your iPhone.
3. In Terminal:

```bash
npx expo start
```

4. Scan the QR code with your iPhone **Camera** app. It opens in Expo Go.
   - Phone and computer must be on the **same Wi-Fi**. If it can't connect, stop it (Ctrl+C) and run `npx expo start --tunnel`.

---

## 7. What to try (Phase 1 checklist)

**Happy path**
- [ ] Create an account with email, then sign out and back in.
- [ ] Sign in with Apple (on the sign-in screen).
- [ ] Onboarding: pick **GLP-1 mode** and check the "not medical advice" note appears. Check that the suggested protein/calorie numbers look sensible, then edit them.
- [ ] Home → **Take a photo** of your fridge. On the confirm screen:
  - remove a wrong item
  - tap an item to rename it
  - type to add a missing item (suggestions appear instantly)
- [ ] **Make 3 recipes.** The cards should be ranked, with big protein numbers, calories, and minutes.
- [ ] **Share** a card and save the image to Photos. Does it look screenshot-worthy?
- [ ] Open a chicken, beef, fish, or egg recipe. It must show the safe temperature, for example "165°F (74°C)" for chicken.
- [ ] **Save** it, then check it appears in **My recipes**.
- [ ] **Cook mode:**
  - swipe between steps
  - start a timer
  - check the screen doesn't go dark
  - at the end, **Log this meal** and check that the Home "Today" bars update.
- [ ] Profile → Edit targets. Then **Delete account**, but only on a test account.

**Try to break it**
- [ ] Photograph a wall or your shoe. You should get "doesn't look like food".
- [ ] Turn on Airplane mode, then scan or generate. You should get a friendly "no connection" message, not a crash.
- [ ] Set allergy **Dairy**, then generate recipes from a fridge with cheese and yogurt. No recipe should contain dairy.
- [ ] Set diet **Vegan** and add only chicken and eggs. You should get a polite "couldn't make recipes" message.
- [ ] Type nonsense ("asdfgh") as an ingredient. It should still work, and anything unknown gets an **Estimated** label.
- [ ] Tap **Make 3 recipes** twice with the same items. The second time should be instant (the cache, which costs no AI).
- [ ] Limits: in Supabase SQL Editor run `update ai_settings set daily_limits = '{"scan": 2, "generate": 2}';` then scan 3 times. The third scan should show the limit message. (Set it back to 15/25 afterwards.)
- [ ] Spending cap: run `update ai_settings set global_daily_cap_usd = 0.0001;`. AI should say "paused". (Set it back to 3 afterwards.)

---

## 8. See what the AI is costing

Supabase → **SQL Editor** → paste blocks from `supabase/admin-queries.sql`:
- **Query 1**: cost per day
- **Query 2**: cost per user
- **Query 3**: the real average cost of **one scan** and **one recipe generation**

---

## 9. Haiku vs Sonnet for fridge photos (your decision)

1. Put 3–5 of your own fridge photos (JPEG/PNG) in `kitchen-ai/test-photos/`. This folder is never uploaded.
2. Create a file `kitchen-ai/.env.local` containing one line: `ANTHROPIC_API_KEY=sk-ant-...` (also never uploaded).
3. Run:

```bash
npm run compare-scan
```

4. Open `kitchen-ai/reports/scan-comparison.html`. It shows each photo with both models' lists side by side, plus cost per scan and speed. It costs a few cents.
5. Tell me which one you pick. Switching later is one line in the SQL editor (see `admin-queries.sql`), with no app update needed.

---

## 10. Expo Go vs a "development build"

**Expo Go** is a ready-made app from Expo that can run our code straight from your computer, with nothing to install or sign. It includes a fixed set of features: camera, photos, sharing, haptics, keep-awake, and Apple sign-in (in test mode). **Everything in Phase 1 works in Expo Go.**

Some features need **our own app binary**. That's called a **development build**: our app built in the cloud by Expo (EAS), installed on your phone through TestFlight. It needs the $99/year Apple Developer account. We'll need one for:

| Feature | Why Expo Go can't do it | When |
|---|---|---|
| Real subscription purchases (RevenueCat) | Needs our App Store app ID and in-app purchase setup | **Phase 4** |
| "Share to Kitchen AI" from TikTok/YouTube (iOS share sheet) | Needs a share extension inside our own app | Phase 2 (optional, later) |
| Sign in with Apple under the "Kitchen AI" name | Expo Go signs in as "Expo Go" | Phase 4 |
| Our app icon, name, and splash screen on the home screen | Expo Go shows its own | Phase 4 |

---

## If something goes wrong

- **The app shows "Almost there"**: the `.env` file is missing or wrong (step 6.1). Restart `npx expo start` after fixing it.
- **"AI features are temporarily unavailable"**: the `ANTHROPIC_API_KEY` secret is missing or wrong (step 3.4), or your Anthropic credit has run out.
- **"AI features are paused"**: the daily $ cap was hit or AI was switched off (see `admin-queries.sql`).
- **Sign in with Apple fails**: check that `host.exp.Exponent` is in Supabase → Apple → Client IDs.
