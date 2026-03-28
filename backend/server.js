require('dotenv').config();
const axios = require('axios');
const FLASK_MODEL_URL = 'https://gigshield-model.onrender.com';
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');


const app = express();
app.use(cors());
app.use(express.json());

// DB Connection
const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
  } : false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    console.error(' DB connection failed:', err);
    return;
  }
  console.log(' MySQL connected via pool');
  connection.release();
});

// GET all zones
app.get('/api/zones', (req, res) => {
  db.query("SELECT * FROM zones WHERE city = 'Chennai'", (err, results) =>  {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// POST register worker + create policy
app.post('/api/register', (req, res) => {
  const { name, phone, worker_id, platform, daily_income, zone_id } = req.body;

  const workerQuery = `
    INSERT INTO workers (name, phone, worker_id, platform, daily_income, zone_id) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(workerQuery, [name, phone, worker_id, platform, daily_income, zone_id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    const newWorkerId = result.insertId;

    db.query('SELECT * FROM zones WHERE id = ?', [zone_id], (err, zones) => {
      if (err) return res.status(500).json({ error: err.message });

      const zone = zones[0];

      // Premium calculation
      const base = 29;
      const riskAdd = Math.round((zone.risk_score / 100) * 30);
      const incomeAdd = daily_income > 800 ? 10 : 0;
      const premium = base + riskAdd + incomeAdd;
      const coverage = Math.round(daily_income * 7 * 0.7);

      const policyQuery = `
        INSERT INTO policies (worker_id, weekly_premium, coverage_amount, start_date) 
        VALUES (?, ?, ?, CURDATE())
      `;

      db.query(policyQuery, [newWorkerId, premium, coverage], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          success: true,
          worker_db_id: newWorkerId,
          premium,
          coverage,
          zone_name: zone.name,
          zone_risk: zone.risk_level
        });
      });
    });
  });
});

// GET worker policy by phone
app.get('/api/policy/:phone', (req, res) => {
  const phone = req.params.phone;

  const query = `
    SELECT w.name, w.phone, w.platform, w.daily_income,
           z.name as zone_name, z.risk_level, z.risk_score,
           p.weekly_premium, p.coverage_amount, p.status, p.start_date
    FROM workers w
    JOIN zones z ON w.zone_id = z.id
    JOIN policies p ON p.worker_id = w.id
    WHERE w.phone = ?
    ORDER BY p.id DESC LIMIT 1
  `;

  db.query(query, [phone], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Worker not found' });
    res.json(results[0]);
  });
});


// ⬇️ YAHAN SE NAYA CODE ADD KARO ⬇️

// GET zone risk from ML model
app.get('/api/zone-risk/:zone', async (req, res) => {
  const zone = req.params.zone;
  const month = new Date().getMonth() + 1;
  try {
    const response = await fetch(`${FLASK_MODEL_URL}/risk-score?zone=${encodeURIComponent(zone)}&month=${month}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Model unavailable', fallback: true });
  }
});

// POST check disruption trigger
app.post('/api/check-trigger', async (req, res) => {
  const { zone, date } = req.body;
  try {
    const response = await fetch(`${FLASK_MODEL_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone, date })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Model unavailable' });
  }
});

// ⬆️ YAHAN TAK NAYA CODE ⬆️

// FRAUD DETECTION
app.post('/api/check-fraud', (req, res) => {
  const { worker_phone, zone, claim_type, claim_date, delivery_count } = req.body;

  let fraud_score = 0;
  let flags = [];

  // Check 1 — Duplicate claim same day
  const dupQuery = `
    SELECT COUNT(*) as count FROM claims 
    WHERE worker_phone = ? AND claim_date = ? AND claim_type = ?
  `;

  db.query(dupQuery, [worker_phone, claim_date, claim_type], (err, results) => {
    if (!err && results[0].count > 0) {
      fraud_score += 60;
      flags.push("Duplicate claim detected for same day");
    }

    // Check 2 — High delivery count during claimed disruption
    if (delivery_count !== undefined) {
      if (delivery_count > 15) {
        fraud_score += 50;
        flags.push(`High delivery count (${delivery_count}) during disruption claim`);
      } else if (delivery_count > 8) {
        fraud_score += 25;
        flags.push(`Moderate delivery count (${delivery_count}) during disruption`);
      }
    }

    // Check 3 — Claim frequency check (more than 3 claims this week)
    const freqQuery = `
      SELECT COUNT(*) as count FROM claims
      WHERE worker_phone = ?
      AND claim_date >= DATE_SUB(?, INTERVAL 7 DAY)
    `;

    db.query(freqQuery, [worker_phone, claim_date], (err2, results2) => {
      if (!err2 && results2[0].count >= 3) {
        fraud_score += 30;
        flags.push("High claim frequency this week");
      }

      // Check 4 — Zone risk vs claim type mismatch
      const lowRiskZones = ["Anna Nagar", "Nungambakkam", "Egmore", "Ashok Nagar", "KK Nagar"];
      if (lowRiskZones.includes(zone) && claim_type === "Heavy Rainfall") {
        fraud_score += 20;
        flags.push(`Low risk zone (${zone}) claiming heavy rainfall`);
      }

      // Final verdict
      let verdict = "PASS";
      let risk_level = "low";

      if (fraud_score >= 60) {
        verdict = "HOLD";
        risk_level = "high";
      } else if (fraud_score >= 30) {
        verdict = "REVIEW";
        risk_level = "medium";
      }

      res.json({
        fraud_score,
        risk_level,
        verdict,
        flags,
        message: verdict === "PASS"
          ? "No fraud detected — payout approved"
          : verdict === "REVIEW"
          ? "Manual review required"
          : "Claim held — potential fraud detected"
      });
    });
  });
});
// Mock Worker ID Verification
app.post('/api/verify-worker', (req, res) => {
  const { worker_id, platform } = req.body;

  const zeptoPattern = /^ZPT-[A-Z]{2}-\d{4}-\d{4}$/;
  const blinkitPattern = /^BLK-[A-Z]{2}-\d{4}-\d{4}$/;

  let isValid = false;
  let message = '';

  if (platform === 'zepto' && zeptoPattern.test(worker_id)) {
    isValid = true;
    message = '✅ Zepto worker verified successfully';
  } else if (platform === 'blinkit' && blinkitPattern.test(worker_id)) {
    isValid = true;
    message = '✅ Blinkit worker verified successfully';
  } else if (platform === 'zepto') {
    message = 'Invalid Zepto ID. Format: ZPT-CH-2024-XXXX';
  } else {
    message = 'Invalid Blinkit ID. Format: BLK-CH-2024-XXXX';
  }

  res.json({ isValid, message });
});

app.get('/api/setup', (req, res) => {
  const queries = [
    `CREATE TABLE IF NOT EXISTS zones (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), city VARCHAR(100), risk_level VARCHAR(20), risk_score INT, avg_rainfall_mm FLOAT, flood_prone BOOLEAN)`,
    `CREATE TABLE IF NOT EXISTS workers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), phone VARCHAR(15), worker_id VARCHAR(50), platform VARCHAR(50), daily_income INT, zone_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS policies (id INT AUTO_INCREMENT PRIMARY KEY, worker_id INT, weekly_premium INT, coverage_amount INT, status VARCHAR(20) DEFAULT 'active', start_date DATE)`,
    `CREATE TABLE IF NOT EXISTS claims (id INT AUTO_INCREMENT PRIMARY KEY, worker_phone VARCHAR(15), zone VARCHAR(100), claim_type VARCHAR(50), claim_date DATE, delivery_count INT DEFAULT 0, payout_amount INT, fraud_score INT DEFAULT 0, verdict VARCHAR(20) DEFAULT 'PASS', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `INSERT IGNORE INTO zones (name, city, risk_level, risk_score, avg_rainfall_mm, flood_prone) VALUES
    ('Velachery','Chennai','high',85,142.5,1),('T Nagar','Chennai','medium',60,98.2,0),
    ('Anna Nagar','Chennai','low',30,72.1,0),('Porur','Chennai','high',80,135.0,1),
    ('Adyar','Chennai','medium',55,95.5,0),('Tambaram','Chennai','high',75,128.3,1),
    ('Sholinganallur','Chennai','medium',50,88.7,0),('Chromepet','Chennai','low',35,74.2,0),
    ('Perungudi','Chennai','high',78,130.1,1),('Pallikaranai','Chennai','high',88,155.2,1),
    ('Madipakkam','Chennai','high',82,138.4,1),('Guindy','Chennai','medium',58,96.3,0),
    ('Nungambakkam','Chennai','low',28,70.5,0),('Egmore','Chennai','low',32,73.8,0),
    ('Mylapore','Chennai','medium',52,91.2,0),('Royapettah','Chennai','medium',48,85.6,0),
    ('Kodambakkam','Chennai','medium',55,94.1,0),('Virugambakkam','Chennai','medium',57,97.3,0),
    ('Saligramam','Chennai','low',38,76.4,0),('Vadapalani','Chennai','medium',53,92.7,0),
    ('Ashok Nagar','Chennai','low',33,74.9,0),('KK Nagar','Chennai','low',36,75.8,0),
    ('Arumbakkam','Chennai','medium',51,89.5,0),('Villivakkam','Chennai','medium',56,95.0,0),
    ('Perambur','Chennai','medium',54,93.2,0),('Kolathur','Chennai','medium',59,97.8,0),
    ('Madhavaram','Chennai','high',72,122.4,1),('Thiruvottiyur','Chennai','high',76,129.6,1),
    ('Manali','Chennai','high',79,133.7,1),('Ambattur','Chennai','medium',62,102.5,0),
    ('Avadi','Chennai','high',70,118.3,1),('Poonamallee','Chennai','high',73,124.1,1),
    ('Vandalur','Chennai','high',71,120.7,1),('Medavakkam','Chennai','high',83,140.2,1),
    ('Perungalathur','Chennai','high',77,131.5,1),('Urapakkam','Chennai','medium',63,104.8,0),
    ('Guduvanchery','Chennai','medium',61,101.3,0),('Kelambakkam','Chennai','high',74,126.9,1),
    ('Siruseri','Chennai','medium',49,87.4,0),('Navalur','Chennai','low',40,78.6,0)`
  ];

  let completed = 0;
  const total = queries.length;
  let hasError = false;

  queries.forEach(q => {
    db.query(q, (err) => {
      if (err && !hasError) {
        hasError = true;
        console.error(err);
        res.status(500).json({ error: err.message });
      } else {
        completed++;
        if (completed === total && !hasError) {
          res.json({ success: true, message: 'All tables and zones created!' });
        }
      }
    });
  });
});
// Live Weather API — Open-Meteo (free, no key) + AQICN (free token)
app.get('/api/live-weather', async (req, res) => {
  const AQICN_TOKEN = '6c868c8980b417984c83de576bdac72bfb305d9f';
  const LAT = 13.0827;
  const LON = 80.2707;

  try {
    const weatherRes = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=precipitation_sum,temperature_2m_max&timezone=Asia/Kolkata&forecast_days=1`
    );

    const rainfall = weatherRes.data.daily.precipitation_sum[0] || 0;
    const temp = weatherRes.data.daily.temperature_2m_max[0] || 30;

    let aqi = 85;
    let aqiSource = 'default';
    try {
      const aqiRes = await axios.get(
        `https://api.waqi.info/feed/chennai/?token=${AQICN_TOKEN}`,
        { timeout: 5000 }
      );
      if (aqiRes.data && aqiRes.data.data && aqiRes.data.data.aqi) {
        aqi = aqiRes.data.data.aqi;
        aqiSource = 'live';
      }
    } catch (e) {
      aqi = 85;
      aqiSource = 'default';
    }

    const rainTrigger = rainfall > 1.5;
    const heatTrigger = temp > 42;
    const aqiTrigger = aqi > 300;

    res.json({
      rainfall_mm: rainfall,
      temperature_c: temp,
      aqi: aqi,
      aqi_source: aqiSource,
      triggers: {
        rain: { active: rainTrigger, value: rainfall, threshold: 1.5, unit: 'mm' },
        heat: { active: heatTrigger, value: temp, threshold: 42, unit: 'C' },
        aqi:  { active: aqiTrigger, value: aqi, threshold: 300, unit: 'AQI' }
      },
      any_trigger_active: rainTrigger || heatTrigger || aqiTrigger,
      source: 'Open-Meteo + AQICN',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: 'Weather API failed', details: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 GigShield backend running on port ${process.env.PORT}`);
});

