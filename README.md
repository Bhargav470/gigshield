# GigShield — AI-Powered Parametric Income Insurance for Q-Commerce Delivery Partners

> Guidewire DEVTrails 2026 | Team 404 Challengers | SRM Institute of Science and Technology

---

## The Problem

Every day, thousands of Zepto and Blinkit delivery partners in Chennai wake up not knowing if they will earn enough. A sudden rainstorm, a spike in air pollution, or an unplanned zone closure can wipe out their entire day's income — with zero safety net.

These are not lazy workers. They are people doing 40+ deliveries a day on 10-minute SLAs, earning Rs.600–Rs.1200/day. When Chennai floods in November, they do not just get wet — they lose their livelihood. And unlike food delivery workers who can shift platforms or zones, Q-Commerce partners are locked to a single dark store's pin-code zone. When that zone goes down, their income drops to exactly Rs.0. No fallback. No alternative.

**We built GigShield to fix that.**

---

## What is GigShield?

GigShield is an AI-powered parametric insurance platform exclusively built for Q-Commerce delivery partners (Zepto/Blinkit) operating across 40 hyperlocal zones in Chennai. When an external disruption crosses a predefined threshold — heavy rainfall, extreme heat, severe AQI, or zone closure — the system automatically detects it, validates the claim through a 4-layer fraud engine, calculates the exact income lost, and transfers it directly to the worker's UPI. Zero forms. Zero calls. Zero waiting.

This is not traditional insurance. There is no claim process. The worker does not even need to know a disruption occurred — GigShield already handled it.

---

## Live Deployment

| Service | URL |
|---------|-----|
| Frontend | https://gigshield-brown.vercel.app |
| Backend API | https://gigshield-backend.onrender.com |
| ML Model API | https://gigshield-model.onrender.com |
| GitHub Repository | https://github.com/Bhargav470/gigshield |

> Note: Services are on free-tier infrastructure. First request after inactivity may take 30–60 seconds. Visit https://gigshield-model.onrender.com/health before demoing to warm up the ML service.

---

## Persona

**Target User:** Zepto and Blinkit delivery partners in Chennai, aged 20–40, earning Rs.600–Rs.1200/day, operating within a single dark store delivery zone.

**Why Q-Commerce specifically?**

Q-Commerce partners face a unique vulnerability that food delivery workers do not. A Zomato rider can switch restaurants or areas during a disruption. A Zepto partner cannot — their entire work is tied to one dark store's zone. When Velachery floods, a Zepto partner in that zone earns nothing. This makes them the highest-need, most underserved segment for parametric income insurance.

**Persona Scenarios:**

Scenario 1 — Ravi, Velachery Zone:
Ravi earns Rs.800/day delivering for Zepto. On November 15th, Chennai receives 32mm of rainfall. Ravi cannot work. Without GigShield, he loses Rs.560 with no recourse. With GigShield, the ML model detects the rainfall threshold breach, runs a fraud check, calculates Rs.560 (70% of daily income), and transfers it to his UPI — before he even opens the app.

Scenario 2 — Priya, Anna Nagar Zone:
Priya works in a low-risk zone. In March, Chennai is dry. GigShield's ML model correctly predicts minimal rainfall and shows "No Disruption Today." Her Rs.49/week premium keeps her covered for when monsoon hits in October. She pays Rs.7/day for peace of mind.

Scenario 3 — Fraud Attempt:
A worker in a safe zone on a sunny day tries to file a rain disruption claim. GigShield's fraud engine flags the claim: low ML rainfall prediction, zone-risk mismatch, and 22 deliveries completed that day. Fraud score: 80/100. Claim held for review. No fraudulent payout.

---

