# Geometric Alpha: Polytopal Projection Processing for Sports Derivatives

A comprehensive architecture for applying geometric cognition and topological data analysis to sports betting markets, specifically MLB.

## Overview

Geometric Alpha transcends traditional statistical aggregation by modeling baseball as a series of geometric interactions between high-dimensional shapes. By analyzing the "shape" of a pitcher's arsenal, the "volume" of an umpire's strike zone, and the "surface" of a defense's coverage, we uncover inefficiencies that purely statistical models overlook.

## Core Concepts

### Polytopal Projection
- A **polytope** is the generalization of a polygon to N dimensions
- Every pitch is a point in an N-dimensional phase space (velocity, spin, release coordinates, acceleration)
- A pitcher's "arsenal" forms a **convex hull** defining their operational capability
- **Projection** maps hyper-dimensional shapes onto low-dimensional decision planes

### Geometric Alpha Sources
1. **Pitch Tunneling** - Manifold intersection analysis
2. **Umpire Zones** - Convex hull expansion/contraction
3. **Defensive Coverage** - Voronoi tessellation analysis

## Architecture

```
geometric-alpha/
├── core/               # Core engine and orchestration
│   ├── engine.py       # Main Polytopal Simulator
│   └── pipeline.py     # Data processing pipeline
├── data/               # Data layer
│   ├── statcast.py     # pybaseball integration
│   ├── odds.py         # The-Odds-API integration
│   └── environment.py  # Weather/stadium context
├── features/           # Geometric feature engineering
│   ├── tunneling.py    # Pitch tunnel analysis
│   ├── umpire_hull.py  # Strike zone convex hulls
│   ├── voronoi.py      # Defensive coverage
│   └── arsenal.py      # Pitcher arsenal polytopes
├── models/             # Predictive modeling
│   ├── predictor.py    # ML model ensemble
│   └── run_expectancy.py # Delta RE predictions
├── optimization/       # Financial engineering
│   ├── kelly.py        # Simultaneous Kelly solver
│   └── portfolio.py    # Bet portfolio management
├── backtest/           # Validation framework
│   ├── simulator.py    # Historical simulation
│   └── metrics.py      # Performance analytics
└── config/             # Configuration
    └── settings.py     # System configuration
```

## Installation

```bash
cd geometric-alpha
pip install -r requirements.txt
```

## Dependencies

- **Data**: pybaseball, requests (odds API)
- **Geometry**: scipy, numpy, scikit-learn
- **ML**: xgboost, lightgbm
- **Optimization**: cvxpy
- **GPU**: cuml (optional, for GPU acceleration)

## Usage

### Fetch Historical Data
```python
from data.statcast import StatcastClient
from data.odds import OddsClient

statcast = StatcastClient()
pitches = statcast.fetch_season(2024)
odds = OddsClient(api_key='YOUR_KEY').fetch_historical('2024-04-01', '2024-09-30')
```

### Compute Geometric Features
```python
from features.tunneling import TunnelAnalyzer
from features.umpire_hull import UmpireHullCalculator

analyzer = TunnelAnalyzer()
tunnel_scores = analyzer.compute_arsenal_tunnels(pitches)

hull_calc = UmpireHullCalculator()
umpire_zones = hull_calc.compute_zone_hulls(pitches)
```

### Run Predictions
```python
from models.predictor import GeometricPredictor

predictor = GeometricPredictor()
predictor.train(historical_features, historical_outcomes)
probabilities = predictor.predict(today_features)
```

### Optimize Betting Portfolio
```python
from optimization.kelly import SimultaneousKellySolver

solver = SimultaneousKellySolver(bankroll=10000)
bets = solver.optimize(opportunities, probabilities)
```

## Mathematical Foundations

### Pitch Tunneling Score
```
TunnelScore = D_plate / D_tunnel
```
Where:
- D_tunnel = Euclidean distance at decision point (~23.8 ft from plate)
- D_plate = Euclidean distance at plate

### Umpire Zone Expansion
```
λ_zone = Area(Umpire Hull) / Area(Rulebook Zone)
```

### Voronoi Coverage Efficiency
```
InefficiencyMetric = ∫(Spray Density × Edge Distance) dA
```

### Simultaneous Kelly
```
max E[log(1 + Σ f_i × b_i × I_i - Σ f_i)]
s.t. Σ f_i ≤ 0.25 (max exposure)
     f_i ≥ 0 (no short positions)
```

## License

Proprietary - Clear Seas Solutions LLC

## Contact

Paul@clearseassolutions.com
