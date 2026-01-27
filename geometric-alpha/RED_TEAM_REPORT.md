# RED TEAM REPORT: Geometric Alpha Betting System

**Date**: 2026-01-26
**Analyst**: Claude (Red Team Assessment)
**Scope**: Full system review - `/geometric-alpha/`
**Classification**: INTERNAL - Brutally Honest Assessment

---

## EXECUTIVE SUMMARY

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Code Quality | ⭐⭐⭐⭐ | Professional architecture, well-structured |
| Statistical Rigor | ⭐⭐ | Hardcoded values, unvalidated assumptions |
| Production Readiness | ⭐ | Cannot actually place bets |
| Profitability Evidence | ⭐ | Zero backtests, zero validation |
| **Risk Level** | 🔴 CRITICAL | Would lose money if used today |

**Bottom Line**: This is a **research framework**, not a betting system. The code is well-written but the core thesis is unproven and critical components are missing or hardcoded.

---

## CRITICAL BLOCKERS (Must Fix Before Any Real Use)

### 1. NO TRAINED PROBABILITY MODEL

**Severity**: 🔴 CRITICAL
**Location**: `models/predictor.py:320-322`

```python
# What the code actually does when untrained:
win_probs = np.ones(len(X)) * 0.5        # Returns 50% for EVERYTHING
total_preds = np.ones(len(X)) * 8.5      # Returns 8.5 runs for EVERYTHING
```

**Reality**: The system has no trained models. Every prediction defaults to:
- 50% win probability (coin flip)
- 8.5 total runs (league average)
- 0 runs margin

**Impact**: You cannot have an edge betting coin flips against the market.

**Fix Required**: Train XGBoost/LightGBM models on 5+ years of historical data with:
- Proper time-series cross-validation
- Feature importance analysis
- Calibration testing (ECE < 0.05)
- Out-of-sample validation

---

### 2. "GEOMETRIC ALPHA" IS UNPROVEN SPECULATION

**Severity**: 🔴 CRITICAL
**Location**: Entire thesis

**The Claim**:
> "Geometric features (tunneling, arsenal polytopes, umpire hulls) reveal market inefficiencies that traditional stats miss."

**The Evidence**: None.

**Questions That Have No Answers**:
1. Does Angular Divergence tunneling predict strikeouts better than velocity alone?
2. Does arsenal polytope volume predict pitcher performance?
3. Do umpire hull features predict total runs?
4. Does ANY geometric feature beat simple baselines?

**Why This Matters**:
- Statcast data is **public** - everyone has it
- If geometric features had alpha, quants would've found it years ago
- Markets are efficient; 2% edges are extremely rare
- Novel feature ≠ profitable feature

**Fix Required**: Before betting real money, prove:
```
H1: ROI(geometric_model) > ROI(market_baseline) + transaction_costs
p-value < 0.05, n_bets > 500
```

---

### 3. ALL CORRELATIONS ARE HARDCODED GUESSES

**Severity**: 🔴 CRITICAL
**Location**: `optimization/kelly.py:466-491`, `optimization/professional_refinements.py:731-743`

```python
# These are GUESSES, not measurements:
if opp_i.bet_type == 'moneyline' and opp_j.bet_type == 'total':
    cov = np.sqrt(variances[i] * variances[j]) * 0.35  # WHY 0.35???

BASE_CORRELATIONS = {
    ('moneyline', 'total_over'): 0.15,    # Source: ???
    ('moneyline', 'spread'): 0.85,        # Source: ???
    ('player_hr', 'team_win'): 0.25,      # Source: ???
}
```

**The Problem**:
- Kelly Criterion is **extremely sensitive** to correlation estimates
- If true correlation > estimated → you over-bet → higher ruin risk
- If true correlation < estimated → you under-bet → leave money on table
- These values have **zero empirical validation**

**Fix Required**: Use the `EmpiricalCorrelationEstimator` we just built:
```python
from evaluation.trustworthy_system import EmpiricalCorrelationEstimator

estimator = EmpiricalCorrelationEstimator()
# Load 3+ years of historical outcomes
for game in historical_games:
    estimator.record_game_outcomes(game.id, game.bet_outcomes)

# Replace hardcoded values with empirical measurements
corr = estimator.get_correlation('moneyline_home', 'total_over')
print(f"Actual correlation: {corr.correlation:.3f} ± {corr.standard_error:.3f}")
```