## Application Workflow
```
Worker Registers with Zepto/Blinkit Worker ID
                  |
                  v
   ID Format Validated (ZPT-XX-YYYY-NNNN)
                  |
                  v
     Zone Selected from 40 Chennai zones
                  |
                  v
   AI Risk Profile Built (zone + income + season)
                  |
                  v
   Weekly Premium Calculated (Rs.49-Rs.79)
                  |
                  v
         Policy Activated
                  |
                  v
     [ Continuous Background Monitoring ]
      ML Model + Zone Risk Check daily
                  |
                  v
      Disruption Threshold Crossed?
                  |
           YES    |    NO
                  |     \
                  v      v
           4-Layer     Coverage active,
           Fraud       no payout needed
           Check
                  |
           PASS   |   HOLD/REVIEW
                  |
                  v
        Dynamic Loss Calculated
   (Daily Income x 70% x Disruption Multiplier)
                  |
                  v
     UPI Payout Initiated — under 5 minutes
                  |
                  v
   Worker Notified: "Rs.420 transferred to your UPI"
```

---

## Weekly Premium Model

| Zone Risk | Base | Risk Add | Income Add (>Rs.800/day) | Range |
|-----------|------|----------|--------------------------|-------|
| Low (Anna Nagar, Egmore, Nungambakkam) | Rs.49 | Rs.9 | Rs.10 | Rs.49–Rs.59 |
| Medium (T Nagar, Adyar, Sholinganallur) | Rs.49 | Rs.16 | Rs.10 | Rs.59–Rs.69 |
| High (Velachery, Pallikaranai, Medavakkam) | Rs.49 | Rs.24 | Rs.10 | Rs.69–Rs.79 |

**Why weekly pricing?** Gig workers earn weekly and think weekly. Monthly premiums feel like a large, uncertain commitment. At Rs.49–Rs.79/week, coverage costs Rs.7–Rs.11/day — less than a cup of chai. This aligns with how delivery partners actually manage money.

**Payout Formula:**
```
Payout = Daily Income x 70% x Disruption Multiplier

Disruption Multipliers:
  Heavy Rainfall  : 0.70
  Extreme Heat    : 0.50
  Severe AQI      : 0.60
  Zone Closure    : 0.80
```

---

## Parametric Triggers

| Trigger | Threshold | Current Source | Phase 2 Source |
|---------|-----------|----------------|----------------|
| Heavy Rainfall | >1.5mm/day (high risk) / >3.0mm/day (others) | Trained ML Model (IMD data) | Live IMD API |
| Extreme Heat | >42 degrees C | Mock | OpenWeatherMap API |
| Severe AQI | >300 | Mock | AQICN API |
| Zone Closure | Curfew/Strike | Admin trigger | News API + civic data feeds |

**Why zone-specific thresholds?** Standard parametric insurance uses absolute thresholds (e.g., 25mm rainfall). This fails in Chennai's hyperlocal context — Velachery floods at 1.5mm daily due to its low-lying geography, while Nungambakkam handles 3mm+ without disruption. Our ML model captures this zone-level variation using real IMD district data mapped to each delivery zone.

---

## AI/ML Integration

### Rainfall Prediction Model (Live)

- Algorithm: GradientBoostingRegressor
- Training Data: India Meteorological Department — District-wise Daily Rainfall Dataset, Tamil Nadu (real government data)
- Features: Day of month, Month, Zone/Station
- Performance: R-squared = 0.6385, MAE = 1.23mm
- Zone Mapping: 40 Chennai zones mapped to nearest IMD districts with flood-risk multipliers from historical data
- Output: Predicted daily rainfall in mm + Binary insurance trigger (YES/NO)

The model is trained on real IMD data and deployed as a Flask microservice on Render. Every claim trigger calls this model with the worker's zone and today's date before processing any payout.

### Dynamic Premium Calculator (Live)

Zone risk scores (0–100) derived from historical rainfall distributions feed into premium calculation. Pallikaranai (risk score: 88) pays more than Nungambakkam (risk score: 28) because the data says Pallikaranai floods more. This is actuarially fair pricing.

### Intelligent Fraud Detection — 4 Layers (Live)

Layer 1 — Duplicate Claim Check: Same worker, same day, same disruption type. Score: +60.

Layer 2 — Delivery Count Validation: More than 15 deliveries on a disruption claim day is suspicious. Score: +50 if >15, +25 if >8.

