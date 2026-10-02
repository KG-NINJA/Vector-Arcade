# BLOOD CRYPT regression tests

Run from the repository root with Node.js 18+ (no install, browser, network, or backend needed):

```sh
node --test vector_crypt/tests/regressions.test.cjs
```

The suite evaluates the actual inline game script using small Phaser/DOM test doubles.
It covers terminal-state ordering, pause/resume/restart, directional melee, pickup
semantics, floor generation (including pathological rolls and 150 seeded floors),
entity-owned graphics cleanup, and unchanged movement/fireball/heal tuning.
It does not load the arcade lobby or exercise payments.

To compare against another HTML revision without modifying the checkout:

```sh
BLOOD_CRYPT_HTML=/absolute/path/to/baseline.html node --test vector_crypt/tests/regressions.test.cjs
```

These are logic/lifecycle regression tests, not a substitute for real Phaser rendering.
For browser QA, serve only `vector_crypt/`, then check movement, front/back melee,
Q/E, P then P, and R during play/pause/defeat/victory. Confirm floor transitions and
repeated restarts leave no old tiles, enemy bars, or lights. Check desktop and a
small viewport for the existing HUD, textures, particles, minimap, and overlays.