---

### 4. NO SPORTSBOOK INTEGRATION

**Severity**: 🔴 CRITICAL
**Location**: `data/odds.py` (uses mock data fallback)

**What Exists**:
- Fetches historical odds from The-Odds-API
- Falls back to **fake mock data** if API unavailable

**What's Missing**:
- DraftKings API integration
- FanDuel API integration
- BetMGM API integration
- Pinnacle API integration
- Automated bet placement
- Account balance tracking
- Limit management
- Multi-book position tracking

**The Code**:
```python
# data/odds.py line 486
if not ODDS_API_AVAILABLE:
    return self._generate_mock_data()  # FAKE DATA RETURNED SILENTLY
```

**Impact**: You cannot place bets. This is a simulation only.

---

### 5. CONFIDENCE SCORE IS HARDCODED

**Severity**: 🟡 HIGH
**Location**: `models/predictor.py:368`

```python
def _compute_confidence(self, x: np.ndarray) -> float:
    return 0.7  # Placeholder - LITERALLY JUST RETURNS 0.7
```

Every prediction gets 0.7 confidence, regardless of:
- Sample size
- Feature quality
- Model uncertainty
- Historical calibration

**Impact**: Downstream systems that use confidence for sizing will be wrong.

---

## SIGNIFICANT ISSUES (Should Fix)

### 6. Physics Imputation Has 5-15% Error

**Location**: `data/statcast.py:293-417`

The Magnus force inversion for missing spin data assumes:
- Constant air density (ignores altitude: Denver ≠ sea level)
- Constant temperature (ignores 90°F ≠ 60°F)
- Fixed Magnus coefficient (actually varies with seam orientation)
- Fixed drag coefficient (0.3, no justification)

**CRITICAL_ANALYSIS.md admits**: "Spin rate estimates may be off by 5-15%"

**Impact**: Features computed from imputed spin are systematically biased.

---

### 7. Batter Eye Position is Hardcoded

**Location**: `features/tunneling.py:91-93`

```python
BATTER_EYE_X = 0.0      # Centered
BATTER_EYE_Y = -6.5     # 6.5 feet behind plate
BATTER_EYE_Z = 3.5      # 3.5 feet high
```

**Problem**: Batters range from 5'6" to 6'5". Eye positions change during swing.

**Impact**: All tunnel scores have systematic bias based on this assumption.

---

### 8. Trust Score is Always 0.8

**Location**: `optimization/conditional.py:95`

```python
trust_score: float = 0.8  # Default trust in any relationship
```

Used in probability blending:
```python
effective_prob = trust * cond_prob + (1 - trust) * marginal_prob
```

**Problem**: No data-driven trust calculation. The `DataDrivenTrustCalculator` exists but isn't wired in.

---

### 9. Mock Data Fallback Hides Real Problems

**Location**: `data/statcast.py:419-477`

If pybaseball fails, system **silently generates fake data** and continues.

```python
if not PYBASEBALL_AVAILABLE:
    return self._generate_mock_data(year)  # Fake data, no warning to user
```

**Impact**: Backtests on fake data are meaningless. User doesn't know data is synthetic.

---

### 10. No Error Handling Throughout

Silent failures in multiple locations:
- Statcast fetch fails → falls back to mock data
- Odds API fails → falls back to mock data
- XGBoost unavailable → falls back to DummyClassifier
- No retries, no exponential backoff, no error propagation

---

## MODERATE ISSUES (Nice to Fix)

| Issue | Location | Description |
|-------|----------|-------------|
| No line shopping | `data/odds.py` | Takes first odds, doesn't compare books |
| No situational factors | Missing | Bullpen usage, travel, rest not modeled |
| No player props | Missing | Only game-level markets supported |
| Arsenal polytope unvalidated | `features/arsenal.py` | Hull volume → performance link unproven |
| Foveal resolution = 0.2° | `tunneling.py:63` | Citation needed, baseball-specific validation missing |
| API key in config | `config/settings.py:26` | Should use environment variables |

