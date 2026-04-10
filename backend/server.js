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

// GET zones by city
app.get('/api/zones', (req, res) => {
  const city = req.query.city || 'Chennai';
  db.query("SELECT * FROM zones WHERE city = ?", [city], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// GET all supported cities
app.get('/api/cities', (req, res) => {
  db.query("SELECT DISTINCT city, COUNT(*) as zone_count FROM zones GROUP BY city", (err, results) => {
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

app.get('/api/setup', async (req, res) => {
  const results = [];
  
  const queries = [
    `CREATE TABLE IF NOT EXISTS zone_activity (id INT AUTO_INCREMENT PRIMARY KEY, zone VARCHAR(100), activity_date DATE, active_workers INT DEFAULT 0, claiming_workers INT DEFAULT 0, solidarity_score FLOAT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY zone_date (zone, activity_date))`,
    `CREATE TABLE IF NOT EXISTS zones (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), city VARCHAR(100), risk_level VARCHAR(20), risk_score INT, avg_rainfall_mm FLOAT, flood_prone BOOLEAN)`,
    `CREATE TABLE IF NOT EXISTS workers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), phone VARCHAR(15), worker_id VARCHAR(50), platform VARCHAR(50), daily_income INT, zone_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS policies (id INT AUTO_INCREMENT PRIMARY KEY, worker_id INT, weekly_premium INT, coverage_amount INT, status VARCHAR(20) DEFAULT 'active', start_date DATE)`,
    `CREATE TABLE IF NOT EXISTS claims (id INT AUTO_INCREMENT PRIMARY KEY, worker_phone VARCHAR(15), zone VARCHAR(100), claim_type VARCHAR(50), claim_date DATE, delivery_count INT DEFAULT 0, payout_amount INT, fraud_score INT DEFAULT 0, verdict VARCHAR(20) DEFAULT 'PASS', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (id INT AUTO_INCREMENT PRIMARY KEY, worker_phone VARCHAR(15), subscription TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY phone_key (worker_phone))`,
    `INSERT IGNORE INTO zones (name, city, risk_level, risk_score, avg_rainfall_mm, flood_prone) VALUES ('Velachery','Chennai','high',85,142.5,1),('T Nagar','Chennai','medium',60,98.2,0),('Anna Nagar','Chennai','low',30,72.1,0),('Porur','Chennai','high',80,135.0,1),('Adyar','Chennai','medium',55,95.5,0),('Tambaram','Chennai','high',75,128.3,1),('Sholinganallur','Chennai','medium',50,88.7,0),('Chromepet','Chennai','low',35,74.2,0),('Perungudi','Chennai','high',78,130.1,1),('Pallikaranai','Chennai','high',88,155.2,1),('Madipakkam','Chennai','high',82,138.4,1),('Guindy','Chennai','medium',58,96.3,0),('Nungambakkam','Chennai','low',28,70.5,0),('Egmore','Chennai','low',32,73.8,0),('Mylapore','Chennai','medium',52,91.2,0),('Royapettah','Chennai','medium',48,85.6,0),('Kodambakkam','Chennai','medium',55,94.1,0),('Virugambakkam','Chennai','medium',57,97.3,0),('Saligramam','Chennai','low',38,76.4,0),('Vadapalani','Chennai','medium',53,92.7,0),('Ashok Nagar','Chennai','low',33,74.9,0),('KK Nagar','Chennai','low',36,75.8,0),('Arumbakkam','Chennai','medium',51,89.5,0),('Villivakkam','Chennai','medium',56,95.0,0),('Perambur','Chennai','medium',54,93.2,0),('Kolathur','Chennai','medium',59,97.8,0),('Madhavaram','Chennai','high',72,122.4,1),('Thiruvottiyur','Chennai','high',76,129.6,1),('Manali','Chennai','high',79,133.7,1),('Ambattur','Chennai','medium',62,102.5,0),('Avadi','Chennai','high',70,118.3,1),('Poonamallee','Chennai','high',73,124.1,1),('Vandalur','Chennai','high',71,120.7,1),('Medavakkam','Chennai','high',83,140.2,1),('Perungalathur','Chennai','high',77,131.5,1),('Urapakkam','Chennai','medium',63,104.8,0),('Guduvanchery','Chennai','medium',61,101.3,0),('Kelambakkam','Chennai','high',74,126.9,1),('Siruseri','Chennai','medium',49,87.4,0),('Navalur','Chennai','low',40,78.6,0)`,
    `INSERT IGNORE INTO zones (name, city, risk_level, risk_score, avg_rainfall_mm, flood_prone) VALUES ('Andheri','Mumbai','high',82,185.2,1),('Bandra','Mumbai','medium',65,142.3,0),('Dharavi','Mumbai','high',88,195.5,1),('Kurla','Mumbai','high',80,178.4,1),('Dadar','Mumbai','medium',60,138.2,0),('Sion','Mumbai','high',78,172.1,1),('Worli','Mumbai','medium',55,128.6,0),('Lower Parel','Mumbai','medium',58,132.4,0),('Malad','Mumbai','high',75,165.3,1),('Borivali','Mumbai','medium',62,145.7,0),('Kandivali','Mumbai','medium',60,140.2,0),('Goregaon','Mumbai','medium',63,147.8,0),('Jogeshwari','Mumbai','high',77,168.9,1),('Santacruz','Mumbai','medium',57,130.5,0),('Vile Parle','Mumbai','medium',56,129.3,0),('Powai','Mumbai','high',79,174.6,1),('Vikhroli','Mumbai','high',76,166.8,1),('Ghatkopar','Mumbai','high',80,179.2,1),('Mulund','Mumbai','medium',64,148.5,0),('Thane','Mumbai','high',83,188.3,1),('Navi Mumbai','Mumbai','medium',61,142.9,0),('Panvel','Mumbai','medium',59,136.7,0),('Mira Road','Mumbai','medium',63,146.3,0),('Vasai','Mumbai','high',77,169.4,1),('Virar','Mumbai','medium',65,151.2,0),('Kalyan','Mumbai','high',81,182.7,1),('Dombivli','Mumbai','high',79,175.3,1),('Ulhasnagar','Mumbai','high',82,184.6,1),('Ambernath','Mumbai','medium',66,153.8,0),('Badlapur','Mumbai','medium',64,149.2,0),('Kharghar','Mumbai','medium',60,139.5,0),('Belapur','Mumbai','medium',58,134.8,0),('Airoli','Mumbai','medium',62,144.7,0),('Vashi','Mumbai','medium',61,142.1,0),('Kopar Khairane','Mumbai','medium',59,137.3,0)`,
    `INSERT IGNORE INTO zones (name, city, risk_level, risk_score, avg_rainfall_mm, flood_prone) VALUES ('Connaught Place','Delhi','low',25,58.4,0),('Dwarka','Delhi','medium',52,95.7,0),('Rohini','Delhi','medium',55,98.3,0),('Pitampura','Delhi','medium',50,92.1,0),('Janakpuri','Delhi','medium',53,96.4,0),('Rajouri Garden','Delhi','low',35,68.2,0),('Karol Bagh','Delhi','low',30,62.5,0),('Saket','Delhi','medium',48,88.6,0),('Vasant Kunj','Delhi','medium',50,91.3,0),('Mehrauli','Delhi','medium',52,94.7,0),('Hauz Khas','Delhi','low',38,72.4,0),('Lajpat Nagar','Delhi','low',32,64.8,0),('Greater Kailash','Delhi','low',28,60.2,0),('Nehru Place','Delhi','low',30,62.9,0),('Okhla','Delhi','medium',55,99.1,0),('Shahdara','Delhi','medium',58,103.4,0),('Preet Vihar','Delhi','medium',54,97.6,0),('Mayur Vihar','Delhi','medium',56,100.2,0),('Patparganj','Delhi','high',65,118.7,1),('Noida Sector 18','Delhi','medium',52,94.3,0),('Noida Sector 62','Delhi','medium',50,91.8,0),('Greater Noida','Delhi','medium',48,88.2,0),('Gurgaon','Delhi','medium',53,96.8,0),('Faridabad','Delhi','medium',55,99.4,0),('Ghaziabad','Delhi','high',62,112.5,1),('Loni','Delhi','high',65,117.8,1),('Bahadurgarh','Delhi','medium',52,94.6,0),('Narela','Delhi','medium',50,91.2,0),('Bawana','Delhi','medium',53,96.1,0),('Najafgarh','Delhi','high',68,122.4,1),('Mundka','Delhi','medium',55,99.7,0),('Vikaspuri','Delhi','medium',52,94.9,0),('Uttam Nagar','Delhi','medium',54,97.3,0),('Bindapur','Delhi','medium',53,96.5,0),('Dwarka Mor','Delhi','medium',51,93.2,0)`,
    `INSERT IGNORE INTO zones (name, city, risk_level, risk_score, avg_rainfall_mm, flood_prone) VALUES ('Koramangala','Bengaluru','high',78,142.5,1),('Indiranagar','Bengaluru','medium',58,108.3,0),('Whitefield','Bengaluru','high',75,138.7,1),('Electronic City','Bengaluru','medium',60,112.4,0),('HSR Layout','Bengaluru','high',80,145.2,1),('BTM Layout','Bengaluru','high',77,140.8,1),('Jayanagar','Bengaluru','medium',55,103.6,0),('JP Nagar','Bengaluru','medium',57,106.9,0),('Banashankari','Bengaluru','medium',56,105.2,0),('Rajajinagar','Bengaluru','medium',52,98.7,0),('Malleshwaram','Bengaluru','low',35,68.4,0),('Hebbal','Bengaluru','high',72,132.6,1),('Yelahanka','Bengaluru','medium',60,112.8,0),('Marathahalli','Bengaluru','high',76,139.4,1),('Bellandur','Bengaluru','high',82,148.6,1),('Sarjapur','Bengaluru','high',79,144.3,1),('Bommanahalli','Bengaluru','high',74,136.8,1),('Hongasandra','Bengaluru','medium',62,115.4,0),('Bannerghatta','Bengaluru','medium',58,108.7,0),('Anekal','Bengaluru','medium',55,103.2,0),('Domlur','Bengaluru','medium',57,106.5,0),('Shivajinagar','Bengaluru','low',32,64.8,0),('MG Road','Bengaluru','low',28,58.3,0),('Ulsoor','Bengaluru','medium',52,98.4,0),('Richmond Town','Bengaluru','low',30,61.7,0),('Kadugodi','Bengaluru','high',73,134.5,1),('Varthur','Bengaluru','high',78,142.8,1),('Hoodi','Bengaluru','high',75,138.2,1),('KR Puram','Bengaluru','high',70,128.6,1),('Banaswadi','Bengaluru','medium',63,117.3,0)`,
    `INSERT IGNORE INTO zones (name, city, risk_level, risk_score, avg_rainfall_mm, flood_prone) VALUES ('Banjara Hills','Hyderabad','medium',55,98.4,0),('Jubilee Hills','Hyderabad','medium',52,94.7,0),('Gachibowli','Hyderabad','high',72,128.6,1),('Hitech City','Hyderabad','medium',60,108.3,0),('Kondapur','Hyderabad','high',75,132.4,1),('Madhapur','Hyderabad','medium',62,112.7,0),('Kukatpally','Hyderabad','high',78,138.5,1),('KPHB','Hyderabad','high',76,135.2,1),('Miyapur','Hyderabad','medium',65,116.4,0),('Bachupally','Hyderabad','medium',63,113.8,0),('Secunderabad','Hyderabad','medium',55,98.9,0),('Begumpet','Hyderabad','medium',52,94.3,0),('Ameerpet','Hyderabad','medium',50,91.6,0),('SR Nagar','Hyderabad','medium',53,96.2,0),('Erragadda','Hyderabad','medium',55,99.4,0),('Moosapet','Hyderabad','high',70,124.8,1),('Borabanda','Hyderabad','high',72,128.3,1),('LB Nagar','Hyderabad','high',75,132.9,1),('Dilsukhnagar','Hyderabad','high',78,138.7,1),('Kothapet','Hyderabad','high',76,135.8,1),('Uppal','Hyderabad','high',80,142.4,1),('Nacharam','Hyderabad','high',77,137.6,1),('Boduppal','Hyderabad','medium',65,116.9,0),('Peerzadiguda','Hyderabad','medium',63,113.4,0),('Hayathnagar','Hyderabad','medium',60,108.7,0)`
  ];

  for (const q of queries) {
    try {
      await db.promise().query(q);
      results.push({ status: 'ok', query: q.substring(0, 50) });
    } catch (err) {
      results.push({ status: 'error', query: q.substring(0, 50), error: err.message });
    }
  }

  const errors = results.filter(r => r.status === 'error');
  res.json({
    success: errors.length === 0,
    total: results.length,
    errors: errors.length,
    details: results
  });
});

  

app.get('/api/live-weather', async (req, res) => {
  const city = req.query.city || 'Chennai';
  const AQICN_TOKEN = '6c868c8980b417984c83de576bdac72bfb305d9f';

  try {
    const weatherRes = await axios.get(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      { timeout: 8000 }
    );

    const current = weatherRes.data.current_condition[0];
    const temp = parseFloat(current.temp_C) || 30;
    const rainfall = parseFloat(current.precipMM) || 0;

    let aqi = 85;
    let aqiSource = 'default';
    try {
      const aqiRes = await axios.get(
        `https://api.waqi.info/feed/${encodeURIComponent(city)}/?token=${AQICN_TOKEN}`,
        { timeout: 5000 }
      );
      if (aqiRes.data?.data?.aqi) {
        aqi = aqiRes.data.data.aqi;
        aqiSource = 'live';
      }
    } catch (e) {}

    const rainTrigger = rainfall > 1.5;
    const heatTrigger = temp > 42;
    const aqiTrigger = aqi > 300;

    res.json({
      city,
      rainfall_mm: rainfall,
      temperature_c: temp,
      aqi,
      aqi_source: aqiSource,
      triggers: {
        rain: { active: rainTrigger, value: rainfall, threshold: 1.5, unit: 'mm' },
        heat: { active: heatTrigger, value: temp, threshold: 42, unit: 'C' },
        aqi: { active: aqiTrigger, value: aqi, threshold: 300, unit: 'AQI' }
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

// AUTOMATED PARAMETRIC TRIGGER ENGINE
// Har 10 minute mein chalti hai
cron.schedule('*/10 * * * *', async () => {
  console.log('Running automated trigger check...');

  try {
    // Sab active policies fetch karo
    const [policies] = await db.promise().query(`
      SELECT w.phone, w.name, z.name as zone, z.risk_level, 
             p.id as policy_id, p.weekly_premium
      FROM policies p
      JOIN workers w ON p.worker_id = w.id
      JOIN zones z ON w.zone_id = z.id
      WHERE p.status = 'active'
    `);

    if (policies.length === 0) return;

    // Live weather fetch karo
    const weatherRes = await axios.get('https://wttr.in/Chennai?format=j1', { timeout: 8000 });
    const current = weatherRes.data.current_condition[0];
    const rainfall = parseFloat(current.precipMM) || 0;
    const temp = parseFloat(current.temp_C) || 30;

    // AQI fetch
    let aqi = 85;
    try {
      const aqiRes = await axios.get(
        `https://api.waqi.info/feed/chennai/?token=6c868c8980b417984c83de576bdac72bfb305d9f`,
        { timeout: 5000 }
      );
      if (aqiRes.data?.data?.aqi) aqi = aqiRes.data.data.aqi;
    } catch(e) {}

    const today = new Date().toISOString().split('T')[0];
    let triggeredCount = 0;

    // Har policy ke liye check karo
    for (const policy of policies) {
      const HIGH_RISK = ['Velachery','Porur','Tambaram','Perungudi','Pallikaranai',
        'Madipakkam','Madhavaram','Thiruvottiyur','Manali','Avadi',
        'Poonamallee','Vandalur','Medavakkam','Perungalathur','Kelambakkam'];

      const threshold = HIGH_RISK.includes(policy.zone) ? 1.5 : 3.0;
      const rainTrigger = rainfall > threshold;
      const heatTrigger = temp > 42;
      const aqiTrigger = aqi > 300;

      if (!rainTrigger && !heatTrigger && !aqiTrigger) continue;

      // Duplicate check — aaj already auto-claim hua?
      const [existing] = await db.promise().query(
        `SELECT id FROM claims WHERE worker_phone = ? AND claim_date = ? AND claim_type LIKE 'AUTO%'`,
        [policy.phone, today]
      );
      if (existing.length > 0) continue;

      // Disruption type determine karo
      let claimType = '';
      let disruptionReason = '';
      if (rainTrigger) {
        claimType = 'AUTO-Heavy Rainfall';
        disruptionReason = `Auto-detected: ${rainfall}mm rainfall in ${policy.zone}`;
      } else if (heatTrigger) {
        claimType = 'AUTO-Extreme Heat';
        disruptionReason = `Auto-detected: ${temp}°C temperature in Chennai`;
      } else if (aqiTrigger) {
        claimType = 'AUTO-Severe AQI';
        disruptionReason = `Auto-detected: AQI ${aqi} in Chennai`;
      }

      // Auto claim save karo
      await db.promise().query(
        `INSERT INTO claims (worker_phone, zone, claim_type, claim_date, delivery_count, fraud_score, verdict)
         VALUES (?, ?, ?, ?, 0, 0, 'AUTO-PASS')`,
        [policy.phone, policy.zone, claimType, today]
      );

      triggeredCount++;
      console.log(`Auto-triggered: ${policy.name} (${policy.zone}) — ${disruptionReason}`);
    }

    console.log(`Trigger check complete. ${triggeredCount}/${policies.length} policies triggered.`);

  } catch (err) {
    console.error('Trigger engine error:', err.message);
  }
});

// Manual trigger endpoint — testing ke liye
app.get('/api/run-trigger-engine', async (req, res) => {
  try {
    const [policies] = await db.promise().query(`
      SELECT w.phone, w.name, z.name as zone, z.risk_level
      FROM policies p
      JOIN workers w ON p.worker_id = w.id
      JOIN zones z ON w.zone_id = z.id
      WHERE p.status = 'active'
    `);

    const weatherRes = await axios.get('https://wttr.in/Chennai?format=j1', { timeout: 8000 });
    const current = weatherRes.data.current_condition[0];
    const rainfall = parseFloat(current.precipMM) || 0;
    const temp = parseFloat(current.temp_C) || 30;

    let aqi = 85;
    try {
      const aqiRes = await axios.get(
        `https://api.waqi.info/feed/chennai/?token=6c868c8980b417984c83de576bdac72bfb305d9f`,
        { timeout: 5000 }
      );
      if (aqiRes.data?.data?.aqi) aqi = aqiRes.data.data.aqi;
    } catch(e) {}

    res.json({
      active_policies: policies.length,
      current_weather: { rainfall_mm: rainfall, temperature_c: temp, aqi },
      rain_trigger: rainfall > 1.5,
      heat_trigger: temp > 42,
      aqi_trigger: aqi > 300,
      any_trigger: rainfall > 1.5 || temp > 42 || aqi > 300,
      message: 'Engine check complete — auto-claims will be created if triggers active'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`🚀 GigShield backend running on port ${process.env.PORT}`);
});


