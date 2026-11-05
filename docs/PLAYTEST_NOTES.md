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
- **Requests or changes to consider:**
  - _What would you like changed, explored, or kept?_
- **Questions:**
  - _Anything you want the AI to investigate or explain?_


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
