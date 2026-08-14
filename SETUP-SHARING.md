# Turning on live sharing

The app is already deployed and works on both your phones. What it can't do yet
is show you each other's changes — that needs a database, and only you can
create it.

Roughly five minutes.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> and sign up (free tier is plenty).
2. **New project**. Name it anything. Pick the region closest to you —
   `Central EU (Frankfurt)` if you're in Germany. Save the database password
   somewhere; you won't need it for this, but you'll want it later.
3. Wait for it to finish provisioning (~2 min).

## 2. Create the table

Open **SQL Editor** in the left sidebar, click **New query**, paste the entire
contents of [`supabase/setup.sql`](supabase/setup.sql), and hit **Run**.

You should see `Success. No rows returned`.

> That script does one thing people usually miss: it explicitly `GRANT`s access
> to the `anon` role. Since 2026-05-30, new Supabase projects no longer expose
> `public` tables to the API automatically, so without the grant every request
> fails with a permission error even though the table and its policies look
> perfectly fine.

## 3. Copy the two keys

Go to **Project Settings → API** and copy:

- **Project URL** — looks like `https://abcdefghijkl.supabase.co`
- **Publishable key** — starts with `sb_publishable_…`

**Take the publishable key, not the `service_role` / secret key.** The secret
key bypasses every access rule and must never go into a web page. The
publishable key is designed to be public.

## 4. Hand them over

Send both values back, and I'll build and redeploy — sharing goes live on the
existing link, no new URL.

Or do it yourself:

```bash
cp .env.example .env      # then paste the two values in
npm run deploy
git add -A && git commit -m "Enable live sharing" && git push
```

GitHub Pages redeploys in about a minute.

---

## How it behaves once it's on

Open the app, hit **Copy the link to this plan**, and send that link to your
partner. You're both in the same room from then on.

- Moving a piece shows up on the other screen more or less instantly.
- Both of you can drag at the same time. Each move is sent per-piece, so your
  furniture won't fight over a shared snapshot.
- Everything is saved. If one of you rearranges while the other is asleep,
  they'll see it when they next open the link.
- Close the tab, open it tomorrow, same plan.
- The status pill at the top of the panel reads **Live** when connected, and
  tells you who else is in the room.

## What the link means

There are no accounts and no passwords. **The room link is the credential** —
anyone who has it can view and edit the plan. It contains a 128-bit random ID,
so nobody will guess it, but treat it like a password: fine in a message to
your partner, don't post it publicly.

Want a fresh, private plan? Open the app without the `?room=…` part of the URL
and it mints a new room.

## If something looks wrong

The panel shows the actual error rather than failing quietly.

| What you see | Cause |
| --- | --- |
| `permission denied for table layouts` | Step 2 didn't run, or the `GRANT` line was skipped. Re-run `setup.sql`. |
| `Not shared` | Built without `.env`. Re-run `npm run deploy` after creating it. |
| `Connection problem` | Usually the project is paused — free projects sleep after a week idle. Open the Supabase dashboard to wake it. |
