# Geometric Alpha: Critical Analysis & Known Issues

## HONEST ASSESSMENT OF OUR BETTING SYSTEM

This document provides a thorough, critical analysis of the Geometric Alpha betting system. It is designed to be brutally honest about limitations, gaps, and potential issues.

---

## Executive Summary

**What We Have:**
- A theoretically sound framework for geometric sports betting
- Professional-grade components (Kelly, CLV, Steam detection)
- Conditional dependency modeling
- Covariance-aware portfolio optimization

**What We're Missing:**
- Real historical data validation
- Live API integration testing
- Production-grade error handling
- Actual probability model (we have the framework, not trained models)
- Real conditional probability estimates (we use placeholders)

**Critical Honesty:** This is a **framework**, not a **proven system**. The code structure is production-quality, but the actual predictive edge is **unproven**.

---

## 1. CORE ISSUES & LIMITATIONS

### 1.1 The Probability Estimation Problem (CRITICAL)

**Issue:** Our entire system assumes we have accurate probability estimates (`model_prob`). But we don't actually have a trained, validated model.

```python
# In kelly.py
model_prob: float  # WHERE DOES THIS COME FROM?

# In predictor.py
predictions = predictor.predict(features)  # Returns probabilities
# But predictor.train() needs labeled historical data we don't have
```

**Reality Check:**
- The `GeometricPredictor` can be trained, but needs:
  - Years of historical game data with outcomes
  - Properly computed geometric features for each game
  - Cross-validation to prevent overfitting
- Without this, `model_prob` is essentially a guess

**Impact:** If `model_prob` is wrong by even 2-3%, the Kelly Criterion will recommend bad bets.

**What's Needed:**
1. Historical backtesting with actual data
2. Calibration testing (does P=0.60 hit 60% of the time?)
3. Out-of-sample validation

---

### 1.2 Hardcoded Correlation Values (SIGNIFICANT)

**Issue:** Correlations in `kelly.py` and `conditional.py` are hardcoded estimates, not empirically derived.

```python
# From kelly.py:410-478 - These are GUESSES
if opp_i.bet_type == 'moneyline' and opp_j.bet_type == 'total':
    if opp_i.model_prob > 0.5:  # Favorite
        if opp_j.selection == 'Over':
            cov = np.sqrt(variances[i] * variances[j]) * 0.35  # WHY 0.35?

# From professional_refinements.py - Also hardcoded
BASE_CORRELATIONS = {
    ('moneyline', 'total_over'): 0.15,  # Source: ???
    ('player_hr', 'team_win'): 0.25,    # Source: ???
}
```

**Reality Check:**
- These correlations (0.15, 0.25, 0.35) are reasonable guesses based on intuition
- They are NOT empirically validated with actual historical data
- Real correlations vary by:
  - Team/pitcher matchup
  - Ballpark factors
  - Weather conditions
  - Season timing

**Impact:** Wrong correlations lead to:
- Underestimating risk (if true correlation > estimated)
- Over-diversifying (if true correlation < estimated)

**What's Needed:**
1. Compute actual correlations from historical bet outcomes
2. Make correlations context-dependent (not static)
3. Update correlation estimates over time

---

### 1.3 Trust Score System is Arbitrary (MODERATE)

**Issue:** The `trust_score` concept is good, but values are arbitrary.

```python
# From conditional.py
trust_score: float = 0.8  # Why 0.8? Why not 0.7 or 0.9?

# Used in blending:
effective_prob = trust * cond_prob + (1 - trust) * marginal_prob
```

**Reality Check:**
- Trust should be computed from:
  - Sample size of historical data
  - Stability of the relationship over time
  - Specificity to current conditions
- Currently it's just set to 0.8 everywhere

**What's Needed:**
1. Compute trust from historical relationship stability
2. Decay trust for relationships with small samples
3. Context-specific trust adjustments

---

### 1.4 The "Geometric Alpha" Claim is Unproven (CRITICAL)

**Issue:** The entire thesis that geometric features provide betting edge is assumed, not demonstrated.

**The Claim:**
> "Geometric Alpha = value from disconnect between physics and market perception"

**The Reality:**
- We have no backtesting results showing this works
- Markets are efficient; edge is hard to find
- Statcast data is public; others use it too
- Our "novel" features (tunneling, arsenal topology) may already be priced in

**Questions We Can't Answer Yet:**
1. Does Angular Divergence tunneling predict strikeouts better than velocity?
2. Does arsenal polytope instability predict pitcher blowups?
3. Do umpire hull features predict total runs?

**What's Needed:**
1. Feature importance analysis from backtesting
2. Comparison to simpler baselines (does complexity help?)
3. Blind test on future games (not historical)

