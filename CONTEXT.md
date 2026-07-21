# Project context

_Maintained by the agent fleet — regenerated after planning, merges and escalations. Read this before changing code. Do not edit by hand; it is overwritten from the tracker._


## Goal
- can you create a simple bomberman game, 2 players max, must work in an browser

## Verified project facts
- **Stack:** node
- **Required checks:** npm run test, npm run build
- **Shared integration files:** package.json, package-lock.json, src/index.ts, src/index.js

## Decisions (from the planning interview — binding)
- **Should the 2 players play locally on one keyboard/screen, or remotely in separate browsers over the network?** Local same-keyboard play only, no networking needed.
- **What tech stack should be used for the game (plain HTML5 Canvas/JS, or a framework/engine like Phaser, React, or a game engine)?** Plain HTML5 Canvas with vanilla TypeScript/JavaScript, no game engine.
- **Does any game data need to persist (high scores, match history, user accounts) or is it purely an in-session game with no storage?** No persistence needed; purely in-browser session state.
- **Which classic Bomberman features are in scope for this 'simple' version (destructible walls, power-ups, multiple levels/maps, sound effects)?** Single fixed map, destructible walls, bombs with explosion radius, and a win/lose screen; no power-ups, levels, or sound in v1.
- **How should the game be deployed/run (static site hosted anywhere, or served from a specific existing app/server in this repo)?** Standalone static site buildable and runnable locally, deployable to any static host.

## Module map
- `index.html` — npm install, npm run build, and npm run test all succeed against a minimal TypeScript + Canvas static-site scaffold with an empty playable-page shell. (EPIC-1-1)
- `package-lock.json` — npm install, npm run build, and npm run test all succeed against a minimal TypeScript + Canvas static-site scaffold with an empty playable-page shell. (EPIC-1-1)
- `package.json` — npm install, npm run build, and npm run test all succeed against a minimal TypeScript + Canvas static-site scaffold with an empty playable-page shell. (EPIC-1-1)
- `src/index.js` — npm install, npm run build, and npm run test all succeed against a minimal TypeScript + Canvas static-site scaffold with an empty playable-page shell. (EPIC-1-1)
- `src/index.test.ts` — A state module tracks each player's alive status and transitions the game to a win screen for the surviving player or a draw screen if both die, verifiable by unit tests. (EPIC-1-5)
- `src/index.ts` — A renderer draws the map, players, bombs, and explosions onto an HTML canvas each animation frame via a requestAnimationFrame-driven loop, given plain data objects as input. (EPIC-1-6)
- `tsconfig.json` — npm install, npm run build, and npm run test all succeed against a minimal TypeScript + Canvas static-site scaffold with an empty playable-page shell. (EPIC-1-1)

## Gotchas the fleet has learned
- **kb://epic-1-1** Scaffold Bomberman project: EPIC-1-1 shipped. Goal: npm install, npm run build, and npm run test all succeed against a minimal TypeScript + Canvas static-site scaffold with an empty playable-page shell. Files: index.html, package-lock.json, package.json, src/index.js, src/index.test.ts, src/index.ts, tsconfig.json. Attempts: 2.
- **kb://epic-1-1-gotcha** EPIC-1-1 gotcha (2 attempts): A failure preceded success here:
CI checks failed:
$ npm run build

> bomberman@0.1.0 build
> tsc

src/index.test.ts(1,22): error TS2307: Cannot find module 'node:test' or its corresponding type declarations.
src/index.test.ts(2,34): error TS2307: Cannot find module 'node:assert' or its corresponding type declarations.

- **kb://epic-1-2** Build fixed map and tile grid: EPIC-1-2 shipped. Goal: A pure module produces a fixed-size grid with indestructible border/pillar walls, a scattering of destructible walls, and open floor tiles, verifiable by unit tests. Files: src/index.test.ts, src/index.ts. Attempts: 1.
- **kb://epic-1-3** Implement player entities and two-player input handling: EPIC-1-3 shipped. Goal: Two players can move on the grid via distinct keyboard schemes (WASD+Space vs Arrows+Enter) with movement blocked by walls, verifiable by unit tests against a mock map. Files: src/index.test.ts, src/index.ts. Attempts: 1.
- **kb://epic-1-4** Implement bomb placement and explosion mechanics: EPIC-1-4 shipped. Goal: Placing a bomb detonates it after a timer, producing a cross-shaped explosion that destroys destructible walls and is blocked by indestructible walls, verifiable by unit tests. Files: src/index.test.ts, src/index.ts. Attempts: 3.
- **kb://epic-1-4-gotcha** EPIC-1-4 gotcha (3 attempts): A failure preceded success here:
Recovery agent classified the problem as repaired; deterministic checks and independent review must run again.
RECOVERY: repaired
- **kb://epic-1-5** Implement game state and win/lose detection: EPIC-1-5 shipped. Goal: A state module tracks each player's alive status and transitions the game to a win screen for the surviving player or a draw screen if both die, verifiable by unit tests. Files: src/index.test.ts, src/index.ts. Attempts: 1.
- **kb://epic-1-6** Build canvas renderer and game loop: EPIC-1-6 shipped. Goal: A renderer draws the map, players, bombs, and explosions onto an HTML canvas each animation frame via a requestAnimationFrame-driven loop, given plain data objects as input. Files: src/index.ts. Attempts: 1.

## Build history
- EPIC-1-1 Scaffold Bomberman project — done (2 attempts)
- EPIC-1-2 Build fixed map and tile grid — done
- EPIC-1-3 Implement player entities and two-player input handling — done
- EPIC-1-4 Implement bomb placement and explosion mechanics — done (3 attempts)
- EPIC-1-5 Implement game state and win/lose detection — done
- EPIC-1-6 Build canvas renderer and game loop — done
- EPIC-1-7 Integrate game modules into playable browser entry point — ready
