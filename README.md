# GigShield — AI-Powered Parametric Income Insurance for Q-Commerce Delivery Partners

> Guidewire DEVTrails 2026 | Team 404 Challengers | SRM Institute of Science and Technology

---

## The Problem

Every day, thousands of Zepto and Blinkit delivery partners in Chennai wake up not knowing if they will earn enough. A sudden rainstorm, a spike in air pollution, or an unplanned zone closure can wipe out their entire day's income — with zero safety net.

These are not lazy workers. They are people doing 40+ deliveries a day on 10-minute SLAs, earning Rs.600–Rs.1200/day. When Chennai floods in November, they do not just get wet — they lose their livelihood. And unlike food delivery workers who can shift platforms or zones, Q-Commerce partners are locked to a single dark store's pin-code zone. When that zone goes down, their income drops to exactly Rs.0. No fallback. No alternative.

We built GigShield to fix that.

---

## What is GigShield?

GigShield is an AI-powered parametric insurance platform exclusively built for Q-Commerce delivery partners (Zepto/Blinkit) operating across 40 hyperlocal zones in Chennai. When an external disruption crosses a predefined threshold — heavy rainfall, extreme heat, severe AQI, or zone closure — the system automatically detects it, validates the claim through a 6-layer fraud engine, calculates the exact income lost, and transfers it directly to the worker's UPI. Zero forms. Zero calls. Zero waiting.

This is not traditional insurance. There is no claim process. The worker does not even need to know a disruption occurred — GigShield already handled it.

---

## Live Deployment

Frontend:           https://gigshield-brown.vercel.app
Backend API:        https://gigshield-backend.onrender.com
ML Model API:       https://gigshield-model.onrender.com
GitHub Repository:  https://github.com/Bhargav470/gigshield

Note: Services are on free-tier infrastructure. First request after inactivity may take 30-60 seconds. Visit https://gigshield-model.onrender.com/health before demoing to warm up the ML service.

---

## Persona

Target User: Zepto and Blinkit delivery partners in Chennai, aged 20-40, earning Rs.600-Rs.1200/day, operating within a single dark store delivery zone.

Why Q-Commerce specifically?

Q-Commerce partners face a unique vulnerability that food delivery workers do not. A Zomato rider can switch restaurants or areas during a disruption. A Zepto partner cannot — their entire work is tied to one dark store's zone. When Velachery floods, a Zepto partner in that zone earns nothing. This makes them the highest-need, most underserved segment for parametric income insurance.

Persona Scenarios:

Scenario 1 — Ravi, Velachery Zone:
Ravi earns Rs.800/day delivering for Zepto. On November 15th, Chennai receives 32mm of rainfall. Ravi cannot work. Without GigShield, he loses Rs.560 with no recourse. With GigShield, the ML model detects the rainfall threshold breach, the automated trigger engine processes the claim automatically, runs a 6-layer fraud check, and transfers Rs.560 to his UPI — before he even opens the app.

Scenario 2 — Priya, Anna Nagar Zone:
Priya works in a low-risk zone. In March, Chennai is dry. GigShield's ML model correctly predicts minimal rainfall and shows "No Disruption Today." Her Rs.49/week premium keeps her covered for when monsoon hits in October. She pays Rs.7/day for peace of mind.

Scenario 3 — GPS Fraud Attempt:
A worker registers in Velachery but physically sits at home in Ambattur and tries to file a rain disruption claim. GigShield's Layer 6 GPS fraud check detects that the worker is 12km away from the Velachery zone center — outside the 3km radius. Fraud score: 80/100. Claim held for review. No fraudulent payout.

---

## Application Workflow

Worker Registers with Zepto/Blinkit Worker ID
Language Selected (English / Hindi / Tamil)
ID Format Validated (ZPT-XX-YYYY-NNNN)
Zone Selected from 40 Chennai zones
AI Risk Profile Built (zone + income + season)
Weekly Premium Calculated (Rs.49-Rs.79)
Policy Activated

