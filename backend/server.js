require('dotenv').config();
const cron = require('node-cron');
const axios = require('axios');
const FLASK_MODEL_URL = 'https://gigshield-model.onrender.com';
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const webpush = require('web-push');
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);


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
     const base = 49;
const riskAdd = zone.risk_level === 'high' ? 24 : zone.risk_level === 'medium' ? 16 : 9;
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




// FRAUD DETECTION — with Zone Solidarity Score
app.post('/api/check-fraud', async (req, res) => {
  const { worker_phone, zone, claim_type, claim_date, delivery_count } = req.body;

  let fraud_score = 0;
  let flags = [];

  try {
    // Layer 1 — Duplicate claim check
    const [dupResults] = await db.promise().query(
      'SELECT COUNT(*) as count FROM claims WHERE worker_phone = ? AND claim_date = ? AND claim_type = ?',
      [worker_phone, claim_date, claim_type]
    );
    if (dupResults[0].count > 0) {
      fraud_score += 60;
      flags.push('Duplicate claim detected for same day');
    }

    // Layer 2 — Delivery count validation
    if (delivery_count !== undefined) {
      if (delivery_count > 15) {
        fraud_score += 50;
        flags.push(`High delivery count (${delivery_count}) during disruption claim`);
      } else if (delivery_count > 8) {
        fraud_score += 25;
        flags.push(`Moderate delivery count (${delivery_count}) during disruption`);
      }
    }

    // Layer 3 — Claim frequency check
    const [freqResults] = await db.promise().query(
      'SELECT COUNT(*) as count FROM claims WHERE worker_phone = ? AND claim_date >= DATE_SUB(?, INTERVAL 7 DAY)',
      [worker_phone, claim_date]
    );
    if (freqResults[0].count >= 3) {
      fraud_score += 30;
      flags.push('High claim frequency this week');
    }

    // Layer 4 — Zone risk mismatch
    const lowRiskZones = ['Anna Nagar', 'Nungambakkam', 'Egmore', 'Ashok Nagar', 'KK Nagar'];
    if (lowRiskZones.includes(zone) && claim_type === 'Heavy Rainfall') {
      fraud_score += 20;
      flags.push(`Low risk zone (${zone}) claiming heavy rainfall`);
    }

    // Layer 5 — Zone Solidarity Score
    const [activeResults] = await db.promise().query(
      'SELECT COUNT(DISTINCT w.phone) as active FROM workers w JOIN zones z ON w.zone_id = z.id WHERE z.name = ?',
      [zone]
    );
    const [claimResults] = await db.promise().query(
      'SELECT COUNT(DISTINCT worker_phone) as claiming FROM claims WHERE zone = ? AND claim_date = ?',
      [zone, claim_date]
    );


    const activeWorkers = activeResults[0].active || 1;
    const claimingWorkers = claimResults[0].claiming || 0;
    const solidarityScore = claimingWorkers / activeWorkers;

    if (solidarityScore >= 0.4) {
      fraud_score = Math.max(0, fraud_score - 20);
      flags.push(`Zone solidarity confirmed — ${Math.round(solidarityScore * 100)}% workers affected`);
    } else if (claimingWorkers > 0 && solidarityScore < 0.1) {
      fraud_score += 15;
      flags.push(`Low zone solidarity — only ${claimingWorkers}/${activeWorkers} workers claiming`);
    }

    // Layer 6 — GPS Location check
if (req.body.latitude && req.body.longitude) {
  const zoneData = ZONE_COORDINATES[zone];
  if (zoneData) {
    const distance = getDistance(
      req.body.latitude, req.body.longitude,
      zoneData.lat, zoneData.lng
    );
    if (distance > zoneData.radius) {
      fraud_score += 40;
      flags.push(`GPS mismatch — worker is ${distance.toFixed(1)}km away from ${zone}`);
    } else {
      flags.push(`GPS verified — worker confirmed in ${zone} (${distance.toFixed(1)}km)`);
    }
  }
}

    // Final verdict
    let verdict = 'PASS';
    if (fraud_score >= 60) verdict = 'HOLD';
    else if (fraud_score >= 30) verdict = 'REVIEW';

    // Save claim to DB
    await db.promise().query(
      'INSERT INTO claims (worker_phone, zone, claim_type, claim_date, delivery_count, fraud_score, verdict) VALUES (?,?,?,?,?,?,?)',
      [worker_phone, zone, claim_type, claim_date, delivery_count, fraud_score, verdict]
    );

    res.json({
      fraud_score,
      verdict,
      flags,
      solidarity: {
        active_workers: activeWorkers,
        claiming_workers: claimingWorkers,
        solidarity_score: Math.round(solidarityScore * 100)
      },
      message: verdict === 'PASS'
        ? 'No fraud detected — payout approved'
        : verdict === 'REVIEW'
        ? 'Manual review required'
        : 'Claim held — potential fraud detected'
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    `CREATE TABLE IF NOT EXISTS zone_activity (
  id INT AUTO_INCREMENT PRIMARY KEY,
  zone VARCHAR(100),
  activity_date DATE,
  active_workers INT DEFAULT 0,
  claiming_workers INT DEFAULT 0,
  solidarity_score FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY zone_date (zone, activity_date)
)`,
`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  worker_phone VARCHAR(15),
  subscription TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY phone_key (worker_phone)
)`,
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
app.get('/api/live-weather', async (req, res) => {
  const AQICN_TOKEN = '6c868c8980b417984c83de576bdac72bfb305d9f';

  try {
    // Temperature — wttr.in (completely free, no rate limit)
    const weatherRes = await axios.get(
      'https://wttr.in/Chennai?format=j1',
      { timeout: 8000 }
    );

    const current = weatherRes.data.current_condition[0];
    const temp = parseFloat(current.temp_C) || 30;
    const rainfall = parseFloat(current.precipMM) || 0;

    // AQI — AQICN
    let aqi = 85;
    let aqiSource = 'default';
    try {
      const aqiRes = await axios.get(
        `https://api.waqi.info/feed/chennai/?token=${AQICN_TOKEN}`,
        { timeout: 5000 }
      );
      if (aqiRes.data?.data?.aqi) {
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
      source: 'wttr.in + AQICN',
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    res.status(500).json({ error: 'Weather API failed', details: err.message });
  }
});

// Zone Solidarity Score
app.post('/api/zone-solidarity', (req, res) => {
  const { zone, claim_date } = req.body;

  // Us zone ke aaj ke active workers count karo
  const activeQuery = `
    SELECT COUNT(DISTINCT w.phone) as active_count
    FROM workers w
    JOIN zones z ON w.zone_id = z.id
    WHERE z.name = ?
  `;

  // Us zone ke aaj ke claiming workers count karo
  const claimingQuery = `
    SELECT COUNT(DISTINCT worker_phone) as claiming_count
    FROM claims
    WHERE zone = ? AND claim_date = ?
  `;

  db.query(activeQuery, [zone], (err, activeResults) => {
    if (err) return res.status(500).json({ error: err.message });

    const activeWorkers = activeResults[0].active_count || 1;

    db.query(claimingQuery, [zone, claim_date], (err2, claimResults) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const claimingWorkers = claimResults[0].claiming_count || 0;
      const solidarityScore = claimingWorkers / activeWorkers;

      // Solidarity levels:
      // > 0.4 (40%+ workers claiming) → Real disruption confirmed
      // 0.1 - 0.4 → Possible disruption
      // < 0.1 → Suspicious — very few workers claiming

      let solidarityVerdict = '';
      let solidarityBonus = 0;

      if (solidarityScore >= 0.4) {
        solidarityVerdict = 'CONFIRMED';
        solidarityBonus = -20; // fraud score kam karo — real disruption
      } else if (solidarityScore >= 0.1) {
        solidarityVerdict = 'POSSIBLE';
        solidarityBonus = 0;
      } else if (claimingWorkers === 0) {
        solidarityVerdict = 'FIRST_CLAIM';
        solidarityBonus = 0; // pehla claim — neutral
      } else {
        solidarityVerdict = 'SUSPICIOUS';
        solidarityBonus = 15; // fraud score badhaao
      }

      // Zone activity save karo
      db.query(
        `INSERT INTO zone_activity (zone, activity_date, active_workers, claiming_workers, solidarity_score)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         claiming_workers = VALUES(claiming_workers),
         solidarity_score = VALUES(solidarity_score)`,
        [zone, claim_date, activeWorkers, claimingWorkers + 1, solidarityScore],
        () => {}
      );

      res.json({
        zone,
        active_workers: activeWorkers,
        claiming_workers: claimingWorkers,
        solidarity_score: Math.round(solidarityScore * 100),
        solidarity_verdict: solidarityVerdict,
        fraud_score_adjustment: solidarityBonus,
        message: solidarityVerdict === 'CONFIRMED'
          ? `${Math.round(solidarityScore * 100)}% workers in ${zone} not delivering — real disruption confirmed`
          : solidarityVerdict === 'SUSPICIOUS'
          ? `Only ${claimingWorkers} out of ${activeWorkers} workers claiming — flagged for review`
          : `${claimingWorkers} workers claiming in ${zone} today`
      });
    });
  });
});

// Save push subscription
app.post('/api/save-subscription', async (req, res) => {
  const { subscription, worker_phone } = req.body;
  try {
    await db.promise().query(
      `INSERT INTO push_subscriptions (worker_phone, subscription) 
       VALUES (?, ?) 
       ON DUPLICATE KEY UPDATE subscription = VALUES(subscription)`,
      [worker_phone, JSON.stringify(subscription)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send push notification
app.post('/api/send-push', async (req, res) => {
  const { worker_phone, title, body, amount } = req.body;
  try {
    const [results] = await db.promise().query(
      'SELECT subscription FROM push_subscriptions WHERE worker_phone = ?',
      [worker_phone]
    );
    if (results.length === 0) return res.json({ success: false, message: 'No subscription found' });

    const subscription = JSON.parse(results[0].subscription);
    const payload = JSON.stringify({
      title: title || 'GigShield Alert',
      body: body || `Rs.${amount} transferred to your UPI`,
      icon: '/icon-192.png'
    });

    await webpush.sendNotification(subscription, payload);
    res.json({ success: true, message: 'Push notification sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Zone coordinates — Chennai zones ke lat/lng
const ZONE_COORDINATES = {
  'Velachery': { lat: 12.9815, lng: 80.2180, radius: 3 },
  'T Nagar': { lat: 13.0418, lng: 80.2341, radius: 2.5 },
  'Anna Nagar': { lat: 13.0850, lng: 80.2101, radius: 3 },
  'Porur': { lat: 13.0359, lng: 80.1566, radius: 3 },
  'Adyar': { lat: 13.0012, lng: 80.2565, radius: 2.5 },
  'Tambaram': { lat: 12.9249, lng: 80.1000, radius: 4 },
  'Sholinganallur': { lat: 12.9010, lng: 80.2279, radius: 3 },
  'Chromepet': { lat: 12.9516, lng: 80.1462, radius: 2.5 },
  'Perungudi': { lat: 12.9563, lng: 80.2369, radius: 2.5 },
  'Pallikaranai': { lat: 12.9372, lng: 80.2075, radius: 3 },
  'Madipakkam': { lat: 12.9602, lng: 80.1985, radius: 2.5 },
  'Guindy': { lat: 13.0067, lng: 80.2206, radius: 2.5 },
  'Nungambakkam': { lat: 13.0569, lng: 80.2425, radius: 2 },
  'Egmore': { lat: 13.0732, lng: 80.2609, radius: 2 },
  'Mylapore': { lat: 13.0368, lng: 80.2676, radius: 2 },
  'Royapettah': { lat: 13.0524, lng: 80.2607, radius: 2 },
  'Kodambakkam': { lat: 13.0490, lng: 80.2213, radius: 2.5 },
  'Virugambakkam': { lat: 13.0569, lng: 80.1971, radius: 2.5 },
  'Saligramam': { lat: 13.0490, lng: 80.1895, radius: 2 },
  'Vadapalani': { lat: 13.0501, lng: 80.2124, radius: 2 },
  'Ashok Nagar': { lat: 13.0297, lng: 80.2094, radius: 2 },
  'KK Nagar': { lat: 13.0423, lng: 80.1928, radius: 2 },
  'Arumbakkam': { lat: 13.0694, lng: 80.2067, radius: 2 },
  'Villivakkam': { lat: 13.1023, lng: 80.2167, radius: 2.5 },
  'Perambur': { lat: 13.1165, lng: 80.2337, radius: 2.5 },
  'Kolathur': { lat: 13.1167, lng: 80.2152, radius: 2.5 },
  'Madhavaram': { lat: 13.1489, lng: 80.2317, radius: 3 },
  'Thiruvottiyur': { lat: 13.1624, lng: 80.3005, radius: 3 },
  'Manali': { lat: 13.1651, lng: 80.2636, radius: 3 },
  'Ambattur': { lat: 13.1143, lng: 80.1548, radius: 3.5 },
  'Avadi': { lat: 13.1149, lng: 80.1047, radius: 4 },
  'Poonamallee': { lat: 13.0466, lng: 80.1165, radius: 3.5 },
  'Vandalur': { lat: 12.8904, lng: 80.0810, radius: 4 },
  'Medavakkam': { lat: 12.9201, lng: 80.1928, radius: 3 },
  'Perungalathur': { lat: 12.9058, lng: 80.1367, radius: 3 },
  'Urapakkam': { lat: 12.8686, lng: 80.0643, radius: 3 },
  'Guduvanchery': { lat: 12.8451, lng: 80.0595, radius: 3.5 },
  'Kelambakkam': { lat: 12.7806, lng: 80.2197, radius: 4 },
  'Siruseri': { lat: 12.8271, lng: 80.2268, radius: 3.5 },
  'Navalur': { lat: 12.8448, lng: 80.2271, radius: 3 }
};

// Haversine formula — distance between 2 coordinates in km
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// GPS Verify route
app.post('/api/verify-location', (req, res) => {
  const { zone, latitude, longitude } = req.body;

  if (!latitude || !longitude) {
    return res.json({ verified: false, reason: 'Location not provided', fraud_add: 20 });
  }

  const zoneData = ZONE_COORDINATES[zone];
  if (!zoneData) {
    return res.json({ verified: true, reason: 'Zone not in GPS database', fraud_add: 0 });
  }

  const distance = getDistance(latitude, longitude, zoneData.lat, zoneData.lng);
  const inZone = distance <= zoneData.radius;

  res.json({
    verified: inZone,
    distance_km: Math.round(distance * 10) / 10,
    zone_radius_km: zoneData.radius,
    reason: inZone
      ? `Worker confirmed in ${zone} zone (${distance.toFixed(1)}km from center)`
      : `Worker is ${distance.toFixed(1)}km away from ${zone} — outside zone radius`,
    fraud_add: inZone ? 0 : 40
  });
});

// ============================================
// AUTOMATED PARAMETRIC TRIGGER ENGINE v2
// Har 10 min — Rain, Heat, AQI, Curfew sab check
// Hours-based tiered payout per disruption type
// ============================================

const HOURS_PER_TICK = 10 / 60; // 0.1667 hours per 10-min tick

// Payout tiers — sab disruption types ke liye same structure
const PAYOUT_TIERS = [
  { minHours: 8,     payout: 500, label: '8+ hours'      },
  { minHours: 5,     payout: 300, label: '5–8 hours'     },
  { minHours: 2,     payout: 150, label: '2–5 hours'     },
  { minHours: 0.001, payout: 50,  label: 'Under 2 hours' },
  { minHours: 0,     payout: 0,   label: 'No disruption' }
];

function getPayoutTier(hours) {
  for (const tier of PAYOUT_TIERS) {
    if (hours >= tier.minHours) return tier;
  }
  return { payout: 0, label: 'No disruption' };
}

// Har disruption ke trigger conditions
// Returns { active: true/false, value, threshold, unit }
function evaluateTriggers(weatherData, zone) {
  const HIGH_RISK = [
    'Velachery','Porur','Tambaram','Perungudi','Pallikaranai',
    'Madipakkam','Madhavaram','Thiruvottiyur','Manali','Avadi',
    'Poonamallee','Vandalur','Medavakkam','Perungalathur','Kelambakkam'
  ];

  const rainfall   = weatherData.rainfall;
  const temp       = weatherData.temp;
  const aqi        = weatherData.aqi;
  const curfewZones = weatherData.curfewZones || []; // Array of zone names under curfew

  const rainThreshold = HIGH_RISK.includes(zone) ? 0.5 : 1.5;

  return {
    rain: {
      active: rainfall > rainThreshold,
      value: rainfall,
      threshold: rainThreshold,
      unit: 'mm'
    },
    heat: {
      active: temp > 42,
      value: temp,
      threshold: 42,
      unit: '°C'
    },
    aqi: {
      active: aqi > 300,
      value: aqi,
      threshold: 300,
      unit: 'AQI'
    },
    curfew: {
      active: curfewZones.includes(zone),
      value: curfewZones.includes(zone) ? 1 : 0,
      threshold: 1,
      unit: 'zone'
    }
  };
}

// Weather + AQI fetch (ek baar, sab policies ke liye use hoga)
async function fetchLiveConditions() {
  let rainfall = 0, temp = 30, aqi = 85;

  try {
    const weatherRes = await axios.get('https://wttr.in/Chennai?format=j1', { timeout: 8000 });
    const current = weatherRes.data.current_condition[0];
    rainfall = parseFloat(current.precipMM) || 0;
    temp     = parseFloat(current.temp_C)   || 30;
  } catch (e) {
    console.error('Weather fetch failed:', e.message);
  }

  try {
    const aqiRes = await axios.get(
      `https://api.waqi.info/feed/chennai/?token=6c868c8980b417984c83de576bdac72bfb305d9f`,
      { timeout: 5000 }
    );
    if (aqiRes.data?.data?.aqi) aqi = aqiRes.data.data.aqi;
  } catch (e) {
    console.error('AQI fetch failed:', e.message);
  }

  // Curfew zones — DB se fetch karo (admin ne manually mark kiya ho)
  // Agar curfew table nahi hai toh empty array return
  let curfewZones = [];
  try {
    const [curfewRows] = await db.promise().query(
      `SELECT zone_name FROM curfew_zones WHERE active = 1 AND curfew_date = CURDATE()`
    );
    curfewZones = curfewRows.map(r => r.zone_name);
  } catch (e) {
    // Table nahi hai toh ignore karo — curfew feature optional hai
    curfewZones = [];
  }

  return { rainfall, temp, aqi, curfewZones };
}

// Core engine function
async function runTriggerEngine() {
  console.log(`\n[${new Date().toISOString()}] === TRIGGER ENGINE START ===`);

  try {
    // Step 1 — Live conditions fetch (sirf ek baar)
    const conditions = await fetchLiveConditions();
    console.log(`Weather → Rain: ${conditions.rainfall}mm | Temp: ${conditions.temp}°C | AQI: ${conditions.aqi} | Curfew zones: ${conditions.curfewZones.length}`);

    // Step 2 — Sab active policies
    const [policies] = await db.promise().query(`
      SELECT w.phone, w.name, z.name as zone, z.risk_level,
             p.id as policy_id, p.coverage_amount
      FROM policies p
      JOIN workers w ON p.worker_id = w.id
      JOIN zones z ON w.zone_id = z.id
      WHERE p.status = 'active'
    `);

    console.log(`Active policies: ${policies.length}`);
    if (policies.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const disruptionTypes = ['rain', 'heat', 'aqi', 'curfew'];

    for (const policy of policies) {
      const triggers = evaluateTriggers(conditions, policy.zone);

      for (const type of disruptionTypes) {
        const trigger = triggers[type];

        // Pehle log row fetch ya create karo
        let [logs] = await db.promise().query(
          `SELECT * FROM disruption_hours_log 
           WHERE worker_phone = ? AND log_date = ? AND disruption_type = ?`,
          [policy.phone, today, type]
        );

        if (logs.length === 0) {
          await db.promise().query(
            `INSERT INTO disruption_hours_log 
             (worker_phone, zone, log_date, disruption_type, hours_count, last_detected, current_payout, payout_released)
             VALUES (?, ?, ?, ?, 0, NULL, 0, FALSE)`,
            [policy.phone, policy.zone, today, type]
          );
          logs = [{ hours_count: 0, last_detected: null, current_payout: 0, payout_released: false }];
        }

        const log = logs[0];
        let newHours = parseFloat(log.hours_count) || 0;

        // Trigger active hai toh hours badhao
        if (trigger.active) {
          newHours = newHours + HOURS_PER_TICK;
          console.log(`  [${type.toUpperCase()}] ${policy.name} (${policy.zone}) → ${newHours.toFixed(2)}h | Value: ${trigger.value}${trigger.unit}`);
        }

        // Tier calculate karo
        const tierInfo   = getPayoutTier(newHours);
        const newPayout  = tierInfo.payout;
        const prevPayout = parseInt(log.current_payout) || 0;

        // Log update karo
        await db.promise().query(
          `UPDATE disruption_hours_log
           SET hours_count     = ?,
               last_detected   = ?,
               current_payout  = ?
           WHERE worker_phone = ? AND log_date = ? AND disruption_type = ?`,
          [
            newHours,
            trigger.active ? new Date() : log.last_detected,
            newPayout,
            policy.phone, today, type
          ]
        );

        // Payout tier badha? → Claim create/update karo
        if (newPayout > prevPayout && newPayout > 0) {
          console.log(`  PAYOUT TIER UP → ${policy.name} | ${type} | ₹${prevPayout} → ₹${newPayout} (${tierInfo.label})`);

          const claimTypeTag = `AUTO-${type.toUpperCase()}-${tierInfo.label}`;

          const [existingClaim] = await db.promise().query(
            `SELECT id FROM claims 
             WHERE worker_phone = ? AND claim_date = ? AND claim_type LIKE ?`,
            [policy.phone, today, `AUTO-${type.toUpperCase()}%`]
          );

          if (existingClaim.length > 0) {
            // Existing claim ka payout aur type update karo
            await db.promise().query(
              `UPDATE claims 
               SET payout_amount = ?, claim_type = ?, verdict = 'AUTO-PASS'
               WHERE worker_phone = ? AND claim_date = ? AND claim_type LIKE ?`,
              [newPayout, claimTypeTag, policy.phone, today, `AUTO-${type.toUpperCase()}%`]
            );
          } else {
            // Nayi claim
            await db.promise().query(
              `INSERT INTO claims 
               (worker_phone, zone, claim_type, claim_date, delivery_count, payout_amount, fraud_score, verdict)
               VALUES (?, ?, ?, ?, 0, ?, 0, 'AUTO-PASS')`,
              [policy.phone, policy.zone, claimTypeTag, today, newPayout]
            );
          }

          // Max tier (₹500) pe released mark karo
          if (newPayout >= 500) {
            await db.promise().query(
              `UPDATE disruption_hours_log 
               SET payout_released = TRUE 
               WHERE worker_phone = ? AND log_date = ? AND disruption_type = ?`,
              [policy.phone, today, type]
            );
          }
        }
      } // end disruption types loop
    } // end policies loop

    console.log(`=== TRIGGER ENGINE COMPLETE ===\n`);

  } catch (err) {
    console.error('Trigger engine error:', err.message);
  }
}

// Har 10 minute mein automatic run
cron.schedule('*/10 * * * *', runTriggerEngine);

// Manual trigger — demo/testing ke liye
app.get('/api/run-trigger-engine', async (req, res) => {
  try {
    await runTriggerEngine();

    const conditions  = await fetchLiveConditions();
    const [policies]  = await db.promise().query(
      `SELECT COUNT(*) as count FROM policies WHERE status = 'active'`
    );
    const [todayLogs] = await db.promise().query(
      `SELECT worker_phone, zone, disruption_type, 
              ROUND(hours_count,2) as hours, current_payout, payout_released
       FROM disruption_hours_log WHERE log_date = CURDATE()
       ORDER BY disruption_type, worker_phone`
    );

    res.json({
      status: 'Engine ran successfully',
      live_conditions: {
        rainfall_mm:   conditions.rainfall,
        temperature_c: conditions.temp,
        aqi:           conditions.aqi,
        curfew_zones:  conditions.curfewZones
      },
      triggers_active: {
        rain:   conditions.rainfall > 0.5,
        heat:   conditions.temp    > 42,
        aqi:    conditions.aqi     > 300,
        curfew: conditions.curfewZones.length > 0
      },
      active_policies: policies[0].count,
      today_disruption_logs: todayLogs,
      payout_tiers: PAYOUT_TIERS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Worker ka disruption status — sab 4 types ek saath
app.get('/api/disruption-status/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const [logs] = await db.promise().query(
      `SELECT disruption_type, ROUND(hours_count,2) as hours_count,
              current_payout, payout_released, last_detected
       FROM disruption_hours_log
       WHERE worker_phone = ? AND log_date = CURDATE()`,
      [phone]
    );

    // Sab 4 types ka structured response
    const result = {};
    const allTypes = ['rain', 'heat', 'aqi', 'curfew'];

    for (const type of allTypes) {
      const log = logs.find(l => l.disruption_type === type);
      const hours = log ? parseFloat(log.hours_count) : 0;
      const tierInfo = getPayoutTier(hours);

      // Next tier info
      const currentIdx = PAYOUT_TIERS.findIndex(t => t.payout === tierInfo.payout);
      const nextTier   = currentIdx > 0 ? PAYOUT_TIERS[currentIdx - 1] : null;

      result[type] = {
        hours_accumulated: hours,
        current_payout:    log ? log.current_payout : 0,
        tier_label:        tierInfo.label,
        payout_released:   log ? log.payout_released : false,
        last_detected:     log ? log.last_detected : null,
        next_tier: nextTier ? {
          payout:         nextTier.payout,
          hours_needed:   nextTier.minHours,
          hours_remaining: Math.max(0, nextTier.minHours - hours).toFixed(1)
        } : null
      };
    }

    const totalPayout = Object.values(result).reduce(
      (sum, t) => sum + (t.current_payout || 0), 0
    );

    res.json({
      phone,
      date: new Date().toISOString().split('T')[0],
      disruptions: result,
      total_payout_today: totalPayout
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 GigShield backend running on port ${process.env.PORT}`);
});


