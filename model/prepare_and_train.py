import pandas as pd
import numpy as np
import pickle
import os
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

# ── Step 1: Load dataset ──────────────────────────────────────
df_raw = pd.read_csv(
    r"C:\Users\navin\OneDrive\Desktop\devtrials\model\Indian Rainfall Dataset District-wise Daily Measurements.csv",
    sep=";"
)

print(f"Raw dataset: {df_raw.shape}")

# ── Step 2: Filter Tamil Nadu ─────────────────────────────────
tn = df_raw[df_raw['state'] == 'Tamil Nadu'].copy()
print(f"Tamil Nadu rows: {len(tn)}")

# ── Step 3: Wide to Long format ───────────────────────────────
day_cols = ['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th',
            '11th','12th','13th','14th','15th','16th','17th','18th','19th','20th',
            '21st','22nd','23rd','24th','25th','26th','27th','28th','29th','30th','31st']

records = []
for _, row in tn.iterrows():
    district = row['district']
    month = int(row['month'])
    for i, col in enumerate(day_cols):
        day = i + 1
        # Skip invalid days (Feb 29-31, months with 30 days)
        if month == 2 and day > 28:
            continue
        if month in [4,6,9,11] and day > 30:
            continue
        val = row[col]
        if pd.notna(val):
            records.append({
                'district': district,
                'month': month,
                'day': day,
                'rainfall_mm': max(0, float(val))
            })

df_long = pd.DataFrame(records)
print(f"Long format rows: {len(df_long)}")
print(f"Districts: {df_long['district'].unique()}")

# ── Step 4: Chennai zones mapping ────────────────────────────
# Each zone maps to nearest district + risk multiplier
zone_mapping = {
    'Velachery':       ('Chennai',     1.8),
    'T Nagar':         ('Chennai',     1.2),
    'Anna Nagar':      ('Chennai',     0.7),
    'Porur':           ('Chengalpattu',1.7),
    'Adyar':           ('Chennai',     1.1),
    'Tambaram':        ('Chengalpattu',1.6),
    'Sholinganallur':  ('Chengalpattu',1.1),
    'Chromepet':       ('Chengalpattu',0.9),
    'Perungudi':       ('Chennai',     1.7),
    'Pallikaranai':    ('Chennai',     2.0),
    'Madipakkam':      ('Chennai',     1.9),
    'Guindy':          ('Chennai',     1.1),
    'Nungambakkam':    ('Chennai',     0.7),
    'Egmore':          ('Chennai',     0.7),
    'Mylapore':        ('Chennai',     0.9),
    'Royapettah':      ('Chennai',     0.8),
    'Kodambakkam':     ('Chennai',     0.9),
    'Virugambakkam':   ('Chennai',     0.9),
    'Saligramam':      ('Chennai',     0.8),
    'Vadapalani':      ('Chennai',     0.9),
    'Ashok Nagar':     ('Chennai',     0.7),
    'KK Nagar':        ('Chennai',     0.7),
    'Arumbakkam':      ('Chennai',     0.9),
    'Villivakkam':     ('Chennai',     1.0),
    'Perambur':        ('Chennai',     1.0),
    'Kolathur':        ('Chennai',     1.2),
    'Madhavaram':      ('Chennai',     1.5),
    'Thiruvottiyur':   ('Chennai',     1.6),
    'Manali':          ('Chennai',     1.7),
    'Ambattur':        ('Chennai',     1.3),
    'Avadi':           ('Tiruvallur',  1.5),
    'Poonamallee':     ('Tiruvallur',  1.6),
    'Vandalur':        ('Chengalpattu',1.5),
    'Medavakkam':      ('Chennai',     1.8),
    'Perungalathur':   ('Chengalpattu',1.6),
    'Urapakkam':       ('Chengalpattu',1.3),
    'Guduvanchery':    ('Chengalpattu',1.2),
    'Kelambakkam':     ('Chengalpattu',1.6),
    'Siruseri':        ('Chengalpattu',1.0),
    'Navalur':         ('Chengalpattu',0.8),
}

# ── Step 5: Generate zone-wise dataset ───────────────────────
zone_records = []
np.random.seed(42)

for zone, (district, multiplier) in zone_mapping.items():
    district_data = df_long[df_long['district'] == district]
    if len(district_data) == 0:
        print(f"WARNING: {district} not found — skipping {zone}")
        continue
    for _, row in district_data.iterrows():
        # Apply multiplier + small daily variation (seeded for consistency)
        seed_val = hash(f"{zone}{row['month']}{row['day']}") % 10000
        np.random.seed(seed_val)
        variation = np.random.uniform(0.85, 1.15)
        rainfall = max(0, round(row['rainfall_mm'] * multiplier * variation, 2))
        zone_records.append({
            'Date.Day':   row['day'],
            'Date.Month': row['month'],
            'Station.City': zone,
            'Data.Precipitation': rainfall
        })

df_zones = pd.DataFrame(zone_records)
print(f"\nZone dataset: {len(df_zones):,} records")
print(f"Zones: {df_zones['Station.City'].nunique()}")
print(f"\nSample stats:")
print(df_zones.groupby('Station.City')['Data.Precipitation'].agg(['mean','max']).head(10))

# ── Step 6: Train model ───────────────────────────────────────
X = df_zones[['Date.Day', 'Date.Month', 'Station.City']]
y = df_zones['Data.Precipitation']

num_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='mean')),
    ('scaler', StandardScaler())
])
cat_pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='most_frequent')),
    ('onehot', OneHotEncoder(handle_unknown='ignore'))
])
preprocessor = ColumnTransformer([
    ('num', num_pipeline, ['Date.Day', 'Date.Month']),
    ('cat', cat_pipeline, ['Station.City'])
])

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

X_train_proc = preprocessor.fit_transform(X_train)
X_test_proc  = preprocessor.transform(X_test)

print("\nTraining GradientBoostingRegressor...")
model = GradientBoostingRegressor(
    n_estimators=200,
    max_depth=5,
    learning_rate=0.1,
    random_state=42
)
model.fit(X_train_proc, y_train)

y_pred = np.maximum(model.predict(X_test_proc), 0)
mae = mean_absolute_error(y_test, y_pred)
r2  = r2_score(y_test, y_pred)
print(f"MAE : {mae:.2f} mm")
print(f"R2  : {r2:.4f}")

# ── Step 7: Save ──────────────────────────────────────────────
save_dir = os.path.dirname(os.path.abspath(__file__))
pickle.dump(model,       open(os.path.join(save_dir, 'model.pkl'),    'wb'))
pickle.dump(preprocessor,open(os.path.join(save_dir, 'pipeline.pkl'), 'wb'))
print("\nmodel.pkl and pipeline.pkl saved!")

# ── Step 8: Test predictions ──────────────────────────────────
print("\n--- Prediction test ---")
test_cases = [
    ('Velachery',    11),
    ('Velachery',    3),
    ('Anna Nagar',   11),
    ('Anna Nagar',   3),
    ('Pallikaranai', 11),
    ('Chromepet',    6),
    ('T Nagar',      10),
]
for zone, month in test_cases:
    for day in [5, 15, 25]:
        test_df = pd.DataFrame([{
            'Date.Day': day, 'Date.Month': month, 'Station.City': zone
        }])
        proc = preprocessor.transform(test_df)
        pred = max(0, model.predict(proc)[0])
        trigger = 'YES' if pred > 25 else 'NO'
        print(f"{zone:<20} | Month {month:2d} Day {day:2d} | {pred:6.2f}mm | Trigger: {trigger}")