Automated Trigger Engine runs every 10 minutes:
Live Weather (wttr.in) + AQI (AQICN) + ML Model check
If disruption threshold crossed:
  6-Layer Fraud Check runs
  If PASS: Dynamic Loss Calculated (Daily Income x Disruption Multiplier)
  UPI Payout Initiated — under 5 minutes
  Worker Dashboard Updated
If no disruption: Coverage active, monitoring continues

---

## Weekly Premium Model

Low Risk zones (Anna Nagar, Egmore, Nungambakkam):
  Base Rs.49 + Risk Add Rs.9 + Income Add Rs.10 (if income > Rs.800) = Rs.49 to Rs.59

Medium Risk zones (T Nagar, Adyar, Sholinganallur):
  Base Rs.49 + Risk Add Rs.16 + Income Add Rs.10 (if income > Rs.800) = Rs.59 to Rs.69

High Risk zones (Velachery, Pallikaranai, Medavakkam):
  Base Rs.49 + Risk Add Rs.24 + Income Add Rs.10 (if income > Rs.800) = Rs.69 to Rs.79

Payout Formula:
  Payout = Daily Income x Disruption Multiplier
  Heavy Rainfall  : 70% of daily income
  Extreme Heat    : 50% of daily income
  Severe AQI      : 60% of daily income
  Zone Closure    : 80% of daily income

---

## Parametric Triggers

Heavy Rainfall:
  Threshold: greater than 1.5mm/day (high risk zones) / greater than 3.0mm/day (others)
  Current Source: wttr.in live API + ML Model
  Next Phase: IMD real-time API

Extreme Heat:
  Threshold: greater than 42 degrees C
  Current Source: wttr.in live API
  Next Phase: OpenWeatherMap

Severe AQI:
  Threshold: greater than 300
  Current Source: AQICN live API
  Next Phase: CPCB API

Zone Closure:
  Threshold: Curfew/Strike declared
  Current Source: Admin trigger
  Next Phase: News API + civic data feeds

---

## AI/ML Integration

Rainfall Prediction Model (Live):
  Algorithm: GradientBoostingRegressor
  Training Data: India Meteorological Department — District-wise Daily Rainfall Dataset, Tamil Nadu (real government data)
  Features: Day of month, Month, Zone/Station
  Performance: R-squared = 0.6385, MAE = 1.23mm
  Zone Mapping: 40 Chennai zones mapped to nearest IMD districts with flood-risk multipliers
  Output: Predicted daily rainfall in mm + Binary insurance trigger YES/NO

Dynamic Premium Calculator (Live):
  Zone risk scores (0-100) derived from historical rainfall distributions feed into premium calculation. Pallikaranai (risk score 88) pays more than Nungambakkam (risk score 28) because the data says Pallikaranai floods more. This is actuarially fair pricing.

Intelligent Fraud Detection — 6 Layers (Live):

  Layer 1 — Duplicate Claim Check:
  Same worker, same day, same disruption type. Score: +60.

  Layer 2 — Delivery Count Validation:
  More than 15 deliveries on a disruption claim day is suspicious. Score: +50 if greater than 15, +25 if greater than 8.

  Layer 3 — Claim Frequency Check:
  More than 3 claims in 7 days triggers scrutiny. Score: +30.

  Layer 4 — Zone Risk Mismatch:
  Low-risk zone claiming heavy rainfall during dry month. Score: +20.

  Layer 5 — Zone Solidarity Score:
  Cross-worker validation. If only 1 out of 50 workers in a zone files a claim, that is suspicious. If 40 out of 50 workers stop delivering simultaneously, that confirms a real disruption. Score: -20 if confirmed real, +15 if suspicious.

  Layer 6 — GPS Location Verification:
  Worker's real-time GPS coordinates compared against registered zone center using Haversine formula. If worker is outside zone radius (2-4km depending on zone), fraud score increases. Score: +40 if outside zone.

  Final Verdict:
  Score 0-29:  PASS   — Instant payout
  Score 30-59: REVIEW — Manual verification
  Score 60+:   HOLD   — Claim blocked

