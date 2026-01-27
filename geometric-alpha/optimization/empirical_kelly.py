"""
Empirical Kelly Criterion Optimizer - FIXES ISSUE #2

Replaces HARDCODED correlations with EMPIRICALLY MEASURED values.

The Problem:
============
The original kelly.py had hardcoded correlation values like:
    cov = np.sqrt(variances[i] * variances[j]) * 0.35  # WHY 0.35???

These were guesses based on intuition, not data.

The Fix:
========
This module integrates with EmpiricalCorrelationEstimator to:
1. Compute correlations from actual historical bet outcomes
2. Track confidence in each correlation estimate
3. Fall back to conservative estimates when data is insufficient
4. Provide transparency about what's measured vs estimated

Usage:
    from optimization.empirical_kelly import EmpiricalKellySolver
    from evaluation.trustworthy_system import EmpiricalCorrelationEstimator

    # Build correlation estimator from historical data
    estimator = EmpiricalCorrelationEstimator()
    for game in historical_games:
        estimator.record_game_outcomes(game.id, game.outcomes)

    # Create solver with empirical correlations
    solver = EmpiricalKellySolver(
        bankroll=10000,
        correlation_estimator=estimator
    )

    # Optimize with REAL correlations
    portfolio = solver.optimize(opportunities)
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
import logging
from pathlib import Path
import pickle

try:
    import cvxpy as cp
    CVXPY_AVAILABLE = True
except ImportError:
    CVXPY_AVAILABLE = False

# Import from parent modules
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from optimization.kelly import (
    BettingOpportunity,
    OptimalPortfolio,
    SimultaneousKellySolver
)
from evaluation.trustworthy_system import (
    EmpiricalCorrelationEstimator,
    CorrelationEstimate,
    DataDrivenTrustCalculator,
    TrustAssessment
)
from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class CorrelationSource:
    """Tracks where each correlation came from."""
    bet_type_a: str
    bet_type_b: str
    correlation: float
    source: str  # 'empirical', 'fallback', 'zero'
    confidence: float
    sample_size: int
    warning: Optional[str] = None


@dataclass
class EmpiricalPortfolio(OptimalPortfolio):
    """Extended portfolio result with correlation transparency."""
    correlation_sources: List[CorrelationSource] = field(default_factory=list)
    n_empirical_correlations: int = 0
    n_fallback_correlations: int = 0
    correlation_confidence: float = 0.0


class EmpiricalKellySolver:
    """
    Kelly solver using EMPIRICAL correlations instead of hardcoded values.

    FIXES ISSUE #2: Hardcoded correlations

    Key improvements:
    1. Uses actual historical bet outcomes to compute correlations
    2. Tracks confidence in each correlation estimate
    3. Falls back to conservative estimates when data is sparse
    4. Provides full transparency about correlation sources
    """

    # Conservative fallback correlations (used when no empirical data)
    # These are CLEARLY MARKED as fallbacks, not hidden in code
    FALLBACK_CORRELATIONS = {
        # Same game, different markets
        ('moneyline', 'total'): 0.20,      # Conservative estimate
        ('moneyline', 'spread'): 0.80,     # Strong relationship
        ('spread', 'total'): 0.15,         # Weak relationship
        # Same market, opposite sides
        ('home', 'away'): -0.95,           # Near-perfect negative
        ('over', 'under'): -0.95,          # Near-perfect negative
        # Player props
        ('player_hr', 'moneyline'): 0.15,  # Weak positive
        ('player_hit', 'total'): 0.10,     # Very weak
    }

    def __init__(
        self,
        bankroll: float = None,
        max_exposure: float = None,
        max_single_bet: float = None,
        min_edge: float = None,
        risk_aversion: float = 0.5,
        correlation_estimator: Optional[EmpiricalCorrelationEstimator] = None,
        trust_calculator: Optional[DataDrivenTrustCalculator] = None
    ):
        """
        Initialize solver with optional empirical correlation estimator.

        Args:
            bankroll: Total bankroll
            max_exposure: Maximum total exposure (fraction)
            max_single_bet: Maximum single bet (fraction)
            min_edge: Minimum edge to consider betting
            risk_aversion: Lambda parameter for risk penalty
            correlation_estimator: Pre-trained correlation estimator
            trust_calculator: Calculator for relationship trust
        """
        config = CONFIG.optimization

        self.bankroll = bankroll or config.initial_bankroll
        self.max_exposure = max_exposure or config.max_exposure
        self.max_single_bet = max_single_bet or config.max_single_bet
        self.min_edge = min_edge or config.min_edge_threshold
        self.risk_aversion = risk_aversion

        # Empirical estimators (CRITICAL FOR FIX)
        self.correlation_estimator = correlation_estimator or EmpiricalCorrelationEstimator()
        self.trust_calculator = trust_calculator or DataDrivenTrustCalculator()

        # Track correlation sources for transparency
        self._correlation_sources: List[CorrelationSource] = []

    def optimize(
        self,
        opportunities: List[BettingOpportunity],
        use_empirical: bool = True
    ) -> EmpiricalPortfolio:
        """
        Find optimal bet sizing with empirical correlations.

        Args:
            opportunities: List of betting opportunities
            use_empirical: Whether to use empirical correlations (default True)

        Returns:
            EmpiricalPortfolio with optimal allocations and correlation sources
        """
        # Filter to value opportunities
        value_opps = [o for o in opportunities if o.is_value(self.min_edge)]

        if not value_opps:
            logger.info("No value opportunities found")
            return EmpiricalPortfolio(solver_status="no_value")

        logger.info(f"Optimizing {len(value_opps)} value opportunities")

        # Clear correlation tracking
        self._correlation_sources = []

        # Build covariance matrix using empirical data where available
        if use_empirical:
            cov_matrix = self._build_empirical_covariance(value_opps)
        else:
            cov_matrix = self._build_fallback_covariance(value_opps)

        # Count empirical vs fallback
        n_empirical = sum(1 for s in self._correlation_sources if s.source == 'empirical')
        n_fallback = sum(1 for s in self._correlation_sources if s.source == 'fallback')

        # Optimize
        if CVXPY_AVAILABLE:
            result = self._solve_cvxpy(value_opps, cov_matrix)
        else:
            result = self._solve_simplified(value_opps)

        # Convert to EmpiricalPortfolio with correlation info
        return EmpiricalPortfolio(
            allocations=result.allocations,
            expected_growth_rate=result.expected_growth_rate,
            total_exposure=result.total_exposure,
            max_single_bet=result.max_single_bet,
            solver_status=result.solver_status,
            correlation_sources=self._correlation_sources,
            n_empirical_correlations=n_empirical,
            n_fallback_correlations=n_fallback,
            correlation_confidence=n_empirical / max(1, n_empirical + n_fallback)
        )

    def _build_empirical_covariance(
        self,
        opportunities: List[BettingOpportunity]
    ) -> np.ndarray:
        """
        Build covariance matrix using empirical correlations where available.

        FIXES ISSUE #2: Uses measured correlations instead of hardcoded values.
        """
        n = len(opportunities)

        # Start with variance matrix (diagonal)
        variances = np.array([
            o.model_prob * (1 - o.model_prob) for o in opportunities
        ])
        sigma = np.diag(variances)

        # Compute off-diagonal covariances
        for i in range(n):
            for j in range(i + 1, n):
                opp_i = opportunities[i]
                opp_j = opportunities[j]

                cov, source = self._get_covariance(
                    opp_i, opp_j,
                    variances[i], variances[j]
                )

                sigma[i, j] = cov
                sigma[j, i] = cov

        # Ensure positive semi-definiteness
        eigenvalues = np.linalg.eigvalsh(sigma)
        if np.min(eigenvalues) < 0:
            sigma += np.eye(n) * (abs(np.min(eigenvalues)) + 1e-6)

        return sigma

    def _get_covariance(
        self,
        opp_i: BettingOpportunity,
        opp_j: BettingOpportunity,
        var_i: float,
        var_j: float
    ) -> Tuple[float, CorrelationSource]:
        """
        Get covariance between two opportunities.

        Priority:
        1. Empirical measurement (if sufficient data)
        2. Fallback conservative estimate
        3. Zero (assume independence)

        Returns:
            Tuple of (covariance, source_info)
        """
        # Construct bet type keys
        bet_type_a = f"{opp_i.bet_type}_{opp_i.selection}"
        bet_type_b = f"{opp_j.bet_type}_{opp_j.selection}"

        # Same game handling
        if opp_i.game_id == opp_j.game_id:
            # Same market, opposite sides
            if opp_i.bet_type == opp_j.bet_type and opp_i.selection != opp_j.selection:
                cov = -np.sqrt(var_i * var_j) * 0.95  # Near-perfect negative
                source = CorrelationSource(
                    bet_type_a=bet_type_a,
                    bet_type_b=bet_type_b,
                    correlation=-0.95,
                    source='rule',  # This is a logical rule, not empirical
                    confidence=0.99,
                    sample_size=0,
                    warning=None
                )
                self._correlation_sources.append(source)
                return cov, source

            # Different markets - try empirical first
            estimate = self.correlation_estimator.get_correlation(
                bet_type_a, bet_type_b
            )

            if estimate.trust_level >= 0.5:
                # USE EMPIRICAL DATA!
                cov = estimate.correlation * np.sqrt(var_i * var_j)

                # Apply trust-based shrinkage toward conservative estimate
                trust = estimate.trust_level
                fallback_corr = self._get_fallback_correlation(
                    opp_i.bet_type, opp_j.bet_type
                )
                shrunk_corr = trust * estimate.correlation + (1 - trust) * fallback_corr
                cov = shrunk_corr * np.sqrt(var_i * var_j)

                source = CorrelationSource(
                    bet_type_a=bet_type_a,
                    bet_type_b=bet_type_b,
                    correlation=shrunk_corr,
                    source='empirical',
                    confidence=estimate.trust_level,
                    sample_size=estimate.sample_size,
                    warning=None if estimate.is_significant else "Not statistically significant"
                )
                self._correlation_sources.append(source)

                logger.info(
                    f"Using EMPIRICAL correlation for {bet_type_a} <-> {bet_type_b}: "
                    f"{estimate.correlation:.3f} (n={estimate.sample_size}, trust={trust:.2f})"
                )

                return cov, source

            else:
                # Fall back to conservative estimate
                fallback_corr = self._get_fallback_correlation(
                    opp_i.bet_type, opp_j.bet_type
                )
                cov = fallback_corr * np.sqrt(var_i * var_j)

                source = CorrelationSource(
                    bet_type_a=bet_type_a,
                    bet_type_b=bet_type_b,
                    correlation=fallback_corr,
                    source='fallback',
                    confidence=0.3,  # Low confidence in fallback
                    sample_size=estimate.sample_size,
                    warning=f"Insufficient data (n={estimate.sample_size}), using fallback"
                )
                self._correlation_sources.append(source)

                logger.warning(
                    f"Using FALLBACK correlation for {bet_type_a} <-> {bet_type_b}: "
                    f"{fallback_corr:.3f} (insufficient empirical data)"
                )

                return cov, source

        # Same team, different games
        elif opp_i.home_team == opp_j.home_team or opp_i.away_team == opp_j.away_team:
            corr = 0.10  # Conservative weak correlation
            cov = corr * np.sqrt(var_i * var_j)

            source = CorrelationSource(
                bet_type_a=bet_type_a,
                bet_type_b=bet_type_b,
                correlation=corr,
                source='fallback',
                confidence=0.4,
                sample_size=0,
                warning="Same team, different game - using conservative estimate"
            )
            self._correlation_sources.append(source)
            return cov, source

        # Different games, different teams - independent
        else:
            source = CorrelationSource(
                bet_type_a=bet_type_a,
                bet_type_b=bet_type_b,
                correlation=0.0,
                source='zero',
                confidence=0.9,
                sample_size=0,
                warning=None
            )
            self._correlation_sources.append(source)
            return 0.0, source

    def _get_fallback_correlation(self, type_a: str, type_b: str) -> float:
        """Get conservative fallback correlation for bet type pair."""
        # Normalize types
        type_a = type_a.lower().replace('_home', '').replace('_away', '')
        type_b = type_b.lower().replace('_home', '').replace('_away', '')

        # Try direct lookup
        key = (type_a, type_b)
        if key in self.FALLBACK_CORRELATIONS:
            return self.FALLBACK_CORRELATIONS[key]

        # Try reverse
        key = (type_b, type_a)
        if key in self.FALLBACK_CORRELATIONS:
            return self.FALLBACK_CORRELATIONS[key]

        # Default conservative estimate for same-game bets
        return 0.20

    def _build_fallback_covariance(
        self,
        opportunities: List[BettingOpportunity]
    ) -> np.ndarray:
        """Build covariance matrix using only fallback correlations."""
        n = len(opportunities)
        variances = np.array([
            o.model_prob * (1 - o.model_prob) for o in opportunities
        ])
        sigma = np.diag(variances)

        for i in range(n):
            for j in range(i + 1, n):
                opp_i = opportunities[i]
                opp_j = opportunities[j]

                if opp_i.game_id == opp_j.game_id:
                    if opp_i.bet_type == opp_j.bet_type and opp_i.selection != opp_j.selection:
                        cov = -np.sqrt(variances[i] * variances[j]) * 0.95
                    else:
                        corr = self._get_fallback_correlation(opp_i.bet_type, opp_j.bet_type)
                        cov = corr * np.sqrt(variances[i] * variances[j])
                else:
                    cov = 0.0

                sigma[i, j] = cov
                sigma[j, i] = cov

        eigenvalues = np.linalg.eigvalsh(sigma)
        if np.min(eigenvalues) < 0:
            sigma += np.eye(n) * (abs(np.min(eigenvalues)) + 1e-6)

        return sigma

    def _solve_cvxpy(
        self,
        opportunities: List[BettingOpportunity],
        covariance_matrix: np.ndarray
    ) -> OptimalPortfolio:
        """Solve using cvxpy with covariance matrix."""
        n = len(opportunities)

        probs = np.array([o.model_prob for o in opportunities])
        net_odds = np.array([o.decimal_odds - 1 for o in opportunities])

        f = cp.Variable(n)

        # Growth objective
        growth_win = cp.sum(cp.multiply(probs, cp.log(1 + cp.multiply(f, net_odds))))
        growth_lose = cp.sum(cp.multiply(1 - probs, cp.log(1 - f)))
        expected_growth = growth_win + growth_lose

        # Risk penalty
        sigma = (covariance_matrix + covariance_matrix.T) / 2 + np.eye(n) * 1e-6
        risk_penalty = self.risk_aversion * cp.quad_form(f, sigma)

        objective = expected_growth - risk_penalty

        constraints = [
            f >= 0,
            f <= self.max_single_bet,
            cp.sum(f) <= self.max_exposure,
            f <= 0.95
        ]

        # Same-game exposure constraint
        game_groups = {}
        for i, opp in enumerate(opportunities):
            if opp.game_id not in game_groups:
                game_groups[opp.game_id] = []
            game_groups[opp.game_id].append(i)

        for game_id, indices in game_groups.items():
            if len(indices) > 1:
                constraints.append(
                    cp.sum([f[i] for i in indices]) <= self.max_single_bet * 1.5
                )

        problem = cp.Problem(cp.Maximize(objective), constraints)

        try:
            problem.solve(solver=cp.ECOS)
        except Exception as e:
            logger.warning(f"ECOS solver failed: {e}, trying SCS")
            try:
                problem.solve(solver=cp.SCS, max_iters=5000)
            except Exception as e2:
                logger.error(f"All solvers failed: {e2}")
                return OptimalPortfolio(solver_status="failed")

        if f.value is None:
            return OptimalPortfolio(solver_status="infeasible")

        allocations = {}
        for i, opp in enumerate(opportunities):
            alloc = max(0.0, float(f.value[i]))
            if alloc > 0.001:
                allocations[opp.opportunity_id] = alloc

        return OptimalPortfolio(
            allocations=allocations,
            expected_growth_rate=float(problem.value) if problem.value else 0.0,
            total_exposure=sum(allocations.values()),
            max_single_bet=max(allocations.values()) if allocations else 0.0,
            solver_status=problem.status
        )

    def _solve_simplified(
        self,
        opportunities: List[BettingOpportunity]
    ) -> OptimalPortfolio:
        """Simplified Kelly when cvxpy unavailable."""
        allocations = {}
        total = 0.0

        for opp in opportunities:
            b = opp.decimal_odds - 1
            p = opp.model_prob
            q = 1 - p

            kelly = (b * p - q) / b
            kelly = kelly / 2  # Half Kelly
            kelly = max(0, min(kelly, self.max_single_bet))

            if kelly > 0.001:
                allocations[opp.opportunity_id] = kelly
                total += kelly

        if total > self.max_exposure:
            scale = self.max_exposure / total
            allocations = {k: v * scale for k, v in allocations.items()}

        return OptimalPortfolio(
            allocations=allocations,
            expected_growth_rate=0.0,
            total_exposure=sum(allocations.values()),
            max_single_bet=max(allocations.values()) if allocations else 0.0,
            solver_status="simplified"
        )

    def get_correlation_report(self) -> str:
        """Generate report on correlation sources used."""
        if not self._correlation_sources:
            return "No correlations computed yet. Run optimize() first."

        report = """