---

## 2. IMPLEMENTATION ISSUES

### 2.1 Physics-Inversion Imputation Assumptions

**Location:** `data/statcast.py:_physics_inversion_impute()`

**Issue:** The Magnus force imputation makes simplifying assumptions.

```python
# Assumptions made:
GRAVITY = -32.174  # ft/s² (constant)
C_MAGNUS = 0.5     # Magnus coefficient (constant)
AIR_DENSITY = 0.0765  # lb/ft³ (constant)

# Reality:
# - Air density varies with altitude, temperature, humidity
# - Magnus coefficient varies with spin axis and seam orientation
# - We're ignoring drag forces
```

**Impact:**
- Spin estimates may be off by 5-15%
- Errors compound in downstream features

---

### 2.2 Angular Divergence Simplifications

**Location:** `features/tunneling.py`

**Issue:** The batter's eye position is assumed, not measured.

```python
# Hardcoded assumptions:
BATTER_EYE_X = 0.0   # Centered
BATTER_EYE_Y = -6.5  # 6.5 feet behind plate
BATTER_EYE_Z = 3.5   # 3.5 feet high

# Reality:
# - Batters have different stances (open, closed)
# - Eye height varies (5'6" vs 6'5" batter)
# - Position changes during swing
```

**Impact:** Angular divergence calculations may be off, reducing signal value.

---

### 2.3 Rolling Window Topology May Not Prevent All Look-Ahead

**Location:** `features/arsenal.py`

**Issue:** Even with trailing window, there are subtle look-ahead risks.

```python
# We fit scaler on trailing data:
scaler = StandardScaler()
features = scaler.fit_transform(df.values)

# But what if trailing window spans multiple "regimes"?
# The scaler learns from data that may not represent future conditions
```

**Subtler Issues:**
- Feature columns selected based on what exists in data (look-ahead?)
- Min/max bounds for probability capping use hardcoded values
- Configuration parameters were tuned... on what data?

---

### 2.4 Convex Optimization Failure Modes

**Location:** `optimization/kelly.py:_solve_cvxpy_with_covariance()`

**Issue:** The optimizer can fail silently or produce edge-case results.

```python
# Failure handling:
if f.value is None:
    return OptimalPortfolio(solver_status="infeasible")

# But what about:
# - Numerical precision issues near boundaries
# - Local optima in non-convex approximations
# - Constraint conflicts not detected
```

**Known Edge Cases:**
1. Very high odds (>10.0) can cause log() issues
2. Very small probabilities (<0.05) destabilize optimizer
3. Many correlated bets can make covariance matrix ill-conditioned

---

### 2.5 CLV Tracker Requires External Data

**Location:** `optimization/professional_refinements.py:CLVTracker`

**Issue:** CLV requires closing line data, which we don't automatically fetch.

```python
def update_closing_odds(self, bet_id: str, closing_odds: float):
    """Update with closing line when available."""
    # WHO CALLS THIS? WITH WHAT DATA?
```

**Reality:**
- Closing lines must be captured at game start
- Requires real-time or historical odds database
- The-Odds-API historical access costs money
- Without closing lines, CLV tracking is useless

---

## 3. STRUCTURAL GAPS

### 3.1 No Live Betting Integration

**What's Missing:**
- Real-time odds streaming
- Automated bet placement
- Position tracking across books
- Limit management

**Impact:** System is backtesting-only; can't actually bet.

---

### 3.2 No Book-Specific Logic

**What's Missing:**
- DraftKings vs FanDuel pricing differences
- Book-specific limits and restrictions
- Alt-line availability by book
- Prop market coverage differences

**Impact:** "Best line" shopping not implemented.

---

### 3.3 No Player Prop Framework

**What's Missing:**
- Player prop probability models
- Prop line scrapers
- Player rest/injury tracking
- Matchup-specific adjustments

**Impact:** Can only bet game-level markets (ML, Total, Spread).

---

### 3.4 No Situational Adjustments

**What's Missing:**
- Bullpen usage from previous days
- Travel schedule effects
- Day/night splits
- Rest days impact
- Lineup changes

**Impact:** Features miss important context.

---

## 4. COMPARISON TO INDUSTRY STANDARDS

### 4.1 What Professional Syndicates Have (That We Don't)

| Capability | Pro Syndicate | Our System |
|------------|---------------|------------|
| Live odds feeds | Sub-second | No live feed |
| Historical odds DB | 10+ years | Mock data only |
| Bet placement API | Automated | Manual only |
| Multiple accounts | 50+ beards | Single user |
| Custom models | Team of PhDs | Framework only |
| Real-time lines | Yes | No |
| Closing line archive | Yes | Need external |
| Account management | Yes | No |
| Steam detection | Sub-minute | Theoretical |