Worker ID Verification (Live):
  Zepto format:   ZPT-XX-YYYY-NNNN (example: ZPT-CH-2024-1234)
  Blinkit format: BLK-XX-YYYY-NNNN (example: BLK-CH-2024-5678)

Automated Parametric Trigger Engine (Live):
  Every 10 minutes, a background cron job runs automatically:
  - Fetches live weather data (rainfall, temperature) from wttr.in
  - Fetches live AQI from AQICN
  - Checks ALL active policies in the database
  - For each active policy, determines if disruption thresholds are crossed
  - Auto-creates claims with verdict AUTO-PASS for genuinely affected workers
  - Prevents duplicate auto-claims for same worker on same day
  Workers receive payouts even if they never open the app.

---

## Adversarial Defense and Anti-Spoofing Strategy

A coordinated syndicate using GPS spoofing to fake disruption locations is a real threat to parametric insurance. GigShield addresses this at multiple layers.

A genuine delivery partner stuck in a flood zone behaves differently from a bad actor spoofing from home. Genuine workers show zero deliveries during the disruption window, consistent zone history, and claims filed within the natural event window. Bad actors show normal delivery counts during claimed disruption, GPS coordinates outside their registered zone, and claims from zones they have never historically operated in.

Zone Solidarity Score makes coordinated spoofing exponentially harder — a fraud ring would need to recruit the majority of workers in a zone to beat this cross-worker validation check.

GPS verification using Haversine distance calculation confirms physical presence. A worker whose device GPS shows them 12km away from their registered zone during a claim gets flagged automatically.

The fraud threshold is set conservatively at 60+ for HOLD. Scores of 30-59 go to REVIEW with acknowledgment — not rejection. Workers in genuine disruptions where the Zone Solidarity Score confirms a real event get their individual fraud score discounted proportionally.

---

## Business Model

Revenue per worker per year:
  Average weekly premium:  Rs.64
  Annual premium revenue:  Rs.3,328 per worker

Realistic payout calculation:
  Average daily income:                      Rs.600
  Payout per event:                          Rs.168 (Rs.600 x 70% x 4hrs/10hrs)
  Disruptive events per year (high risk):    approximately 8
  Annual payout per worker:                  Rs.1,344

Loss ratio: 40% — profitable and sustainable.

Revenue model:
  20% of premium as platform fee
  Reinsurance partnership with established insurers for risk pooling
  B2B2C: partner with Zepto/Blinkit to offer GigShield as default worker benefit

---

## Tech Stack

Frontend:           HTML5, CSS3, Vanilla JavaScript
Backend:            Node.js + Express.js
ML Model Service:   Python + Flask
Database:           MySQL hosted on Aiven Cloud
ML Algorithm:       GradientBoostingRegressor (scikit-learn)
Training Data:      IMD District-wise Daily Rainfall — Tamil Nadu
Weather API:        wttr.in (real-time temperature + rainfall)
AQI API:            AQICN (real-time air quality)
Automation:         node-cron (10-minute trigger engine)
Frontend Hosting:   Vercel
Backend Hosting:    Render
Model Hosting:      Render
Push Notifications: Web Push API + VAPID

---

## Phase 1 — What Was Built (Complete)

- Worker registration with Zepto/Blinkit ID format validation
- 40 Chennai zones with real risk scores from IMD historical data
- Dynamic weekly premium calculation using ML model risk scores
- ML rainfall prediction model trained on real IMD data, deployed as live API
- Zone-specific parametric triggers with dynamic thresholds
- 4-layer intelligent fraud detection engine with scoring
- Automated claim flow — disruption detected, fraud checked, payout calculated
- Dynamic payout amounts tied to each worker's declared daily income
- Payout history tracking on worker dashboard
- Full end-to-end cloud deployment: Vercel + Render + Aiven MySQL

