# makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/eleanor-alt/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/eleanor-alt/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Palmira Heat** — an original open-world crime game that plays in a desktop browser from static files, no build step and no network. Explore the sun-soaked city of Palmira Bay on foot and by car: traffic and pedestrians fill the streets, any car can be stolen and driven, and the Palmira PD answers crimes with a five-star wanted system, pursuits and busts. A four-job story runs through it — steal a collector's convertible for Dee at her diner, move a crate out of the Old Port, drive a getaway from Palmira Trust, and settle the pier with the Corsairs at dusk — with combat on foot, a HUD and live minimap, a start screen, pause, and saving at the diner. Every name, vehicle, character and street is this game's own; all art is drawn in code and all sound is synthesised with WebAudio.

## Run it

```sh
node serve.ts   # then open http://localhost:8080 in a desktop browser (Chrome is ideal)
```

Hand the entry in the way the grader does:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # copies game/ and screenshots/ to out/ and writes out/dossier.json
```

Controls: WASD/arrows to move and drive, mouse to aim, click to shoot, F to steal or leave a car, Shift to sprint, Space for the handbrake, Esc to pause, M to mute.

---

<sub>Entered on [make.fun](https://make.fun/?ref=mfztwn6d&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
