# GigShield — AI-Powered Parametric Income Insurance for Q-Commerce Delivery Partners

> Guidewire DEVTrails 2026 | Team 404 Challengers | SRM Institute of Science and Technology

---

## The Problem

Every day, thousands of Zepto and Blinkit delivery partners across India wake up not knowing if they will earn enough. A sudden rainstorm, a spike in air pollution, or an unplanned zone closure can wipe out their entire day's income with zero safety net.

These are not lazy workers. They are people doing 40+ deliveries a day on 10-minute SLAs, earning Rs.600 to Rs.1200 per day. When Chennai floods in November, they do not just get wet. They lose their livelihood. And unlike food delivery workers who can shift platforms or zones, Q-Commerce partners are locked to a single dark store pin-code zone. When that zone goes down, their income drops to exactly Rs.0. No fallback. No alternative.

We built GigShield to fix that.

---

## What is GigShield?

GigShield is an AI-powered parametric insurance platform exclusively built for Q-Commerce delivery partners (Zepto/Blinkit) operating across 165 hyperlocal zones in 5 Indian cities. When an external disruption crosses a predefined threshold — heavy rainfall, extreme heat, severe AQI, or zone closure — the system automatically detects it, validates the claim through a 6-layer fraud engine, calculates the exact income lost, and transfers it directly to the worker's UPI. Zero forms. Zero calls. Zero waiting.

This is not traditional insurance. There is no claim process. The worker does not even need to know a disruption occurred. GigShield already handled it.

---

## Live Deployment

Frontend:           https://gigshield-brown.vercel.app
Backend API:        https://gigshield-backend.onrender.com
ML Model API:       https://gigshield-model.onrender.com
GitHub Repository:  https://github.com/Bhargav470/gigshield

Note: Services are on free-tier infrastructure. First request after inactivity may take 30 to 60 seconds. Visit https://gigshield-model.onrender.com/health before demoing to warm up the ML service.

---

## Cities and Zones Covered

Chennai, Tamil Nadu:    40 zones (Velachery, Pallikaranai, Tambaram, Adyar and more)
Mumbai, Maharashtra:    35 zones (Andheri, Dharavi, Powai, Thane and more)
Delhi, NCR:             35 zones (Dwarka, Rohini, Gurgaon, Noida and more)
Bengaluru, Karnataka:   30 zones (Koramangala, Whitefield, HSR Layout and more)
Hyderabad, Telangana:   25 zones (Gachibowli, Kondapur, Kukatpally and more)

Total: 165 hyperlocal zones across 5 cities

---

## Persona

Target User: Zepto and Blinkit delivery partners across India, aged 20 to 40, earning Rs.600 to Rs.1200 per day, operating within a single dark store delivery zone.

Why Q-Commerce specifically?

Q-Commerce partners face a unique vulnerability that food delivery workers do not. A Zomato rider can switch restaurants or areas during a disruption. A Zepto partner cannot — their entire work is tied to one dark store zone. When Velachery floods, a Zepto partner there earns nothing. This makes them the highest-need, most underserved segment for parametric income insurance.

Scenario 1 — Ravi, Velachery Zone, Chennai:
Ravi earns Rs.800 per day delivering for Zepto. On November 15th, Chennai receives 32mm of rainfall. Without GigShield, he loses Rs.560 with no recourse. With GigShield, the ML model detects the rainfall threshold breach, the automated trigger engine processes the claim, runs a 6-layer fraud check, and transfers Rs.560 to his UPI before he even opens the app.

Scenario 2 — Ankit, Andheri Zone, Mumbai:
Ankit registers on GigShield, selects Mumbai as his city and Andheri as his zone. During monsoon, live weather data for Mumbai crosses the threshold. GigShield detects it, runs fraud check, and automatically processes his payout without him doing anything.

Scenario 3 — GPS Fraud Attempt:
A worker registers in Velachery but sits at home in Ambattur and tries to file a rain claim. Layer 6 GPS fraud check detects the worker is 12km away from the Velachery zone center. Fraud score 80/100. Claim held. No fraudulent payout.

---

## Application Workflow

Worker opens GigShield — selects language (English / Hindi / Tamil)
Fills registration details — name, phone, worker ID, platform, daily earnings
Worker ID validated — Zepto format ZPT-XX-YYYY-NNNN or Blinkit format BLK-XX-YYYY-NNNN
Biometric fingerprint verification — device authenticator used for identity confirmation
City selected — Chennai, Mumbai, Delhi, Bengaluru, or Hyderabad
Zone selected from that city's hyperlocal zones
Income fingerprint baseline established from declared earnings
AI risk profile built — zone risk score + income + seasonal factors
Weekly premium calculated — Rs.49 to Rs.79 based on zone risk
Razorpay payment — UPI/card/netbanking in test mode
Policy activated

Automated Trigger Engine runs every 10 minutes:
  Fetches city-specific live weather from wttr.in
  Fetches city-specific AQI from AQICN
  Checks all active policies in the database
  If disruption threshold crossed and fraud check passes:
    Payout calculated (daily income x disruption multiplier)
    UPI transfer initiated
    Worker dashboard updated

