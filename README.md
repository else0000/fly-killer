# Fly Killer

A small browser game built on plain TypeScript and the Canvas 2D API — no game engine,
no runtime dependencies. Swat the flies before they drive you mad: they scatter when you
get close, and they get faster as your score climbs.

```bash
npm install
npm run dev
```

Vite prints the exact URL to open. Because of the GitHub Pages base path it is
http://localhost:5173/fly-killer/ rather than the bare root.

## Controls

| Action | Input                                  |
| ------ | -------------------------------------- |
| Move   | `WASD` / arrow keys, or move the mouse |
| Swat   | `Space` / `Enter` / `J`, or click      |

Holding a movement key takes priority over the mouse, so you can use both without the
cursor fighting you. The teal ring shows exactly where a swing will land.

## Scripts

| Script               | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Vite dev server with hot module replacement          |
| `npm run build`      | Type-check, then emit a production bundle to `dist/` |
| `npm run preview`    | Serve the built bundle locally                       |
| `npm test`           | Run the Vitest suite once                            |
| `npm run test:watch` | Run tests in watch mode                              |
| `npm run typecheck`  | `tsc --noEmit` with the strictest settings           |
| `npm run lint`       | ESLint (type-aware)                                  |
| `npm run format`     | Prettier, write mode                                 |

## Layout

```
.github/workflows/
  deploy.yml            Lint, test, build, then publish to GitHub Pages
index.html              Shell markup; the canvas lives here
src/main.ts             Entry point: canvas, DPR scaling, wiring, visibility pause
src/style.css           Page chrome and responsive canvas sizing
src/game/
  loop.ts               Fixed-timestep loop with an injectable scheduler
  input.ts              Keyboard + pointer → axes, pointer position, swat edges
  world.ts              The whole simulation (pure, no DOM)
  render.ts             Canvas drawing; reads the world, mutates nothing
  types.ts              Vec2 / Size and small math helpers
  *.test.ts             Vitest suites
```

## How it is put together

The project deliberately keeps three concerns apart:

1. **`world.ts` owns the game.** It is plain data plus one mutator, `updateWorld(world, dt, intent)`.
   `intent` is the only thing the outside world contributes each step. There is no DOM, canvas,
   or `Date.now()` in here, and randomness arrives through an injectable `random()` — which is
   why the simulation is fully testable and reproducible.
2. **`loop.ts` owns time.** The simulation advances in fixed `1/60 s` steps regardless of the
   display refresh rate, with `alpha` handed to the renderer for interpolation. Long stalls
   (backgrounded tabs, GC pauses) are clamped so the game cannot spiral into a catch-up loop.
3. **`render.ts` owns pixels.** It reads interpolated positions and draws; it never changes state.

### Tuning the game

Every gameplay knob is a named constant at the top of `src/game/world.ts`:
`SWAT_REACH`, `SWAT_COOLDOWN`, fly speed and wander, and how far flies flee. The `difficulty()`
function is the single place that scales the challenge with score.

### Adding something new

Add a field to the relevant entity in `world.ts`, mutate it in `updateWorld`, then draw it in
`render.ts`. If it needs player input, extend `Intent` and have `input.ts` provide it. Remember
to store `prev` alongside `pos` on anything that moves so interpolation keeps working.

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` runs on every push to `main` (and on demand from the
Actions tab). It installs with `npm ci`, lints, tests, builds, and publishes `dist/`
through the Pages deployment API. A failing lint, test, or type check stops the deploy.

One-time setup, after the code is on GitHub:

1. Push the repo to GitHub, named **`fly-killer`**.
2. In the repo: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
   Do not pick "Deploy from a branch" — there is no `gh-pages` branch to serve.
3. Push to `main` (or run the workflow manually). The site appears at
   `https://<your-user>.github.io/fly-killer/`.

If the repository ends up with a different name, the live URL changes and so must the
build: update the single `base` value in `vite.config.ts` to `'/<repo-name>/'`. That
prefix has to match the Pages subpath or the deployed page loads with no assets.
Running `npm run preview` locally serves the built output under the same prefix, so you
can imitate production before pushing.

### If the first run fails

`Get Pages site failed ... Not Found` means no Pages site exists for the repository yet —
the Pages API returns 404 before any artifact is built. Nothing in the repository can fix
this one: creating a Pages site is a repository-administration operation, and the automatic
`GITHUB_TOKEN` cannot be granted `administration:write`, so `enablement: true` on the
configure step just trades that clear error for `Resource not accessible by integration`.
Set the source to GitHub Actions once, as described above, then re-run the workflow. No
code change and no further commit is needed.

If there is no Pages section in the repository settings at all, the repository is private
on a free plan, which cannot serve Pages — it has to be public or on a paid plan.

## Stack

TypeScript 6 · Vite 8 · Vitest 5 · ESLint 10 (type-aware, flat config) · Prettier.
`tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitReturns` and friends.
