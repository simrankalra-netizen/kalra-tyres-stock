# Kalra Tyres Stock

A one-screen web app for the counter at **Kalra Tyres**, a tyre shop in India with 3 godowns that sells tyres, alloys, batteries and tubes. Staff search stock across all godowns and record a sale or a godown-to-godown move by typing one plain sentence.

Hackathon MVP. Built with Next.js, Google Gemini (free tier) and Postgres.

---

## Job to be done

> When a customer at the counter asks for a tyre, alloy, battery or tube, I want to see instantly how many we have in each of our 3 godowns and update the stock in one line, so I can confirm the sale on the spot instead of phoning each godown or checking registers.

**User:** the owner and counter staff at Kalra Tyres.

### The 3 tests the MVP must pass

| # | Test | Pass means |
|---|------|-----------|
| 1 | Type a size like `185/65 R15` (or just `1856515`). | Within **2 seconds**, every matching item is shown with its stock in Godown 1, 2, 3 and the total. |
| 2 | Type a sentence like *"Sold 2 MRF ZLX 185/65 R15 from Godown 2"* or *"Moved 4 Exide 35Ah batteries from Godown 1 to Godown 3"*. | Within **10 seconds**, the app shows what it understood (item, quantity, from, to, type). After **Confirm**, the godown counts change and the movement appears in the activity list with date and time. |
| 3 | Try to sell or move more than a godown has, or type a sentence that doesn't clearly match one item. | A clear error appears, **nothing in the stock changes**, and the app **never guesses** an item. |

### Out of scope
Login and staff roles, GST billing and invoices, customer records, battery warranty and serial numbers, suppliers and purchase orders, barcode scanning, WhatsApp/SMS alerts, sales reports, a mobile app, and receiving new stock.

---

## Current workflow → future workflow

| Step | Today (registers and phone) | With this app |
|------|---------------------------|---------------|
| Customer asks for a size | Staff check a paper register or phone each godown | Type the size in **Find stock** and see G1, G2, G3 and the total at once |
| Is there enough? | Wait for a godown to call back | The counts are on screen |
| Sale is made | Written in a register, maybe later | Type *"Sold 2 … from Godown 2"*, check the card, press **Confirm** |
| Stock moved between godowns | Phone call, separate register | Type *"Moved 3 … from Godown 1 to Godown 3"* and **Confirm** |
| Who did what, when? | Scattered across registers | **Activity** list with date and time (Indian time) |

---

## Architecture: Input → AI → Logic → Action → Output

### Flow A: Search (Test 1). No AI.

```
Input   "1856515" typed in Find stock
AI      none
Logic   clean up the size ("185/65 R15", "185 65 15", "1856515" all become "1856515")
        → match size, brand or model
Action  nothing is changed
Output  table: category, brand, model, size, G1, G2, G3, Total
```

### Flow B: Record a sale or move (Tests 2 and 3)

```
Input   "Sold 2 MRF ZLX 185/65 R15 from Godown 2"  → Check
AI      Gemini fills a fixed form: type, quantity, category, brand, model, size, from, to
        (anything not in the sentence = empty)
Logic   plain code, stops at the first problem:
          1. did Gemini answer in time and in the right shape?
          2. is every brand / model / size / number it filled in actually in the sentence?
          3. does the movement make sense? (quantity ≥ 1, sale needs "from",
             transfer needs two different godowns)
          4. does exactly ONE item match? (0 or 2+ = error, never a guess)
          5. does the godown have enough stock?
Action  show a card: what was understood + matched item + "Godown 2: 6 → 4"
        → person presses Confirm
        → server checks the rules again, then ONE database step:
          subtract only if stock is still there, and log the movement
Output  updated counts + a new activity line, or a red error with "Nothing was changed"
```

### Files

```
app/page.tsx                 the one screen: Find stock, Record a sale or move, Activity
app/api/items/route.ts       search (no AI)
app/api/parse/route.ts       sentence → Gemini → plain-code checks → preview (changes nothing)
app/api/movements/route.ts   GET activity list · POST Confirm (re-check + save in one step)
lib/gemini.ts                reusable, server-only Gemini service (askGemini, askGeminiForJson)
lib/parse-sentence.ts        the one Gemini prompt + the form it must fill
lib/check.ts                 rules: words really in the sentence, movement makes sense, enough stock
lib/match.ts                 find exactly one item or explain why not
lib/normalize.ts             size clean-up and search
lib/db.ts                    database connection, tables and sample stock
tests/logic.test.ts          automatic tests for all the plain-code rules
```

---

## Where AI is used, and what stays human

