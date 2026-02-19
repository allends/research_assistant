---
title: Spec — Dining & Reservation Assistant for OpenClaw
tags: [spec, openclaw, skill, restaurants, resy, todo]
created: 2026-02-19
status: draft
---

# Dining & Reservation Assistant for OpenClaw

A conversational skill for discovering restaurants, maintaining a personal list, and managing reservations — all via Telegram.

## The Vision

Message Mira like you'd text a well-connected friend:

> "Find me something good for dinner Saturday, 2 people, somewhere in Williamsburg or the Lower East Side, not too loud, not a steakhouse"

And get back a curated shortlist with vibes, not just a Yelp dump. Save the ones you like. When you're ready, book it. Get notified when a table opens at a place on your wishlist.

---

## Two-Layer Architecture

The system splits cleanly into two layers with very different implementation complexity:

### Layer 1: Discovery (easy, official APIs)

Search, browse, and understand restaurants. No scraping, no ToS risk.

**APIs:**
- **Yelp Fusion** — best for discovery: search by vibe/cuisine/neighborhood/price, reviews, hours, ratings. Free tier available.
- **Google Places API (New)** — best for details: address, photos, opening hours, place IDs. ~$200/mo free credit, very generous for personal use.

Either works alone. Yelp is better for natural language "vibe" searches; Google is better for precise lookups and photos.

### Layer 2: Reservations (harder, unofficial APIs)

Check availability, book, cancel. This uses reverse-engineered private APIs.

**Target platforms:**
- **Resy** — dominant in NYC (Brooklyn especially). Unofficial API is well-understood; Python/Node wrappers exist on GitHub (`resy-py`, `resy-bot`, etc.). Auth via phone number + SMS token.
- **OpenTable** — wider coverage, especially outside NYC. Similarly reverse-engineered.

**ToS note:** Both Resy and OpenTable prohibit automated booking in their ToS. This is for personal use only and is not scalable abuse. Risk is account suspension, not legal exposure. Proceed with eyes open.

---

## Data Model

A single JSON file stored locally acts as your personal restaurant database. Simple, portable, no external DB needed.

**Location:** `~/.openclaw/dining/lists.json`

```json
{
  "wishlist": [
    {
      "id": "wd-1",
      "name": "Lilia",
      "neighborhood": "Williamsburg",
      "cuisine": "Italian",
      "price": "$$$$",
      "platform": "resy",
      "platform_id": "lilia-brooklyn",
      "yelp_id": "lilia-brooklyn",
      "notes": "heard the rigatoni is insane, need to try",
      "added": "2026-02-19",
      "status": "wishlist",
      "watching": true
    }
  ],
  "visited": [
    {
      "id": "v-1",
      "name": "Oxomoco",
      "neighborhood": "Greenpoint",
      "cuisine": "Mexican",
      "price": "$$$",
      "visited_on": "2026-01-10",
      "rating": 5,
      "notes": "mezcal margarita, get the mushroom tlayuda",
      "would_return": true
    }
  ],
  "upcoming": [
    {
      "id": "u-1",
      "name": "Don Angie",
      "neighborhood": "West Village",
      "confirmed_time": "2026-03-01T19:30:00",
      "party_size": 2,
      "platform": "resy",
      "reservation_id": "abc123",
      "reminder_sent": false
    }
  ]
}
```

---

## OpenClaw Integration

Build this as an **OpenClaw skill** (`dining`) that registers tools into the agent. The agent handles all the natural language — the skill just gives it the tools.

### Skill tools

```
discovery tools:
  search_restaurants(query, location, filters?)    → ranked list from Yelp/Google
  get_restaurant_details(name_or_id)              → full details + hours + reviews
  
list management tools:
  add_to_wishlist(restaurant, notes?)             → saves to lists.json
  list_wishlist()                                 → returns current wishlist
  mark_visited(restaurant_id, rating?, notes?)    → moves to visited
  
reservation tools:
  check_availability(restaurant, date, party_size, time_range?)  → open slots
  book_reservation(restaurant, slot, party_size)                 → books it
  cancel_reservation(reservation_id)                             → cancels
  list_upcoming()                                                → upcoming reservations
  watch_restaurant(restaurant_id, dates, party_size)            → enables availability watching
```

