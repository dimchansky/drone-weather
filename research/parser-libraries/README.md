# Parser-library research sandbox

Isolated evaluation of third-party METAR/TAF parsers vs our in-house parser. **Not part of the
production app** — this directory has its own `package.json`/`node_modules` and is never imported by
`src/`, the Vite build, or CI. See the full write-up in
[`docs/parser-library-research.md`](../../docs/parser-library-research.md).

## Run

```sh
cd research/parser-libraries
npm install              # installs metar-taf-parser + @squawk/weather + tsx (sandbox only)
npm run spike            # ours vs metar-taf-parser (aeharding), side by side
npx tsx spike-squawk.ts  # ours vs @squawk/weather
```

## Files

- `spike.ts` — parses the tricky examples with **our parser** and **`metar-taf-parser`**, side by
  side, plus robustness probes (does the library throw where we degrade?).
- `spike-squawk.ts` — the same for **`@squawk/weather`** (the only other TAF-capable candidate).
- `spike-output.txt`, `spike-squawk-output.txt` — captured runs (committed for reference).

## Bottom line

Keep our parser (Option D). Both libraries can throw on live global reports, neither exposes a
partial-parse warnings signal, and `@squawk` drops MPS wind + `///` markers. `metar-taf-parser`
(aeharding) is the pick **if** we ever adopt one — behind an adapter with a fall-back to our parser
(Option E). Details + compatibility matrix in the doc above.
