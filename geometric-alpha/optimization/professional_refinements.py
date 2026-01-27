"""
Professional Betting Refinements for Geometric Alpha

Based on research into how professional betting houses, syndicates, and
algorithmic traders operate. These refinements bring our system closer
to production-grade betting infrastructure.

Research Sources:
- Pinnacle Sports (market maker model)
- CRIS/Bookmaker (sharp money originator)
- Professional syndicates (The Computer Group, Ranogajec)
- Academic research (Wharton, arXiv, PMC)

Key Findings Integrated:
=======================
1. CLV (Closing Line Value) tracking - the #1 indicator of long-term success
2. Market efficiency hierarchy (Pinnacle/CRIS as originators)
3. Steam move detection and exploitation
4. Fractional Kelly (Full Kelly = 100% bankruptcy in Wharton study)
5. SGP correlation matrices (books use Gaussian copulas)
6. Risk of ruin analysis with variance-adjusted sizing
7. Calibration > Accuracy (69.86% higher returns per arXiv)
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
from collections import defaultdict
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# 1. CLOSING LINE VALUE (CLV) TRACKER
# =============================================================================
# "Tracking CLV over rolling 100-bet samples provides clearer performance
# pictures than raw profit calculations" - Industry standard

@dataclass
class BetRecord:
    """Record of a placed bet for CLV analysis."""
    bet_id: str
    timestamp: datetime
    game_id: str
    market_type: str  # 'moneyline', 'spread', 'total', 'prop'
    selection: str

    # Odds at different times
    odds_at_placement: float  # What we got
    odds_at_close: float = None  # Final line before event

    # Probabilities
    model_prob: float = None
    implied_prob_at_placement: float = None
    implied_prob_at_close: float = None

    # Outcome
    won: bool = None
    profit: float = None
    stake: float = None

    @property
    def clv_cents(self) -> Optional[float]:
        """CLV in cents (basis points of edge)."""
        if self.odds_at_close is None:
            return None
        # Convert to implied probability difference
        implied_placement = 1 / self.odds_at_placement
        implied_close = 1 / self.odds_at_close
        # Positive CLV = we got better odds than closing
        return (implied_close - implied_placement) * 100

    @property
    def clv_percentage(self) -> Optional[float]:
        """CLV as percentage of closing line."""
        if self.odds_at_close is None:
            return None
        return ((self.odds_at_close - self.odds_at_placement) /
                self.odds_at_placement) * 100


class CLVTracker:
    """
    Closing Line Value Tracker.

    The #1 indicator of betting skill according to professionals.
    "Bettors consistently beating closing lines by 2-3% typically achieve
    long-term profitability even when short-term results suggest otherwise."
    """

    def __init__(self, rolling_window: int = 100):
        self.bets: List[BetRecord] = []
        self.rolling_window = rolling_window

    def record_bet(self, bet: BetRecord):
        """Record a bet placement."""
        bet.implied_prob_at_placement = 1 / bet.odds_at_placement
        self.bets.append(bet)

    def update_closing_odds(self, bet_id: str, closing_odds: float):
        """Update with closing line when available."""
        for bet in self.bets:
            if bet.bet_id == bet_id:
                bet.odds_at_close = closing_odds
                bet.implied_prob_at_close = 1 / closing_odds
                break

    def record_outcome(self, bet_id: str, won: bool, profit: float):
        """Record bet outcome."""
        for bet in self.bets:
            if bet.bet_id == bet_id:
                bet.won = won
                bet.profit = profit
                break

    def get_rolling_clv(self, n: int = None) -> Dict[str, float]:
        """
        Get rolling CLV statistics.

        Key insight: Consistent positive CLV indicates sharp analysis,
        even during losing streaks (variance).
        """
        n = n or self.rolling_window
        recent = [b for b in self.bets[-n:] if b.clv_cents is not None]

        if not recent:
            return {'avg_clv_cents': 0, 'clv_positive_rate': 0, 'sample_size': 0}

        clv_values = [b.clv_cents for b in recent]

        return {
            'avg_clv_cents': np.mean(clv_values),
            'median_clv_cents': np.median(clv_values),
            'clv_std': np.std(clv_values),
            'clv_positive_rate': sum(1 for c in clv_values if c > 0) / len(clv_values),
            'sample_size': len(recent),
            'total_clv': sum(clv_values),
            # Sharp threshold: consistently beating close by 2-3%
            'is_sharp': np.mean(clv_values) >= 2.0
        }

    def get_clv_by_market(self) -> Dict[str, Dict]:
        """Break down CLV by market type."""
        by_market = defaultdict(list)

        for bet in self.bets:
            if bet.clv_cents is not None:
                by_market[bet.market_type].append(bet.clv_cents)

        return {
            market: {
                'avg_clv': np.mean(values),
                'sample_size': len(values),
                'is_sharp': np.mean(values) >= 2.0
            }
            for market, values in by_market.items()
        }

    def diagnose_performance(self) -> Dict[str, Any]:
        """
        Diagnose betting performance separating skill from variance.

        Key insight: "A bettor with 54% win rate at -110 odds will still
        lose money during 37% of 1,000-wager samples purely due to variance."
        """
        if len(self.bets) < 50:
            return {'status': 'insufficient_data', 'min_required': 50}

        settled = [b for b in self.bets if b.won is not None and b.clv_cents is not None]

        if not settled:
            return {'status': 'no_settled_bets'}

        clv_stats = self.get_rolling_clv(len(settled))

        # Calculate actual profit
        total_profit = sum(b.profit for b in settled if b.profit is not None)
        win_rate = sum(1 for b in settled if b.won) / len(settled)

        # Diagnosis
        diagnosis = {
            'sample_size': len(settled),
            'win_rate': win_rate,
            'total_profit': total_profit,
            'avg_clv_cents': clv_stats['avg_clv_cents'],
            'clv_positive_rate': clv_stats['clv_positive_rate'],
        }

        # Interpret
        if clv_stats['avg_clv_cents'] >= 2.0:
            if total_profit < 0:
                diagnosis['interpretation'] = 'VARIANCE_UNLUCKY'
                diagnosis['recommendation'] = 'Continue strategy - positive CLV indicates skill, losses are variance'
            else:
                diagnosis['interpretation'] = 'SKILL_PROFITABLE'
                diagnosis['recommendation'] = 'Strategy is working as expected'
        else:
            if total_profit > 0:
                diagnosis['interpretation'] = 'VARIANCE_LUCKY'
                diagnosis['recommendation'] = 'Warning: profits may be unsustainable without positive CLV'
            else:
                diagnosis['interpretation'] = 'NEGATIVE_EDGE'
                diagnosis['recommendation'] = 'Review model - negative CLV suggests market is more accurate'

        return diagnosis


# =============================================================================
# 2. MARKET EFFICIENCY & STEAM MOVE DETECTION
# =============================================================================
# "Pinnacle MLB steam move: 4,503-4,132 (52.1%) with +302.8 units won"

class BookmakerTier(Enum):
    """Bookmaker tiers by market efficiency."""
    # Market makers - originators of efficient lines
    ORIGINATOR = "originator"  # Pinnacle, CRIS/Bookmaker

    # Fast followers - quick to match originators
    FAST_FOLLOWER = "fast_follower"  # Circa, Bet365

    # Retail - slower, softer lines
    RETAIL = "retail"  # DraftKings, FanDuel, BetMGM

    # Soft - known for slow reactions, bonus-driven
    SOFT = "soft"  # Bovada, smaller regionals


@dataclass
class OddsSnapshot:
    """Snapshot of odds across books at a point in time."""
    timestamp: datetime
    game_id: str
    market_type: str
    selection: str
    odds_by_book: Dict[str, float]  # book_name -> decimal odds


class SteamMoveDetector:
    """
    Detect steam moves from sharp books.

    "A steam move usually results when a syndicate or heavy-betting,
    winning bettor wagers on a game. Larger, professional-friendly
    sportsbooks such as Pinnacle and CRIS will move their lines in response."
    """

    BOOK_TIERS = {
        'pinnacle': BookmakerTier.ORIGINATOR,
        'cris': BookmakerTier.ORIGINATOR,
        'bookmaker': BookmakerTier.ORIGINATOR,
        'betcris': BookmakerTier.ORIGINATOR,
        'circa': BookmakerTier.FAST_FOLLOWER,
        'bet365': BookmakerTier.FAST_FOLLOWER,
        'draftkings': BookmakerTier.RETAIL,
        'fanduel': BookmakerTier.RETAIL,
        'betmgm': BookmakerTier.RETAIL,
        'caesars': BookmakerTier.RETAIL,
        'bovada': BookmakerTier.SOFT,
    }

    def __init__(self,
                 steam_threshold_cents: float = 10.0,
                 min_move_cents: float = 5.0):
        """
        Args:
            steam_threshold_cents: Minimum move to trigger steam alert
            min_move_cents: Minimum line move to consider
        """
        self.steam_threshold = steam_threshold_cents
        self.min_move = min_move_cents
        self.snapshots: Dict[str, List[OddsSnapshot]] = defaultdict(list)

    def record_snapshot(self, snapshot: OddsSnapshot):
        """Record an odds snapshot."""
        key = f"{snapshot.game_id}:{snapshot.market_type}:{snapshot.selection}"
        self.snapshots[key].append(snapshot)

    def detect_steam(self, game_id: str, market_type: str, selection: str) -> Optional[Dict]:
        """
        Detect if there's been a steam move on this market.

        Returns steam info if detected, None otherwise.
        """
        key = f"{game_id}:{market_type}:{selection}"
        snaps = self.snapshots.get(key, [])

        if len(snaps) < 2:
            return None

        # Get originator books
        originator_moves = []

        for i in range(1, len(snaps)):
            prev = snaps[i-1]
            curr = snaps[i]

            for book, tier in self.BOOK_TIERS.items():
                if tier != BookmakerTier.ORIGINATOR:
                    continue

                if book in prev.odds_by_book and book in curr.odds_by_book:
                    prev_implied = 1 / prev.odds_by_book[book]
                    curr_implied = 1 / curr.odds_by_book[book]
                    move_cents = (curr_implied - prev_implied) * 100

                    if abs(move_cents) >= self.min_move:
                        originator_moves.append({
                            'book': book,
                            'move_cents': move_cents,
                            'direction': 'steam_on' if move_cents > 0 else 'steam_off',
                            'timestamp': curr.timestamp,
                            'old_odds': prev.odds_by_book[book],
                            'new_odds': curr.odds_by_book[book]
                        })

        if not originator_moves:
            return None

        # Check for significant steam
        max_move = max(originator_moves, key=lambda x: abs(x['move_cents']))

        if abs(max_move['move_cents']) >= self.steam_threshold:
            # Find soft books that haven't moved yet
            latest = snaps[-1]
            stale_books = []

            for book, tier in self.BOOK_TIERS.items():
                if tier in [BookmakerTier.RETAIL, BookmakerTier.SOFT]:
                    if book in latest.odds_by_book:
                        # Check if this book is stale (hasn't followed the steam)
                        stale_books.append({
                            'book': book,
                            'current_odds': latest.odds_by_book[book],
                            'tier': tier.value
                        })

            return {
                'detected': True,
                'originator_move': max_move,
                'all_moves': originator_moves,
                'stale_books': stale_books,
                'recommendation': f"Steam detected at {max_move['book']}: {max_move['direction']} "
                                f"by {abs(max_move['move_cents']):.1f} cents. "
                                f"Consider betting at stale {[b['book'] for b in stale_books]}"
            }

        return None

    def find_arbitrage_opportunities(self, snapshot: OddsSnapshot) -> List[Dict]:
        """
        Find potential arbitrage between sharp and soft books.

        "Arbitrage occurs when implied probabilities add up to less than 1"
        but more practically, we look for stale soft books.
        """
        opportunities = []

        # Get best originator odds
        originator_odds = [
            (book, odds) for book, odds in snapshot.odds_by_book.items()
            if self.BOOK_TIERS.get(book) == BookmakerTier.ORIGINATOR
        ]

        if not originator_odds:
            return opportunities

        best_originator = max(originator_odds, key=lambda x: x[1])

        # Compare to soft books
        for book, odds in snapshot.odds_by_book.items():
            tier = self.BOOK_TIERS.get(book)
            if tier in [BookmakerTier.RETAIL, BookmakerTier.SOFT]:
                # If soft book offers better odds than sharp book, potential value
                edge = (odds - best_originator[1]) / best_originator[1] * 100

                if edge > 2.0:  # More than 2% better than sharp book
                    opportunities.append({
                        'soft_book': book,
                        'soft_odds': odds,
                        'sharp_book': best_originator[0],
                        'sharp_odds': best_originator[1],
                        'edge_percent': edge,
                        'recommendation': f"Potential value: {book} offers {edge:.1f}% better than {best_originator[0]}"
                    })

        return opportunities


# =============================================================================
# 3. ENHANCED KELLY WITH RISK OF RUIN ANALYSIS
# =============================================================================
# "Full Kelly scenarios led to bankruptcy in 100% of scenarios" - Wharton

@dataclass
class RiskMetrics:
    """Risk analysis metrics for a betting strategy."""
    risk_of_ruin: float  # Probability of hitting zero
    expected_growth: float  # Kelly growth rate
    variance: float
    sharpe_ratio: float
    max_drawdown_expected: float
    time_to_double: float  # Expected bets to double bankroll
    time_to_halve: float  # Expected bets to halve bankroll


class EnhancedKellyOptimizer:
    """
    Enhanced Kelly Criterion with professional risk management.

    Key findings:
    - Full Kelly = 100% bankruptcy (Wharton 2023)
    - Recommended: 0.5 Kelly with 10% threshold
    - 1/2 Kelly: 1/9 chance of halving before doubling
    - Full Kelly: 1/3 chance of halving before doubling
    """

    # Wharton study recommendation
    DEFAULT_KELLY_FRACTION = 0.5
    MAX_SINGLE_BET = 0.05  # Never more than 5% on single bet
    MAX_ODDS_LIMIT = 4.0   # Limit underdogs to reduce variance

    def __init__(self,
                 kelly_fraction: float = 0.5,
                 max_single_bet: float = 0.05,
                 max_odds: float = 4.0,
                 min_edge: float = 0.02,
                 max_total_exposure: float = 0.25):
        """
        Args:
            kelly_fraction: Fraction of Kelly to use (0.5 = half Kelly)
            max_single_bet: Maximum fraction on single bet
            max_odds: Maximum decimal odds allowed (reduces variance)
            min_edge: Minimum edge required to bet
            max_total_exposure: Maximum total bankroll exposure
        """
        self.kelly_fraction = kelly_fraction
        self.max_single_bet = max_single_bet
        self.max_odds = max_odds
        self.min_edge = min_edge
        self.max_total_exposure = max_total_exposure

    def compute_kelly_stake(self,
                           prob: float,
                           decimal_odds: float,
                           confidence: float = 1.0) -> float:
        """
        Compute Kelly stake with all safety adjustments.

        Args:
            prob: Estimated probability of winning
            decimal_odds: Decimal odds offered
            confidence: Confidence in probability estimate (0-1)
        """
        # Filter out high-variance underdogs
        if decimal_odds > self.max_odds:
            logger.debug(f"Odds {decimal_odds} exceed max {self.max_odds}, skipping")
            return 0.0

        # Basic Kelly
        b = decimal_odds - 1  # Net odds
        q = 1 - prob

        kelly = (b * prob - q) / b

        if kelly <= 0:
            return 0.0

        # Check minimum edge
        edge = prob - (1 / decimal_odds)
        if edge < self.min_edge:
            return 0.0

        # Apply fractional Kelly
        stake = kelly * self.kelly_fraction

        # Apply confidence adjustment
        stake *= confidence

        # Apply maximum cap
        stake = min(stake, self.max_single_bet)

        return max(0.0, stake)

    def compute_risk_of_ruin(self,
                            edge: float,
                            variance: float,
                            bet_size: float,
                            target_profit: float = 1.0) -> float:
        """
        Compute probability of ruin before reaching profit target.

        Uses the classic risk of ruin formula for betting.
        """
        if edge <= 0:
            return 1.0  # Guaranteed ruin with negative edge

        if variance <= 0:
            return 0.0  # No variance = no risk

        # Simplified risk of ruin formula
        # RoR ≈ ((1-edge)/(1+edge))^(bankroll/unit)
        # More accurate for fractional Kelly

        units = 1 / bet_size  # Number of units in bankroll
        win_prob = 0.5 + edge / 2  # Approximate

        if win_prob >= 1:
            return 0.0
        if win_prob <= 0:
            return 1.0

        ratio = (1 - win_prob) / win_prob
        ror = ratio ** units

        return min(1.0, max(0.0, ror))

    def analyze_strategy_risk(self,
                             avg_edge: float,
                             avg_odds: float,
                             bet_size: float,
                             n_bets: int = 1000) -> RiskMetrics:
        """
        Comprehensive risk analysis for a betting strategy.
        """
        # Variance for a single bet (Bernoulli)
        p = 0.5 + avg_edge / 2
        q = 1 - p
        b = avg_odds - 1

        single_bet_var = p * q * (1 + b) ** 2

        # Kelly growth rate
        growth = p * np.log(1 + bet_size * b) + q * np.log(1 - bet_size)

        # Variance of log returns
        log_var = p * (np.log(1 + bet_size * b)) ** 2 + q * (np.log(1 - bet_size)) ** 2
        log_var -= growth ** 2

        # Sharpe-like ratio for betting
        sharpe = growth / np.sqrt(log_var) if log_var > 0 else 0

        # Time to double/halve
        time_to_double = np.log(2) / growth if growth > 0 else float('inf')
        time_to_halve = -np.log(0.5) / growth if growth > 0 else 0

        # Risk of ruin
        ror = self.compute_risk_of_ruin(avg_edge, single_bet_var, bet_size)

        # Expected max drawdown (approximation)
        max_dd = 2 * np.sqrt(n_bets * log_var) * bet_size

        return RiskMetrics(
            risk_of_ruin=ror,
            expected_growth=growth,
            variance=single_bet_var,
            sharpe_ratio=sharpe,
            max_drawdown_expected=min(1.0, max_dd),
            time_to_double=time_to_double,
            time_to_halve=time_to_halve
        )

    def recommend_kelly_fraction(self,
                                 risk_tolerance: str = 'moderate') -> Dict[str, Any]:
        """
        Recommend Kelly fraction based on risk tolerance.

        Based on Wharton findings:
        - Full Kelly: 1/3 chance of halving before doubling
        - Half Kelly: 1/9 chance of halving before doubling
        - Quarter Kelly: Very conservative, slower growth
        """
        recommendations = {
            'aggressive': {
                'kelly_fraction': 0.5,
                'halving_probability': '1 in 9 (11%)',
                'growth_rate': 'Maximum practical growth',
                'suitable_for': 'Large bankrolls, high confidence in edge'
            },
            'moderate': {
                'kelly_fraction': 0.35,
                'halving_probability': '~1 in 15 (7%)',
                'growth_rate': 'Good growth with lower volatility',
                'suitable_for': 'Most serious bettors'
            },
            'conservative': {
                'kelly_fraction': 0.25,
                'halving_probability': '~1 in 25 (4%)',
                'growth_rate': 'Slower but steadier',
                'suitable_for': 'Beginners or limited bankrolls'
            },
            'ultra_conservative': {
                'kelly_fraction': 0.125,
                'halving_probability': '~1 in 50 (2%)',
                'growth_rate': 'Very slow, minimal risk',
                'suitable_for': 'Risk-averse, proof of concept'
            }
        }

        return recommendations.get(risk_tolerance, recommendations['moderate'])


# =============================================================================
# 4. CALIBRATION OPTIMIZER
# =============================================================================
# "Calibration-optimized model generated 69.86% higher average returns
#  compared to accuracy-optimized model" - arXiv 2024

class CalibrationOptimizer:
    """
    Optimize for calibration rather than accuracy.

    Key insight: A well-calibrated model (when it predicts 60%, events
    happen 60% of the time) is more profitable than a high-accuracy model
    that's poorly calibrated.
    """

    def __init__(self, n_bins: int = 10):
        self.n_bins = n_bins
        self.predictions: List[Tuple[float, bool]] = []  # (predicted_prob, actual_outcome)

    def record_prediction(self, predicted_prob: float, actual_outcome: bool):
        """Record a prediction and its outcome."""
        self.predictions.append((predicted_prob, actual_outcome))

    def compute_calibration_error(self) -> Dict[str, float]:
        """
        Compute Expected Calibration Error (ECE) and related metrics.
        """
        if len(self.predictions) < self.n_bins * 5:
            return {'status': 'insufficient_data'}

        # Bin predictions
        bins = [[] for _ in range(self.n_bins)]

        for pred, outcome in self.predictions:
            bin_idx = min(int(pred * self.n_bins), self.n_bins - 1)
            bins[bin_idx].append((pred, outcome))

        # Compute ECE
        total_samples = len(self.predictions)
        ece = 0.0
        mce = 0.0  # Maximum calibration error
        bin_stats = []

        for i, bin_data in enumerate(bins):
            if not bin_data:
                continue

            bin_size = len(bin_data)
            avg_pred = np.mean([p for p, _ in bin_data])
            avg_outcome = np.mean([int(o) for _, o in bin_data])

            error = abs(avg_pred - avg_outcome)
            weighted_error = (bin_size / total_samples) * error

            ece += weighted_error
            mce = max(mce, error)

            bin_stats.append({
                'bin': i,
                'range': (i / self.n_bins, (i + 1) / self.n_bins),
                'n_samples': bin_size,
                'avg_predicted': avg_pred,
                'avg_actual': avg_outcome,
                'calibration_error': error
            })

        return {
            'expected_calibration_error': ece,
            'maximum_calibration_error': mce,
            'bin_statistics': bin_stats,
            'is_well_calibrated': ece < 0.05,  # <5% ECE is good
            'n_predictions': total_samples
        }

    def get_calibration_adjustment(self, predicted_prob: float) -> float:
        """
        Get calibration-adjusted probability based on historical performance.

        If model consistently over/under predicts in certain ranges,
        adjust accordingly.
        """
        if len(self.predictions) < 100:
            return predicted_prob  # Not enough data

        # Find relevant bin
        bin_idx = min(int(predicted_prob * self.n_bins), self.n_bins - 1)

        # Get historical performance in this bin
        bin_data = [
            (p, o) for p, o in self.predictions
            if int(p * self.n_bins) == bin_idx
        ]

        if len(bin_data) < 10:
            return predicted_prob

        # Calculate adjustment
        avg_pred = np.mean([p for p, _ in bin_data])
        avg_actual = np.mean([int(o) for _, o in bin_data])

        # Blend towards actual frequency
        # adjustment_factor controls how much to adjust (0.5 = 50% blend)
        adjustment_factor = min(0.5, len(bin_data) / 200)  # More data = more adjustment

        adjusted = predicted_prob + adjustment_factor * (avg_actual - avg_pred)

        return np.clip(adjusted, 0.01, 0.99)


# =============================================================================
# 5. SGP CORRELATION MATRIX (GAUSSIAN COPULA APPROACH)
# =============================================================================
# "Sportsbooks use Gaussian copulas, empirical frequency tables, and
#  correlation matrices to price SGPs with reasonable accuracy"

class SGPCorrelationEngine:
    """
    Same-Game Parlay correlation engine.

    "Due to correlation complexity, SGPs typically carry house edges of
    15-25%, compared to 4-5% for single bets."

    Our goal: Find mispriced SGPs by modeling correlations better.
    """

    # Base correlation estimates from historical data
    BASE_CORRELATIONS = {
        # (market_a, market_b) -> correlation
        ('moneyline', 'total_over'): 0.15,  # Winners often high-scoring
        ('moneyline', 'total_under'): -0.15,
        ('moneyline', 'spread'): 0.85,  # Almost redundant
        ('player_hr', 'team_win'): 0.25,  # HR helps team
        ('player_hits', 'team_win'): 0.20,
        ('pitcher_strikeouts', 'team_win'): 0.30,
        ('pitcher_strikeouts', 'total_under'): 0.25,
        ('first_inning_run', 'total_over'): 0.35,
        ('player_rbi', 'team_win'): 0.30,
    }

    def __init__(self):
        self.historical_correlations: Dict[Tuple[str, str], List[Tuple[bool, bool]]] = defaultdict(list)

    def record_outcomes(self, outcomes: Dict[str, bool]):
        """Record correlated outcomes for learning."""
        markets = list(outcomes.keys())

        for i, m1 in enumerate(markets):
            for m2 in markets[i+1:]:
                key = tuple(sorted([m1, m2]))
                self.historical_correlations[key].append((outcomes[m1], outcomes[m2]))

    def get_correlation(self, market_a: str, market_b: str) -> float:
        """Get correlation between two markets."""
        key = tuple(sorted([market_a, market_b]))

        # Check historical data first
        if key in self.historical_correlations and len(self.historical_correlations[key]) >= 30:
            data = self.historical_correlations[key]
            a_vals = [int(x[0]) for x in data]
            b_vals = [int(x[1]) for x in data]

            if np.std(a_vals) > 0 and np.std(b_vals) > 0:
                return np.corrcoef(a_vals, b_vals)[0, 1]

        # Fall back to base estimates
        for (m1, m2), corr in self.BASE_CORRELATIONS.items():
            if m1 in market_a and m2 in market_b:
                return corr
            if m2 in market_a and m1 in market_b:
                return corr

        return 0.0  # Assume independent if unknown

    def compute_sgp_true_probability(self,
                                     legs: List[Tuple[str, float]]) -> Dict[str, float]:
        """
        Compute true joint probability for SGP legs.

        Args:
            legs: List of (market_type, marginal_probability) tuples

        Returns:
            True probability and comparison to naive estimate
        """
        n = len(legs)

        if n < 2:
            return {
                'true_prob': legs[0][1] if legs else 1.0,
                'naive_prob': legs[0][1] if legs else 1.0,
                'correlation_adjustment': 0.0
            }

        # Naive probability (independence assumption)
        naive_prob = np.prod([p for _, p in legs])

        # Build correlation matrix
        corr_matrix = np.eye(n)
        for i in range(n):
            for j in range(i+1, n):
                corr = self.get_correlation(legs[i][0], legs[j][0])
                corr_matrix[i, j] = corr
                corr_matrix[j, i] = corr

        # Use Gaussian copula approximation
        # For binary outcomes, we can approximate joint probability
        # P(A ∩ B) ≈ Φ₂(Φ⁻¹(P(A)), Φ⁻¹(P(B)), ρ)
        # where Φ₂ is bivariate normal CDF

        try:
            from scipy.stats import norm
            from scipy.special import ndtr

            # Transform marginals to normal quantiles
            probs = np.array([p for _, p in legs])
            z_scores = norm.ppf(probs)

            # Approximate joint probability using Gaussian copula
            # This is a simplification; full implementation would use multivariate normal

            # For simplicity, use pairwise adjustment
            true_prob = naive_prob

            for i in range(n):
                for j in range(i+1, n):
                    rho = corr_matrix[i, j]
                    if abs(rho) > 0.01:
                        # Adjustment factor based on correlation
                        # Positive correlation increases joint prob
                        # Negative correlation decreases joint prob
                        adjustment = 1 + rho * 0.3 * np.sqrt(probs[i] * probs[j])
                        true_prob *= adjustment

            # Ensure valid probability
            true_prob = np.clip(true_prob, 0.001, 0.999)

        except ImportError:
            # Fallback without scipy
            true_prob = naive_prob

        correlation_adjustment = true_prob - naive_prob

        return {
            'true_prob': true_prob,
            'naive_prob': naive_prob,
            'correlation_adjustment': correlation_adjustment,
            'adjustment_percent': (correlation_adjustment / naive_prob) * 100 if naive_prob > 0 else 0,
            'correlation_matrix': corr_matrix.tolist(),
            'is_positive_correlation': correlation_adjustment > 0
        }

    def evaluate_sgp_value(self,
                          legs: List[Tuple[str, float]],
                          offered_odds: float) -> Dict[str, Any]:
        """
        Evaluate if an SGP offers value.

        Key insight: "Look for negatively correlated combinations where
        the book may offer disproportionately high payouts."
        """
        probs = self.compute_sgp_true_probability(legs)

        implied_prob = 1 / offered_odds
        true_prob = probs['true_prob']

        edge = true_prob - implied_prob
        ev = true_prob * (offered_odds - 1) - (1 - true_prob)

        # House edge estimate
        house_edge = (1 - true_prob * offered_odds) * 100

        result = {
            **probs,
            'offered_odds': offered_odds,
            'implied_prob': implied_prob,
            'edge': edge,
            'expected_value': ev,
            'estimated_house_edge_percent': house_edge,
            'is_value': edge > 0.03,  # Higher threshold for SGPs
            'recommendation': 'BET' if edge > 0.03 else 'PASS'
        }

        # Special case: negative correlation (potential value)
        if probs['correlation_adjustment'] < -0.02:
            result['special_note'] = (
                "Negatively correlated legs - book may be overpricing. "
                "These 'counter-intuitive' parlays sometimes offer better value."
            )

        return result


# =============================================================================
# 6. PROFESSIONAL BANKROLL MANAGEMENT
# =============================================================================

class ProfessionalBankrollManager:
    """
    Professional-grade bankroll management.

    "Most professional bettors recommend betting 1-3% of bankroll per wager.
    Never bet more than 5% on a single wager."
    """

    def __init__(self,
                 initial_bankroll: float = 10000,
                 conservative_pct: float = 0.01,
                 standard_pct: float = 0.02,
                 aggressive_pct: float = 0.03,
                 max_pct: float = 0.05):
        self.bankroll = initial_bankroll
        self.initial_bankroll = initial_bankroll
        self.conservative_pct = conservative_pct
        self.standard_pct = standard_pct
        self.aggressive_pct = aggressive_pct
        self.max_pct = max_pct

        self.history: List[Dict] = []
        self.high_water_mark = initial_bankroll

    def get_unit_size(self, confidence: str = 'standard') -> float:
        """Get bet size based on confidence level."""
        pct_map = {
            'conservative': self.conservative_pct,
            'standard': self.standard_pct,
            'aggressive': self.aggressive_pct
        }

        pct = pct_map.get(confidence, self.standard_pct)
        return self.bankroll * pct

    def record_bet(self, stake: float, profit: float, metadata: Dict = None):
        """Record a bet result."""
        self.bankroll += profit
        self.high_water_mark = max(self.high_water_mark, self.bankroll)

        self.history.append({
            'timestamp': datetime.now(),
            'stake': stake,
            'profit': profit,
            'bankroll_after': self.bankroll,
            'metadata': metadata or {}
        })

    def get_drawdown(self) -> Dict[str, float]:
        """Calculate current and max drawdown."""
        current_dd = (self.high_water_mark - self.bankroll) / self.high_water_mark

        max_dd = 0
        peak = self.initial_bankroll

        for record in self.history:
            peak = max(peak, record['bankroll_after'])
            dd = (peak - record['bankroll_after']) / peak
            max_dd = max(max_dd, dd)

        return {
            'current_drawdown': current_dd,
            'max_drawdown': max_dd,
            'current_bankroll': self.bankroll,
            'high_water_mark': self.high_water_mark,
            'from_initial': (self.bankroll - self.initial_bankroll) / self.initial_bankroll
        }

    def should_reduce_stakes(self) -> Tuple[bool, str]:
        """
        Determine if stakes should be reduced due to drawdown.

        "Effective risk management involves calculating optimal bet sizes
        for your bankroll and avoiding emotional betting during downswings."
        """
        dd = self.get_drawdown()

        if dd['current_drawdown'] > 0.30:  # 30% drawdown
            return True, "CRITICAL: 30%+ drawdown. Reduce to 1/2 standard stakes."
        elif dd['current_drawdown'] > 0.20:  # 20% drawdown
            return True, "WARNING: 20%+ drawdown. Reduce to 3/4 standard stakes."
        elif dd['current_drawdown'] > 0.10:  # 10% drawdown
            return False, "MONITOR: 10%+ drawdown. Continue normal stakes but review strategy."

        return False, "NORMAL: Bankroll healthy."

    def get_performance_summary(self) -> Dict[str, Any]:
        """Comprehensive performance summary."""
        if not self.history:
            return {'status': 'no_bets_recorded'}

        profits = [h['profit'] for h in self.history]
        stakes = [h['stake'] for h in self.history]

        wins = sum(1 for p in profits if p > 0)
        losses = sum(1 for p in profits if p < 0)

        return {
            'total_bets': len(self.history),
            'wins': wins,
            'losses': losses,
            'win_rate': wins / len(self.history) if self.history else 0,
            'total_profit': sum(profits),
            'total_staked': sum(stakes),
            'roi': sum(profits) / sum(stakes) * 100 if sum(stakes) > 0 else 0,
            'avg_profit_per_bet': np.mean(profits),
            'profit_std': np.std(profits),
            'best_bet': max(profits),
            'worst_bet': min(profits),
            'current_bankroll': self.bankroll,
            'from_initial_pct': (self.bankroll - self.initial_bankroll) / self.initial_bankroll * 100,
            **self.get_drawdown()
        }