---

## IS THIS SENSIBLE TO WORK FROM?

### YES, if you treat it as:
1. **A learning framework** for understanding professional betting concepts
2. **A research platform** for testing geometric feature hypotheses
3. **A software template** that needs validation before deployment
4. **An honest starting point** (CRITICAL_ANALYSIS.md is brutally self-aware)

### NO, if you expect:
1. **Immediate profitability** - No evidence this makes money
2. **A complete system** - Missing sportsbook integration
3. **Validated edge** - "Geometric Alpha" is unproven
4. **Production readiness** - Would lose money if used today

---

## WHAT WOULD MAKE THIS SYSTEM TRUSTWORTHY

### Phase 1: Validate the Foundation (REQUIRED)

```
[ ] Train probability models on 5+ years of Statcast data
[ ] Validate calibration: ECE < 0.05
[ ] Compute empirical correlations from historical outcomes
[ ] Run backtest showing ROI > 0 with p < 0.05 (n > 500 bets)
[ ] Compare geometric features vs. baseline (velocity, ERA, etc.)
[ ] Prove geometric features add incremental value
```

### Phase 2: Integration (REQUIRED for real use)

```
[ ] Integrate with at least one sportsbook API
[ ] Implement real-time odds fetching
[ ] Build bet placement pipeline
[ ] Add account/bankroll tracking
[ ] Implement line shopping across books
```

### Phase 3: Hardening (RECOMMENDED)

```
[ ] Wire DataDrivenTrustCalculator into conditional bets
[ ] Replace hardcoded correlations with empirical values
[ ] Add situational factors (bullpen, rest, travel)
[ ] Implement proper error handling with retries
[ ] Add player props support
```

---

## HONEST COMPARISON

| Aspect | Geometric Alpha | Professional Operation |
|--------|-----------------|------------------------|
| Models | Untrained | Trained on proprietary data |
| Correlations | Hardcoded guesses | Empirically measured |
| Validation | None | Continuous CLV tracking |
| Integration | Mock data | Multi-book real-time |
| Edge | Unproven claim | Measured and monitored |
| Risk Management | Defaults | Dynamic based on drawdown |

---

## FINAL VERDICT

**Code Quality**: The software engineering is professional. Good architecture, clear separation of concerns, thoughtful design.

**Statistical Foundation**: Weak. Core assumptions are untested. Critical parameters are guesses.

**Recommendation**:

This is a **research framework**, not a betting system. The path forward:

1. **Validate before betting**: Run the `TrustworthyBettingSystem` on historical data
2. **Prove geometric alpha**: Compare to baseline models statistically
3. **Measure correlations**: Use `EmpiricalCorrelationEstimator` on real outcomes
4. **Paper trade first**: Simulate bets without real money for 3+ months
5. **Start small**: If validated, begin with 1/10th of planned bankroll

**DO NOT** bet real money until you can show:
- Calibrated probabilities (ECE < 0.05)
- Positive CLV over 500+ bets
- Statistically significant ROI (p < 0.05)
- Geometric features outperform baseline

The foundation is there. The validation is not.

---

## APPENDIX: FILE REFERENCE

| File | Lines | Purpose | Critical Issues |
|------|-------|---------|-----------------|
| `models/predictor.py` | 560 | Probability prediction | Returns 50%/50% when untrained |
| `optimization/kelly.py` | 562 | Bet sizing | Hardcoded correlations |
| `optimization/conditional.py` | 881 | Dependencies | trust_score = 0.8 always |
| `features/tunneling.py` | 654 | Angular divergence | Hardcoded eye position |
| `features/arsenal.py` | 624 | Arsenal polytope | Look-ahead bias risk |
| `data/statcast.py` | 517 | Pitch data | Mock data fallback |
| `data/odds.py` | ~300 | Odds data | Mock data fallback |
| `evaluation/trustworthy_system.py` | 1,211 | Validation | NEW - Use this! |

---

*"The first principle is that you must not fool yourself—and you are the easiest person to fool."*
— Richard Feynman

---

**Report Generated**: 2026-01-26
**System Version**: geometric-alpha (pre-validation)
**Recommendation**: HALT real-money betting until validation complete
