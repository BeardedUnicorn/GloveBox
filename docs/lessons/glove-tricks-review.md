# Glove tricks review

This is a review of GloveBox's built-in lesson library (`src/lessons/builtin.ts`), checked against how
glovers actually teach. It says what the 12 original lessons got right and wrong, what replaced
them, and which tricks were left out and why. It is written for whoever maintains the library next.

Everything here comes from tutorials and guides, not from tuning on real gloves. See
[Not yet verified](#not-yet-verified).

## Contents

1. [How the research was done](#how-the-research-was-done)
2. [Vocabulary corrections](#vocabulary-corrections)
3. [Verdicts on the original lessons](#verdicts-on-the-original-lessons)
4. [The new library](#the-new-library)
5. [Trick catalog](#trick-catalog)
6. [Considered and not added](#considered-and-not-added)
7. [Scoring ideas for later](#scoring-ideas-for-later)
8. [How teachers order the skills](#how-teachers-order-the-skills)
9. [Best tutorial per move](#best-tutorial-per-move)
10. [Not yet verified](#not-yet-verified)

---

## How the research was done

Three passes, one per area:

- fundamentals and finger work;
- tracers and tutting;
- contours, isolations, light-show structure and battle judging.

**YouTube.** About 110 tutorials were found. For roughly 70 of them the content itself was read:
YouTube's own auto-captions (through the player's "Show transcript" panel), or the description and
chapter list. The rest are known by title only. Transcript sites (youtubetranscript.com and similar)
returned nothing.

**Written sources:**

- the [Glow LEDs Academy](https://www.glow-leds.com/academy), mostly short summaries of tutorials by
  Puppet and StarStream, and its
  [concept dictionary](https://www.glow-leds.com/academy/tutorials/concept_term_dictionary);
- the [GloFX learning center](https://glofx.com/led-flow-arts-learning-center/led-gloving-tutorials/);
- [Futuristic Lights](https://futuristiclights.com/blogs/news/what-is-gloving);
- [Euphorium](https://www.euphorium.au/blogs/guides/what-is-gloving-a-beginners-guide-to-led-light-shows);
- press coverage of the International Gloving Championship (IGC);
- Maranan, Schiphorst, Bartram & Hwang, "Expressing Technological Metaphors in Dance Using Structural
  Illusion from Embodied Motion" (C&C 2013), an academic paper on liquid, digits and tutting
  ([PDF](https://api.repository.upou.edu.ph/api/core/bitstreams/39b65e59-b4bc-407b-873b-223232a77167/content)).

### Caveats

- **Machine captions.** Auto-captions get words wrong, and some were unusable. Long videos were
  sometimes read only in part.
- **Nobody watched the footage.** Every "from the front" description below is reconstructed from the
  teachers' narration and written definitions. Treat it as a strong hint, not a measurement.
- **Unreadable sources:**
  - Reddit, including the r/gloving beginner wiki. Anything credited to Reddit comes from search-result
    summaries.
  - Vimeo, which was behind a bot check.
  - WonderHowTo (403), web.archive.org, and forum.gloving.com.
  - One "Gloving 101" PDF that downloaded but couldn't be opened.
- **Teachers disagree on levels.** The same move is "beginner" in one source and "intermediate" in
  another. The tiers below follow the consensus order, not any one source.

---

## Vocabulary corrections

These changed the library more than any single trick did.

| Term                      | What it means in gloving                                                                                                                                                                                           | What it meant to GloveBox                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Finger roll**           | Fingers open one at a time, stay open, then close one at a time. The classic beginner version is a relay across both hands.                                                                                        | Every finger briefly curls and comes back, on both hands at once.                              |
| **Finger wave**           | Fingers stay open while a dip passes through them. The r/gloving wiki (via search summary) notes people mix the two terms up.                                                                                      | (Not used.) Our old "finger rolls" was really this.                                            |
| **Tracer**                | A glove **light mode**: a flashing pattern that leaves visible trails. It is what makes circles read as solid lines ([Glow LEDs dictionary](https://www.glow-leds.com/academy/tutorials/concept_term_dictionary)). | The name of tier 2, a family of moves.                                                         |
| **Figure 8**              | One shared 8 drawn by both hands, one following the other, often with the wrists joined.                                                                                                                           | A separate 8 on each side.                                                                     |
| **Staircase**             | "Finger stairs" / "infinity stairs": fingertips stepping from finger to finger.                                                                                                                                    | A hand path shaped like stairs.                                                                |
| **Contour, rails, folds** | Liquid-dance terms (tracing an imaginary object or plane). Not found in any gloving glossary, though glovers do liquid.                                                                                            | A tier name, and a flat slide called a "plane contour".                                        |
| **Fan**                   | A sweeping wrist turn of an open hand inside a figure 8 (EmazingLights, The Lighthouse).                                                                                                                           | The name of the spread-fingers layout (`fan`). Fine as code, but don't name a lesson after it. |
| **Orbit**                 | A separate LED flow toy. "Tracer orbit" videos are orbit tutorials, not gloving.                                                                                                                                   | (Not used.)                                                                                    |

**Not established gloving terms** (no source used them as move names):

- spirals, pendulums, rainbows/arcs, pyramids, frames, chains;
- wraps, waterfall, flats, cones, pops, zooms, layering, hats, breaks;
- whirlwinds, turbines, "the bird", "the snake";
- ball contour, spinning globe, cube contour, glass, tilts, cuts, blocks.

If a lesson ever uses one of these, label it as GloveBox's own name.

**Other notes:**

- **Roll direction.** Glovers name it index-first ("pointer to pinky") or pinky-first. The thumb is
  usually held out as an anchor or tucked, not part of the roll.
- **Isolation means two things:**
  - moving one finger on its own (finger isolation: splits, digits);
  - keeping a point still in space while the hand moves around it (point isolation).

---

## Verdicts on the original lessons

| Original lesson                | Verdict                                                             | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **finger-rolls** (tier 1)      | Replaced by **upward-roll**; its motion lives on as **finger-wave** | It was a wave, not a roll: each finger dipped and returned. Both hands moved at once, the thumbs rolled too, and the hands were apart. Every curriculum starts with a relay: one hand opens, the other continues, the bridge fingers (pinkies) stay touching, thumbs stay still ([Lighthouse](https://www.youtube.com/watch?v=SG-w8ubvJNU), [EmazingLights](https://www.youtube.com/watch?v=5FuMppADqQg), [Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc)). |
| **ten-light-wave** (tier 1)    | Replaced by **downward-roll**                                       | A row of ten lights with a wave is closest to the palms-down roll, which GloFX calls the "finger wave". But in that move the thumbs are tucked into the fists, so they shouldn't be lights in the row, and the roll bridges at the index fingers.                                                                                                                                                                                                                 |
| **slow-circles** (tier 1)      | Replaced by **wrist-flails**                                        | Small mirrored circles are a flail with no name. A flail keeps the fingers together and points them outward as the hand swings ([Fry & Cire](https://www.youtube.com/watch?v=0-BN7yahyKs), [Lighthouse](https://www.youtube.com/watch?v=7mldubZtL6k)).                                                                                                                                                                                                            |
| **mirror-tracers** (tier 2)    | Removed                                                             | It is the "together-opposite" flail pattern, now inside **flail-patterns**. "Tracer" is a light mode.                                                                                                                                                                                                                                                                                                                                                             |
| **opposite-tracers** (tier 2)  | Reworked as **split-flails**                                        | Same motion: same direction, half a loop apart. Poi and flail theory calls it split-same ([0MrFreckles0](https://www.youtube.com/watch?v=cQgDS_mT7fQ)).                                                                                                                                                                                                                                                                                                           |
| **infinity** (tier 2)          | Replaced by **figure-8**                                            | The figure 8 is one shared 8 with one hand following the other ([Sharky](https://www.youtube.com/watch?v=tCICnGoLq7g), [Lighthouse](https://www.youtube.com/watch?v=HF8fd5EeMd8), [Gummy & Ha-Ha](https://www.youtube.com/watch?v=0PUxXoJBenU)).                                                                                                                                                                                                                  |
| **vertical-infinity** (tier 2) | Removed                                                             | No source teaches a vertical 8.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **tut-box** (tier 3)           | Reworked as **king-tut-box**                                        | Already close to a King Tut box: flat hands, corners held, 90° wrist angles. It needed the real name, tips about flat angles and lifted elbows, and its one cue actually shown.                                                                                                                                                                                                                                                                                   |
| **tut-staircase** (tier 3)     | Replaced by **grid-slides**                                         | Gloving staircases happen at the fingertips. A hand sliding along straight lines and landing on points is Puppet's "do less" grid drill.                                                                                                                                                                                                                                                                                                                          |
| **ball-contour** (tier 4)      | Kept, fixed                                                         | Holding an imaginary ball is a real liquid idea. But contours need a steady speed (Maranan et al.), and the lesson held each angle and snapped between them. It now rocks smoothly.                                                                                                                                                                                                                                                                               |
| **plane-contour** (tier 4)     | Replaced by **grid-slides**                                         | A flat hand sliding without tilting is a slide or linear isolation. Liquid "planes" and folds turn the hand to show both sides, which is mostly depth.                                                                                                                                                                                                                                                                                                            |
| **flow-combo** (tier 5)        | Reworked as **roll-to-whip**                                        | "Rolls into a wave into tracers" used the misnamed parts. The standard bridge in real shows is roll into whip ([Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc), [LucyDrop](https://www.youtube.com/watch?v=Qxc07l0uifA)).                                                                                                                                                                                                                                   |

**Gaps outside the lessons themselves:**

- **Coaching never reached the learner.** The schema had `cues`, and tut-box had one ("Stop on every
  corner"), but no screen, controller or metronome read them. The new library adds per-lesson tips on
  the Ready card and timed text cues during practice.
- **Uneven tiers.** Tiers 3 and 4 had two lessons each and tier 5 had one, so a tier could open after
  very little practice.
- **Hands running into each other.** Sampling every lesson over a loop showed the two hands' lights
  meeting (zero distance) in mirror-tracers, opposite-tracers, infinity and flow-combo. A real performer
  can't follow targets that pass through each other, and Lit-mode tracking loses fingers when hands
  overlap. The new library keeps the hands apart everywhere except the finger box, where fingertips
  touch on purpose, and a test holds it to that.

---

## The new library

Twenty-two lessons in the same five tiers. Two tiers are renamed, and the order follows the consensus
ladder in [How teachers order the skills](#how-teachers-order-the-skills). A few moves had to be
adapted to what one front camera can see; each table says where.

### What the move builder gained

The new moves needed a few optional additions to the lesson format (`src/lessons/schema.ts`). Each one
defaults to the old behaviour, so older lessons and `.glovebox.json` files are unchanged.

- **Rolls** (`roll`):
  - `style: 'roll'` closes each finger in turn and holds it closed, then opens it half a cycle later.
    The default, `'wave'`, is the old dip-and-return.
  - `fingers` picks which fingers roll, so the thumbs can hold still.
  - `spread` squeezes a hand's turns into part of the cycle.
  - `offset` moves the roll alone, not the hand. With `spread: 0.25` and the other hand's `offset` a
    quarter later, the roll is handed across: a relay. Because the hand doesn't move with it, a relay
    still works while both hands travel (the roll crawl).
- **Finger shapes that change** (`layout: { steps, holdFrac }`): shapes held in turn and eased into, for
  splits, the finger box, fixed 45s and the light show's burst.
- **Smooth turns** (`rotation.holdFrac`): `0` sweeps steadily between angles (the ball contour, point
  isolation); the default `0.5` keeps tutting's hold-then-snap.
- **Coaching** (`tips`): shown on the Ready card. Text `cues`, which existed before but were never shown,
  now appear on the stage while a move plays, in practice and in Watch.

Pivots need no new option: a custom finger shape that puts the pivot fingertip at the palm point turns
about that fingertip (clocking, point isolation, whips).

### Tier 1 · Foundations

Rolls and finger control. Every curriculum starts here.

| id              | Move                                                                                                                                                           | Notes                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `finger-wave`   | Fingers open, palms to the camera. A dip runs from the left pinky to the left index, crosses, then runs from the right index to the right pinky. Thumbs still. | The easiest relay: fingers never fully close. Keeps the old lesson's motion under its correct name.                                                |
| `upward-roll`   | Underhand roll. Pinky edges together, thumbs out and still. Open one finger at a time across both hands, then close in the same order.                         | The first move in nearly every curriculum.                                                                                                         |
| `downward-roll` | Overhand roll. Fists side by side with the index fingers touching, thumbs tucked. A row of eight tips lifts and drops across both hands.                       | Thumbs aren't scored: they are tucked out of sight.                                                                                                |
| `splits`        | Compressions. Split the pinky off (3+1), then 2+2 (the "Spock"), then 1+3, then back together, one split held each beat.                                       | A finger-control drill LucyDrop treats as a basic. The gap is small on camera, so the splits are drawn a little wider than a real hand makes them. |
| `roll-crawl`    | Both hands slide sideways while rolling and freeze on two fists between steps, then come back.                                                                 | Blitzen's intermediate stop-and-go crawl. It sits last in the tier as the bridge to moving shapes.                                                 |

### Tier 2 · Flails & whips (was "Tracers")

Circles and figure 8s, the shapes the tracer light mode makes visible.

| id               | Move                                                                                                                     | Notes                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wrist-flails`   | Fingers together, each hand swinging a continuous circle from the wrist, mirrored.                                       | Never stops: flails have no breaks.                                                                                                                                                                                                 |
| `split-flails`   | Both hands circle the same way, half a loop apart, side by side.                                                         | The old opposite-tracers motion with the fingers pointing outward.                                                                                                                                                                  |
| `flail-patterns` | Together-same, together-mirrored, split-mirrored and split-same: two circles (four beats) each.                          | The four two-hand patterns teachers drill (from poi). Hands sit side by side so they never overlap. The order lets the left hand change pattern where it already is, so only the together ↔ split changes need a one-beat catch-up. |
| `figure-8`       | One horizontal 8 in front of the chest. The follower hand trails a quarter loop behind.                                  | Adapted: real figure 8s join the wrists and cross the hands, which hides fingers from the camera. The trailing hand keeps both hands visible.                                                                                       |
| `whips`          | The four fingers roll open around a still thumb and sweep one circle facing the camera, then close. The hands alternate. | Only the face-on circle is scored. The push toward the receiver is depth the camera can't see.                                                                                                                                      |

### Tier 3 · Tutting

Right angles, holds and landing on the beat.

| id             | Move                                                                                                            | Notes                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `king-tut-box` | Flat hands bent 90° at the wrist trace a box, holding every corner.                                             | The old tut-box, renamed and coached.                                                                                                       |
| `grid-slides`  | A still hand shape slides along straight grid lines and lands each point on the beat. Nothing tilts.            | Replaces staircase and plane contour.                                                                                                       |
| `box-move`     | Both hands go round a 2×2 box, like turning a steering wheel, with a roll on each corner.                       | Simplified: the real move flips the palms and touches the hands ([Puppet](https://www.glow-leds.com/academy/tutorials/box_move_by_puppet)). |
| `finger-box`   | Two Ls joined thumb to thumb (the "field goal"). One hand slides up and turns to close a rectangle, then opens. | The basic finger tut.                                                                                                                       |
| `tracing`      | The left hand holds an L still. The right index slides up the left thumb and index, holding at each corner.     | Tracing is the core of finger tutting. The still hand must not float.                                                                       |

### Tier 4 · Tech & contours (was "Contours")

Fixed points, pivots and exact finger shapes.

| id                | Move                                                                                                               | Notes                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `clocking`        | Each index finger is a clock hand ticking around its own knuckle, one angle per beat, over the top and back.       | Adapted: glovers often use the other hand as the clock face, which puts one hand in front of the other. Here each hand keeps its own centre so the camera sees both. Snaps and holds suit the camera well. |
| `point-isolation` | The pinched thumb and index stay dead still while the rest of the hand swings around them.                         | Puppet's intermediate tutting tool. The still point is scored like any other target.                                                                                                                       |
| `fixed-45s`       | Each finger bends a step more than the last, so the tips form a 45° line. Mirrored hands make a V, then flip to Λ. | A tech form. The bend itself is partly depth; the line of tips is clear from the front.                                                                                                                    |
| `ball-contour`    | The hands hold an imaginary ball and rock it at a steady speed. The ball never changes size.                       | Kept from the original library, with smooth motion instead of held steps.                                                                                                                                  |

### Tier 5 · Combos

| id                 | Move                                                                                                                                                                              | Notes                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `roll-to-whip`     | Upward roll, into whips, into wrist flails.                                                                                                                                       | Rolls are the standard bridge into whips.                                                                                                                                                        |
| `tech-combo`       | Finger box, into tracing, into clocking.                                                                                                                                          | One tech set built from tier 3 and 4 shapes.                                                                                                                                                     |
| `first-light-show` | 36 beats shaped like a show: intro (an upward roll at centre), build (wrist flails), climax (tips gathered to a point burst open, into split flails), resolution (a finger wave). | Follows the Glow LEDs [anatomy of a light show](https://www.glow-leds.com/academy/tutorials/anatomy_of_the_lightshow) and Puppet's [beginner show](https://www.youtube.com/watch?v=OuZM-kS7ZZU). |

---

## Trick catalog

**How to read each entry:**

- **Level** is the consensus where sources agree, or a range where they don't.
- **2D tracking** is how well the move shows up as fingertip positions from one front camera:
  - **Good:** tips stay visible and move in the plane facing the camera.
  - **Partial:** some depth, overlap or palm flips.
  - **Poor:** relies on depth, hidden fingers or light modes.
- **In GloveBox** names the lesson that teaches it, or says it isn't in the library.

### Rolls and waves

**Upward finger roll** (underhand roll, basic roll)

- **From the front:** hands side by side with the pinky edges touching and thumbs out. One hand opens
  index→pinky, the other continues pinky→index, then they close in the same order. Open, the eight
  tips form a U. It reads as one wave crossing eight lights.
- **Level:** beginner. It comes first or nearly first everywhere.
- **Tips:**
  - The pinkies, where the roll crosses hands, move together and stay touching.
  - Open each finger all the way; clean rolls come from reach, not speed.
  - Go slow to find the finger that moves early, and practise leading with either hand.
- **2D tracking:** Good when the fingers point up toward the viewer. Partial when they point straight
  at the camera, because the curl then goes into depth.
- **In GloveBox:** `upward-roll`.
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=SG-w8ubvJNU),
  [Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc),
  [Sharky](https://www.youtube.com/watch?v=5FuMppADqQg),
  [Puppet tips](https://www.youtube.com/watch?v=QetvgC3PAFw)

**Downward finger roll** (overhand roll; GloFX and Frosty call it the "finger wave")

- **From the front:** palms down, thumbs tucked, fists together with the index fingers touching. Tips
  lift out of a horizontal row and drop back, across both hands, symmetric about the middle.
- **Level:** beginner, usually taught right after the upward roll.
- **Tips:**
  - The index fingers touch and follow each other.
  - Look for the U shape, symmetric in the middle.
  - Tuck the thumbs so the fingers have something to wrap around.
- **2D tracking:** Partial leaning Good. The lift is mostly up and down, with some depth.
- **In GloveBox:** `downward-roll`.
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=SG-w8ubvJNU),
  [Sharky](https://www.youtube.com/watch?v=5FuMppADqQg),
  [Glow LEDs (Puppet)](https://www.glow-leds.com/academy/tutorials/overhand_fingerrolls_by_puppet)

**Finger wave** (wave; the terms overlap)

- **From the front:** the fingers stay open while a dip passes through them one after another.
- **Level:** beginner.
- **Tips:**
  - Keep the fingers you aren't moving fully open.
  - Let the wave cross between hands without a gap.
- **2D tracking:** Good with palms to the camera.
- **In GloveBox:** `finger-wave`.
- **Sources:** r/gloving wiki (search summary only),
  [Glow LEDs dictionary](https://www.glow-leds.com/academy/tutorials/concept_term_dictionary),
  [Jest](https://www.youtube.com/watch?v=PNoT0SPvAC8)

**Roll variants: both hands at once, reversed, paused**

- **From the front:** the same tip motions, but both hands roll together in mirror, or the direction
  reverses, or the roll pauses partway.
- **Level:** beginner to intermediate.
- **Tips:** train both directions and both lead hands; vary where you pause.
- **2D tracking:** Good.
- **In GloveBox:** not its own lesson. The tips on the roll lessons suggest the variants.
- **Sources:** [Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc) (5:47),
  [Lighthouse experts](https://www.youtube.com/watch?v=DYvWh45BRpw)

**Roll crawl** (rolls while moving)

- **From the front:** the hands travel while a roll ripples through. In Blitzen's version they freeze
  on two fists between steps. Going up, the index fingers lead; going down, the pinkies.
- **Level:** intermediate.
- **Tips:**
  - Move only while the fingers roll; stop when both hands are fists.
  - Keep the bridge fingers connected while travelling.
- **2D tracking:** Good.
- **In GloveBox:** `roll-crawl`.
- **Sources:** [Blitzen](https://www.youtube.com/watch?v=W1mwrHpua4M),
  [Lighthouse experts](https://www.youtube.com/watch?v=DYvWh45BRpw),
  [LucyDrop](https://www.youtube.com/watch?v=VzuJAxKp3PI)

**Roll transitions, continuous/infinite, reverse, crossover, stacked, closed-wave and split rolls**

- **From the front:** the hands flip between up and down rolls, swap over and under each other, cross
  at the wrists, or stack, while the roll keeps travelling.
- **Level:** late beginner to advanced. The Glow LEDs dictionary lists the infinite roll as advanced.
- **Tips:**
  - Keep the "middles" (the bridge fingers) connected.
  - Aim for a symmetric U.
  - Precise stacking is what lets you move a roll around.
- **2D tracking:** Partial. The hands overlap or cross, which hides fingers from the camera and
  confuses which hand is which.
- **In GloveBox:** not added (overlap). Split rolls, where the hands roll apart, are Good and could be
  added later.
- **Sources:** [Lighthouse Roll 2](https://www.youtube.com/watch?v=1CCbhWHCBNw),
  [Misogi](https://www.youtube.com/watch?v=gX5ayBPJfpc),
  [LucyDrop continuous](https://www.youtube.com/watch?v=grtN-cxT_K8)

### Flails, figure 8s, whips and circles

**Flail** (wrist flail, elbow flail)

- **From the front:** fingers together, thumb in. The whole hand swings one continuous circle facing
  the viewer, so the five lights draw one thick ring. A wrist flail is small and an elbow flail is big.
  There are no stops.
- **Level:** beginner to intermediate (sources disagree).
- **Tips:**
  - Never break the circle; faster only looks better if it stays round.
  - Extend the arm a little to take strain off the wrist.
  - Vary speed, size and placement through a show.
- **2D tracking:** Good when face-on. A circle tipped toward the viewer collapses to a line.
- **In GloveBox:** `wrist-flails`.
- **Sources:** [Fry & Cire](https://www.youtube.com/watch?v=0-BN7yahyKs),
  [Lighthouse](https://www.youtube.com/watch?v=7mldubZtL6k),
  [LucyDrop](https://www.youtube.com/watch?v=947mnaBUQx4),
  [StarStream](https://www.glow-leds.com/academy/tutorials/flail_tutorial_by_starstream)

**Two-hand flail patterns** (together/split × same/opposite)

- **Definitions:** "together" = same start point; "split" = different start points; "same" or
  "opposite" = travel direction.
  - Together-opposite is mirror-symmetric.
  - Split-same is two hands chasing round the same circle.
  - Split-opposite crosses twice per loop.
- **Level:** intermediate. The opposite patterns are harder.
- **Tips:**
  - Drill all four, in both directions.
  - If you lose track, return to the four anchor points (top, right, bottom, left).
- **2D tracking:** Good side by side. Partial on one shared circle, where the hands overlap.
- **In GloveBox:** `split-flails`, `flail-patterns`.
- **Sources:** [0MrFreckles0](https://www.youtube.com/watch?v=cQgDS_mT7fQ),
  [Lighthouse](https://www.youtube.com/watch?v=7mldubZtL6k),
  [Home of Poi terminology](https://www.homeofpoi.com/us/lessons/teach/POI/Poi-terminology/Poi-terminology)

**Antispin and flower flails**

- **From the front:** each hand traces a petalled flower. Antispin means the hand turns against the
  circle; the number of petals depends on the spin ratio.
- **Level:** advanced.
- **2D tracking:** Good in principle.
- **In GloveBox:** not added. A four-petal rose needs a new path type, and the poi definitions are
  second-hand.
- **Sources:** [Vincent van Flow PoC #1](https://www.youtube.com/watch?v=HIV160OQIvc),
  [MIT Admissions on poi curves](https://mitadmissions.org/blogs/entry/flowers-of-fire-and-light/)

**Figure 8** (figure eights, infinity loop; liquid names: lotus hands, tea cup)

- **From the front:** one horizontal ∞ in front of the chest. The lead hand traces it and the other
  follows. The hands cross at the centre and swap top and bottom each pass. It can be small (wrists
  together) or big (full arms).
- **Level:** beginner. Gummy & Ha-Ha call it the most common move in light shows.
- **Tips:**
  - Let the elbows do the work, not the wrists.
  - Keep rotating one way; don't reverse partway.
  - Move it around the space only once it's clean.
- **2D tracking:** Partial. The path faces the camera, but the hands cross and touch at the centre.
- **In GloveBox:** `figure-8`, adapted so the follower trails a quarter loop behind and the hands never
  overlap.
- **Sources:** [Sharky](https://www.youtube.com/watch?v=tCICnGoLq7g),
  [Lighthouse](https://www.youtube.com/watch?v=HF8fd5EeMd8),
  [Gummy & Ha-Ha](https://www.youtube.com/watch?v=0PUxXoJBenU),
  [Glow LEDs (Puppet)](https://www.glow-leds.com/academy/tutorials/figure_8s_by_puppet)

**Whips** (forward/backward, overhand/underhand, continuous)

- **From the front:** a finger roll turned around the thumb. The four fingertips spread and sweep one
  circle around a nearly still thumb, then close. The hand pushes toward the viewer while opening.
  Continuous whips alternate hands.
- **Level:** intermediate (GloFX, Glow LEDs); Puppet's beginner course includes them.
- **Tips:**
  - Point the thumb at the viewer; it marks the centre and barely moves.
  - Palm faces the receiver, not off to the side.
  - Bend the wrist back fully; half-bent whips look small.
  - Practise on a solid or "dops" mode, not strobe, so mistakes show.
- **2D tracking:** Partial. The circle is face-on but the push is depth, and closed fists hide the tips.
- **In GloveBox:** `whips` (face-on circle only).
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=sYHkxHKd_PA),
  [Panda & Stunna](https://www.youtube.com/watch?v=IOvd50fnfEY),
  [Frosty](https://www.youtube.com/watch?v=Fk_Fuh_8c2U),
  [How To Glove](https://www.youtube.com/watch?v=aliY5EhUrqg)

**Circle move**

- **From the front:** one unbroken ring drawn by the hands taking turns. Each hand closes, flips at
  the side, and reopens. The pointers meet at the bottom and the pinkies at the top. The hands start
  crossed, or stacked with the wrists together.
- **Level:** intermediate. Prerequisites: rolls and continuous whips in both directions.
- **Tips:**
  - Seal the seams at the top and bottom, or the ring looks like a blob.
  - Practise starting anywhere, stopping and reversing.
  - Go slow; separating the hands while learning is fine.
- **2D tracking:** Partial. Stacked and crossed hands, palms flipping, fingers closing.
- **In GloveBox:** not added (overlap). The best candidate for a recorded lesson.
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=KhTmzJlzp-4),
  [Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc) (12:12),
  [LucyDrop](https://www.youtube.com/watch?v=2BfOBVhbAz4),
  [Po](https://www.glow-leds.com/academy/tutorials/short_tutorial_circle_move_by_po)

**Tunnels and warps**

- **From the front:** two-handed whips pushed toward and away from the receiver. The trails look like
  rings growing and shrinking, like looking down a tunnel.
- **Level:** intermediate to advanced.
- **2D tracking:** Poor to Partial. Mostly depth, with stacked hands.
- **In GloveBox:** not added.
- **Sources:** [Frosty](https://www.youtube.com/watch?v=Fk_Fuh_8c2U),
  [Blitzen](https://www.youtube.com/watch?v=lLgIu_Fvq0c),
  [Ambience Lights](https://www.youtube.com/watch?v=TbmHYHyvpwE) (title only)

### Tutting

**King Tut** (hand and arm tutting)

- **From the front:** hands bent 90° at the wrist so the fingers point horizontal or vertical. They
  slide, hinge at the elbow and rotate, holding at each angle. The boxes are big.
- **Level:** beginner to intermediate.
- **Tips:**
  - Angles flat and straight; no "duck" hands bent at the knuckles.
  - Lift the elbows fully.
  - Learn with fists first, then flat hands, then twists.
- **2D tracking:** Partial overall, but Good for a box in the face-on plane. Many King Tut slides go
  forward and back.
- **In GloveBox:** `king-tut-box`.
- **Sources:** [Munch](https://www.youtube.com/watch?v=j4SpxzF80Fk),
  [Frosty](https://www.youtube.com/watch?v=62UHR5OvNW8),
  [LucyDrop](https://www.youtube.com/watch?v=ipWR2yo4oX4),
  [GloFX](https://www.youtube.com/watch?v=CWjUXaNI9U4)

**Finger box** (box, field goal, double-L)

- **From the front:** two Ls (index up, thumb out) joined thumb to thumb. One slides up into a
  double-L and the box closes, turns and opens. The lit tips sit on the box's corners, and it reads as
  holds with sharp moves between them.
- **Level:** beginner.
- **Tips:**
  - Keep 90° angles, fingers straight and touching.
  - Hit each corner before moving on.
  - Learn one shape, then add a second.
- **2D tracking:** Good to Partial. The curled fingers bunch together.
- **In GloveBox:** `finger-box`.
- **Sources:** [PNUT](https://www.youtube.com/watch?v=5FX5H72B71k),
  [Lighthouse](https://www.youtube.com/watch?v=XvWSQLbzMq8),
  [Po](https://www.glow-leds.com/academy/tutorials/short_tutorial_finger_tutting_by_po)

**Tracing**

- **From the front:** one hand holds still while a fingertip of the other slides along its edges and
  lands on corners, for example up the inside of the thumb, up the index and back.
- **Level:** beginner concept, the core of finger tutting.
- **Tips:**
  - Keep the tracer touching the other hand.
  - Land the corners cleanly.
  - Don't "air trace" with nothing to trace against (Puppet's warning).
- **2D tracking:** Good when tracing in front of the hand. Poor for traces behind it, which are hidden
  on purpose.
- **In GloveBox:** `tracing`.
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=XvWSQLbzMq8),
  [Puppet critique](https://www.youtube.com/watch?v=5tkDGTogU4Q),
  [Puppet trace shorts](https://www.youtube.com/watch?v=wfbpdZPaWCs)

**Pivots and hinges** ("doors")

- **From the front:** one hand or contact point stays fixed while the other swings 90° around it.
  The Lighthouse teaches three axes; StarStream's "doors" hinge between stacked boxes without
  breaking contact.
- **Level:** beginner concept, intermediate execution.
- **Tips:** when stuck, change the angle to find a new structure.
- **2D tracking:** Good for the axis pointing at the viewer, which is in-plane rotation. Poor for the
  other two axes, which only shorten the fingers.
- **In GloveBox:** used inside `clocking` and `point-isolation` (in-plane pivots).
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=XvWSQLbzMq8),
  [StarStream](https://www.youtube.com/watch?v=-gQTnrOeneI)

**Wave tutting**

- **From the front:** tut shapes linked by finger rolls. The fingers ripple shut one by one, carrying
  a contact point across the other hand, then land in a clean hold.
- **Level:** intermediate. Prerequisites: rolls and finger tutting.
- **Tips:**
  - Mirror every sequence on both sides.
  - Use the roll to land in a straight box; Puppet calls it the best transition tool.
- **2D tracking:** Partial. The rolls hide tips; the holds read well.
- **In GloveBox:** not added as its own lesson. `tech-combo` and `box-move` carry the idea.
- **Sources:** [Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc) (21:17),
  [EmazingLights](https://www.youtube.com/watch?v=iw3D_C9s_JM),
  [advanced](https://www.youtube.com/watch?v=8cu3FYKSQDQ),
  [Glow LEDs](https://www.glow-leds.com/academy/tutorials/introduction_to_wavetutting_by_puppet)

**Box move** (a finger-roll concept)

- **From the front:** a 2×2 box in front of you. The hands meet index to index, then flip to pinky to
  pinky, working round the box like a steering wheel, with a roll on each count.
- **Level:** beginner to intermediate.
- **Tips:** get the hand path clean before adding the rolls.
- **2D tracking:** Partial. The corners suit the camera; the palm flips and touching hands don't.
- **In GloveBox:** `box-move`, simplified.
- **Sources:** [Puppet](https://www.youtube.com/watch?v=QETrsCYs5Hc) (16:23),
  [Glow LEDs](https://www.glow-leds.com/academy/tutorials/box_move_by_puppet)

**Stacking**

- **From the front:** flat hands leapfrog: one goes over and lands under the other, in a chain.
- **Level:** beginner. EmazingLights calls it the easiest move after rolls.
- **Tips:**
  - Extend the arms to avoid wrist strain.
  - Start slow and build speed.
- **2D tracking:** Partial. The hands overlap and the flips reverse the tip order.
- **In GloveBox:** not added (overlap).
- **Sources:** [Sharky](https://www.youtube.com/watch?v=Pz-EuuG2wGk),
  [GloFX](https://www.youtube.com/watch?v=7vELjR2vARc),
  [Puppet](https://www.glow-leds.com/academy/tutorials/stacking_by_puppet)

**Finger stairs** (infinity stairs)

- **From the front:** fingertips step from finger to finger, giving the illusion of an endless climb.
- **Level:** intermediate.
- **2D tracking:** Partial. The tips touch and overlap.
- **In GloveBox:** not added.
- **Sources:** [Puppet short](https://www.youtube.com/watch?v=SIGQIUjSNAs)

### Tech

**Splits and compressions**

- **From the front:** with the palm facing the camera, the gap between fingers moves across the hand:
  3+1, 2+2, 1+3, together.
- **Level:** beginner drill.
- **Tips:**
  - One gap at a time; the other fingers stay pressed together.
  - Count 1-2-3-4.
  - Put a fist between the fingers to feel the stretch.
- **2D tracking:** Good. The spread is side to side, in the camera's plane.
- **In GloveBox:** `splits`.
- **Sources:** [LucyDrop](https://www.youtube.com/watch?v=K0elaEKlehI),
  [Puppet](https://www.glow-leds.com/academy/tutorials/short_tutorial_finger_isolations_splits_by_puppet)

**Digits and the digit scale**

- **From the front:** fingers bend at the second or third knuckle so the tips sit at stepped heights.
  The scale passes index to pinky and back.
- **Level:** beginner to intermediate.
- **Tips:**
  - Keep 90° angles with no sagging.
  - Don't force joints your hands can't bend.
- **2D tracking:** Partial. The movements are tiny and partly toward the camera.
- **In GloveBox:** not added. `fixed-45s` uses the same stepped bend at a readable size.
- **Sources:** [Lighthouse](https://www.youtube.com/watch?v=hT239356Ito),
  [Glow LEDs](https://www.glow-leds.com/academy/tutorials/digits_by_puppet)

**Dials**

- **From the front:** one tip arcs a half-circle over a neighbouring tip, then the next finger does
  the same.
- **Level:** intermediate to advanced.
- **2D tracking:** Partial. Small arcs, with tips overlapping at the pivot.
- **In GloveBox:** not added.
- **Sources:** [Glow LEDs](https://www.glow-leds.com/academy/tutorials/dial_tutorial_by_puppet_by_puppet),
  [Kurrent](https://www.youtube.com/watch?v=Y_Z_rWa9S3s)

**Clocking**

- **From the front:** one or two straight fingers act as clock hands, pivoting around a fixed centre
  and snapping between angles on the beat ("ticking").
- **Level:** intermediate.
- **Tips:**
  - The centre never moves.
  - Tick, don't sweep: land each angle on the beat.
- **2D tracking:** Good. It is held angles with snaps around a fixed point.
- **In GloveBox:** `clocking`, with each hand ticking around its own index knuckle (no hand in front of the other).
- **Sources:** [Glow LEDs](https://www.glow-leds.com/academy/tutorials/short_tutorial_clocking_by_puppet),
  [Puppet short](https://www.youtube.com/watch?v=gpURKBvYnuc),
  [Throwlights](https://www.youtube.com/watch?v=UlqEwwA6fOk) (title only)

**Fixed 45s**

- **From the front:** each finger bent a little more than the one before, so the tips form a 45°
  diagonal. Mirrored hands make a V; moving the bend makes the line travel.
- **Level:** intermediate.
- **Tips:**
  - A straight line with no dents.
  - The same angle on both hands.
- **2D tracking:** Good for the line of tips; the bend itself is partly depth.
- **In GloveBox:** `fixed-45s`.
- **Sources:** [Glow LEDs](https://www.glow-leds.com/academy/tutorials/short_tutorial_fixed_45s_by_puppet),
  [Vincent van Flow #15a](https://www.youtube.com/watch?v=D4Luhq3nty0) (title and description),
  Maranan et al.

**Point isolation** (isos, fixed point)

- **From the front:** one fingertip, often a pinched thumb and index, stays still while the hand swings
  around it and counter-rotates. The other tips sweep arcs around the fixed point.
- **Level:** intermediate.
- **Tips:**
  - Fix the point against a real reference.
  - The usual mistake is the "still" point drifting the way the hand moves.
  - Practise one hand at a time.
- **2D tracking:** Good. The fixed point is a target that doesn't move, so stillness is scored directly.
- **In GloveBox:** `point-isolation`.
- **Sources:** [Puppet](https://www.youtube.com/watch?v=jfzh0eTRoso),
  [Vincent van Flow #4](https://www.youtube.com/watch?v=Uo3QGLbd5XU) (chapters only),
  [Wikipedia: isolation](https://en.wikipedia.org/wiki/Isolation_(illusion))

**Linear isolations, slides, platforming and grid work**

- **From the front:** a still hand shape travels along a straight x or y line and lands crisply on a
  point.
- **Level:** beginner to intermediate.
- **Tips:** Puppet's "do less": move the shape, land on a point, then move again; precise beats fast.
- **2D tracking:** Good for x and y. Pushes toward the viewer only change apparent size.
- **In GloveBox:** `grid-slides`.
- **Sources:** [Puppet roadmap](https://www.youtube.com/watch?v=0gyTotdGOo4),
  [Puppet tips](https://www.youtube.com/watch?v=UeGQLoaoXWA),
  [The grid](https://www.glow-leds.com/academy/tutorials/the_grid_by_puppet)

**Clusters**

- **From the front:** the ten tips gather into a tight array of three to six points, with fingers from
  both hands interleaving.
- **Level:** intermediate to advanced.
- **2D tracking:** Poor. The tips sit a centimetre or two apart and swap identity.
- **In GloveBox:** not added.
- **Sources:** [StarStream](https://www.glow-leds.com/academy/tutorials/cluster_tutorial_by_starstream),
  [How To Glove](https://www.youtube.com/watch?v=wGaum1AZJGQ) (chapters)

**Pinches**

- **From the front:** two fingertips land exactly on each other for a sharp accent.
- **Level:** intermediate.
- **2D tracking:** Partial. The landing is visible as two targets meeting, but which finger is which is
  ambiguous after contact.
- **In GloveBox:** used as a held shape in `point-isolation`. Not added as its own move.
- **Sources:** [Glow LEDs](https://www.glow-leds.com/academy/tutorials/pinching_tutorial_by_puppet),
  [How To Glove](https://www.youtube.com/watch?v=VMChMwG_MyE) (chapters)

**Threading and passthroughs**

- **From the front:**
  - Threading: fingers from the two hands come out alternately and interlace.
  - Passthrough: one hand appears to move through the other.
- **Level:** intermediate to advanced.
- **2D tracking:** Poor. Fingers hide each other by design, and front-back order is lost.
- **In GloveBox:** not added.
- **Sources:** [Lighthouse threading](https://www.youtube.com/watch?v=VdHBiSyYq7Q) (chapters),
  [Misogi](https://www.youtube.com/watch?v=gX5ayBPJfpc),
  [Glow LEDs passthrough](https://www.glow-leds.com/academy/tutorials/passthrough_tutorial_by_puppet)

### Liquid and contours

**Liquid hand flow**

- **From the front:** the two hands' fingertips stay loosely connected and trace a smooth,
  ribbon-like path while the palms ripple; the following hand trails just behind.
- **Level:** beginner.
- **Tips:**
  - Fingertips always connected.
  - Move the elbows; don't pin them to your sides.
  - Keep a constant speed.
- **2D tracking:** Partial. The path is visible but the knuckle bends are depth.
- **In GloveBox:** not its own lesson. `figure-8` uses the leader/follower idea.
- **Sources:** [Trippz](https://www.youtube.com/watch?v=kNsi3hlU8vs),
  [Puppet](https://www.glow-leds.com/academy/tutorials/liquid_tutorial_by_puppet),
  Maranan et al.

**Contours and builds**

- **From the front:** the hands trace the outline of an imaginary object, such as a ball (tips on a
  circle) or a box (tips on its edges). The object's size and place never change.
- **Level:** beginner to intermediate.
- **Tips:**
  - Keep the object the same size.
  - Keep a steady speed, changing only with the music.
  - Let the hands visibly "hit" the surface.
- **2D tracking:** Good for objects in the face-on plane.
- **In GloveBox:** `ball-contour`.
- **Sources:** Maranan et al.,
  [Liquid dancing (old Wikipedia article)](https://en-academic.com/dic.nsf/enwiki/750594),
  [creativecode.org](http://www.creativecode.org/wp-content/uploads/2015/01/ARt5_HittingImaginaryWalls.pdf)

**Rails** (box rails)

- **From the front:** the palms travel a rectangle's edges with the fingers flat on its "walls",
  turning about 90° at each corner.
- **Level:** beginner.
- **2D tracking:** Good.
- **In GloveBox:** covered by `king-tut-box`, which draws the same box path.
- **Sources:** [Lighthouse short](https://www.youtube.com/watch?v=mNJAN0DyyLg), Maranan et al.

**Folds and planes; the liquid 8**

- **From the front:** a flat hand tilts or flips to show both sides of a plane. From the front, its
  width shrinks to a line and grows back. The liquid 8 lays the figure 8 front to back.
- **Level:** intermediate.
- **2D tracking:** Poor to Partial. It is mostly depth.
- **In GloveBox:** not added.
- **Sources:** [Jest](https://www.youtube.com/watch?v=PNoT0SPvAC8),
  [Lighthouse folds](https://www.youtube.com/watch?v=A6LO4tORjH4),
  [Lighthouse liquid 8](https://www.youtube.com/watch?v=Fp3c25ioTtw)

### Light-mode styles

**Impacting, strobing and conjuring**

- **What they are:**
  - Impacting clicks lights on and off, often the thumbs, timed to the music.
  - Strobing uses a bright strobe mode very close to the viewer.
  - Conjuring switches lights so light seems to float.
- **Level:** various. Impacting got its own IGC bracket in 2016.
- **Tips:** don't use hyperstrobe as a crutch, because it hides sloppiness; practise on solid or dops.
- **2D tracking:** Poor. Positions are visible but on/off states and modes are not. Strobing close to
  the eyes is also an eye-safety concern.
- **In GloveBox:** not added.
- **Sources:** [Lighthouse impacting](https://www.youtube.com/watch?v=ucWNi3Px6F4),
  [Lighthouse strobing](https://www.youtube.com/watch?v=DyAiTCnYGFI),
  [StarStream](https://www.glow-leds.com/academy/tutorials/impacting_tutorial_by_starstream),
  [GloFX](https://glofx.com/led-flow-arts-learning-center/led-gloving-tutorials/)

**Creatures, morphing and remoting**

- **What they are:**
  - Creatures are hand shapes that look like animals.
  - Morphing turns one shape into another without breaks.
  - Remoting has one hand seem to steer the other from a distance.
- **2D tracking:** the positions are trackable; what the shape _is_ isn't scored.
- **In GloveBox:** not added. Morphing is what a blended sequence already does.
- **Sources:** [creatures](https://www.glow-leds.com/academy/tutorials/short_tutorial_creatures_by_puppet),
  [morphing](https://www.glow-leds.com/academy/tutorials/morphing_tutorial_by_starstream),
  [remoting](https://www.glow-leds.com/academy/tutorials/remoting_tutorial_by_puppet)

---

## Considered and not added

| Group                      | Moves                                                                                                    | Why not                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hands cross or stack       | circle move, stacking, crossover / infinite / reverse / stacked rolls, threading, clusters, passthroughs | In Lit mode, hand tracking loses fingers and mixes up hands when they overlap, so scoring each finger against its own target would punish correct play. |
| Mostly depth               | tunnels, liquid folds and planes, the liquid 8, forbidden angles, z-axis pushes                          | From the front they only change apparent size or foreshorten the hand. GloveBox has no scale-over-time yet, and guessing depth would mislead.           |
| Too small, or partly depth | digits and the digit scale, dials, finger stairs                                                         | Movements of 1–3 cm sit inside the tracker's jitter, and tips overlap at pivots.                                                                        |
| Light modes                | impacting, strobing, conjuring                                                                           | Positions can't show on/off states or modes.                                                                                                            |
| Advanced shapes            | antispin and flower flails                                                                               | Needs a new path type; the poi formulas are second-hand. A good later addition.                                                                         |
| Not real terms             | pendulums, rainbows, spirals, orbits, pyramids                                                           | No source teaches them as gloving moves.                                                                                                                |

**Recommendation for M6.** The overlap moves are some of the most loved in real shows, especially the
circle move and infinite rolls. Don't write them as generators. Record them with Record mode, with a
real glover on real gloves in Dark mode. Dark mode scores the pattern (any light to any target), the
way a receiver sees it, so overlapping hands don't break scoring. Ship them as built-ins once they've
been checked.

---

## Scoring ideas for later

None of these are built. They are what the research suggests the scorer could learn next.

- **Bridge fingers together.** The most repeated coaching cue: in a relay roll, the pinkies (upward)
  or index fingers (downward) should stay touching and move together. Their distance could be scored
  directly ([Lighthouse](https://www.youtube.com/watch?v=SG-w8ubvJNU),
  [Sharky](https://www.youtube.com/watch?v=5FuMppADqQg)).
- **No "floating".** Puppet's term for small jitters in the hand that should be still while the other
  leads. The tracking already exists, so a still hand's wobble could be its own measure
  ([Puppet](https://www.youtube.com/watch?v=4FtPooZRqmI)).
- **Holds landing on the beat.** Tut corners, clock ticks and crawl stops should start and end on
  counts. The beats where a move hits a corner (`keyBeats`) are already computed but unused, so
  arriving early or late at a corner could be scored separately from the beat readout over the whole
  move ([LucyDrop](https://www.youtube.com/watch?v=6xQWrMAA7Ok),
  [Jest](https://www.youtube.com/watch?v=a3JU6AzG1r0)).
- **Battle criteria.** There is no single published rubric, but sources agree on these:

| Source                                                                                                                                                                        | Criteria                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| IGC 2013 ([Green Galactic](https://www.greengalactic.com/2013/emazinglights-igc-2013/))                                                                                       | execution, musicality, trick difficulty, cleanliness, variety                                 |
| EmazingLights monthly contests ([Rolling Stone](https://www.rollingstone.com/music/music-lists/show-us-your-hands-inside-edms-gloving-craze-10752/the-art-of-gloving-240110)) | the same five, on points                                                                      |
| IGC ([BuzzFeed](https://www.buzzfeed.com/marisacarroll/a-hands-on-day-at-the-super-bowl-of-gloving))                                                                          | musicality, presentation, execution (tricks and transitions); points lost for repeating moves |
| Brian Lim, IGC founder ([Insomniac](https://www.insomniac.com/magazine/everything-you-need-to-know-about-gloving/))                                                           | creativity, musicality, flow                                                                  |
| How To Glove ([video](https://www.youtube.com/watch?v=TQ7Sfcc7dK0))                                                                                                           | complexity + execution + musicality, with musicality mattering most                           |

How these could map onto GloveBox:

- **Cleanliness and execution:** today's accuracy.
- **Musicality:** hold and corner timing.
- **Difficulty:** a weight per lesson.
- **Transitions:** smoothness across a combo's blends.
- **Variety:** only meaningful for a future free-play mode.

**Safety.** Several sources warn against bright lights close to the eyes, and battles deduct points
for hitting the opponent's face. If GloveBox ever coaches distance, it should warn rather than reward
lights held right at the camera
([Euphorium](https://www.euphorium.au/blogs/guides/what-is-gloving-a-beginners-guide-to-led-light-shows),
[Glow LEDs etiquette](https://www.glow-leds.com/learn/gloving_etiquette)).

---

## How teachers order the skills

**Puppet, Gloving Academy "Basics & Foundation"** ([video](https://www.youtube.com/watch?v=QETrsCYs5Hc)).
The clearest published sequence, from its chapter list:

1. Underhand, then overhand finger roll.
2. The transition between them.
3. Continuous rolls, variations, the stacked roll.
4. Underhand, then overhand whips.
5. The roll-to-whip transition; whip variations.
6. The circle move, and circle move to whip.
7. Stacking.
8. The box move.
9. The figure 8.
10. Liquid.
11. An intro to wave tutting.
12. A "checkpoint" light show to copy before moving on.

**Puppet's roadmap** ([video](https://www.youtube.com/watch?v=0gyTotdGOo4)):

- **Beginner:** rolls → digits → splits → dials → liquid → whips and flails → stacking.
- **Intermediate:** King and finger tutting → wave tutting → pinching → threading → creatures.

He stresses that it is a path, not _the_ path, and that you can specialise early.

**GloFX** ([learning center](https://glofx.com/led-flow-arts-learning-center/led-gloving-tutorials/)):

- **Beginner:** rolls and waves, stacking, liquid, figure 8, finger tutting.
- **Intermediate:** whips, flails, dials, wave tutting, King Tuts.

**Glow LEDs** ([dictionary](https://www.glow-leds.com/academy/tutorials/concept_term_dictionary),
[where to start](https://www.glow-leds.com/tutorials/where_do_i_start)):

- **Beginner:** figure 8, wave, roll, finger tutting, liquid, stacking.
- **Intermediate:** dials, digits, flails, King Tuts, wave tuts, whips.
- **Advanced:** creatures, infinite roll, tunnels.

The four fundamentals are rolls, whips, liquid and tutting; 15–30 minutes a day is suggested.

**EmazingLights** (YouTube "How To Glove" series):

- Rolls first; stacking is the easiest after that; the figure 8 is fine as a first move.
- Intermediate rolls need the up and down rolls and the transition.
- Then whips, tunnels, flails and wave tutting.

**The Lighthouse:**

- Rolls, which they call the most important move ([1](https://www.youtube.com/watch?v=SG-w8ubvJNU),
  [2](https://www.youtube.com/watch?v=1CCbhWHCBNw),
  [experts](https://www.youtube.com/watch?v=DYvWh45BRpw)).
- Whips need clean rolls; the circle move needs rolls and whips.
- Their "[8 mistakes](https://www.youtube.com/watch?v=21PKI6Eye8o)" video says not to skip rolls or
  build complexity before foundations.

**Within tutting:**

- LucyDrop: gestures → rotating on the beat → tracing → hinges.
- The Lighthouse: open/close → trace → pivot.
- Frosty: fists → flat hands → twisting angles → finger tuts.

**Practice advice the tips draw on:**

- About 100 rolls a day.
- Go slow to find the flaw, then add speed to smooth it.
- Mirror and reverse every move.
- Record yourself and review it.
- Stretch first.

([Puppet tips](https://www.youtube.com/watch?v=UeGQLoaoXWA),
[20 tips](https://www.youtube.com/watch?v=QetvgC3PAFw))

GloveBox's tiers follow the overlap of these orders: rolls first; then circles (flails, figure 8,
whips); then tutting; then tech; then combos. Moves that depend on overlapping hands are skipped (see
above).

---

## Best tutorial per move

| Move                                | Tutorial                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finger rolls (beginner)             | [The Lighthouse: How To Finger Roll](https://www.youtube.com/watch?v=SG-w8ubvJNU)                                                                                                           |
| Rolls to circle move, as one course | [Puppet: Basics & Foundation](https://www.youtube.com/watch?v=QETrsCYs5Hc)                                                                                                                  |
| Advanced rolls                      | [The Lighthouse: Finger Roll 2](https://www.youtube.com/watch?v=1CCbhWHCBNw), [for Experts](https://www.youtube.com/watch?v=DYvWh45BRpw)                                                    |
| Crawls                              | [EmazingLights (Blitzen): Intermediate Finger Rolls](https://www.youtube.com/watch?v=W1mwrHpua4M)                                                                                           |
| Splits / compressions               | [LucyDrop: Compressions](https://www.youtube.com/watch?v=K0elaEKlehI)                                                                                                                       |
| Flails                              | [Fry & Cire: Flails](https://www.youtube.com/watch?v=0-BN7yahyKs), [The Lighthouse: Flail](https://www.youtube.com/watch?v=7mldubZtL6k)                                                     |
| Flail patterns                      | [0MrFreckles0: Flail Pattern Breakdown](https://www.youtube.com/watch?v=cQgDS_mT7fQ)                                                                                                        |
| Figure 8                            | [EmazingLights (Sharky): Figure 8](https://www.youtube.com/watch?v=tCICnGoLq7g)                                                                                                             |
| Whips                               | [The Lighthouse: How To Whip](https://www.youtube.com/watch?v=sYHkxHKd_PA), [Panda & Stunna](https://www.youtube.com/watch?v=IOvd50fnfEY)                                                   |
| Circle move                         | [The Lighthouse: Circle Move in 6 Steps](https://www.youtube.com/watch?v=KhTmzJlzp-4)                                                                                                       |
| Stacking                            | [EmazingLights (Sharky): Stacking](https://www.youtube.com/watch?v=Pz-EuuG2wGk)                                                                                                             |
| Liquid                              | [EmazingLights (Trippz): Liquid](https://www.youtube.com/watch?v=kNsi3hlU8vs)                                                                                                               |
| King Tut                            | [EmazingLights (Munch): King Tut](https://www.youtube.com/watch?v=j4SpxzF80Fk)                                                                                                              |
| Finger tutting, tracing, pivots     | [The Lighthouse: Finger Tut for Beginners](https://www.youtube.com/watch?v=XvWSQLbzMq8)                                                                                                     |
| Wave tutting                        | [EmazingLights: Wave Tutting](https://www.youtube.com/watch?v=iw3D_C9s_JM)                                                                                                                  |
| Point isolation                     | [Puppet: Point Isolation](https://www.youtube.com/watch?v=jfzh0eTRoso)                                                                                                                      |
| Digits                              | [The Lighthouse: Digit for Beginners](https://www.youtube.com/watch?v=hT239356Ito)                                                                                                          |
| Light-show structure                | [Puppet: Lightshow as a beginner](https://www.youtube.com/watch?v=OuZM-kS7ZZU), [Glow LEDs: Anatomy of the Lightshow](https://www.glow-leds.com/academy/tutorials/anatomy_of_the_lightshow) |
| Mistakes to avoid                   | [The Lighthouse: 8 Mistakes](https://www.youtube.com/watch?v=21PKI6Eye8o), [Puppet: 20 Tips](https://www.youtube.com/watch?v=QetvgC3PAFw)                                                   |

**Worth a human's time next.** These were not readable here, so someone should open them in a
browser and read the transcripts:

- [Puppet's competition Q&A](https://www.youtube.com/watch?v=j9ul4RdO510) (judging);
- [The Lighthouse: What Is Impacting?](https://www.youtube.com/watch?v=rvPIDo4xgCo);
- Vincent van Flow's [point isolations](https://www.youtube.com/watch?v=Uo3QGLbd5XU) and
  [projections](https://www.youtube.com/watch?v=sS8ouy5CYZA) episodes (the latter is about how 3D
  shapes look from the front, exactly GloveBox's problem).

---

## Not yet verified

- **No lesson has been tried on real gloves in a dark room.** Sizes, tempos and the front-view shapes
  come from tutorials and from the lesson tests (seamless loops, smooth motion, staying on screen),
  not from a glover performing them for the camera.
- **Untested in Lit mode:** whether hand tracking holds up on palms-up rolls, fists and pinched
  fingers.
- **Untested in Dark mode:** whether calibration separates the lights in tight shapes such as the
  finger box and the pinch.

Tuning on real gloves is milestone M6 in the README roadmap. Expect to adjust sizes and tempos, and
possibly drop or redesign a lesson, once that happens.
