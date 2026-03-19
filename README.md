GigShield — AI-Powered Parametric Income Insurance for Q-Commerce Delivery Partners
> Guidewire DEVTrails 2026 | Team 404 Challengers | SRM Institute of Science and Technology
---
The Problem
Every day, thousands of Zepto and Blinkit delivery partners in Chennai wake up not knowing if they will earn enough. A sudden rainstorm, a spike in air pollution, or an unplanned zone closure can wipe out their entire day's income — with zero safety net.
These are not lazy workers. They are people doing 40+ deliveries a day on 10-minute SLAs, earning Rs.600–Rs.1200/day. When Chennai floods in November, they do not just get wet — they lose their livelihood. And unlike food delivery workers who can shift platforms or zones, Q-Commerce partners are locked to a single dark store's pin-code zone. When that zone goes down, their income drops to exactly Rs.0. No fallback. No alternative.
We built GigShield to fix that.
---
What is GigShield?
GigShield is an AI-powered parametric insurance platform exclusively built for Q-Commerce delivery partners (Zepto/Blinkit) operating across 40 hyperlocal zones in Chennai. When an external disruption crosses a predefined threshold — heavy rainfall, extreme heat, severe AQI, or zone closure — the system automatically detects it, validates the claim through a 4-layer fraud engine, calculates the exact income lost, and transfers it directly to the worker's UPI. Zero forms. Zero calls. Zero waiting.
This is not traditional insurance. There is no claim process. The worker does not even need to know a disruption occurred — GigShield already handled it.
---
Live Deployment
Service	URL
Frontend	https://gigshield-brown.vercel.app
Backend API	https://gigshield-backend.onrender.com
ML Model API	https://gigshield-model.onrender.com
GitHub Repository	https://github.com/Bhargav470/gigshield
Note: Services are hosted on free-tier infrastructure. First request after inactivity may take 30–60 seconds to warm up. Visit the health endpoint before demoing: https://gigshield-model.onrender.com/health
---
Persona
Target User: Zepto and Blinkit delivery partners in Chennai, aged 20–40, earning Rs.600–Rs.1200/day, operating within a single dark store delivery zone.
Why Q-Commerce specifically?
Q-Commerce partners face a unique vulnerability that food delivery workers do not. A Zomato rider can switch restaurants or areas during a disruption. A Zepto partner cannot — their entire work is tied to one dark store's zone. When Velachery floods, a Zepto partner in that zone earns nothing. This makes them the highest-need, most underserved segment for parametric income insurance.
Persona Scenarios:
Scenario 1 — Ravi, Velachery Zone:
Ravi earns Rs.800/day delivering for Zepto. On November 15th, Chennai receives 32mm of rainfall. Ravi cannot work. Without GigShield, he loses Rs.560 with no recourse. With GigShield, the ML model detects the rainfall threshold breach, runs a fraud check, calculates Rs.560 (70% of daily income), and transfers it to his UPI — before he even opens the app.
Scenario 2 — Priya, Anna Nagar Zone:
Priya works in a low-risk zone. In March, Chennai is dry. GigShield's ML model correctly predicts minimal rainfall and shows "No Disruption Today." Her Rs.49/week premium keeps her covered for when monsoon hits in October. She pays Rs.7/day for peace of mind.
Scenario 3 — Fraud Attempt:
A worker in a safe zone during a sunny day tries to file a rain disruption claim. GigShield's fraud engine flags the claim: low rainfall prediction from ML model, zone-risk mismatch, and 22 deliveries completed that day. Fraud score: 80/100. Claim held for review. No fraudulent payout.
---
Application Workflow
```
Worker Registers with Zepto/Blinkit Worker ID
         |
         v
ID Format Validated (ZPT-XX-YYYY-NNNN / BLK-XX-YYYY-NNNN)
         |
         v
Zone Selected from 40 Chennai hyperlocal zones
         |
         v
AI Risk Profile Built (zone risk score + income + season)
         |
         v
Weekly Premium Calculated dynamically (Rs.49-Rs.79)
         |
         v
Policy Activated — Coverage begins immediately
         |
         v
[ Continuous Background Monitoring ]
ML Rainfall Model + Zone Risk Check running daily
         |
         v
Disruption Threshold Crossed?
         |
    YES  |  NO
         |   \
         v    v
    4-Layer   Coverage active,
    Fraud     no payout needed
    Check
         |
    PASS |  HOLD/REVIEW
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
Weekly Premium Model
Zone Risk	Base	Risk Add	Income Add (>Rs.800/day)	Range
Low (Anna Nagar, Egmore, Nungambakkam)	Rs.49	Rs.9	Rs.10	Rs.49–Rs.59
Medium (T Nagar, Adyar, Sholinganallur)	Rs.49	Rs.16	Rs.10	Rs.59–Rs.69
High (Velachery, Pallikaranai, Medavakkam)	Rs.49	Rs.24	Rs.10	Rs.69–Rs.79
Why weekly pricing? Gig workers earn weekly and think weekly. Monthly premiums feel like a large, uncertain commitment. At Rs.49–Rs.79/week, coverage costs Rs.7–Rs.11/day — less than a cup of chai. This aligns with how delivery partners actually manage money.
Payout Formula:
```
Payout = Daily Income x 70% x Disruption Multiplier

