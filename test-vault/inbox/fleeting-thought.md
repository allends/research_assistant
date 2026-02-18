---
title: Embedding-Based Tag Suggestions
tags:
  - inbox
  - idea
  - ai
created: 2026-02-11
modified: 2026-02-11
---

# Embedding-Based Tag Suggestions

**Idea:** Use the embedding vectors from [[vector-search|QMD's vector index]] to automatically suggest tags for new notes.

## How It Would Work

1. Embed the new note using the same model (embeddinggemma-300M)
2. Find the K nearest existing notes by cosine similarity
3. Aggregate tags from those neighbors (weighted by similarity score)
4. Suggest the top N tags that aren't already on the note

## Why This Could Be Useful

- New notes often lack tags because it's friction to add them
- Existing similar notes have already been tagged through manual curation
- This leverages the "wisdom" of past tagging decisions

## Implementation Ideas

Could be a new command in [[research-assistant]]:

```bash
ra tag-suggest ./inbox/new-note.md
ra tag-suggest ./inbox/new-note.md --apply  # auto-add suggested tags
```

Or integrate into `link-suggest` as a secondary output.

Would need QMD to expose raw embedding vectors — currently it only does similarity search. Maybe `qmd embed --query "text" --raw` or similar.

## Related

- [[typescript-patterns]] — for implementation patterns
- [[programming]] — general development notes
- [[research-assistant]] — parent project

#inbox #idea #embeddings #feature-request
