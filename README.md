# MOE-PRECIP: ADAPTIVE MIXTURE-OF-EXPERTS FUSION AND AN INTERACTIVE WEB-BASED VISUAL ANALYTICS INTERFACE FOR MULTIMODAL RAINFALL FORECASTING

- https://webspace.csumb.edu/~krom2772/AdaptiveMoE/

An interactive, browser-based tool for exploring the **MoE-Climate dataset** and
visually inspecting the spatiotemporal forecasts produced by the project's
**Adaptive Mixture-of-Experts (MoE)** model. The application renders gridded
atmospheric variables over South Florida on a map, animates them through time,
and lets you compare model predictions against ground truth side by side.

This README documents the web application only. For the modeling code and the
underlying dataset, see the sibling `Script/` directory and
[`Data/README.md`](Data/README.md).

---

## Research Context

The visualizer is the front end for an **Adaptive Mixture-of-Experts** approach
to spatiotemporal weather forecasting. The wider project trains a pool of expert
MLPs in two phases — first encouraging the experts to develop distinct
"perspectives," then freezing them and training a gating/router network over
**physically grouped feature partitions** (Momentum, Temperature, Mass,
Moisture, Cloud, Radiation, Hydrology). Predictions from each partition are then
aggregated.

The dataset captures a **9-day hurricane-landfall window in South Florida**
(2022-09-23 → 2022-10-02), sampled hourly (216 timestamps) on a **100 × 100
grid** at roughly 3 km resolution. Each atmospheric variable is stored as a
separate CSV. See [`Data/README.md`](Data/README.md) for full variable
definitions, units, and feature-category groupings.

> The training/inference code in `Script/` (e.g. `adaptive_moe.py`,
> `dataloader.py`, and the `baselines/`) is provided as Google Colab exports and
> is not wired up for local execution out of the box. This web app consumes the
> exported CSV outputs rather than running the model directly.

---

## What the Visualizer Does

- **Map-based rendering** — each of the 10,000 grid cells is drawn as a colored
  rectangle over a Leaflet map of South Florida, with selectable Street,
  Satellite, and Terrain base layers.
- **Time animation** — play/pause, rewind, fast-forward, and a scrubber move
  through all 216 hourly timestamps, with adjustable playback speed
  (1× / 2× / 5× / 10×).
- **Variable selection** — pick a feature **Category** (Temperature, Hydrology,
  Radiation, Moisture, Cloud, Mass, Momentum) and then a specific **Data Type**
  within it.
- **Prediction comparison** — toggle *Compare Predictions* to show the model's
  forecast map (`*_pred.csv`) alongside the actual map, with synchronized
  panning/zoom and time.
- **Error map** — when comparison is active, toggle *Show Error Map* to render a
  diverging color scale of the per-cell difference between actual and predicted
  values.
- **Variable-aware color scales** — fixed global min/max per variable plus
  purpose-built palettes (a diverging palette for temperature, a sequential blue
  palette for moisture, and a diverging red/blue palette for error), with a
  legend showing range and physical units.

---

## Project Structure

```
Web-based Application/
├── index.html              # App shell: control panel + map panels
├── script.js               # All app logic (map setup, CSV loading, animation, comparison)
├── styles.css              # Layout and theming
├── generate_predictions.py # Creates demo *_pred.csv files from the source CSVs
└── Data/
    ├── README.md           # Dataset documentation (variables, grid, time range)
    ├── <id>.csv            # Ground-truth variable (e.g. 83.csv = precipitation rate)
    └── <id>_pred.csv       # Corresponding prediction file
```

Each variable CSV has a `Grid` column (cell index `0`–`9999`) followed by one
column per hourly timestamp, named `YYYYMMDD_HH_<id>.npy`.

### Variable reference

| ID  | Variable                        | Category     | Unit         |
|-----|---------------------------------|--------------|--------------|
| 21  | Dew Point Temperature (700 hPa) | Temperature  | K            |
| 71  | 2 m Temperature                 | Temperature  | K            |
| 88  | Storm Surface Runoff            | Hydrology    | kg m⁻²       |
| 89  | Baseflow-Groundwater Runoff     | Hydrology    | kg m⁻²       |
| 170 | GOES-12 Ch 3 Brightness Temp    | Radiation    | K            |
| 171 | GOES-12 Ch 4 Brightness Temp    | Radiation    | K            |
| 172 | GOES-11 Ch 3 Brightness Temp    | Radiation    | K            |
| 173 | GOES-11 Ch 4 Brightness Temp    | Radiation    | K            |
| 66  | Moisture Availability           | Moisture     | %            |
| 67  | Plant Canopy Surface Water      | Moisture     | kg m⁻²       |
| 83  | Precipitation Rate              | Moisture     | kg m⁻² s⁻¹   |
| 84  | Total Precipitation             | Moisture     | kg m⁻²       |
| 143 | Relative Humidity               | Moisture     | %            |
| 115 | Total Cloud Cover               | Cloud        | %            |
| 116 | Low Cloud Cover                 | Cloud        | %            |
| 117 | Medium Cloud Cover              | Cloud        | %            |
| 122 | Pressure (Cloud Base)           | Mass         | Pa           |
| 123 | Pressure (Cloud Top)            | Mass         | Pa           |
| 9   | Wind Speed (Gust)               | Momentum     | m s⁻¹        |
| 10  | U Component of Wind (250 hPa)   | Momentum     | m s⁻¹        |
| 11  | V Component of Wind (250 hPa)   | Momentum     | m s⁻¹        |

---

## Running the App

The app loads CSV files from `./Data/` via `fetch`, so it must be served over
HTTP (opening `index.html` directly with `file://` will be blocked by the
browser). From inside the `Web-based Application/` directory:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/> and use the **Data Controls** panel to pick a
category and variable, press **Load**, and use the playback controls to animate
through time. Leaflet is loaded from a CDN, so an internet connection is needed
on first load.

### Typical workflow

1. Choose a **Category**, then a **Data Type**, then click **Load**.
2. Scrub or press play to animate the variable over the 9-day window.
3. Enable **Compare Predictions** to show the actual and predicted maps together.
4. Enable **Show Error Map** to inspect where the model deviates most.

---


## Implementation Notes

- **Rendering** uses [Leaflet](https://leafletjs.com/) 1.9.4 with a canvas
  renderer for performance across 10,000 cells. The map is locked to a fixed
  South Florida bounding box.
- **Grid layout** maps each CSV row index to a lat/lon cell on a 100 × 100 grid
  (≈0.01° steps) covering roughly 25.2°–26.2° N, 81.0°–80.0° W.
- **Color mapping** clamps each value to a fixed per-variable global range so
  colors stay consistent as you animate and compare; the error map uses a
  diverging palette centered on zero.
- **Comparison maps** keep panning, zoom, and the active timestamp synchronized
  between the actual, predicted, and error panels.

