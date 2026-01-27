# Geometric Alpha Betting System Documentation

## Complete Architecture Overview

This document provides comprehensive documentation of the Geometric Alpha betting system - a production-grade sports betting infrastructure using geometric/topological analysis of baseball data.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Data Layer](#2-data-layer)
3. [Probability Estimation](#3-probability-estimation)
4. [Bet Sizing (Kelly Criterion)](#4-bet-sizing-kelly-criterion)
5. [Conditional Bet Dependencies](#5-conditional-bet-dependencies)
6. [Portfolio Management](#6-portfolio-management)
7. [Professional Refinements](#7-professional-refinements)
8. [Backtesting](#8-backtesting)
9. [Complete Betting Flow](#9-complete-betting-flow)
10. [Risk Management](#10-risk-management)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GEOMETRIC ALPHA SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   DATA      │    │  FEATURES   │    │   MODEL     │                 │
│  │   LAYER     │───▶│   ENGINE    │───▶│  PREDICTOR  │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│        │                                      │                         │
│        │                                      ▼                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │    ODDS     │───▶│  BETTING    │◀───│ PROBABILITY │                 │
│  │   CLIENT    │    │ OPPORTUNITY │    │  ESTIMATES  │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│                            │                                            │
│                            ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     OPTIMIZATION LAYER                           │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │   KELLY   │  │CONDITIONAL│  │COVARIANCE │  │   RISK    │    │   │
│  │  │  SOLVER   │  │  GRAPH    │  │  MATRIX   │  │ ANALYSIS  │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                            │                                            │
│                            ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PORTFOLIO MANAGEMENT                          │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │ BANKROLL  │  │    CLV    │  │  STEAM    │  │CALIBRATION│    │   │
│  │  │  TRACKER  │  │  TRACKER  │  │ DETECTOR  │  │ OPTIMIZER │    │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
geometric-alpha/
├── data/
│   ├── statcast.py         # MLB pitch telemetry (Statcast/pybaseball)
│   └── odds.py             # Betting odds (The-Odds-API)
├── features/
│   ├── tunneling.py        # Pitch tunneling analysis (Angular Divergence)
│   ├── umpire_hull.py      # Umpire strike zone hulls
│   ├── arsenal.py          # Pitcher arsenal polytopes (Rolling Window Topology)
│   └── defensive.py        # Defensive Voronoi analysis
├── models/
│   └── predictor.py        # Geometric probability predictor
├── optimization/
│   ├── kelly.py            # Simultaneous Kelly Criterion (Covariance-aware)
│   ├── conditional.py      # Conditional bet dependencies
│   ├── portfolio.py        # Portfolio & bankroll management
│   └── professional_refinements.py  # CLV, Steam, Calibration
└── backtest/
    └── simulator.py        # Time-machine backtesting
```

---

## 2. Data Layer

### 2.1 Statcast Client (`data/statcast.py`)

Fetches MLB pitch-by-pitch telemetry data.

**Key Features:**
- Physics-Inversion Imputation (replaces KNN for missing spin data)
- Uses Magnus force equation to derive spin from acceleration
- Caches data for efficiency

```python
# Example usage
from data.statcast import StatcastClient

client = StatcastClient()
pitches = client.fetch_date_range('2024-07-01', '2024-07-31')

# Key columns:
# - release_speed, release_spin_rate
# - pfx_x, pfx_z (movement)
# - plate_x, plate_z (location)
# - release_pos_x, release_pos_y, release_pos_z
```

**Physics-Inversion Imputation:**
```python
# Instead of KNN lookup (slow), solve Magnus equation algebraically:
# a_magnus = acceleration - gravity
# ω = a_magnus * m / (C_m * ρ * π * r² * v * r)
# spin_rpm = ω * 60 / (2π)
```

### 2.2 Odds Client (`data/odds.py`)

Fetches betting odds from The-Odds-API.

**Supported Markets:**
- `h2h` (Moneyline)
- `totals` (Over/Under)
- `spreads` (Run Line)

```python
from data.odds import OddsClient

client = OddsClient(api_key="your_key")

# Live odds
live = client.fetch_live_odds(markets=['h2h', 'totals'])

# Historical odds (for backtesting)
historical = client.fetch_historical('2024-07-01', '2024-07-31')

# Closing lines (for CLV calculation)
closing = client.fetch_closing_lines(game_ids=['game_001', 'game_002'])
```

**Key Functions:**
```python
# Convert American to decimal odds
american_to_decimal(-150)  # Returns 1.667

# Convert to implied probability
american_to_probability(-150)  # Returns 0.60

# Remove vig from two-outcome market
remove_vig(0.60, 0.55)  # Returns (0.522, 0.478)
```

---

## 3. Probability Estimation

### 3.1 Geometric Predictor (`models/predictor.py`)

Uses geometric features to estimate game probabilities.

**Features Used:**
- Pitch tunneling scores (Angular Divergence)
- Umpire strike zone hull deviations
- Arsenal polytope characteristics
- Defensive Voronoi coverage

```python
from models.predictor import GeometricPredictor

predictor = GeometricPredictor()
predictor.train(features_df, targets_df)

# Generate predictions
predictions = predictor.predict(game_features)

# Each prediction contains:
# - home_win_prob: P(home team wins)
# - away_win_prob: P(away team wins)
# - over_prob: P(total > line)
# - under_prob: P(total < line)
# - confidence: Model confidence score
```

---

## 4. Bet Sizing (Kelly Criterion)

### 4.1 Core Kelly Formula

The Kelly Criterion maximizes long-term bankroll growth:

```
f* = (bp - q) / b

Where:
- f* = optimal fraction of bankroll to bet
- b = decimal odds - 1 (net odds)
- p = probability of winning
- q = probability of losing (1 - p)
```

### 4.2 Simultaneous Kelly Solver (`optimization/kelly.py`)

Handles multiple concurrent bets with correlations.

```python
from optimization.kelly import SimultaneousKellySolver, BettingOpportunity

solver = SimultaneousKellySolver(
    bankroll=10000,
    max_exposure=0.25,        # Max 25% of bankroll at risk
    max_single_bet=0.05,      # Max 5% on any single bet
    min_edge=0.02,            # Minimum 2% edge required
    kelly_fraction=0.5,       # Half Kelly (recommended)
    risk_aversion=0.5         # Covariance penalty weight
)

# Create betting opportunities
opportunities = [
    BettingOpportunity(
        opportunity_id="game1_home",
        game_id="game1",
        bet_type="moneyline",
        selection="home",
        decimal_odds=1.90,
        model_prob=0.55         # Our estimated probability
    ),
    # ... more opportunities
]

# Optimize portfolio
portfolio = solver.optimize(opportunities)

# Get recommended bet sizes
bets = portfolio.get_bet_amounts(bankroll=10000)
# {'game1_home': 250.00, 'game2_away': 180.00, ...}
```

### 4.3 Covariance-Aware Optimization

**The Independence Trap Fix:**

Standard Kelly assumes bets are independent. But same-game bets share "game script" correlation.

```python
# Objective function with covariance:
# maximize(growth - λ * risk)
# Where: risk = f' * Σ * f (portfolio variance)

def compute_covariance_matrix(self, opportunities):
    """Compute correlations between betting outcomes."""

    # Same-game correlations
    if same_game:
        if bet_type_i == 'moneyline' and bet_type_j == 'total':
            if model_prob > 0.5:  # Favorite
                if selection == 'Over':
                    correlation = 0.35  # Favorites + Overs correlated

    # Same-pitcher correlations
    if same_pitcher:
        if 'strikeout' in both:
            correlation = 0.25  # K props correlated
```

### 4.4 Kelly Fraction Recommendations

Based on Wharton research:

| Risk Level | Kelly Fraction | Halving Probability |
|------------|----------------|---------------------|
| Aggressive | 0.50 | 1 in 9 (11%) |
| Moderate | 0.35 | 1 in 15 (7%) |
| Conservative | 0.25 | 1 in 25 (4%) |
| Ultra-Conservative | 0.125 | 1 in 50 (2%) |

**Critical Finding:** Full Kelly (1.0) leads to 100% bankruptcy in simulations.

---

## 5. Conditional Bet Dependencies

### 5.1 The Problem

Traditional betting treats `P(B)` as fixed, but many bets are **conditional**:

- "Player X hits HR" affects "Team Y wins"
- "First 5 innings ML" is VOID if game doesn't reach 5 innings
- Same-Game Parlay legs share causal relationships

### 5.2 Dependency Types (`optimization/conditional.py`)

```python
class DependencyType(Enum):
    # P(B|A_win) ≠ P(B)
    PROBABILITY_CONDITIONAL = "probability_conditional"

    # Bet B is VOID if Bet A loses
    VOID_IF_PARENT_LOSES = "void_if_parent_loses"

    # Bet B is VOID if Bet A wins
    VOID_IF_PARENT_WINS = "void_if_parent_wins"

    # Exactly one can win
    MUTUALLY_EXCLUSIVE = "mutually_exclusive"

    # Always resolve the same way
    PERFECTLY_CORRELATED = "perfectly_correlated"

    # Always resolve opposite
    PERFECTLY_ANTICORRELATED = "perfectly_anticorrelated"

    # A causes B (one-way)
    CAUSAL = "causal"
```

### 5.3 Conditional Relationship

```python
@dataclass
class ConditionalRelationship:
    parent_bet_id: str
    child_bet_id: str
    dependency_type: DependencyType

    # Conditional probabilities
    prob_child_given_parent_wins: float   # P(child | parent wins)
    prob_child_given_parent_loses: float  # P(child | parent loses)

    # Trust in this relationship (0-1)
    trust_score: float = 0.8
```

### 5.4 Bet Dependency Graph

```python
from optimization.conditional import (
    BetDependencyGraph,
    ConditionalBet,
    ConditionalRelationship,
    DependencyType
)

# Create graph
graph = BetDependencyGraph()

# Add bets
player_hr_bet = ConditionalBet(
    bet_id="player_hr",
    game_id="game1",
    bet_type="player_prop",
    selection="Mike Trout HR",
    decimal_odds=6.00,
    marginal_prob=0.18
)

team_win_bet = ConditionalBet(
    bet_id="team_win",
    game_id="game1",
    bet_type="moneyline",
    selection="Angels ML",
    decimal_odds=2.10,
    marginal_prob=0.50
)

graph.add_bet(player_hr_bet)
graph.add_bet(team_win_bet)

# Add relationship: HR helps team win
relationship = ConditionalRelationship(
    parent_bet_id="player_hr",
    child_bet_id="team_win",
    dependency_type=DependencyType.PROBABILITY_CONDITIONAL,
    prob_child_given_parent_wins=0.65,   # P(team wins | HR) = 65%
    prob_child_given_parent_loses=0.48,  # P(team wins | no HR) = 48%
    trust_score=0.70
)

graph.add_relationship(relationship)
```

### 5.5 Propagating Outcomes

When a bet settles, update all dependent bets:

```python
# Player hits HR
updated = graph.propagate_outcome("player_hr", won=True)
# team_win bet's effective_prob updated from 0.50 to 0.65

# Check if any bets voided
for bet_id, bet in graph.bets.items():
    if bet.is_void:
        print(f"{bet_id} voided due to parent condition")
```

### 5.6 True Parlay Probability

```python
# WRONG: P(A ∩ B) = P(A) * P(B)  [independence assumption]
naive_prob = 0.50 * 0.18  # = 0.09

# CORRECT: P(A ∩ B) = P(A) * P(B|A)  [chain rule]
true_prob = graph.compute_joint_probability(["team_win", "player_hr"])
# Uses: P(team_win) * P(player_hr | team_win)
```

### 5.7 SGP Value Evaluation

```python
from optimization.conditional import ConditionalKellySolver

solver = ConditionalKellySolver(min_edge=0.03)

# Evaluate a Same-Game Parlay
result = solver.compute_parlay_value(
    graph=graph,
    leg_ids=["team_win", "player_hr"]
)

# Returns:
# {
#     'true_probability': 0.117,
#     'naive_probability': 0.090,
#     'correlation_adjustment': 0.027,
#     'parlay_odds': 12.60,
#     'edge': 0.037,
#     'recommendation': 'BET'
# }
```

---

## 6. Portfolio Management

### 6.1 Bankroll Tracker (`optimization/portfolio.py`)

```python
from optimization.portfolio import BankrollTracker, BetRecord

tracker = BankrollTracker(initial_bankroll=10000)

# Place a bet
bet = BetRecord(
    bet_id="bet_001",
    timestamp=datetime.now(),
    game_id="game1",
    bet_type="moneyline",
    selection="home",
    stake=200.00,
    odds=1.90,
    model_prob=0.55,
    market_prob=0.526,
    edge=0.024
)

tracker.place_bet(bet)

# Settle the bet
pnl = tracker.settle_bet(
    bet_id="bet_001",
    won=True,
    closing_odds=1.85  # For CLV calculation
)

# Get performance summary
summary = tracker.get_performance_summary()
# {
#     'total_bets': 150,
#     'win_rate': 0.54,
#     'total_pnl': 1250.00,
#     'roi': 0.083,
#     'avg_clv': 0.023,
#     'max_drawdown': 0.12
# }
```

### 6.2 Portfolio Manager

```python
from optimization.portfolio import PortfolioManager

manager = PortfolioManager(bankroll=10000)

# Process opportunities and get recommended bets
opportunities = [...]  # List of BettingOpportunity
allocations = manager.process_opportunities(opportunities)
# {'opp_001': 250.00, 'opp_002': 180.00, ...}

# Execute bets
placed_ids = manager.execute_bets(opportunities, allocations)
```

---

## 7. Professional Refinements

### 7.1 Closing Line Value (CLV) Tracker

**Why CLV Matters:**
CLV is the #1 indicator of long-term betting skill. It separates luck from edge.

```python
from optimization.professional_refinements import CLVTracker, BetRecord

clv_tracker = CLVTracker(rolling_window=100)

# Record bet at placement
bet = BetRecord(
    bet_id="bet_001",
    timestamp=datetime.now(),
    game_id="game1",
    market_type="moneyline",
    selection="home",
    odds_at_placement=1.90,
    model_prob=0.55
)
clv_tracker.record_bet(bet)

# Update with closing odds (before game starts)
clv_tracker.update_closing_odds("bet_001", closing_odds=1.85)

# Get CLV statistics
stats = clv_tracker.get_rolling_clv()
# {
#     'avg_clv_cents': 2.5,      # Beating close by 2.5%
#     'clv_positive_rate': 0.58, # 58% of bets beat the close
#     'is_sharp': True           # Consistently beating close
# }

# Diagnose performance
diagnosis = clv_tracker.diagnose_performance()
# {
#     'interpretation': 'VARIANCE_UNLUCKY',
#     'recommendation': 'Continue strategy - positive CLV indicates skill'
# }
```

**CLV Interpretations:**

| CLV | Profit | Interpretation | Action |
|-----|--------|----------------|--------|
| Positive | Positive | SKILL_PROFITABLE | Continue |
| Positive | Negative | VARIANCE_UNLUCKY | Continue (bad luck) |
| Negative | Positive | VARIANCE_LUCKY | Review (unsustainable) |
| Negative | Negative | NEGATIVE_EDGE | Change strategy |

### 7.2 Steam Move Detector

Detect when sharp books (Pinnacle, CRIS) move lines:

```python
from optimization.professional_refinements import SteamMoveDetector, OddsSnapshot

detector = SteamMoveDetector(
    steam_threshold_cents=10.0,  # 10 cent move triggers alert
    min_move_cents=5.0
)

# Record odds snapshots over time
snapshot1 = OddsSnapshot(
    timestamp=datetime(2024, 7, 1, 12, 0),
    game_id="game1",
    market_type="h2h",
    selection="home",
    odds_by_book={
        'pinnacle': 1.90,
        'draftkings': 1.92,
        'fanduel': 1.91
    }
)
detector.record_snapshot(snapshot1)

# Later snapshot
snapshot2 = OddsSnapshot(
    timestamp=datetime(2024, 7, 1, 14, 0),
    game_id="game1",
    market_type="h2h",
    selection="home",
    odds_by_book={
        'pinnacle': 1.80,     # Moved!
        'draftkings': 1.92,   # Stale
        'fanduel': 1.91       # Stale
    }
)
detector.record_snapshot(snapshot2)

# Detect steam
steam = detector.detect_steam("game1", "h2h", "home")
# {
#     'detected': True,
#     'originator_move': {'book': 'pinnacle', 'move_cents': 10.0, 'direction': 'steam_on'},
#     'stale_books': [{'book': 'draftkings', ...}, {'book': 'fanduel', ...}],
#     'recommendation': 'Steam detected at pinnacle: steam_on by 10.0 cents.
#                        Consider betting at stale [draftkings, fanduel]'
# }
```

**Bookmaker Tiers:**
- **Originator**: Pinnacle, CRIS, Bookmaker (set efficient lines)
- **Fast Follower**: Circa, Bet365 (quick to adjust)
- **Retail**: DraftKings, FanDuel, BetMGM (slower, softer)
- **Soft**: Bovada, regionals (slowest, best for exploiting)

### 7.3 Calibration Optimizer

A well-calibrated model outperforms a high-accuracy model by 69.86% (arXiv 2024).

```python
from optimization.professional_refinements import CalibrationOptimizer

calibrator = CalibrationOptimizer(n_bins=10)

# Record predictions and outcomes
calibrator.record_prediction(predicted_prob=0.65, actual_outcome=True)
calibrator.record_prediction(predicted_prob=0.65, actual_outcome=False)
# ... many more

# Check calibration
error = calibrator.compute_calibration_error()
# {
#     'expected_calibration_error': 0.032,  # 3.2% ECE
#     'is_well_calibrated': True,           # < 5% is good
#     'bin_statistics': [
#         {'bin': 6, 'range': (0.6, 0.7), 'avg_predicted': 0.65, 'avg_actual': 0.62},
#         ...
#     ]
# }

# Get calibration-adjusted probability
raw_prob = 0.65
adjusted_prob = calibrator.get_calibration_adjustment(raw_prob)
# Returns 0.62 if model historically over-predicts in this range
```

### 7.4 SGP Correlation Engine

```python
from optimization.professional_refinements import SGPCorrelationEngine

sgp_engine = SGPCorrelationEngine()

# Compute true SGP probability
legs = [
    ('moneyline', 0.55),           # Team wins
    ('player_hr', 0.18),           # Player HR
    ('total_over', 0.48)           # Over 8.5
]

result = sgp_engine.compute_sgp_true_probability(legs)
# {
#     'true_prob': 0.052,
#     'naive_prob': 0.048,
#     'correlation_adjustment': 0.004,  # Positive correlation boosts joint prob
#     'correlation_matrix': [[1, 0.25, 0.15], [0.25, 1, 0.10], [0.15, 0.10, 1]]
# }

# Evaluate SGP value
evaluation = sgp_engine.evaluate_sgp_value(legs, offered_odds=22.0)
# {
#     'edge': 0.007,
#     'expected_value': 0.14,
#     'estimated_house_edge_percent': 18.5,
#     'recommendation': 'PASS'  # Edge < 3% threshold for SGPs
# }
```

**Base Correlations:**

| Market A | Market B | Correlation |
|----------|----------|-------------|
| Moneyline | Total Over | +0.15 |
| Moneyline | Total Under | -0.15 |
| Moneyline | Spread | +0.85 |
| Player HR | Team Win | +0.25 |
| Pitcher Ks | Team Win | +0.30 |
| Pitcher Ks | Total Under | +0.25 |

### 7.5 Professional Bankroll Manager

```python
from optimization.professional_refinements import ProfessionalBankrollManager

manager = ProfessionalBankrollManager(
    initial_bankroll=10000,
    conservative_pct=0.01,   # 1% for conservative bets
    standard_pct=0.02,       # 2% standard
    aggressive_pct=0.03,     # 3% for high-edge bets
    max_pct=0.05             # Never exceed 5%
)

# Get unit size based on confidence
unit = manager.get_unit_size('standard')  # $200 for 2%

# Record bet and result
manager.record_bet(stake=200, profit=180, metadata={'game': 'NYY vs BOS'})

# Check if should reduce stakes
should_reduce, message = manager.should_reduce_stakes()
# (True, 'WARNING: 20%+ drawdown. Reduce to 3/4 standard stakes.')

# Get performance summary
summary = manager.get_performance_summary()
# {
#     'total_bets': 150,
#     'win_rate': 0.54,
#     'roi': 8.3,
#     'max_drawdown': 0.22,
#     'current_bankroll': 10830
# }
```

---

## 8. Backtesting

### 8.1 Backtest Simulator (`backtest/simulator.py`)

Time-machine architecture prevents look-ahead bias.

```python
from backtest.simulator import BacktestSimulator

simulator = BacktestSimulator(
    initial_bankroll=10000,
    start_date='2024-04-01',
    end_date='2024-09-30'
)

# Run backtest
result = simulator.run(verbose=True)

print(result.summary())
# ========================================
# BACKTEST RESULTS: 2024-04-01 to 2024-09-30
# ========================================
#
# PERFORMANCE
# -----------
# Initial Bankroll: $10,000.00
# Final Bankroll:   $11,250.00
# Total P&L:        $+1,250.00
# ROI:              12.50%
#
# BETTING
# -------
# Total Bets:     450
# Winners:        243 (54.0%)
# Losers:         207
#
# RISK
# ----
# Max Drawdown:   15.2%
# Sharpe Ratio:   1.85
# Sortino Ratio:  2.40
#
# CLV ANALYSIS
# ------------
# Average CLV:        0.0230
# Positive CLV Rate:  58.0%
```

### 8.2 Key Principles

1. **No Look-Ahead**: Only uses data available at each point in time
2. **Rolling Window Features**: Topology/manifold features use trailing data only
3. **Realistic Settlement**: Settles bets based on actual game outcomes
4. **CLV Tracking**: Records closing lines for skill assessment

---

## 9. Complete Betting Flow

### Step-by-Step Process

```python
# 1. FETCH DATA
from data.statcast import StatcastClient
from data.odds import OddsClient

statcast = StatcastClient()
odds_client = OddsClient(api_key="your_key")

# Get today's pitching data
pitches = statcast.fetch_today()
odds = odds_client.fetch_live_odds(markets=['h2h', 'totals'])

# 2. COMPUTE FEATURES
from features.tunneling import TunnelAnalyzer
from features.arsenal import ArsenalAnalyzer

tunnel_analyzer = TunnelAnalyzer()
arsenal_analyzer = ArsenalAnalyzer()

# Pitcher features
tunnel_scores = tunnel_analyzer.compute_angular_tunnel_scores(pitches)
arsenal_polytope = arsenal_analyzer.build_arsenal_polytope(pitcher_id, pitches)

# 3. GENERATE PREDICTIONS
from models.predictor import GeometricPredictor

predictor = GeometricPredictor()
predictions = predictor.predict(features)

# 4. CREATE BETTING OPPORTUNITIES
from optimization.kelly import BettingOpportunity

opportunities = []
for game, pred in zip(games, predictions):
    # Get market odds
    game_odds = odds[odds['game_id'] == game.id]

    for outcome in ['home', 'away']:
        decimal_odds = american_to_decimal(game_odds[outcome])
        model_prob = pred.home_win_prob if outcome == 'home' else pred.away_win_prob

        opp = BettingOpportunity(
            opportunity_id=f"{game.id}_{outcome}",
            game_id=game.id,
            bet_type="moneyline",
            selection=outcome,
            decimal_odds=decimal_odds,
            model_prob=model_prob
        )

        if opp.edge > 0.02:  # Only if edge > 2%
            opportunities.append(opp)

# 5. BUILD DEPENDENCY GRAPH (if same-game bets)
from optimization.conditional import BetDependencyGraph, ConditionalBet

graph = BetDependencyGraph()
for opp in opportunities:
    cond_bet = ConditionalBet(
        bet_id=opp.opportunity_id,
        game_id=opp.game_id,
        bet_type=opp.bet_type,
        selection=opp.selection,
        decimal_odds=opp.decimal_odds,
        marginal_prob=opp.model_prob
    )
    graph.add_bet(cond_bet)

# Add relationships for same-game bets
# ... (see conditional.py for helpers)

# 6. OPTIMIZE WITH KELLY
from optimization.kelly import SimultaneousKellySolver

solver = SimultaneousKellySolver(
    bankroll=10000,
    kelly_fraction=0.5,
    risk_aversion=0.5
)

# With covariance matrix from dependency graph
covariance = graph.compute_conditional_covariance_matrix(bet_ids)
portfolio = solver.optimize_with_covariance(opportunities, covariance)

# 7. EXECUTE BETS
from optimization.portfolio import BankrollTracker, BetRecord

tracker = BankrollTracker(initial_bankroll=10000)

for opp_id, fraction in portfolio.allocations.items():
    stake = fraction * tracker.current_bankroll

    if stake < 5.0:  # Minimum $5
        continue

    bet = BetRecord(
        bet_id=f"bet_{opp_id}",
        timestamp=datetime.now(),
        game_id=opp.game_id,
        bet_type=opp.bet_type,
        selection=opp.selection,
        stake=stake,
        odds=opp.decimal_odds,
        model_prob=opp.model_prob,
        market_prob=1/opp.decimal_odds,
        edge=opp.edge
    )

    tracker.place_bet(bet)

    # Record for CLV tracking
    clv_tracker.record_bet(...)

# 8. SETTLE BETS (after games)
for bet_id, bet in tracker.pending_bets.items():
    result = get_game_result(bet.game_id)  # Your result source

    # Get closing odds for CLV
    closing = odds_client.fetch_closing_lines([bet.game_id])

    pnl = tracker.settle_bet(
        bet_id=bet_id,
        won=result.home_won if bet.selection == 'home' else result.away_won,
        closing_odds=closing.iloc[0]['closing_price']
    )

    # Update CLV tracker
    clv_tracker.update_closing_odds(bet_id, closing_odds)
    clv_tracker.record_outcome(bet_id, won, pnl)

# 9. ANALYZE PERFORMANCE
summary = tracker.get_performance_summary()
clv_stats = clv_tracker.get_rolling_clv()
diagnosis = clv_tracker.diagnose_performance()

print(f"ROI: {summary['roi']:.1%}")
print(f"CLV: {clv_stats['avg_clv_cents']:.1f} cents")
print(f"Diagnosis: {diagnosis['interpretation']}")
```

---

## 10. Risk Management

### 10.1 Key Parameters

| Parameter | Recommended | Description |
|-----------|-------------|-------------|
| `kelly_fraction` | 0.5 | Half Kelly reduces variance |
| `max_single_bet` | 0.05 | Never > 5% on one bet |
| `max_exposure` | 0.25 | Never > 25% total at risk |
| `min_edge` | 0.02 | Require 2%+ edge |
| `max_odds` | 4.0 | Avoid high-variance underdogs |

### 10.2 Drawdown Response

```python
drawdown = tracker.get_drawdown()['current_drawdown']

if drawdown > 0.30:
    # CRITICAL: Reduce to 1/2 stakes
    kelly_fraction = 0.25
elif drawdown > 0.20:
    # WARNING: Reduce to 3/4 stakes
    kelly_fraction = 0.375
elif drawdown > 0.10:
    # MONITOR: Continue but review
    kelly_fraction = 0.5
```

### 10.3 Risk of Ruin Estimation

```python
ror = tracker.estimate_risk_of_ruin(
    target_ruin=0,       # Bankruptcy
    n_simulations=1000
)
print(f"Risk of ruin: {ror:.1%}")
```

### 10.4 When NOT to Bet

- Edge < 2% (below noise threshold)
- Odds > 4.0 (too much variance)
- CLV consistently negative (model is wrong)
- 30%+ drawdown (reduce stakes)
- Unverified conditional relationships (trust < 0.5)

---

## Summary

The Geometric Alpha betting system provides:

1. **Geometric Features**: Novel pitch tunneling, arsenal topology, defensive Voronoi
2. **Covariance-Aware Kelly**: Handles correlated bets properly
3. **Conditional Dependencies**: Graph-based P(B|A) modeling
4. **Professional Tools**: CLV tracking, steam detection, calibration
5. **Risk Management**: Fractional Kelly, drawdown controls, exposure limits
6. **Backtesting**: Time-machine architecture without look-ahead bias

**Key Insight**: The system finds "Geometric Alpha" - value from the disconnect between how baseball physics works and how markets perceive it.
