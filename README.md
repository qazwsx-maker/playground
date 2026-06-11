# ⚒ HASHBORN

> **Every soul is forged from a hash · Rarity is king · No one is the same**

A pixel-art mini RPG that runs entirely in the browser — no build step, no backend, no install.
Play it on GitHub Pages.

## How it works

1. **Type any seed** — your name, a word, or roll a random UUID.
2. The seed is hashed with **SHA-256**, and that hash *deterministically* forges a hero:
   sprite, palette, class, element, stats, trait, name, title — everything.
3. The **first 4 bytes of the hash seal your rarity** (provably fair, verifiable by anyone):

   | Rarity | Odds | Stat multiplier |
   |---|---|---|
   | Common | 45% | ×1.00 |
   | Uncommon | 27.5% | ×1.14 |
   | Rare | 15% | ×1.30 |
   | Epic | 8% | ×1.52 |
   | Legendary | 3.5% | ×1.82 |
   | Mythic | 1% | ×2.25 |

4. Climb **The Spire** — a turn-based endless dungeon with class skills, traits,
   elemental matchups, and a boss every 5 floors.
5. Every soul you forge is remembered in the **Hall of Souls** (localStorage),
   along with its deepest climb.
6. **Share a link** (`?s=<seed>`) and anyone who opens it meets the *exact same hero*.

Same seed → same soul, for everyone, forever. Share seeds, not saves.

## Tech

- Vanilla HTML/CSS/JS, zero dependencies
- Procedural pixel sprites drawn on `<canvas>` (28×28 grid, auto-outlined, hue-shifted palettes)
- `crypto.subtle` SHA-256 with a pure-JS fallback
- Deployed via GitHub Actions → GitHub Pages on every push to `main`
