# Project context

_Maintained by the agent fleet — regenerated after planning, merges and escalations. Read this before changing code. Do not edit by hand; it is overwritten from the tracker._


## Goal
- can you create a simple bomberman game, 2 players max, must work in an browser

## Verified project facts
- **Stack:** node
- **Required checks:** npm run test, npm run build
- **Shared integration files:** src/index.ts, src/index.js, package.json

## Decisions (from the planning interview — binding)
- **Should the 2 players play locally on one keyboard/screen, or remotely in separate browsers over the network?** Local same-keyboard play only, no networking needed.
- **What tech stack should be used for the game (plain HTML5 Canvas/JS, or a framework/engine like Phaser, React, or a game engine)?** Plain HTML5 Canvas with vanilla TypeScript/JavaScript, no game engine.
- **Does any game data need to persist (high scores, match history, user accounts) or is it purely an in-session game with no storage?** No persistence needed; purely in-browser session state.
- **Which classic Bomberman features are in scope for this 'simple' version (destructible walls, power-ups, multiple levels/maps, sound effects)?** Single fixed map, destructible walls, bombs with explosion radius, and a win/lose screen; no power-ups, levels, or sound in v1.
- **How should the game be deployed/run (static site hosted anywhere, or served from a specific existing app/server in this repo)?** Standalone static site buildable and runnable locally, deployable to any static host.

## Build history
- EPIC-1-1 Scaffold Bomberman project — draft
- EPIC-1-2 Build fixed map and tile grid — draft
- EPIC-1-3 Implement player entities and two-player input handling — draft
- EPIC-1-4 Implement bomb placement and explosion mechanics — draft
- EPIC-1-5 Implement game state and win/lose detection — draft
- EPIC-1-6 Build canvas renderer and game loop — draft
- EPIC-1-7 Integrate game modules into playable browser entry point — draft
