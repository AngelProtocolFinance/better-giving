#!/usr/bin/env bash
# regenerates the self-hosted webfont subsets beside this script.
#
# the output is COMMITTED SOURCE, not a build artifact — same convention as
# packages/crypto's and packages/stocks' src/generated/**. nothing in the task
# graph runs this; it is a maintenance script for a font bump or a face change.
#
# why we subset at all instead of taking fontsource's files: fontsource cuts
# with the default layout-feature retain list, which does not include `zero`.
# quicksand HAS a dotted-zero alternate behind that feature, and
# `font-variant-numeric: slashed-zero` is how css asks for it. their build
# discards it; this one keeps it. see ../fonts.css.
#
# output is equivalent but not byte-identical across runs — woff2 compression
# is not deterministic. compare glyph counts, codepoints and feature tags, not
# checksums, when confirming a regeneration did what you expected.
#
# needs python with fontTools + brotli:
#   python3 -m venv .venv && .venv/bin/pip install 'fonttools[woff]' brotli
#   PY=.venv/bin/python3 ./generate.sh
set -euo pipefail
cd "$(dirname "$0")"

PY="${PY:-python3}"
"$PY" -c 'import fontTools, brotli' || {
  echo "needs fontTools + brotli — see the header of this script" >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "fetching upstream sources from google/fonts…"
curl -sfL -o "$tmp/Quicksand.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/quicksand/Quicksand%5Bwght%5D.ttf"
curl -sfL -o "$tmp/GochiHand.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/gochihand/GochiHand-Regular.ttf"

# the unicode-ranges in ../fonts.css, verbatim. each subset is cut to the UNION
# of its range and the coverage the committed subset beside this script already
# has, so a regeneration can never serve less than what the site served before.
# that union is why the ranges are expanded in python rather than passed as-is.
"$PY" - "$tmp" <<'PYEOF'
import subprocess, sys, os
from fontTools.ttLib import TTFont

tmp = sys.argv[1]
here = os.getcwd()  # the shell cd'd to this script's dir above

RANGES = {
 "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
 "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
 "vietnamese": "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
}
# `zero` is the whole point — everything else is pyftsubset's own default set.
QUICKSAND_FEATURES = "ccmp,locl,mark,mkmk,kern,liga,dnom,numr,frac,zero"
GOCHI_FEATURES = "ccmp,locl,mark,mkmk,kern,liga"

def expand(spec):
    out = set()
    for part in spec.split(","):
        p = part.strip()[2:]
        if "-" in p:
            a, b = p.split("-")
            out.update(range(int(a, 16), int(b, 16) + 1))
        else:
            out.add(int(p, 16))
    return out

def floor(out):
    """the coverage the committed subset at `out` already has — the ratchet the
    union above is taken against. it is read from the committed woff2 rather
    than from the font package the subsets were first derived from, because
    that package is no longer a dependency: deriving the floor from node_modules
    would quietly return nothing on a clean install and cut a SMALLER font than
    the one it replaced. the shipped bytes are the only copy of this number that
    cannot go missing. absent (a subset generated for the first time) -> the
    declared range alone, said out loud rather than assumed."""
    try:
        return set(TTFont(out).getBestCmap())
    except Exception:
        print(f"  no existing {os.path.basename(out)} — declared range only")
        return set()

def cut(src, out, spec, features):
    keep = floor(out)
    unicodes = expand(spec) | keep
    lst = os.path.join(tmp, "u.txt")
    with open(lst, "w") as fh:
        fh.write(",".join(f"U+{c:04X}" for c in sorted(unicodes)))
    subprocess.run([sys.executable, "-m", "fontTools.subset", src,
                    f"--unicodes-file={lst}", f"--layout-features={features}",
                    "--flavor=woff2", f"--output-file={out}"], check=True)
    f = TTFont(out)
    # the ratchet is only a promise until something checks it — the subsetter
    # can drop a requested codepoint the source face does not actually have.
    lost = keep - set(f.getBestCmap())
    if lost:
        raise SystemExit(f"{os.path.basename(out)} regressed: lost "
                         + " ".join(f"U+{c:04X}" for c in sorted(lost)))
    feats = set()
    for t in ("GSUB", "GPOS"):
        if t in f:
            for fr in f[t].table.FeatureList.FeatureRecord:
                feats.add(fr.FeatureTag)
    print(f"  {os.path.basename(out):44} {os.path.getsize(out):>6}B  "
          f"{len(f.getBestCmap()):>3} cps  zero={'yes' if 'zero' in feats else 'no'}")

for sub, spec in RANGES.items():
    cut(f"{tmp}/Quicksand.ttf",
        os.path.join(here, f"quicksand-{sub}-wght-normal.woff2"),
        spec, QUICKSAND_FEATURES)

cut(f"{tmp}/GochiHand.ttf",
    os.path.join(here, "gochi-hand-latin-400-normal.woff2"),
    RANGES["latin"], GOCHI_FEATURES)
PYEOF

echo "done. verify with: pnpm --filter @better-giving/ui build && grep -c woff2 dist/styles.css"
