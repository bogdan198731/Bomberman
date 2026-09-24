# Blast Arcade UI/UX implementation and validation

24 September 2026. Local implementation; no deployment, publication, messages, or external-service changes.

## What changed

The game library now comes earlier, with a smaller introduction, readable two-column phone cards, a four-column desktop grid, search, favorites, and recently played games when recorded matches exist. Games, Challenges, and Profile have separate destinations. Quick Play stays within Games, and hub navigation disappears during gameplay.

Help, Settings, Pause, and Results share one modal controller. It contains keyboard focus, makes the background inert, handles Escape, exposes dismissal buttons, and restores focus. Offline interruptions stop gameplay and leave an explicit pause when dismissed. Action games resume through a countdown; puzzles resume directly. Game setup remains reachable from Pause. Online Help and Settings explain that the match continues and release held input.

Phone layouts reserve space for boards, status, and touch controls. Short landscape layouts place controls beside the board where suitable. Blast Buddies has a separate setup panel and non-overlapping scoreboard. Sudoku keeps its number pad and tools in reach; Block Drop prioritizes the player's board. English and Romanian shared copy, mode labels, and guidance were updated.

Game routes now support browser Back/Forward, preserve library search/filter/scroll state, and handle invitations and connection cleanup. Shared metadata drives catalog filters, Quick Play, and launch modes. Paddle Clash is included in Solo; Same device disables its practice bot. Star Defender respects Same device launches and exposes the correct selected tab. Replay starts a new game in the selected mode/difficulty through the existing game handlers.

All 12 game implementations remain present. The saved-puzzle formats, game engines, and network protocol were retained. The obsolete hero artwork was removed from the layout; the visible game count comes from the metadata.

## Reproduction and automated checks

Before the shared interruption changes, the local browser reproduction showed Micro Racers continuing its countdown/bot play behind Help, and Tab leaving the guide. Source inspection confirmed the uncoordinated overlays, missing game-history transitions, and inconsistent Paddle Solo metadata described in the review.

Final checks on the modified source:

| Check | Actual result |
| --- | --- |
| `npm.cmd run build` | Passed; TypeScript compiled successfully. |
| `npm.cmd test` | 294 tests passed; 0 failed, cancelled, skipped, or todo. Includes a fresh build. |
| `git -c core.safecrlf=false diff --check` | Passed with no whitespace errors. |
| Captured browser error logs in the final host/guest test tabs | No error entries. This is not a claim about every browser or every session. |

The [raw final test output](D:/Test/Bomberman/UI_UX_TEST_RESULTS_2026-09-24.txt) is included.

Focused regressions exercise modal priority and the actual modal controller's initial focus, Tab/Shift+Tab containment, Escape, inert restoration, and focus restoration using a small DOM fixture. Other checks cover explicit resume after overlapping interruptions, online/idle interruption policy, exclusion of paused wall-clock time, route serialization, invitation parameters, the navigation controller's Back/Forward and library-state restoration, cleanup-event ordering, metadata consistency for every game/mode, and new Romanian labels. Existing structural layout checks were adjusted to the new navigation and stylesheet. Node fixtures do not substitute for browser interaction tests.

## Browser viewport inspection

All 12 games were visually inspected at the five sizes below using the local app and the existing **Always show** touch-control preference. Gameplay was started or a puzzle was continued; action games were often then paused with the pause dialog dismissed to keep the playfield stable for inspection. Checks included the board, essential status, and visible input controls, rather than only the lobby. Problems found during these checks were corrected and affected layouts were rechecked.

