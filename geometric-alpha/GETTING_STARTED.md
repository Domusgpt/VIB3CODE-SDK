# Getting Started: Training, Validation, and Paper Trading

This guide walks you through the complete process of:
1. Training your model
2. Validating it's trustworthy
3. Paper trading before risking real money

## Prerequisites

```bash
# Install dependencies
pip install -r requirements.txt

# Required packages
# - numpy, pandas, scipy
# - scikit-learn
# - xgboost or lightgbm (recommended)
# - cvxpy (for Kelly optimization)
```

---

## Step 1: Prepare Your Data

You need two types of data:

### 1.1 Feature Data (X)
Historical game features including:
- **Geometric features**: tunnel_score, arsenal_volume, defense_voronoi_coverage
- **Contextual features**: home_team_win_pct, pitcher_era, bullpen_era
- **Environmental**: weather, altitude, etc.

```python
import pandas as pd

# Your features DataFrame should look like:
features_df = pd.DataFrame({
    'game_id': ['game_001', 'game_002', ...],
    'date': ['2023-04-01', '2023-04-01', ...],
    'tunnel_score': [0.65, 0.72, ...],
    'arsenal_volume': [1.2, 0.9, ...],
    'home_team_win_pct': [0.55, 0.48, ...],
    'home_pitcher_era': [3.45, 4.12, ...],
    # ... more features
})
```

### 1.2 Target Data (y)
Game outcomes:

```python
targets_df = pd.DataFrame({
    'game_id': ['game_001', 'game_002', ...],
    'home_win': [1, 0, ...],           # 1 if home won, 0 if away won
    'total_runs': [9, 7, ...],         # Total runs scored
    'margin': [3, -2, ...]             # Home score - Away score
})
```

### 1.3 Data Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Training samples | 1,000 | 5,000+ |
| Date range | 1 season | 3+ seasons |
| Features | 5 | 15+ |

---

## Step 2: Train Your Model

```python
from training.pipeline import ModelTrainingPipeline, TrainingConfig

# Configure training
config = TrainingConfig(
    min_training_samples=1000,
    cv_folds=5,
    max_acceptable_ece=0.05  # Calibration threshold
)

# Initialize pipeline
pipeline = ModelTrainingPipeline(config)

# Train with full validation
result = pipeline.train_and_validate(
    features_df=features_df,
    targets_df=targets_df,
    target_col='home_win'
)

# Check results
print(pipeline.get_training_report())
```

### Expected Output

```
================================================================================
                    MODEL TRAINING REPORT
================================================================================

MODEL: xgboost
DATE: 2024-01-15T10:30:00

DATA
----
Training samples: 4000
Test samples: 1000
Features used: 15

CROSS-VALIDATION
----------------
AUC: 0.5823 (+/- 0.0156)

TEST SET PERFORMANCE
--------------------
AUC: 0.5789
Brier Score: 0.2341
Log Loss: 0.6821

CALIBRATION (CRITICAL FOR BETTING)
----------------------------------
ECE: 0.0342
Level: GOOD
Is Calibrated: YES ✓
Threshold: ECE < 0.050

✓ Model is READY for betting

TOP FEATURES
------------
1. home_team_win_pct: 0.1523
2. tunnel_score: 0.0987
3. home_pitcher_era: 0.0876
...
================================================================================
```

### Critical Calibration Check

**If `Is Calibrated: NO`**, do NOT proceed to betting. Your model's probability estimates are not reliable.

Fix options:
1. Get more training data
2. Try different features
3. Apply calibration adjustment (Platt scaling, isotonic regression)

---

## Step 3: Save Your Trained Model

```python
# Save model for production use
pipeline.save_model("models/production_v1")

# This creates:
# models/production_v1/
# ├── model.pkl           # Trained model
# ├── scaler.pkl          # Feature scaler
# ├── features.json       # Feature column names
# ├── calibration.pkl     # Calibration validator
# └── training_result.json # Training metrics
```

---

## Step 4: Build Correlation Estimator

Before betting, you need empirical correlations (not hardcoded guesses).

```python
from optimization.empirical_kelly import (
    EmpiricalKellySolver,
    build_correlation_estimator_from_history
)

# Prepare historical outcomes
historical_outcomes = []
for game in historical_games:
    historical_outcomes.append({
        'game_id': game.id,
        'outcomes': {
            'moneyline_home': game.home_won,
            'moneyline_away': not game.home_won,
            'total_over': game.total > game.line,
            'total_under': game.total < game.line,
        },
        'date': game.date
    })

# Build estimator
correlation_estimator = build_correlation_estimator_from_history(
    historical_outcomes,
    min_samples=50  # Minimum games for reliable correlation
)

# Check what correlations are available
print(correlation_estimator.get_summary())
```

---

## Step 5: Start Paper Trading

**CRITICAL**: Paper trade for at least 3 months and 500+ bets before live trading.

```python
from paper_trading.simulator import PaperTradingSimulator
from models.validated_predictor import ValidatedPredictor

# Load your trained model
predictor = ValidatedPredictor()
predictor.load_model("models/production_v1")

# Initialize paper trading
simulator = PaperTradingSimulator(
    initial_bankroll=10000,
    validation_mode=True  # Extra strict checks
)

simulator.start_session("paper_trading_v1")
```