Disruption Multipliers:
  Heavy Rainfall  : 0.70
  Extreme Heat    : 0.50
  Severe AQI      : 0.60
  Zone Closure    : 0.80
```
---
Parametric Triggers
Trigger	Threshold	Current Source	Phase 2 Source
Heavy Rainfall	>1.5mm/day (high risk) / >3.0mm/day (others)	Trained ML Model (IMD data)	Live IMD API
Extreme Heat	>42 degrees C	Mock	OpenWeatherMap API
Severe AQI	>300	Mock	AQICN API
Zone Closure	Curfew/Strike	Admin trigger	News API + civic data feeds
Why zone-specific thresholds?
Standard parametric insurance uses absolute thresholds (e.g., 25mm rainfall nationwide). This fails in Chennai's hyperlocal context — Velachery floods at 1.5mm daily accumulation due to its low-lying geography and poor drainage, while Nungambakkam can handle 3mm+ without disruption. Our ML model captures this zone-level variation using real IMD district data mapped to each of the 40 delivery zones.
---
AI/ML Integration
Rainfall Prediction Model (Live)
Algorithm: GradientBoostingRegressor
Training Data: India Meteorological Department — District-wise Daily Rainfall Dataset, Tamil Nadu (real government data, not synthetic)
Features: Day of month, Month, Zone/Station
Performance: R-squared = 0.6385, MAE = 1.23mm
Zone Mapping: 40 Chennai zones mapped to nearest IMD districts (Chennai, Chengalpattu, Tiruvallur) with flood-risk multipliers derived from historical data
Output: Predicted daily rainfall in mm + Binary insurance trigger (YES/NO)
The model is trained on real IMD data and deployed as a Flask microservice on Render. Every claim trigger calls this model with the worker's zone and today's date to get a real prediction before processing any payout.
Dynamic Premium Calculator (Live)
Zone risk scores (0–100) derived from historical rainfall distributions feed into premium calculation. Pallikaranai (risk score: 88) pays more than Nungambakkam (risk score: 28) because the data says Pallikaranai floods more. This is actuarially fair pricing — something most gig insurance products do not do.
Intelligent Fraud Detection (Live — 4 Layers)
Layer 1 — Duplicate Claim Check: Same worker, same day, same disruption type. Score: +60 if triggered.
Layer 2 — Delivery Count Validation: If a worker completed >15 deliveries on a day they are claiming was disrupted, that is suspicious. Score: +50 if >15 deliveries, +25 if >8 deliveries.
Layer 3 — Claim Frequency Check: More than 3 claims in 7 days triggers scrutiny. Score: +30 if triggered.
Layer 4 — Zone Risk Mismatch: A low-risk zone (Anna Nagar, Egmore) claiming heavy rainfall during a dry month gets flagged. Score: +20 if triggered.
Final Verdict:
Score 0–29: PASS — Instant payout
Score 30–59: REVIEW — Manual verification queue
Score 60+: HOLD — Claim blocked, flagged for investigation
Worker ID Verification (Live)
Only workers with valid Zepto or Blinkit ID formats can register. This is the first line of fraud prevention — ensuring only actual delivery partners access the platform.
Zepto format: ZPT-XX-YYYY-NNNN (e.g., ZPT-CH-2024-1234)
Blinkit format: BLK-XX-YYYY-NNNN (e.g., BLK-CH-2024-5678)
---
Business Model
Revenue per worker per year:
Average weekly premium: Rs.64
Annual premium revenue: Rs.3,328 per worker
Realistic payout calculation:
Average daily income: Rs.600
Payout per event: Rs.600 x 70% x (4 disrupted hours / 10 working hours) = Rs.168
Truly disruptive events per year per high-risk zone: ~8 (based on Chennai IMD historical data)
Annual payout per worker: 8 x Rs.168 = Rs.1,344
Loss ratio: 40% — profitable and sustainable.
Why not 25mm threshold? At 25mm, very few events trigger. At 1.5mm for high-risk zones, we capture the actual disruption events workers experience, making the product genuinely useful while keeping payouts calibrated to actual lost hours — not full-day flat payouts.
GigShield's revenue model:
20% of premium as platform fee
Reinsurance partnership with established insurers for risk pooling at scale
B2B2C distribution: partner directly with Zepto/Blinkit to offer GigShield as a default benefit, funded partially by the platform
---
Tech Stack
Layer	Technology
Frontend	HTML5, CSS3, Vanilla JavaScript
Backend	Node.js + Express.js
ML Model Service	Python + Flask
Database	MySQL hosted on Aiven Cloud
ML Algorithm	GradientBoostingRegressor (scikit-learn)
Training Data	IMD District-wise Daily Rainfall — Tamil Nadu (real data)
Frontend Hosting	Vercel
Backend Hosting	Render
Model Hosting	Render
---
What is Built in Phase 1
The following features are fully implemented and live:
Worker registration with Zepto/Blinkit ID format validation
40 Chennai zones with real risk scores from IMD data
Dynamic weekly premium calculation using ML model risk scores
ML rainfall prediction model trained on real IMD data, deployed as API
Zone-specific parametric triggers with dynamic thresholds
4-layer intelligent fraud detection engine
Automated claim flow — disruption detected, fraud checked, payout calculated
Dynamic payout amounts tied to each worker's declared income
Payout history tracking on worker dashboard
Live disruption monitoring panel on dashboard
Full end-to-end deployment: Vercel + Render + Aiven
---
What Comes in Phase 2 and 3
Phase 2 — Protect Your Worker (Mar 21 – Apr 4)
Real-time weather API integration (OpenWeatherMap, AQICN) replacing ML-only triggers for live accuracy. The ML model will continue handling risk scoring and premium calculation while live APIs handle actual daily trigger validation.
Advanced fraud detection using GPS data — validating that a worker was actually in the claimed zone during the disruption, not just registered there. This addresses GPS spoofing, a common fraud vector in delivery-based insurance.
Zone Solidarity Score: If only one worker in a zone files a claim but 50 others in the same zone did not, that is suspicious. If 40 out of 50 workers in a zone file claims during the same hour, that is a real disruption. This cross-worker validation layer will be implemented in Phase 2.
WhatsApp Bot integration for zero-friction claim notifications — workers receive a WhatsApp message rather than needing to open an app.
Phase 3 — Scale and Optimise (Apr 5 – Apr 17)
Income Fingerprinting: Each worker's earning pattern over 30 days builds a personal income signature. Unusual claim patterns that do not match a worker's historical behavior get flagged automatically.
Multi-language support: Tamil, Hindi, and English interfaces. Currently the platform is English-only, which creates a barrier for many delivery workers who are more comfortable in Tamil.
Real Zepto/Blinkit API integration: In production, worker ID verification will call the platform's actual API to confirm the worker is active and employed. Phase 1 uses format-based validation as a proxy.
Admin insurer dashboard with loss ratio analytics, predictive claim volume forecasting for next 7 days, and zone-level risk heat maps.
Razorpay integration (test mode) for simulated instant UPI payouts replacing the current mock transfer.
---
Platform Decision: Web App
A Progressive Web App (PWA-ready) was chosen over native mobile for Phase 1 because:
Delivery workers use low-cost Android devices across hundreds of different models — native app compatibility is a real challenge
Browser-based access requires zero installation — a worker can receive a WhatsApp link and be onboarded in 2 minutes
PWA supports offline capability for areas with intermittent connectivity — relevant for workers on the move
Phase 2 will add WhatsApp Bot integration as the primary notification and interaction channel, as WhatsApp has near-universal adoption among delivery partners.
---
Development Timeline
Phase	Dates	Theme	Status
Phase 1	Mar 4–20	Ideation and Foundation	Complete
Phase 2	Mar 21–Apr 4	Automation and Protection	Upcoming
Phase 3	Apr 5–17	Scale and Optimise	Upcoming
---
Team
Team Name: 404 Challengers
Institution: SRM Institute of Science and Technology
Track: AI-Powered Insurance for India's Gig Economy
Hackathon: Guidewire DEVTrails 2026