from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import pickle
import os
import hashlib
from datetime import datetime

app = Flask(__name__)
CORS(app)

save_dir = os.path.dirname(os.path.abspath(__file__))
model = pickle.load(open(os.path.join(save_dir, "model.pkl"), "rb"))
pipeline = pickle.load(open(os.path.join(save_dir, "pipeline.pkl"), "rb"))

HIGH_RISK_ZONES = [
    "Velachery", "Porur", "Tambaram", "Perungudi", "Pallikaranai",
    "Madipakkam", "Madhavaram", "Thiruvottiyur", "Manali", "Avadi",
    "Poonamallee", "Vandalur", "Medavakkam", "Perungalathur", "Kelambakkam"
]

ZONE_MULTIPLIERS = {
    "Velachery": 1.8, "Pallikaranai": 2.0, "Madipakkam": 1.9,
    "Porur": 1.7, "Tambaram": 1.6, "Medavakkam": 1.8,
    "Perungudi": 1.7, "Madhavaram": 1.5, "Thiruvottiyur": 1.6,
    "Manali": 1.7, "Avadi": 1.5, "Poonamallee": 1.6,
    "Vandalur": 1.5, "Perungalathur": 1.6, "Kelambakkam": 1.6,
    "Ambattur": 1.3, "Kolathur": 1.2, "Adyar": 1.1,
    "Guindy": 1.1, "Sholinganallur": 1.1, "T Nagar": 1.0,
    "Mylapore": 0.9, "Kodambakkam": 0.9, "Virugambakkam": 0.9,
    "Vadapalani": 0.9, "Arumbakkam": 0.9, "Chromepet": 0.8,
    "Saligramam": 0.8, "Royapettah": 0.8, "Villivakkam": 1.0,
    "Perambur": 1.0, "Anna Nagar": 0.7, "Nungambakkam": 0.6,
    "Egmore": 0.6, "Ashok Nagar": 0.6, "KK Nagar": 0.6,
    "Navalur": 0.7, "Siruseri": 0.9, "Urapakkam": 1.1,
    "Guduvanchery": 1.2
}

def get_risk_level(zone, predicted_rain, month):
    score = 0
    if zone in HIGH_RISK_ZONES:
        score += 40
    if predicted_rain > 8:
        score += 40
    elif predicted_rain > 4:
        score += 20
    if month in [10, 11, 12]:
        score += 20
    elif month in [7, 8, 9]:
        score += 10
    if score >= 70:
        return "high"
    elif score >= 40:
        return "medium"
    return "low"

@app.route("/predict", methods=["POST"])
def predict():
    data = request.json
    zone = data.get("zone")
    date_str = data.get("date")

    try:
        date = datetime.strptime(date_str, "%Y-%m-%d")
    except:
        date = datetime.today()

    input_df = pd.DataFrame([{
        "Date.Day": date.day,
        "Date.Month": date.month,
        "Station.City": zone
    }])

    processed = pipeline.transform(input_df)
    base_rain = max(0, float(model.predict(processed)[0]))

    multiplier = ZONE_MULTIPLIERS.get(zone, 1.0)

    seed = int(hashlib.md5(f"{zone}{date_str}".encode()).hexdigest()[:8], 16)
    np.random.seed(seed % 10000)
    variation = np.random.uniform(0.7, 1.4)

    predicted_rain = round(base_rain * multiplier * variation, 2)
    predicted_rain = max(0, predicted_rain)

    # Dynamic threshold
    if zone in HIGH_RISK_ZONES:
        DAILY_TRIGGER_MM = 1.5
    else:
        DAILY_TRIGGER_MM = 3.0

    model_trigger = predicted_rain > DAILY_TRIGGER_MM

    # Rule based
    monsoon_months = [6, 7, 8, 9, 10, 11, 12]
    rule_trigger = (
        date.month in monsoon_months and
        zone in HIGH_RISK_ZONES and
        predicted_rain > 0.5
    )

    # Dry months — no trigger
    dry_months = [1, 2, 3, 4]
    if date.month in dry_months:
        model_trigger = predicted_rain > 5.0
        rule_trigger = False

    insurance_trigger = model_trigger or rule_trigger

    if model_trigger:
        reason = f"Heavy rainfall {predicted_rain}mm predicted — exceeds {DAILY_TRIGGER_MM}mm threshold"
    elif rule_trigger:
        reason = f"Monsoon season active — {zone} high risk zone alert"
    else:
        reason = "Normal conditions — no disruption detected"

    risk_level = get_risk_level(zone, predicted_rain, date.month)

    return jsonify({
        "zone": zone,
        "date": date_str,
        "predicted_rainfall_mm": predicted_rain,
        "insurance_trigger": insurance_trigger,
        "trigger_reason": reason,
        "risk_level": risk_level
    })

@app.route("/risk-score", methods=["GET"])
def risk_score():
    zone = request.args.get("zone")
    month = int(request.args.get("month", datetime.today().month))

    input_df = pd.DataFrame([{
        "Date.Day": 15,
        "Date.Month": month,
        "Station.City": zone
    }])

    processed = pipeline.transform(input_df)
    base_rain = max(0, float(model.predict(processed)[0]))
    multiplier = ZONE_MULTIPLIERS.get(zone, 1.0)
    predicted_rain = round(base_rain * multiplier, 2)
    risk_level = get_risk_level(zone, predicted_rain, month)
    risk_scores = {"high": 80, "medium": 55, "low": 30}

    return jsonify({
        "zone": zone,
        "month": month,
        "risk_level": risk_level,
        "risk_score": risk_scores[risk_level],
        "avg_predicted_rainfall_mm": predicted_rain
    })

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": "GigShield Rainfall Predictor v2 — Real IMD Data"
    })

if __name__ == "__main__":
   app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)), debug=False)