---

## Phase 2 — What Was Built (Complete)

- Live Weather API integration (wttr.in) — real-time rainfall and temperature
- Live AQI API integration (AQICN) — real-time air quality data
- Dashboard Live Disruption Monitors showing actual live values with thresholds
- Heat and AQI trigger validation — no payout if threshold not crossed
- No Disruption screen with AI explanation showing live data
- Zone Solidarity Score — Layer 5 fraud detection using cross-worker behavior
- GPS Location Verification — Layer 6 fraud detection using Haversine formula
- 40 zone GPS coordinates with radius boundaries defined
- Automated Parametric Trigger Engine — cron job every 10 minutes(https://gigshield-backend.onrender.com/api/run-trigger-engine)
- Manual trigger engine test endpoint for verification
- Multilingual support — English, Hindi, Tamil across all 4 pages
- Language selection screen on first visit — saves preference in localStorage
- Language toggle on dashboard for switching anytime
- Web Push Notifications infrastructure (VAPID keys, service worker)
- Premium calculation fix — actuarially correct zone-based pricing

---

## Phase 3 — Upcoming Features

Income Fingerprinting:
  Each worker's 30-day delivery history builds a personal income signature. Claims that do not match the worker's historical earning patterns get flagged automatically. A worker who typically earns Rs.400/day but claims Rs.1200 in lost income gets scrutinised.

Razorpay UPI Integration:
  Replace mock payout simulation with actual Razorpay test-mode UPI transfers. Workers receive real confirmation with UTR numbers, creating an auditable payment trail.

Multi-City Expansion:
  Expand beyond Chennai to Mumbai, Delhi, Bengaluru, and Hyderabad. Each city gets its own zone database, risk scoring, and weather API configuration. ML model retrained on all-India IMD district data.

WhatsApp Notification via Twilio:
  When a payout is processed, a WhatsApp message is sent to the worker's registered number. Zero app interaction required. Message: "GigShield: Rs.420 transferred to your UPI for Heavy Rainfall disruption in Velachery."

Admin Insurer Dashboard:
  Separate dashboard for insurance operations teams showing live loss ratio analytics, claim volume forecasting for next 7 days, zone-level risk heat maps, fraud case management queue, and policy renewal tracking.

Real Platform API Integration:
  Replace format-based worker ID validation with actual Zepto and Blinkit API calls to confirm active employment status. Only workers with active platform accounts can enroll.

Offline PWA Support:
  Convert to a full Progressive Web App with offline capability. Workers in areas with intermittent connectivity can access policy details and payout history without internet.

Dynamic Pricing Engine:
  Premium recalculation every week based on updated zone risk scores, seasonal rainfall patterns, and individual claim history. Workers in low-claim zones see premium reductions over time.

Tamil Nadu Government Data Integration:
  Real-time integration with TNSDMA flood alerts and CMDA zone closure notifications for official trigger validation.

Blockchain Payout Ledger:
  Immutable record of all claim triggers, fraud checks, and payouts on a public ledger. Workers can independently verify their payout history without trusting the platform.

---

## Platform Decision: Web App

A Progressive Web App was chosen over native mobile because delivery workers use diverse, low-cost Android devices. Browser-based access requires zero installation — a worker can be onboarded via a WhatsApp link in under 2 minutes.

---

## Development Timeline

Phase 1 — Mar 4 to Mar 20   — Ideation and Foundation    — Complete
Phase 2 — Mar 21 to Apr 4   — Automation and Protection  — Complete
Phase 3 — Apr 5 to Apr 17   — Scale and Optimise         — In Progress

---

## Team

Team Name:   404 Challengers
Institution: SRM Institute of Science and Technology
Track:       AI-Powered Insurance for India's Gig Economy
Hackathon:   Guidewire DEVTrails 2026
