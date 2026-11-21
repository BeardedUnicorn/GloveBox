# Change notes

Every change someone using GloveBox would notice adds a note here, in the
branch that makes it. `pnpm release` then does three things with the notes:

- turns them into the next [CHANGELOG.md](../CHANGELOG.md) section,
- bumps the version by the highest `bump` among them,
- deletes them.

Each note is its own file, so branches never conflict over the changelog.

Name the file after the change (`dark-mode.md`); the name isn't shown
anywhere. A note is front matter, then the text for the changelog:

```markdown
---
bump: minor
type: Added
---
Dark mode: practice in a dark room with your gloves on. GloveBox follows
the LEDs themselves.
```

- `bump`:
  - `major` when saved lessons, progress or settings from older versions
    stop working.
  - `minor` for something new.
  - `patch` for a fix or a small change.
- `type`: the CHANGELOG heading it goes under: `Added`, `Changed`,
  `Removed`, `Fixed` or `Security`.
- The text is one bullet, with its lines joined. For several bullets under
  the same heading, start each with `- `.

Write the note for the person learning to glove. Say what they can do now or
what changed for them, not how the code changed. The update dialog shows
these words. Internal work (tests, refactors, tooling) needs no note.

`pnpm release --dry-run` shows the next version and its section without
changing anything.
