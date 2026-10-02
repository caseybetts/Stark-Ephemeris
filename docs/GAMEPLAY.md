# Gameplay brief

This document captures gameplay intent and current design agreements. It is a working brief, not a complete specification. Details marked **Open** need a design decision before implementation depends on them.

## Player role and growth arc

The player owns and operates an earth-imagery satellite startup. They begin with limited money and design their first satellite, using mostly default options. As the business grows, they move from spacecraft-level configuration toward fleet policies, launch planning, and choosing which customers and markets to pursue.

## Core loop

1. **Configure capacity:** Design or select satellites and set their operating priorities within the available budget.
2. **Run the operation:** Satellites capture imagery, use energy, accumulate onboard data, and deliver it through downlinks and processing.
3. **Monitor outcomes:** Review operations, revenue, customer satisfaction, asset health, and anomalies.
4. **Resolve exceptions:** Diagnose or respond to issues that threaten service, equipment, or finances.
5. **Choose growth:** Reinvest in spacecraft, ground capacity, or the customer portfolio, then adapt operations to the larger business.

Routine operations should be able to run unattended for a while. The player should be able to intervene when an exception or strategic decision makes their attention valuable.

## Systems in the concept

These are intended subject areas; the specific formulas and interactions remain to be designed.

- **Satellite design:** A constrained set of hardware choices, with money as a major limit. Candidate dimensions include imaging capability, onboard storage, energy generation and storage, pointing agility, processing, communications, and expected service life.
- **Operations:** Capture opportunities, power use, onboard storage, downlink availability, and delivery commitments.
- **Data and value:** Captured data occupies capacity and may be associated with potential or realized customer revenue. Retention, delivery timing, and disposal should have meaningful consequences.
- **Customers and revenue:** Requests or contracts create income and service expectations. Customer satisfaction reflects whether the business reliably meets them.
- **Asset health:** Degradation and anomalies affect a satellite’s capability or risk. The player monitors fleet health and decides when to investigate, change operations, or accept a loss.
- **Company resources:** Cash and operational capacity constrain what can be built, launched, supported, and promised.
- **Fleet growth:** More satellites increase capacity and revenue potential, while making per-satellite oversight less practical. Fleet policies and satellite classes become more useful as the constellation grows.

## Interface needs

The initial interface should prioritize status tabs or panels for:

- Fleet and individual satellite state, including onboard data, energy, health, and current work.
- Operations and exceptions requiring attention.
- Revenue and other business performance.
- The next growth choices available to the company.

A visual Earth with orbit paths and satellite markers is desirable context. The first version may be a simplified, primarily informational view; detailed interaction with the globe is not required by the current brief.

## Design principles

- Show causes alongside alerts and outcomes. A low-storage warning should help the player see what is filling storage and what options remain.
- Make routine actions automatable through priorities or policies as fleet size grows.
- Keep exceptions consequential but understandable. An anomaly should lead to a legible choice, not unexplained failure.
- Connect operational performance to business outcomes so capture, storage, downlink, and delivery decisions matter.
- Avoid requiring constant manual input for every orbit or routine activity.

## Open design questions

- What is the basic time unit, and how does the player advance or accelerate time?
- What does the first customer request look like, and how is imagery valued and paid for?
- Which design choices belong in the first satellite builder, and which use defaults?
- How should onboard data gain, retain, and realize customer value?
- What anomaly information is immediately visible, and what requires diagnosis?
- Which routine decisions can be expressed as simple operating priorities?
- What is the first meaningful growth choice after the initial satellite is operating?