| Step | Who does it | Why |
|------|-------------|-----|
| Reading the sentence | **AI (Gemini)** | People say the same thing many ways ("Sold 2…", "2 pcs gone from G2", "godown two", mixed Hindi and English). Rules for every phrasing would keep breaking. Gemini's only job is to fill in a fixed form. |
| Checking Gemini didn't invent details | Plain code | Brand, model, size, quantity and godown must all appear in your sentence. |
| Finding the item | Plain code | A database lookup: exactly one match, or an error that lists the options. |
| Checking stock and rules | Plain code | Simple arithmetic and yes/no rules. |
| Saving | Plain code | One database step that only subtracts if the stock is still there. |
| **Deciding to save** | **Human** | Nothing changes until a person reads the card and presses **Confirm**. |
| **Settling unclear items** | **Human** | If 2+ items match, the person retypes more precisely. The app never picks one. |
| **Keeping stock true** | **Human** | Starting counts are loaded by the shop, and sales not typed in aren't tracked. |

Gemini never sees the stock list and can never change stock.

## Why these tools

| Tool | Why |
|------|-----|
| **Next.js** | One project for both the screen and the server code. Deploys to Vercel with no setup. |
| **Vercel** (planned) | Free hosting made for Next.js, so the app works on any phone or computer. |
| **Google Gemini `gemini-3.5-flash-lite`** | Free tier, fast, and it supports a forced JSON shape. The model name is set in one line in `lib/gemini.ts`. |
| **Postgres** | It can do "subtract 2 only if there are at least 2" as one all-or-nothing step, so two counters can't oversell the same tyre. |
| **PGlite** (on this laptop) | Real Postgres stored in the `.data` folder, so the app runs with no account or internet database. |
| **Neon** (planned, for Vercel) | Free hosted Postgres, added from the Vercel dashboard. The app switches to it automatically when `DATABASE_URL` is set. Same SQL. |
| **zod + Vitest** | zod checks Gemini's answer has the right shape. Vitest runs the 15 automatic tests on the plain-code rules. |

## Failure cases and what you see

Every failure shows a plain message and **changes no stock**.

| What goes wrong | What the screen says |
|-----------------|----------------------|
| Empty search | "Type a size, brand or model." |
| Search finds nothing | "No items match "…"." |
| Sentence isn't a sale or move | "I couldn't find a sale or move in that. Example: …" |
| Missing quantity or godown | "How many? …" / "Which godown did it come from? …" |
| Gemini fills in a detail that isn't in the sentence | "The AI read …, but that isn't in your sentence." |
| No item, or several items match | "No item in stock matches …" / "3 items match … Please say which one: …" |
| Not enough stock | "Godown 1 has only 2 of Apollo Amazer 4G 155/80 R13. You asked for 10." |
| Gemini key missing or wrong | "Gemini API key missing…" / "Gemini rejected the API key…" |
| Gemini slow (over 9 s), busy, or free limit reached | "Gemini took too long…" / "Gemini is busy…" / "Free Gemini limit reached…" |
| Database can't be reached | "Can't reach the stock list. Check the internet and retry." |
| Stock changed between preview and Confirm | "Stock changed since the preview: Godown 2 now has 1." |

### Known issues (from the last full test run)

- **Gemini can be slow.** Replies took 2–7.5 s, and the first one in a session once timed out at 9.5 s. A retry worked.
- **Gemini sometimes fills in the category ("tyre") when the sentence doesn't say it.** That can quietly choose between a tyre and a tube of the same brand and size. The "is it really in the sentence?" check doesn't cover category yet.
- **"Sold 2 CEAT tyres" stops at the missing godown** before it gets to the unclear item.
- **On phone-width screens, the G1/G2/G3 columns need a sideways scroll.**
- **OneDrive can mark the local `.data` folders read-only,** and the local database then can't start (see Troubleshooting below).
- **Not deployed yet**, so it isn't on Vercel or Neon.

---

## Run it locally

**You need:** Node.js (LTS), git, and a free Gemini API key from [Google AI Studio](https://aistudio.google.com).

1. **Get the code and install the packages**
   ```bash
   git clone https://github.com/simrankalra-netizen/kalra-tyres-stock.git
   ```
   ```bash
   cd kalra-tyres-stock
   ```
   ```bash
   npm install
   ```

2. **Add your Gemini key.** Create a file named `.env` in the project folder with one line:
   ```
   GEMINI_API_KEY=your-key-here
   ```
   No quotes, no spaces. `.env` and `.env.local` are in `.gitignore` and are never committed. The key is only read on the server and never sent to the browser.

3. **Start the app**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. The first start creates the local database in `.data/` with about 20 sample items.

4. **Run the automatic tests**
   ```bash
   npm test
   ```

5. **Reset the sample stock.** Stop the app, delete the `.data` folder, and start it again.

### Troubleshooting

**"Can't reach the stock list" right after starting.** The local database couldn't open. Stop the app, then from the project folder, in PowerShell:

```bash
attrib -R ".data\*" /S /D
```
```bash
del .data\stock\postmaster.pid
```

Then start it again. The cause is OneDrive marking folders read-only, or the app being stopped abruptly, which leaves a lock file behind. Keeping the project outside OneDrive avoids it.

**Using a hosted database (for Vercel):** set `DATABASE_URL` to a Neon Postgres connection string in `.env.local` or in Vercel's settings. Tables and sample stock are created automatically on first use.
