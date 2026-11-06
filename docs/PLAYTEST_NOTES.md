# Playtest notes

Use this running log to capture what happened and what you noticed during each playtest. Add a new entry for each session; short notes in your own words are enough. These notes are evidence and requests for the project, not automatic approval of a particular implementation or gameplay rule.

When continuing work, agents should read new entries and turn actionable observations or requests into plain-language outcomes in [Your work list](PENDING_CHANGES.md), then add the supporting technical work and dependencies to the [AI implementation plan](AI_IMPLEMENTATION_PLAN.md). Keep the original observation linked or quoted briefly so the action item stays grounded in what you reported. If an observation implies a choice about intended gameplay, ask before treating one solution as agreed.

## Playtest log

### 2026-11-04 — First M01 playthrough

- **Outcome:** Successful.
- **Observations:**
  - Focused mainly on very basic playability; ability to find information and make simple changes.
- **Requests or changes to consider:**
  - Would like the map to respond when changing tabs. When moving to the summary tab turn basemap on. When moving to the Orders tab turn basemap off and turn the Current Priority map layer on. Layers can still be adjusted manually regardless of which tab you are on.
  - Would like more information on the orders tab. Would like to have total sqkm or instance (depending on metric) that has been collected. Also a 3 day running average. Also an average days since last collected (if never collected then use the time since simulation starat). This can be on a hidden tab within the orders tab so the player can switch between the pricing and collection metrics. All at once would clutter the screen. 
  - Would like visibility rings for the ground stations added as an optional layer on the map.

#### 2026-11-05 — Second Playthrough

- **Outcome:** Success
- **Observations:**
  - I did not see the Awaiting Downlink in the summary section ever change from 0. Seems wrong.
  - Orbit trak is still displayed as a complete circle rather than showing the future orbit and past orbit track of the satellite.
  - Sat is showing as sunlit at all times, is this a bug?
- **Requests or changes to consider:**
  - Can you add a readout on the spacecraft tab for each spacecraft of number of images on board vs total in TEL? So a fraction showing how many orders are on the current plan (past and future) and how many of them have been collected and are sitting on the spacecraft.
- **Questions:**
  - _Anything you want the AI to investigate or explain?_

#### 2026-11-06 — Third Playthrough

- **Outcome:** Success
- **Observations:**
  - The orbit track is still not right. It shows a partial rev, but it still moves latterally over time. The idea is for the orbit track to accurately show where  the satellite will be (or has been). So, like a snake, it should move arond the world, but not slide latterally. Is this possible? Would it take too much compute to be practical?
  - I'm not seeing the scheduled cells show up on the map, can this be double checked?
  - I think we need more collections. Can you reduce the time in between collections by about half?
- **Requests or changes to consider:**
  -
- **Questions:**
  -

### New playtest entry template

Copy this section for each session and fill in whatever is useful. Leave fields blank when you have nothing to add.

#### YYYY-MM-DD — Mission or test

- **Run/setup:** _Optional seed, setup, or what you were testing._
- **Outcome:** _Success, failure, retry, or other._
- **Observations:**
  - _What happened? What felt confusing, slow, satisfying, or unexpected?_
- **Requests or changes to consider:**
  - _What would you like changed, explored, or kept?_
- **Questions:**
  - _Anything you want the AI to investigate or explain?_