Layer 3 — Claim Frequency Check: More than 3 claims in 7 days triggers scrutiny. Score: +30.

Layer 4 — Zone Risk Mismatch: Low-risk zone claiming heavy rainfall during dry month. Score: +20.

Final Verdict:
- Score 0–29: PASS — Instant payout
- Score 30–59: REVIEW — Manual verification
- Score 60+: HOLD — Claim blocked

### Worker ID Verification (Live)

Only workers with valid Zepto or Blinkit ID formats can register.

- Zepto format: ZPT-XX-YYYY-NNNN (example: ZPT-CH-2024-1234)
- Blinkit format: BLK-XX-YYYY-NNNN (example: BLK-CH-2024-5678)

---

## Business Model

Revenue per worker per year:
- Average weekly premium: Rs.64
- Annual premium revenue: Rs.3,328 per worker

Realistic payout calculation:
- Average daily income: Rs.600
- Payout per event: Rs.600 x 70% x (4 disrupted hours / 10 working hours) = Rs.168
- Truly disruptive events per year per high-risk zone: approximately 8 (based on Chennai IMD historical data)
- Annual payout per worker: 8 x Rs.168 = Rs.1,344

**Loss ratio: 40% — profitable and sustainable.**

GigShield revenue model:
- 20% of premium as platform fee
- Reinsurance partnership with established insurers for risk pooling at scale
- B2B2C distribution: partner directly with Zepto/Blinkit to offer GigShield as a default worker benefit

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js + Express.js |
| ML Model Service | Python + Flask |
| Database | MySQL hosted on Aiven Cloud |
| ML Algorithm | GradientBoostingRegressor (scikit-learn) |
| Training Data | IMD District-wise Daily Rainfall — Tamil Nadu |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |
| Model Hosting | Render |

---

## What is Built in Phase 1

All of the following are fully implemented and live in the deployed prototype:

- Worker registration with Zepto/Blinkit ID format validation
- 40 Chennai zones with real risk scores derived from IMD historical data
- Dynamic weekly premium calculation using ML model risk scores
- ML rainfall prediction model trained on real IMD data, deployed as live API
- Zone-specific parametric triggers with dynamic thresholds
- 4-layer intelligent fraud detection engine with scoring
- Automated claim flow — disruption detected, fraud checked, payout calculated
- Dynamic payout amounts tied to each worker's declared daily income
- Payout history tracking on worker dashboard
- Live disruption monitoring panel
- Full end-to-end cloud deployment: Vercel + Render + Aiven MySQL

---

## Adversarial Defense & Anti-Spoofing Strategy

A coordinated syndicate of workers using GPS spoofing to fake disruption locations is a real threat to any parametric insurance platform. Here is how GigShield addresses it architecturally.

### The Differentiation — Genuine Worker vs Bad Actor

A genuine delivery partner stuck in a flood zone behaves differently from a bad actor spoofing their location from home.

Genuine worker signals: delivery count drops to zero during the disruption window, last known GPS movement was within the claimed zone before the disruption, claim filed within the natural window of the disruption event, and the worker's 30-day delivery history shows consistent zone activity.

Bad actor signals: delivery count remains normal or high while claiming disruption (our existing Layer 2 fraud check catches this — more than 15 deliveries on a claimed disruption day scores +50), GPS coordinates change unusually fast between delivery pings suggesting spoofed movement, claim filed at an unusual hour relative to the disruption event, and the worker has never previously operated in the claimed zone.

Our existing fraud detection already catches the delivery count signal. Phase 2 GPS validation will add location trajectory analysis.

### The Data — Beyond GPS Coordinates

To detect a coordinated fraud ring, GigShield uses the following data points:

Zone Solidarity Score: If 40 out of 50 workers in a zone claim disruption in the same hour, that confirms a real event. If only 5 out of 50 claim it, those 5 are flagged for review. This cross-worker signal makes coordinated spoofing exponentially harder — a syndicate would need to recruit the majority of workers in a zone to beat this check.