---

## Weekly Premium Model

Low Risk zones (Anna Nagar, Egmore, Connaught Place, MG Road):
  Base Rs.49 + Risk Add Rs.9 + Income Add Rs.10 if income over Rs.800 = Rs.49 to Rs.59

Medium Risk zones (T Nagar, Adyar, Bandra, Indiranagar, Gachibowli):
  Base Rs.49 + Risk Add Rs.16 + Income Add Rs.10 if income over Rs.800 = Rs.59 to Rs.69

High Risk zones (Velachery, Pallikaranai, Dharavi, Koramangala, Kukatpally):
  Base Rs.49 + Risk Add Rs.24 + Income Add Rs.10 if income over Rs.800 = Rs.69 to Rs.79

Payout Formula:
  Heavy Rainfall:  70% of daily income
  Extreme Heat:    50% of daily income
  Severe AQI:      60% of daily income
  Zone Closure:    80% of daily income

---

## Parametric Triggers

Heavy Rainfall:
  Threshold: greater than 1.5mm per day (high risk zones) or greater than 3.0mm per day (others)
  Source: wttr.in live API + ML Model

Extreme Heat:
  Threshold: greater than 42 degrees C
  Source: wttr.in live API (city-specific)

Severe AQI:
  Threshold: greater than 300
  Source: AQICN live API (city-specific)

Zone Closure:
  Threshold: curfew or strike declared
  Source: admin trigger (News API integration planned)

---

## AI/ML Integration

Rainfall Prediction Model:
  Algorithm: GradientBoostingRegressor
  Training Data: IMD District-wise Daily Rainfall Dataset, Tamil Nadu (real government data)
  Performance: R-squared 0.6385, MAE 1.23mm
  Output: Predicted daily rainfall in mm + binary insurance trigger YES/NO

Income Fingerprinting (Phase 3):
  Each worker's declared daily income builds a personal earning baseline. Claims involving income amounts inconsistent with historical patterns get flagged automatically. A worker who typically earns Rs.400 per day but claims Rs.1200 in lost income gets scrutinised before payout.

Intelligent Fraud Detection — 6 Layers:

  Layer 1 — Duplicate Claim Check:
  Same worker, same day, same disruption type. Score +60.

  Layer 2 — Delivery Count Validation:
  More than 15 deliveries on a disruption day is suspicious. Score +50 if over 15, +25 if over 8.

  Layer 3 — Claim Frequency Check:
  More than 3 claims in 7 days. Score +30.

  Layer 4 — Zone Risk Mismatch:
  Low-risk zone claiming heavy rainfall during dry period. Score +20.

  Layer 5 — Zone Solidarity Score:
  Cross-worker validation. If 40+ percent of workers in a zone stop delivering simultaneously, that confirms a real disruption. Confirmation reduces fraud score by 20. Only 1 worker claiming when others are working raises score by 15.

  Layer 6 — GPS Location Verification:
  Worker GPS coordinates verified against registered zone center using Haversine formula. Outside zone radius raises score by 40.

  Final Verdict:
  Score 0 to 29:  PASS   — Instant payout
  Score 30 to 59: REVIEW — Manual verification
  Score 60+:      HOLD   — Claim blocked

Worker ID Verification:
  Zepto format:   ZPT-XX-YYYY-NNNN
  Blinkit format: BLK-XX-YYYY-NNNN

Automated Parametric Trigger Engine:
  Cron job every 10 minutes. Checks all active policies. Auto-creates claims with AUTO-PASS verdict for genuinely affected workers. Workers receive payouts even if they never open the app.

---

## Tech Stack

Frontend:              HTML5, CSS3, Vanilla JavaScript
Backend:               Node.js + Express.js
ML Model Service:      Python + Flask
Database:              MySQL hosted on Aiven Cloud
ML Algorithm:          GradientBoostingRegressor (scikit-learn)
Training Data:         IMD District-wise Daily Rainfall Tamil Nadu
Weather API:           wttr.in (real-time temperature and rainfall, city-specific)
AQI API:               AQICN (real-time air quality, city-specific)
Automation:            node-cron (10-minute trigger engine)
Payment Gateway:       Razorpay (test mode UPI/card/netbanking)
Biometric Auth:        Web Authentication API (WebAuthn/FIDO2)
Push Notifications:    Web Push API + VAPID
Multilingual:          Custom translations (English, Hindi, Tamil)
Frontend Hosting:      Vercel
Backend Hosting:       Render
Model Hosting:         Render

---

## Phase 1 — Complete

Worker registration with ID format validation
40 Chennai zones with real IMD historical risk scores
Dynamic weekly premium calculation using ML model
ML rainfall prediction model trained on real IMD data deployed as live API
Zone-specific parametric triggers with dynamic thresholds
4-layer intelligent fraud detection
Automated claim flow — disruption detected, fraud checked, payout calculated
Payout history tracking on worker dashboard
Full deployment: Vercel + Render + Aiven MySQL