| Game | 360×640 | 390×844 | 844×390 | 820×1180 tablet | 1440×900 |
| --- | --- | --- | --- | --- | --- |
| Blast Buddies | Inspected | Inspected | Inspected | Inspected | Inspected |
| Țintar | Inspected | Inspected | Inspected | Inspected | Inspected |
| Paddle Clash | Inspected | Inspected | Inspected | Inspected | Inspected |
| Neon Snake Arena | Inspected | Inspected | Inspected | Inspected | Inspected |
| Mini Tanks | Inspected | Inspected | Inspected | Inspected | Inspected |
| Micro Racers | Inspected | Inspected | Inspected | Inspected | Inspected |
| Block Drop Duel | Inspected | Inspected | Inspected | Inspected | Inspected |
| 2048 | Inspected | Inspected | Inspected | Inspected | Inspected |
| Sudoku | Inspected | Inspected | Inspected | Inspected | Inspected |
| Șeptică | Inspected | Inspected | Inspected | Inspected | Inspected |
| Survival Arena | Inspected | Inspected | Inspected | Inspected | Inspected |
| Star Defender | Inspected | Inspected | Inspected | Inspected | Inspected |

The matrix is a layout inspection, not an exhaustive playthrough of every mode, difficulty, result, or language at every size. Small-board usability, simultaneous touch, and reach still need physical-device testing. At 360×640 the active Sudoku and 2048 boards and primary tools fit in the viewport; the latest Țintar checks also fit at 360×640 and 844×390. Block Drop's short-phone layout keeps the primary board and controls together with a smaller opponent preview.

Additional interactions actually checked:

- Help's initial focus and Tab/Shift+Tab containment, Settings focus cycling, Escape, and return focus. Micro Racers remained at its paused countdown while Help was open. Closing Help or Settings exposed the pending pause; closing Pause kept gameplay stopped. Explicit Resume showed the countdown.
- First-use guidance and its dismissal were exercised during the game checks. The stale delayed-guide path was also inspected in source; it is cancelled when views change.
- Micro Racers, Survival Arena, and Star Defender Results → Play again started a fresh session. Romanian Micro Racers replay also started a race countdown. This was not an end-to-end replay test for all 12 games.
- Same device launch from the library selected Star Defender co-op, displayed both fighters and controls, and fitted 360×640 and 844×390. Its selected-tab accessibility state was rechecked after the fix.
- Solo filtering included Paddle Clash. A library search for “Paddle” with Solo selected survived Back, and Forward returned to `#play/paddle`; the final check restored scroll position 245. Library state also survived reload during the mode checks. Games, Challenges, and Profile links selected their respective destinations.
- Sudoku displayed its saved-puzzle continuation flow. 2048 restored the saved score 4, tile 4 at row 2/column 1, tile 2 at row 3/column 1, and time 00:50. Continuing and pausing retained that board. Persistence is also covered by the existing unit tests.
- Two local browser clients joined a Blast Buddies invitation. Help explained that play continued; leaving showed disconnection to the other client, and browser Back rejoined the invitation.
- Two local clients joined a Paddle Clash invitation. The score advanced from 0–0 to 1–0 while the host had Help open. Dismissal restored the Help button without an offline pause. The guest left for Games and rejoined through Back. After fixing a missing control-container ID, the invited Coral player displayed only Coral's touch joystick. The mobile online status used a live indicator.
- Romanian checks covered the hub at all five sizes, guide/settings/pause/resume/results/replay in Micro Racers, Sudoku's long status/tool labels at 360×640, and Blast Buddies setup/scoreboard at phone and landscape sizes. These checks found and fixed the English-label-dependent Quick Play layout and translated-label overlap. English desktop keyboard guidance was also checked with touch controls set to Automatic.

Temporary tabs and the loopback-only test server were closed. The test browser's language and touch preference were restored to English and Automatic, and the viewport override was reset.

## Changed files

Shared behavior and navigation:

- [src/dialogs.ts](D:/Test/Bomberman/src/dialogs.ts) — modal coordination and accessible focus behavior.
- [src/session-state.ts](D:/Test/Bomberman/src/session-state.ts) — interruption state and active-time clock.
- [src/session-control.ts](D:/Test/Bomberman/src/session-control.ts) — pause, safe resume, setup access, and online status.
- [src/navigation.ts](D:/Test/Bomberman/src/navigation.ts) — routes, history, library snapshots, and departure events.
- [src/settings.ts](D:/Test/Bomberman/src/settings.ts) — shared dialog integration.
- [src/game-experience.ts](D:/Test/Bomberman/src/game-experience.ts) — help, player instructions, results, and replay.
- [src/index.ts](D:/Test/Bomberman/src/index.ts) — navigation integration, Blast Buddies timing, lobby, and cleanup.
- [src/game-room.ts](D:/Test/Bomberman/src/game-room.ts) — shared mode labels, invitation return, and room cleanup.