### Daily Paper Trading Loop

```python
from datetime import datetime, timedelta

# Process each day
for day in range(90):  # 3 months minimum
    date = datetime.now() - timedelta(days=90-day)

    # 1. Get today's games
    games = fetch_todays_games(date)  # Your data source

    # 2. Generate features
    features = compute_features(games)  # Your feature engineering

    # 3. Get predictions with uncertainty
    predictions = predictor.predict_with_uncertainty(features)

    # Format for simulator
    pred_list = [{
        'game_id': p.game_id,
        'home_team': p.home_team,
        'away_team': p.away_team,
        'home_win_prob': p.home_win_prob,
        'confidence': p.confidence,
        'trust_score': p.trust_score
    } for p in predictions]

    # 4. Get market odds
    odds = fetch_market_odds(date)  # Your odds source

    # 5. Process through simulator
    result = simulator.process_day(date, pred_list, odds)

    # 6. Later, when games finish, settle bets
    outcomes = fetch_outcomes(date)  # After games complete
    simulator.settle_pending_bets(outcomes)
```

### Check Validation Status

```python
# After paper trading, check if ready for live
report = simulator.get_validation_report()

print(f"Ready for live: {report.is_ready_for_live}")
print(f"Status: {report.validation_status.value}")
print(f"Total bets: {report.total_bets}")
print(f"ROI: {report.total_roi:.2%}")
print(f"CLV: {report.mean_clv:.4f}")

if report.blocking_issues:
    print("\nBlocking issues:")
    for issue in report.blocking_issues:
        print(f"  ✗ {issue}")

print(f"\n{report.recommendation}")
```

---

## Step 6: Validation Requirements

Before going live, you MUST pass ALL of these:

| Check | Requirement | Why It Matters |
|-------|-------------|----------------|
| **Sample Size** | 500+ bets | Statistical significance |
| **Time Period** | 90+ days | Capture variance |
| **Profitability** | p < 0.05 | Not just luck |
| **CLV** | > 0.5% | Beating closing line = real skill |
| **Calibration** | ECE < 5% | Probabilities are accurate |
| **Drawdown** | < 30% | Risk management works |

### What Each Metric Means

**CLV (Closing Line Value)**: If you consistently beat the closing line, you have skill. This is the #1 indicator professional bettors use.

**ECE (Expected Calibration Error)**: When your model says 60%, does it win ~60% of the time? If ECE > 5%, your probabilities are unreliable.

**Sharpe Ratio**: Risk-adjusted return. Higher is better. > 1.0 is good.

---

## Step 7: Go Live (Carefully)

If validation passes:

```python
if report.is_ready_for_live:
    print("✓ System validated!")
    print("\nRecommended approach:")
    print("1. Start with 25% of intended bankroll")
    print("2. Monitor CLV closely for first month")
    print("3. If CLV stays positive, scale up gradually")
    print("4. If CLV turns negative, STOP and investigate")
```

### Live Trading Checklist

- [ ] Paper trading passed all validation checks
- [ ] CLV positive over 500+ bets
- [ ] Calibration ECE < 5%
- [ ] Max drawdown < 30%
- [ ] Starting with reduced bankroll (25%)
- [ ] Have stop-loss rules defined
- [ ] Know your bet limits at each book

---

## Common Issues

### "Model not calibrated"

Your probability estimates are off. When you predict 60%, outcomes occur much more or less often.

**Fix**:
1. More training data
2. Apply Platt scaling post-hoc
3. Use isotonic regression calibration

### "Insufficient CLV"

You're not beating the closing line consistently.

**Fix**:
1. Bet earlier (lines move toward truth)
2. Improve model features
3. Focus on less efficient markets

### "High drawdown"

Your bankroll is too volatile.

**Fix**:
1. Reduce max bet size
2. Increase Kelly fraction (use quarter Kelly)
3. Diversify across more games

---

## Quick Test

To verify everything works:

```python
from paper_trading.simulator import run_quick_paper_test

# Run 60-day test with synthetic data
simulator = run_quick_paper_test(n_days=60)

# This should complete without errors
# and print a performance summary
```

---

## Files Created by This Guide

```
geometric-alpha/
├── training/
│   ├── __init__.py
│   └── pipeline.py              # Model training pipeline
├── models/
│   └── validated_predictor.py   # Predictor with uncertainty
├── optimization/
│   └── empirical_kelly.py       # Kelly with empirical correlations
├── evaluation/
│   ├── __init__.py
│   └── trustworthy_system.py    # Validation framework
├── paper_trading/
│   ├── __init__.py
│   └── simulator.py             # Paper trading simulator
└── GETTING_STARTED.md           # This guide
```

---

## Summary

1. **Train** your model with proper time-series validation
2. **Check calibration** - ECE must be < 5%
3. **Build correlations** from historical data, not guesses
4. **Paper trade** for 90+ days, 500+ bets
5. **Validate** all metrics before live trading
6. **Go live** with reduced bankroll, monitor CLV

**The key insight**: Professional bettors don't trust models that aren't validated. Neither should you.

---

*Questions? Issues? See the RED_TEAM_REPORT.md for known limitations.*
