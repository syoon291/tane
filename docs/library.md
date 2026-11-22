---
owns:
  - library.js
  - demo/**
status: current
---

# Library

The source library is the read-only half of tane: ideas extracted from the owner's saved videos by furikaeri on the computer and exported to `library/latest.json` in tane-data. The format was agreed with the exporter (furikaeri `export`).

## Format (schema `tane-library`, v 1)

```
{"schema":"tane-library","v":1,"generatedAt":ISO,
 "areas":[{id,name,summary}],
 "themes":[{id,areaId,name,summary,folder?}],
 "ideas":[{id,themeId,claim,detail?,videoIds:[],prompts:[{id,text}],status:"active"|"retired"}],
 "videos":[{id,title,creator,url,summary,keyIdeas:[string],quotes:[{id,text}]}],
 "links":[{from,to,kind:"supports"|"contradicts"|"extends",why}],
 "threads":[{id,title?,question,ideaIds}],
 "core":[{id,belief,ideaIds}],
 "perspectives":[{id,target,verdict:"holds up"|"mixed"|"push back",take,better?,question}],
 "discussions":[{id,title,sides:[idea ids],take,question}]}
```

- Flat arrays joined by stable ids (`area-…`, `theme-…`, `idea-…`, `p-…`, `q-…`; a video's id is its TikTok video id as a string). Array order is display order.
- `folder` on a theme is the saved-video folder it came from; kept on the index (`folderOf`) for later filters, not shown yet.
- `detail` is optional (the exporter does not send it today).
- `perspectives` and `discussions` are Claude's take, a third voice: written ahead of time by furikaeri `export` on the computer (never in the app), read-only like the rest. A perspective's `target` is an area, theme or idea id; `better` is a better version of the idea, sent when Claude pushes back. A discussion is a tension between kept ideas (`sides`). Both lists are optional, so a library without them still loads.
- Retired ideas stay in `ideas` with `status: "retired"`, their claim kept and `prompts: []`; their `themeId` may point to a theme no longer in `themes`.

## Parsing (`parseLibrary`)

- Rejects, with a message fit to show: not JSON, not an object, `schema` other than `tane-library`, `v` not an integer, newer than 1 ("update the app") or older, a missing `areas`/`themes`/`ideas`/`videos` list, or a non-list `links`/`threads`/`core`/`perspectives`/`discussions`.
- Tolerates unknown extra fields (dropped) and missing optional lists.
- Skips and counts malformed items (no id, not an object, an idea without a claim, a link with an unknown kind or pointing to itself, a perspective without a take or target, a discussion without a title or take); an unknown verdict is dropped and the take kept; a duplicate id keeps the first.
- Video links survive only as `https:` URLs.

## Index (`buildIndex`)

Lookups by id, children per parent (themes per area, active ideas per theme), links per idea in both directions (`dir: "out"` this idea → other, `"in"` other → this), threads and core beliefs per idea, quotes by id (with their video) and the ideas each video sits behind (so a note on a video or quote opens the idea page that shows it), the active ideas and the themes as lists (for the note link search), and counts: videos per idea, ideas and distinct videos per theme and area, themes per area, totals. Dangling ids (a theme's missing area, an idea's missing theme or videos, a link or thread to a missing idea) are dropped, never fatal; a thread or core belief left with no ideas goes away. Claude's take: `perspectiveOf(target)` (one per item, the first wins; a take on something not in the library is dropped, and each carries its target's `type`), `perspective(id)`, `discussions`, `discussion(id)` and `discussionsOf(idea)`; a discussion keeps only sides that exist and needs two. Retired ideas never appear in lists or counts but `idea(id)` finds them, and `parentsOf` returns nulls when their theme is gone.

## Demo library

`demo/library.json` is made up: 3 areas, 6 themes, 15 active ideas and one retired idea (`idea-0a1b10`, its theme gone), 12 videos by fictional `@demo…` creators with made-up `@demo` TikTok video links, links of all three kinds, two threads (one with a title), a core belief, a made-up Claude's take on every area, theme and active idea (all three verdicts, some with a better version) and three discussions. Tests and screenshots use it; the app shows it with `?demo=1`. It is never written to IndexedDB. The fast check (command in docs/docsic.json) validates it and refuses non-demo creators or links. Never put a real idea, video or creator in it.