Library, presentation, and localization:

- [index.html](D:/Test/Bomberman/index.html) — shell, navigation, mode labels, artwork references, and control hooks.
- [public/arcade-ux.css](D:/Test/Bomberman/public/arcade-ux.css) — shared dialog, library, and viewport-specific game layouts; includes relocated Blast Buddies touch styles.
- [src/hub-layout.ts](D:/Test/Bomberman/src/hub-layout.ts) — Games/Challenges/Profile organization and recent games.
- [src/game-previews.ts](D:/Test/Bomberman/src/game-previews.ts) — code-generated game previews.
- [src/game-metadata.ts](D:/Test/Bomberman/src/game-metadata.ts) — shared game definitions and supported modes.
- [src/catalog.ts](D:/Test/Bomberman/src/catalog.ts) — metadata, filters, launch mode, and restored search state.
- [src/quick-play.ts](D:/Test/Bomberman/src/quick-play.ts) — shared metadata and accurate launch labels.
- [src/stats.ts](D:/Test/Bomberman/src/stats.ts) — metadata reuse while preserving the existing profile API.
- [src/invite.ts](D:/Test/Bomberman/src/invite.ts) — shared game names.
- [src/i18n.ts](D:/Test/Bomberman/src/i18n.ts) — English/Romanian shared copy and relevant dynamic labels.
- [service-worker.js](D:/Test/Bomberman/service-worker.js) — cache version and new shell modules/styles.

Game integration fixes:

- [src/paddle.ts](D:/Test/Bomberman/src/paddle.ts) — correct Same device behavior and assigned-player touch controls.
- [src/star.ts](D:/Test/Bomberman/src/star.ts) — requested launch mode and accessible selected-tab state.
- [src/sudoku.ts](D:/Test/Bomberman/src/sudoku.ts), [src/twenty48.ts](D:/Test/Bomberman/src/twenty48.ts), [src/tintar.ts](D:/Test/Bomberman/src/tintar.ts), [src/septica.ts](D:/Test/Bomberman/src/septica.ts) — preserve pause when a progress-loss confirmation is cancelled; clear it after an accepted restart.

Regression checks:

- [src/dialogs.test.ts](D:/Test/Bomberman/src/dialogs.test.ts)
- [src/session-state.test.ts](D:/Test/Bomberman/src/session-state.test.ts)
- [src/navigation.test.ts](D:/Test/Bomberman/src/navigation.test.ts)
- [src/i18n.test.ts](D:/Test/Bomberman/src/i18n.test.ts)
- [src/mobile-layout.test.ts](D:/Test/Bomberman/src/mobile-layout.test.ts)

This report and the raw test output are additional documentation. The pre-existing review documents were not edited. Compiled `dist` output was generated by the required build and is ignored by the repository.

## Remaining limits

- These were browser viewport checks, **not physical-device tests**. No iOS/Android hardware, multi-touch, mobile browser chrome, screen reader, or cross-browser compatibility certification was performed.
- The browser automation stalled on an existing native Sudoku restart confirmation. The cancel path is protected in code, but native confirmation cancellation was not verified end to end in the browser. It should be checked manually for Sudoku, 2048, Țintar, and Șeptică.
- Online tests used two clients on a local loopback server, not the public deployment, a remote network, or Quick Match with independent users. The existing authority model is unchanged: Blast Buddies runs its online simulation on the server; the other online games use a host simulation with server relay. This work did **not** migrate those games to server-side simulation.
- The complete viewport matrix used representative active states. All possible modal combinations, puzzle completions, game endings, network failures, difficulties, and both languages across every matrix cell were not exhaustively exercised. Some older per-game Romanian copy remains outside the shared-copy updates.
- No user research or claims about retention, conversion, accessibility conformance, or measured usability were made.