---

## Phase 2 — Complete

Live Weather API integration — wttr.in real-time rainfall and temperature
Live AQI API integration — AQICN real-time air quality
Dashboard Live Disruption Monitors showing actual live city-specific values
Heat and AQI trigger validation — no payout if threshold not crossed
No Disruption screen with AI explanation showing live data
Zone Solidarity Score — Layer 5 fraud detection using cross-worker behavior
GPS Location Verification — Layer 6 fraud detection using Haversine formula
40 zone GPS coordinates with radius boundaries
Automated Parametric Trigger Engine — cron job every 10 minutes
Manual trigger engine test endpoint
Multilingual support — English, Hindi, Tamil across all 4 pages
Language selection screen on first visit
Language toggle on dashboard
Web Push Notifications infrastructure — VAPID keys and service worker
Premium calculation fix — actuarially correct zone-based pricing

---

## Phase 3 — Complete

Multi-City Expansion:
  Platform expanded from Chennai-only to 5 major Indian cities.
  165 hyperlocal zones added across Chennai, Mumbai, Delhi, Bengaluru, and Hyderabad.
  Each city has its own zone database, risk scoring, and weather API configuration.
  City-specific live weather and AQI fetched for each worker's registered city.
  All disruption monitors and claim flows now city-aware.

Income Fingerprinting:
  Worker's declared daily income establishes an earning baseline at registration.
  Claims are validated against the worker's income profile.
  Payout amounts are dynamically tied to each worker's actual declared earnings.
  Inconsistent income claims get flagged during fraud detection.

Razorpay UPI Integration (Test Mode):
  Premium payment integrated with Razorpay payment gateway.
  Supports UPI, debit/credit card, and netbanking in test mode.
  Real payment confirmation flow with order ID and payment ID tracking.
  Production keys ready to swap in when platform goes live.

Biometric Fingerprint Verification:
  Workers verify their identity using device biometrics during onboarding.
  Uses Web Authentication API (WebAuthn/FIDO2) — works on fingerprint-enabled devices.
  Adds a hardware-level identity layer before OTP verification.
  Prevents identity theft and fake worker registrations.



---

## Business Model

Revenue per worker per year:
  Average weekly premium:  Rs.64
  Annual premium revenue:  Rs.3,328 per worker

Payout calculation:
  Average daily income:              Rs.600
  Payout per event:                  Rs.168
  Disruptive events per year:        approximately 8 (high risk zones)
  Annual payout per worker:          Rs.1,344

Loss ratio: 40 percent — profitable and sustainable.

Revenue model:
  20 percent of premium as platform fee
  Reinsurance partnership with established insurers for risk pooling
  B2B2C: partner with Zepto and Blinkit to offer GigShield as default worker benefit

---

## If This Project Scales — Future Roadmap

The following features are planned if GigShield moves beyond the hackathon into a production product:

Real Platform API Integration:
  Replace format-based worker ID validation with actual Zepto and Blinkit API calls to confirm active employment. Only workers with verified active platform accounts can enroll.

WhatsApp Notifications via Twilio:
  When a payout is processed, a WhatsApp message sent to the worker's number instantly. Zero app interaction required.

Dynamic Pricing Engine:
  Weekly premium recalculation based on updated zone risk scores, seasonal rainfall patterns, and individual claim history. Workers in low-claim zones see premium reductions over time.

Admin Insurer Dashboard:
  Real-time loss ratio analytics, claim volume forecasting for the next 7 days, zone-level risk heat maps, fraud case management queue, and policy renewal tracking for insurance operations teams.

Offline PWA Support:
  Full Progressive Web App with offline capability. Workers in areas with intermittent connectivity can access policy details and payout history without internet.

Tamil Nadu Government Data Integration:
  Real-time integration with TNSDMA flood alerts and CMDA zone closure notifications for official trigger validation.

Blockchain Payout Ledger:
  Immutable record of all claim triggers, fraud checks, and payouts on a public ledger. Workers can independently verify their payout history without trusting the platform.

Pan-India Expansion:
  ML model retrained on all-India IMD district data. Expansion to Pune, Kolkata, Ahmedabad, Jaipur, and tier-2 cities with significant Q-Commerce activity.

Insurance Regulator Integration:
  IRDAI sandbox integration for regulatory compliance. Formal insurance product filing as a microinsurance product under IRDAI guidelines.

Worker Cooperative Model:
  Workers collectively own a stake in GigShield through a cooperative structure. Premium surpluses at end of year returned to workers as dividends.

---

## Development Timeline

Phase 1 — Mar 4 to Mar 20   — Ideation and Foundation    — Complete
Phase 2 — Mar 21 to Apr 4   — Automation and Protection  — Complete
Phase 3 — Apr 5 to Apr 17   — Scale and Optimise         — Complete

---

## Team

Team Name:   404 Challengers
Institution: SRM Institute of Science and Technology
Track:       AI-Powered Insurance for India's Gig Economy
Hackathon:   Guidewire DEVTrails 2026