### 4.2 What Market Makers Have (That We Don't)

| Capability | Pinnacle/CRIS | Our System |
|------------|---------------|------------|
| Two-way flow | Yes | One-sided |
| Liability management | Real-time | None |
| Sharp player tagging | Yes | No |
| Dynamic vig adjustment | Yes | No |
| Cross-sport hedging | Yes | MLB only |

---

## 5. HONEST PROBABILITY ASSESSMENT

### 5.1 What's Likely True

1. **Kelly math is correct** - The formulas are standard
2. **Covariance matters** - Same-game bets ARE correlated
3. **CLV IS the best skill indicator** - Industry consensus
4. **Fractional Kelly reduces ruin** - Mathematically proven

### 5.2 What's Uncertain

1. **Our geometric features provide edge** - Unproven
2. **Correlation estimates are accurate** - Guesses
3. **Model probabilities are well-calibrated** - No validation
4. **Trust scores are appropriate** - Arbitrary

### 5.3 What's Likely False

1. **We can beat markets consistently** - Markets are efficient
2. **Physics imputation is accurate** - Simplifications hurt
3. **Static correlations work** - Context matters
4. **Framework alone creates edge** - Execution matters more

---

## 6. RISK WARNINGS

### 6.1 Financial Risks

**DO NOT BET REAL MONEY WITH THIS SYSTEM UNTIL:**
1. Backtesting on 3+ years of historical data shows profit
2. Calibration testing confirms probability accuracy
3. Out-of-sample validation passes
4. Live paper trading for 100+ bets shows positive CLV
5. Risk parameters validated against personal risk tolerance

### 6.2 Technical Risks

1. **API failures** - No retry logic for Statcast
2. **Data gaps** - Missing pitches not handled gracefully
3. **Memory issues** - Large datasets may crash
4. **Timezone bugs** - Game times not timezone-aware everywhere

### 6.3 Market Risks

1. **Line moves** - We don't track line movement speed
2. **Limits** - No limit tracking by book
3. **Voided bets** - Settlement logic incomplete
4. **Rule changes** - MLB rule changes not auto-detected

---

## 7. RECOMMENDATIONS FOR IMPROVEMENT

### 7.1 Immediate Priorities

1. **Get Real Data**
   - Historical Statcast (free via pybaseball)
   - Historical odds (paid API or scrape)
   - Game outcomes for labeling

2. **Run Backtests**
   - Does the full pipeline generate profit historically?
   - What's the actual CLV distribution?
   - Feature importance ranking

3. **Calibration Testing**
   - When model says 60%, does it hit 60%?
   - Expected calibration error should be <5%

### 7.2 Medium-Term Improvements

1. **Compute Actual Correlations**
   - Replace hardcoded values with historical estimates
   - Make context-dependent

2. **Add Player Props**
   - Separate prediction models
   - Statcast-based features

3. **Line Shopping**
   - Track odds across books
   - Find best available line

### 7.3 Long-Term Goals

1. **Live Integration**
   - Real-time odds feeds
   - Automated bet placement
   - Position tracking

2. **Multi-Sport Expansion**
   - NBA (similar data availability)
   - NFL (less granular data)

---

## 8. CONCLUSION

### What This System IS:
- A well-architected framework for sports betting
- Educational about professional betting concepts
- A starting point for building a real system

### What This System IS NOT:
- A proven profitable betting system
- Ready for real-money use
- Validated against historical data
- Complete with all necessary integrations

### Honest Assessment:
The code quality is high. The concepts are sound. But **code quality ≠ profitability**.

Without:
1. Historical validation showing positive expected value
2. Calibration testing confirming probability accuracy
3. Live paper trading demonstrating positive CLV

...this remains an **interesting framework**, not a **betting edge**.

---

## APPENDIX: File-by-File Issues

| File | Lines | Critical Issues |
|------|-------|-----------------|
| `kelly.py` | 562 | Hardcoded correlations (L469-500) |
| `conditional.py` | 881 | Arbitrary trust scores (L95) |
| `professional_refinements.py` | 1014 | Hardcoded correlations (L731-743) |
| `statcast.py` | ~300 | Physics assumptions (Magnus coefficient) |
| `tunneling.py` | ~400 | Hardcoded batter eye position |
| `arsenal.py` | ~620 | Potential look-ahead in scaler fitting |
| `odds.py` | 486 | Mock data fallback hides real data absence |
| `predictor.py` | 560 | No trained model; returns untested probabilities |

---

*This document was created to ensure complete honesty about system capabilities and limitations. Use at your own risk.*