Claim Timing Correlation: Legitimate disruption claims cluster naturally around the disruption window. Spoofed claims in a coordinated attack tend to arrive in batches at irregular hours. Outlier timing patterns are flagged.

Delivery Platform Cross-Reference (Phase 2): In production, Zepto and Blinkit APIs will confirm whether a worker's delivery activity dropped during the claimed disruption. A worker with 22 completed deliveries during a claimed flood — as our fraud engine already checks today — cannot successfully spoof.

Device Fingerprinting (Phase 3): Multiple accounts filing claims from the same device or IP cluster signal a fraud ring. This is a standard anti-fraud technique used in fintech that we will implement at scale.

### The UX Balance — Flagged Claims Without Penalizing Honest Workers

This is the hardest design problem. A genuine worker experiencing a real network drop in bad weather might look suspicious to an algorithm.

GigShield's approach has three layers:

First, the fraud score threshold for automatic HOLD is set conservatively at 60+. A worker scoring 30–59 goes to REVIEW, not rejection. They still receive a provisional acknowledgment and are not left in silence.

Second, REVIEW queue resolution is time-bound. Any claim in REVIEW that is not resolved within 2 hours automatically escalates — the worker is not stuck indefinitely.

Third, the Zone Solidarity Score actively protects honest workers. If their zone shows a genuine disruption signal (majority of workers not delivering), their individual fraud score is discounted proportionally. A real flood protects real workers from being falsely flagged.

The principle: we would rather approve a borderline legitimate claim than deny a genuine one. Fraud prevention is calibrated to catch organized rings, not to penalize individual workers who happen to have unusual delivery patterns on a disruption day.

## What Comes Next — Phase 2 and Phase 3

**Phase 2 — Protect Your Worker (Mar 21 – Apr 4)**

Real-time weather API integration (OpenWeatherMap, AQICN) replacing mock triggers for live accuracy. The ML model continues handling risk scoring and premium calculation while live APIs validate daily triggers.

GPS-based fraud detection — validating that a worker was physically in the claimed zone during the disruption. This directly addresses GPS spoofing, a known fraud vector in delivery-based insurance.

Zone Solidarity Score — if 40 out of 50 workers in a zone file claims during the same hour, that confirms a real disruption. If only 1 files, that is suspicious. This cross-worker validation layer makes fraud exponentially harder.

WhatsApp Bot integration — workers receive a WhatsApp message when a payout is processed. Zero app opens required.

**Phase 3 — Scale and Optimise (Apr 5 – Apr 17)**

Income Fingerprinting — each worker's 30-day earning history builds a personal income signature. Claims that do not match historical patterns get flagged automatically.

Multi-language support — Tamil and Hindi interfaces, removing the language barrier for workers who are not comfortable in English. This is critical for real adoption.

Real Zepto/Blinkit API integration — worker ID verification will call the platform's actual API to confirm active employment status.

Admin insurer dashboard — loss ratio analytics, predictive claim volume for next 7 days, zone-level risk heat maps, fraud case management.

Razorpay test mode integration — simulated instant UPI payouts replacing current mock transfers.

---

## Platform Decision: Web App

A Progressive Web App was chosen over native mobile for Phase 1 because delivery workers use diverse, low-cost Android devices across hundreds of models. Native app compatibility is a genuine challenge. Browser-based access requires zero installation — a worker can be onboarded via a WhatsApp link in under 2 minutes. PWA supports offline capability, relevant for workers in areas with intermittent connectivity.

---

## Development Timeline

| Phase | Dates | Theme | Status |
|-------|-------|-------|--------|
| Phase 1 | Mar 4–20 | Ideation and Foundation | Complete |
| Phase 2 | Mar 21–Apr 4 | Automation and Protection | Upcoming |
| Phase 3 | Apr 5–17 | Scale and Optimise | Upcoming |

---

## Team

**Team Name:** 404 Challengers
**Institution:** SRM Institute of Science and Technology
**Track:** AI-Powered Insurance for India's Gig Economy
**Hackathon:** Guidewire DEVTrails 2026