### Cron integration

OpenClaw cron jobs handle the background work:

- **Every 30 min** — check Resy/OpenTable availability for any restaurants on wishlist with `watching: true`; notify via Telegram if a slot opens on a watched date
- **Day-before reminder** — scan `upcoming` list and send a reminder the evening before any reservation

---

## Conversation Examples

**Discovery:**
> "What's good for a birthday dinner in Brooklyn? 4 people, want something special, not sushi"

**List management:**
> "Save Lilia to my list, I want to try it for our anniversary"
> "What's on my restaurant list?"
> "Mark Oxomoco as visited, 5 stars, the tlayuda was incredible"

**Availability check:**
> "Any tables at Lilia this weekend for 2?"
> "Check if Don Angie has anything Saturday night"

**Booking:**
> "Book us at Don Angie Saturday at 7:30 for 2"
> "Cancel my reservation at Lilia next week"

**Watching:**
> "Keep an eye on Lilia for any Saturday slots in March for 2, ping me when something opens"

---

## Implementation Phases

### Phase 1: Discovery + List Management (build first)

- Yelp Fusion API integration (get API key, wrap endpoints)
- `lists.json` read/write functions
- Tools: `search_restaurants`, `get_restaurant_details`, `add_to_wishlist`, `list_wishlist`, `mark_visited`
- Wire into OpenClaw as a skill
- No reservation functionality yet — pure discovery and personal list

**Effort:** ~1-2 days. Clean, low-risk, immediately useful.

### Phase 2: Availability Checking (no booking yet)

- Resy unofficial API auth (phone + SMS flow)
- `check_availability` tool — query slots, return human-readable list
- Manual booking via the Resy app (you pick the slot, you tap Book)
- This lets you ask "what's open Saturday at Lilia?" without auto-booking

**Effort:** 1 day. Adds real value with minimal ToS exposure (read-only).

### Phase 3: Full Booking + Watching

- `book_reservation` and `cancel_reservation` tools
- Cron job for availability watching + Telegram push notifications
- `upcoming` reservation management + reminders

**Effort:** 2-3 days. This is the full vision.

---

## Keys & Credentials Needed

| Credential | Where to Get | Notes |
|---|---|---|
| `YELP_API_KEY` | developer.yelp.com | Free, instant |
| `GOOGLE_PLACES_API_KEY` | console.cloud.google.com | Free tier covers personal use |
| Resy account | resy.com | Your existing account — auth via phone SMS |
| OpenTable account | opentable.com | Only needed if targeting non-Resy restaurants |

Store in `~/.openclaw/openclaw.json` under skill config or as env vars.

---

## File Structure (as a skill)

```
skills/dining/
  SKILL.md              — instructions for the agent on how/when to use this skill
  src/
    index.ts            — skill entrypoint, registers tools
    discovery.ts        — Yelp + Google Places wrappers
    lists.ts            — lists.json read/write
    resy.ts             — Resy API client (unofficial)
    opentable.ts        — OpenTable API client (unofficial)
    cron.ts             — background availability checking
  config.ts             — credential loading
```

---

## Open Questions

- [ ] **Yelp vs Google for discovery** — do both, or pick one? Yelp has better "vibe" data for NYC restaurants; Google has better photos and more reliable hours. Probably Yelp for search, Google for details.
- [ ] **How to handle Resy auth** — phone SMS flow needs to be done once and token cached. Need to figure out token lifetime and refresh.
- [ ] **OpenTable vs Resy** — most Brooklyn places are Resy. Is OpenTable needed at all for your use case?
- [ ] **Party size default** — should it be configurable per-user in the skill config, or always asked?
- [ ] **Watching frequency** — Resy slots drop and get snatched fast (especially Fri/Sat prime time). 30 min polling may be too slow for hot spots. Could go to 5 min but risks rate limiting.

---

## Next Steps

1. Check if Yelp Fusion still has a free developer tier (they've been shifting toward paid — verify current pricing)
2. Find a working Node.js Resy API client on GitHub or write thin wrapper from scratch
3. Build Phase 1 (discovery + lists) first — immediately useful without any ToS risk
4. Decide: standalone OpenClaw skill, or absorb into an existing personal agent setup?