================================================================================
                    CORRELATION SOURCE REPORT
================================================================================

This report shows where each correlation estimate came from.

LEGEND:
- empirical: Computed from historical bet outcome data (PREFERRED)
- fallback: Using conservative default estimate (NEEDS MORE DATA)
- rule: Logical relationship (e.g., opposite sides of same market)
- zero: Assumed independent (different games/teams)

"""
        empirical = [s for s in self._correlation_sources if s.source == 'empirical']
        fallback = [s for s in self._correlation_sources if s.source == 'fallback']

        report += f"SUMMARY\n"
        report += f"-------\n"
        report += f"Empirical correlations: {len(empirical)}\n"
        report += f"Fallback correlations: {len(fallback)}\n"
        report += f"Confidence: {len(empirical) / max(1, len(self._correlation_sources)):.1%}\n\n"

        if empirical:
            report += "EMPIRICAL (Good - based on data)\n"
            report += "-" * 40 + "\n"
            for s in empirical:
                report += f"  {s.bet_type_a} <-> {s.bet_type_b}\n"
                report += f"    ρ = {s.correlation:.3f}, n = {s.sample_size}, confidence = {s.confidence:.2f}\n"
                if s.warning:
                    report += f"    ⚠ {s.warning}\n"
            report += "\n"

        if fallback:
            report += "FALLBACK (Needs more data)\n"
            report += "-" * 40 + "\n"
            for s in fallback:
                report += f"  {s.bet_type_a} <-> {s.bet_type_b}\n"
                report += f"    ρ = {s.correlation:.3f} (default), n = {s.sample_size}\n"
                if s.warning:
                    report += f"    ⚠ {s.warning}\n"
            report += "\n"

        report += "================================================================================\n"
        return report

    def save_estimator(self, path: str):
        """Save correlation estimator for reuse."""
        with open(path, 'wb') as f:
            pickle.dump(self.correlation_estimator, f)
        logger.info(f"Correlation estimator saved to {path}")

    def load_estimator(self, path: str):
        """Load pre-trained correlation estimator."""
        with open(path, 'rb') as f:
            self.correlation_estimator = pickle.load(f)
        logger.info(f"Correlation estimator loaded from {path}")


# =============================================================================
# HELPER: Build correlation estimator from historical data
# =============================================================================

def build_correlation_estimator_from_history(
    historical_outcomes: List[Dict],
    min_samples: int = 50
) -> EmpiricalCorrelationEstimator:
    """
    Build correlation estimator from historical bet outcomes.

    Args:
        historical_outcomes: List of dicts with format:
            {
                'game_id': 'NYY_BOS_20240701',
                'outcomes': {
                    'moneyline_home': True,
                    'moneyline_away': False,
                    'total_over': True,
                    'total_under': False,
                    'spread_home': True,
                    ...
                },
                'date': datetime(2024, 7, 1)
            }
        min_samples: Minimum samples for reliable correlation

    Returns:
        Trained EmpiricalCorrelationEstimator
    """
    estimator = EmpiricalCorrelationEstimator(min_samples_for_estimate=min_samples)

    for game in historical_outcomes:
        estimator.record_game_outcomes(
            game_id=game['game_id'],
            outcomes=game['outcomes'],
            game_date=game.get('date')
        )

    logger.info(f"Built correlation estimator from {len(historical_outcomes)} games")
    return estimator
