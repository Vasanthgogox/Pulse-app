# Env / Supabase: when `.env` changes seem ignored

Operational notes from debugging “I switched `.env` to preprod but the app (or logs) still looks like prod.”

## 1. App vs Supabase CLI: two different “targets”

| Surface | What it uses |
|--------|----------------|
| **Expo / Metro / web bundle** | Root `.env` (and optional `.env.local`), loaded by `app.config.js` and `node -r dotenv/config` in npm scripts. Values flow into `expo.extra` and `EXPO_PUBLIC_*`. |
| **`supabase db query`, `db push`, `migration list --linked`** | **`supabase link`** project ref — **not** your app `.env`. |

Check linked remote:

```bash
npx supabase projects list
```

The **LINKED** column (●) is the DB the CLI uses with `--linked`.

To point the CLI at another project:

```bash
npx supabase link --project-ref <ref>
```

## 2. How the app resolves Supabase URL

`lib/supabase.ts` uses, in order:

1. `Constants.expoConfig.extra.supabaseUrl` / `supabaseAnonKey` (from `app.config.js` at **Metro start**)
2. Then `process.env.EXPO_PUBLIC_SUPABASE_*` as fallback

So changing `.env` **while the dev server keeps running** does not update an already-built bundle. **Restart Metro** after every meaningful `.env` edit.

## 3. Clearing Metro / Expo cache

### Wrong: `npm run dev --clear`

npm does **not** forward flags after the script name unless you use `--`. So `--clear` never reached Expo.

### Right (this repo)

- **`npm run web`** (or same underlying command):

  ```bash
  npm run web -- --clear
  ```

- **`npm run dev`** (because `dev` runs `npm run web` nested, you need **two** `--`):

  ```bash
  npm run dev -- -- --clear
  ```

### Custom Metro disk cache (`metro.config.js`)

Metro uses `FileStore` under the OS temp directory:

`$(node -p "require('path').join(require('os').tmpdir(), 'pulse-metro-cache')")`

If the UI still shows an old Supabase host after `--clear`, delete that folder, then start again with `--clear`:

```bash
rm -rf "$(node -p "require('path').join(require('os').tmpdir(), 'pulse-metro-cache')")"
```

**zsh note:** avoid nested `"` inside `"$(...)"` for `node -e "..."`; use `node -p '...'` with single-quoted JS strings, or you can get `dquote cmdsubst>` (stuck prompt) — **Ctrl+C** to abort.

## 4. Kill stale dev servers

If port **8081** (or your Expo port) is already taken by an **old** process, you may still be hitting a server started **before** the `.env` change. Stop all Expo/Metro instances, then start again.

## 5. Shell / IDE env overrides

If `EXPO_PUBLIC_SUPABASE_URL` (or related vars) are set in the **shell** or **IDE run configuration**, they can interact oddly with dotenv load order. Check:

```bash
env | grep EXPO_PUBLIC_SUPABASE
```

Unset or align them with `.env` for local dev.

## 6. `.env.local` overrides `.env`

`app.config.js` loads `.env` then **overrides** with `.env.local` if present. Prefer `.env.local` for machine-specific URLs (see `.env.local.example`).

## 7. Netlify vs local `dev`

- **Local:** `npm run dev` is a thin wrapper around **`npm run web`** (Expo dev server). Same web entry; minor env differences in `package.json` scripts.
- **Netlify** (`netlify.toml`): **`npm run build:web`** → static **`dist`**. Deployed Supabase URL/keys come from **Netlify environment variables** for that site, not from your laptop’s `.env`.

## 8. Quick verification in the browser

In dev, the app logs the host once the client is created, e.g.:

`[pulse] Supabase URL host: <project-ref>.supabase.co`

That host should match the **active** (uncommented) `EXPO_PUBLIC_SUPABASE_URL` in `.env` / `.env.local` after a clean restart.

## 9. `restore_no_session` in AuthGuard

After switching projects or clearing storage, seeing **no session** on restore is **expected** until the user signs in again on that Supabase project.
