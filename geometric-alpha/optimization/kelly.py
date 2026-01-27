"""
Simultaneous Kelly Criterion Optimizer

Convex optimization for optimal bet sizing across multiple
concurrent betting opportunities.
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
import logging

try:
    import cvxpy as cp
    CVXPY_AVAILABLE = True
except ImportError:
    CVXPY_AVAILABLE = False

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class BettingOpportunity:
    """Representation of a betting opportunity."""

    opportunity_id: str
    game_id: str

    # Teams
    home_team: str
    away_team: str

    # Bet details
    bet_type: str  # 'moneyline', 'total', 'spread'
    selection: str  # 'home', 'away', 'over', 'under'

    # Odds (decimal format)
    decimal_odds: float

    # Model's probability estimate
    model_prob: float

    # Market implied probability
    market_prob: float

    # Correlation group (for correlated bets)
    correlation_group: Optional[str] = None

    @property
    def american_odds(self) -> float:
        """Convert decimal odds to American format."""
        if self.decimal_odds >= 2.0:
            return (self.decimal_odds - 1) * 100
        else:
            return -100 / (self.decimal_odds - 1)

    @property
    def edge(self) -> float:
        """Calculate edge vs market."""
        return self.model_prob - self.market_prob

    @property
    def expected_value(self) -> float:
        """Calculate expected value per unit wagered."""
        return self.model_prob * (self.decimal_odds - 1) - (1 - self.model_prob)

    def is_value(self, min_edge: float = 0.02) -> bool:
        """Check if opportunity has sufficient edge."""
        return self.edge >= min_edge


@dataclass
class OptimalPortfolio:
    """Result of Kelly optimization."""

    # Bet allocations (as fraction of bankroll)
    allocations: Dict[str, float] = field(default_factory=dict)

    # Portfolio metrics
    expected_growth_rate: float = 0.0
    total_exposure: float = 0.0
    max_single_bet: float = 0.0

    # Solver info
    solver_status: str = ""
    solver_time: float = 0.0

    def get_bet_amounts(self, bankroll: float) -> Dict[str, float]:
        """Convert fractions to dollar amounts."""
        return {k: v * bankroll for k, v in self.allocations.items()}

    def summary(self) -> str:
        """Generate human-readable summary."""
        lines = [
            f"Optimal Portfolio Summary",
            f"========================",
            f"Total Exposure: {self.total_exposure:.1%}",
            f"Max Single Bet: {self.max_single_bet:.1%}",
            f"Expected Growth: {self.expected_growth_rate:.4%}",
            f"Solver Status: {self.solver_status}",
            f"",
            f"Allocations:"
        ]

        for opp_id, frac in sorted(self.allocations.items(), key=lambda x: -x[1]):
            if frac > 0.001:
                lines.append(f"  {opp_id}: {frac:.2%}")

        return "\n".join(lines)


class SimultaneousKellySolver:
    """
    PRODUCTION UPGRADE: Covariance-Aware Kelly Criterion Optimizer.

    CRITICAL FIX: The original implementation used a "diagonal approximation"
    that treated all bets as independent. This is DANGEROUS because:

    1. THE INDEPENDENCE TRAP: Treating "Yankees Moneyline" and "Yankees Team Total"
       as independent events leads to aggressive over-betting on a single game script.

    2. DIAGONAL KELLY FAILURE: Ignoring sibling correlations potentially risks
       10% of bankroll on one outcome without the user realizing it.

    SOLUTION: Explicitly include a COVARIANCE MATRIX (Sigma) in the objective
    function to penalize volatility and force the solver to recognize linked risks.

    New objective: maximize(growth - λ * risk)
    Where risk = f' * Σ * f (portfolio variance using covariance matrix)

    Mathematical formulation:
    max E[log(W)] - λ * Var[log(W)]
    ≈ max Σ p_i * log(1 + f_i * b_i) + (1-p_i) * log(1 - f_i) - λ * f' * Σ * f

    Subject to:
    - Σ f_i ≤ max_exposure
    - f_i ≤ max_single_bet
    - f_i ≥ 0

    Where:
    - Σ (Sigma) = covariance matrix of bet outcomes
    - λ = risk aversion parameter
    """

    def __init__(
        self,
        bankroll: float = None,
        max_exposure: float = None,
        max_single_bet: float = None,
        min_edge: float = None,
        risk_aversion: float = 0.5
    ):
        """
        Initialize Kelly solver with covariance awareness.

        Args:
            bankroll: Total bankroll
            max_exposure: Maximum total exposure (fraction)
            max_single_bet: Maximum single bet (fraction)
            min_edge: Minimum edge to consider betting
            risk_aversion: Lambda parameter for risk penalty (0=ignore risk, 1=very conservative)
        """
        config = CONFIG.optimization

        self.bankroll = bankroll or config.initial_bankroll
        self.max_exposure = max_exposure or config.max_exposure
        self.max_single_bet = max_single_bet or config.max_single_bet
        self.min_edge = min_edge or config.min_edge_threshold
        self.solver = config.solver

        # UPGRADED: Risk aversion parameter for covariance penalty
        self.risk_aversion = risk_aversion

        if not CVXPY_AVAILABLE:
            logger.warning("cvxpy not available. Using simplified Kelly.")

    def optimize(
        self,
        opportunities: List[BettingOpportunity],
        correlation_matrix: Optional[np.ndarray] = None,
        auto_compute_covariance: bool = True
    ) -> OptimalPortfolio:
        """
        UPGRADED: Find optimal bet sizing with covariance-aware risk management.

        Args:
            opportunities: List of betting opportunities
            correlation_matrix: Optional correlation between outcomes
            auto_compute_covariance: If True, automatically compute covariance
                                     from game relationships

        Returns:
            OptimalPortfolio with optimal allocations
        """
        # Filter to value opportunities only
        value_opps = [o for o in opportunities if o.is_value(self.min_edge)]

        if not value_opps:
            logger.info("No value opportunities found")
            return OptimalPortfolio(solver_status="no_value")

        logger.info(f"Optimizing {len(value_opps)} value opportunities")

        # UPGRADED: Auto-compute covariance matrix if not provided
        if correlation_matrix is None and auto_compute_covariance:
            correlation_matrix = self.compute_covariance_matrix(value_opps)
            logger.info("Auto-computed covariance matrix for correlated bets")

        if CVXPY_AVAILABLE:
            return self._solve_cvxpy_with_covariance(value_opps, correlation_matrix)
        else:
            return self._solve_simplified(value_opps)

    def _solve_cvxpy(
        self,
        opportunities: List[BettingOpportunity],
        correlation_matrix: Optional[np.ndarray] = None
    ) -> OptimalPortfolio:
        """Legacy method - redirects to covariance-aware solver."""
        return self._solve_cvxpy_with_covariance(opportunities, correlation_matrix)

    def _solve_cvxpy_with_covariance(
        self,
        opportunities: List[BettingOpportunity],
        covariance_matrix: Optional[np.ndarray] = None
    ) -> OptimalPortfolio:
        """
        UPGRADED: Solve using cvxpy with full covariance matrix.

        Key innovation: The objective function now includes a risk penalty
        term that uses the covariance matrix to dampen stakes on highly
        correlated markets, preventing bankruptcy from single-game exposure.

        Objective: maximize(growth - λ * risk)
        Where: risk = f' * Σ * f (portfolio variance)
        """
        n = len(opportunities)

        # Extract parameters
        probs = np.array([o.model_prob for o in opportunities])
        net_odds = np.array([o.decimal_odds - 1 for o in opportunities])

        # Decision variable: fraction of bankroll for each bet
        f = cp.Variable(n)

        # ============================================================
        # UPGRADED OBJECTIVE: Risk-Adjusted Growth
        # ============================================================
        # Growth component (log utility)
        growth_win = cp.sum(cp.multiply(probs, cp.log(1 + cp.multiply(f, net_odds))))
        growth_lose = cp.sum(cp.multiply(1 - probs, cp.log(1 - f)))
        expected_growth = growth_win + growth_lose

        # UPGRADED: Covariance-based risk penalty
        # Risk = f' * Σ * f (quadratic form)
        if covariance_matrix is not None and self.risk_aversion > 0:
            # Ensure covariance matrix is positive semi-definite
            sigma = np.array(covariance_matrix)

            # Make symmetric and add small regularization for numerical stability
            sigma = (sigma + sigma.T) / 2
            sigma += np.eye(n) * 1e-6

            # Risk penalty: λ * f' * Σ * f
            risk_penalty = self.risk_aversion * cp.quad_form(f, sigma)

            # Combined objective: maximize growth - risk
            objective = expected_growth - risk_penalty

            logger.info(f"Using covariance-aware optimization with λ={self.risk_aversion}")
        else:
            # Fallback to pure growth maximization
            objective = expected_growth

        # ============================================================
        # CONSTRAINTS
        # ============================================================
        constraints = [
            f >= 0,                          # No short positions
            f <= self.max_single_bet,        # Max single bet
            cp.sum(f) <= self.max_exposure,  # Max total exposure
            f <= 0.95                         # Cannot bet more than 95% per bet
        ]

        # UPGRADED: Same-game exposure constraint
        # Identify bets on the same game and limit combined exposure
        game_groups = {}
        for i, opp in enumerate(opportunities):
            if opp.game_id not in game_groups:
                game_groups[opp.game_id] = []
            game_groups[opp.game_id].append(i)

        for game_id, indices in game_groups.items():
            if len(indices) > 1:
                # Limit total exposure on any single game
                # Even with uncorrelated bet types, single-game exposure is risky
                single_game_limit = self.max_single_bet * 1.5
                constraints.append(
                    cp.sum([f[i] for i in indices]) <= single_game_limit
                )
                logger.debug(f"Game {game_id}: limiting combined exposure to {single_game_limit:.1%}")

        # Solve
        problem = cp.Problem(cp.Maximize(objective), constraints)

        try:
            problem.solve(solver=getattr(cp, self.solver, cp.ECOS))
            status = problem.status
        except Exception as e:
            logger.warning(f"Primary solver failed: {e}, trying SCS")
            try:
                problem.solve(solver=cp.SCS, max_iters=5000)
                status = problem.status
            except Exception as e2:
                logger.error(f"All solvers failed: {e2}")
                return OptimalPortfolio(solver_status="failed")

        if f.value is None:
            return OptimalPortfolio(solver_status="infeasible")

        # Extract results
        allocations = {}
        for i, opp in enumerate(opportunities):
            allocation = max(0.0, float(f.value[i]))
            if allocation > 0.001:  # Only include meaningful bets
                allocations[opp.opportunity_id] = allocation

        # Compute portfolio metrics
        total_exposure = sum(allocations.values())
        max_single = max(allocations.values()) if allocations else 0.0
        growth_rate = float(problem.value) if problem.value is not None else 0.0

        return OptimalPortfolio(
            allocations=allocations,
            expected_growth_rate=growth_rate,
            total_exposure=total_exposure,
            max_single_bet=max_single,
            solver_status=status
        )

    def _solve_simplified(
        self,
        opportunities: List[BettingOpportunity]
    ) -> OptimalPortfolio:
        """
        Simplified Kelly without cvxpy.

        Uses independent Kelly for each bet, then scales down
        if total exposure exceeds limit.
        """
        allocations = {}
        total = 0.0

        for opp in opportunities:
            # Independent Kelly formula
            # f* = (bp - q) / b
            # where b = net odds, p = prob of winning, q = 1 - p
            b = opp.decimal_odds - 1
            p = opp.model_prob
            q = 1 - p

            kelly_fraction = (b * p - q) / b

            # Apply half-Kelly for safety
            kelly_fraction = kelly_fraction / 2

            # Apply individual cap
            kelly_fraction = max(0, min(kelly_fraction, self.max_single_bet))

            if kelly_fraction > 0.001:
                allocations[opp.opportunity_id] = kelly_fraction
                total += kelly_fraction

        # Scale down if over exposure limit
        if total > self.max_exposure:
            scale = self.max_exposure / total
            allocations = {k: v * scale for k, v in allocations.items()}
            total = self.max_exposure

        max_single = max(allocations.values()) if allocations else 0.0

        # Approximate growth rate
        growth_rate = 0.0
        for opp in opportunities:
            if opp.opportunity_id in allocations:
                f = allocations[opp.opportunity_id]
                b = opp.decimal_odds - 1
                p = opp.model_prob
                growth_rate += p * np.log(1 + f * b) + (1 - p) * np.log(1 - f)

        return OptimalPortfolio(
            allocations=allocations,
            expected_growth_rate=growth_rate,
            total_exposure=total,
            max_single_bet=max_single,
            solver_status="simplified"
        )

    def compute_correlation_matrix(
        self,
        opportunities: List[BettingOpportunity]
    ) -> np.ndarray:
        """
        Legacy method - redirects to covariance matrix computation.
        """
        return self.compute_covariance_matrix(opportunities)

    def compute_covariance_matrix(
        self,
        opportunities: List[BettingOpportunity]
    ) -> np.ndarray:
        """
        UPGRADED: Compute full COVARIANCE matrix between betting outcomes.

        Critical insight: Correlation alone is insufficient. We need the
        covariance matrix (Σ) that captures both:
        1. The direction of relationship (positive/negative correlation)
        2. The magnitude of variance for each bet

        Same-game bets have HIGH covariance because they share the same
        "game script" - if the Yankees blow out the opponent, BOTH the
        Yankees ML AND the Over hit together.

        Returns:
            Covariance matrix Σ where Σ_ij = Cov(outcome_i, outcome_j)
        """
        n = len(opportunities)

        # Start with variance matrix (diagonal)
        # Variance of a Bernoulli outcome = p * (1-p)
        variances = np.array([
            o.model_prob * (1 - o.model_prob) for o in opportunities
        ])
        sigma = np.diag(variances)

        # Compute off-diagonal covariances
        for i in range(n):
            for j in range(i + 1, n):
                opp_i = opportunities[i]
                opp_j = opportunities[j]

                # Base covariance = 0 for independent bets
                cov = 0.0

                # Same game - CRITICAL for managing single-game exposure
                if opp_i.game_id == opp_j.game_id:
                    # Same market, opposite sides (e.g., Home ML vs Away ML)
                    if opp_i.bet_type == opp_j.bet_type:
                        if opp_i.selection != opp_j.selection:
                            # Perfectly negative correlation (one wins, other loses)
                            # Cov = -sqrt(var_i * var_j)
                            cov = -np.sqrt(variances[i] * variances[j]) * 0.95
                        else:
                            # Same selection (shouldn't happen but handle it)
                            cov = np.sqrt(variances[i] * variances[j]) * 0.95

                    # Different markets, same game (e.g., ML and Total)
                    else:
                        # THE INDEPENDENCE TRAP FIX:
                        # These are NOT independent! Game scripts cause correlation.
                        # High-scoring games often have the favorite winning big.

                        # Estimate correlation based on bet types
                        if opp_i.bet_type == 'moneyline' and opp_j.bet_type == 'total':
                            # Favorite ML often correlates with Over
                            # Underdog ML often correlates with Under
                            if opp_i.model_prob > 0.5:  # Favorite
                                if opp_j.selection == 'Over':
                                    cov = np.sqrt(variances[i] * variances[j]) * 0.35
                                else:  # Under
                                    cov = -np.sqrt(variances[i] * variances[j]) * 0.35
                            else:  # Underdog
                                if opp_j.selection == 'Over':
                                    cov = -np.sqrt(variances[i] * variances[j]) * 0.25
                                else:  # Under
                                    cov = np.sqrt(variances[i] * variances[j]) * 0.25

                        elif opp_i.bet_type == 'total' and opp_j.bet_type == 'moneyline':
                            # Symmetric case
                            if opp_j.model_prob > 0.5:  # Favorite
                                if opp_i.selection == 'Over':
                                    cov = np.sqrt(variances[i] * variances[j]) * 0.35
                                else:
                                    cov = -np.sqrt(variances[i] * variances[j]) * 0.35
                            else:
                                if opp_i.selection == 'Over':
                                    cov = -np.sqrt(variances[i] * variances[j]) * 0.25
                                else:
                                    cov = np.sqrt(variances[i] * variances[j]) * 0.25

                        # Spread and Total
                        elif opp_i.bet_type == 'spread' and opp_j.bet_type == 'total':
                            # Moderate correlation
                            cov = np.sqrt(variances[i] * variances[j]) * 0.2

                        else:
                            # Other same-game combinations - assume moderate correlation
                            cov = np.sqrt(variances[i] * variances[j]) * 0.25

                # Same team, different games (e.g., doubleheader)
                elif opp_i.home_team == opp_j.home_team or opp_i.away_team == opp_j.away_team:
                    # Weak correlation due to team form
                    cov = np.sqrt(variances[i] * variances[j]) * 0.1

                # Different games, different teams - independent
                else:
                    cov = 0.0

                sigma[i, j] = cov
                sigma[j, i] = cov

        # Ensure positive semi-definiteness (numerical stability)
        eigenvalues = np.linalg.eigvalsh(sigma)
        if np.min(eigenvalues) < 0:
            # Add small regularization if needed
            sigma += np.eye(n) * (abs(np.min(eigenvalues)) + 1e-6)

        return sigma


def single_kelly_fraction(
    win_prob: float,
    decimal_odds: float,
    fractional_kelly: float = 0.5
) -> float:
    """
    Calculate single-bet Kelly fraction.

    Args:
        win_prob: Probability of winning
        decimal_odds: Decimal odds
        fractional_kelly: Fraction of full Kelly (default 0.5 = half Kelly)

    Returns:
        Optimal bet fraction
    """
    b = decimal_odds - 1  # Net odds
    p = win_prob
    q = 1 - p

    if b <= 0:
        return 0.0

    full_kelly = (b * p - q) / b

    return max(0, full_kelly * fractional_kelly)


def american_to_decimal(american_odds: float) -> float:
    """Convert American odds to decimal."""
    if american_odds > 0:
        return 1 + american_odds / 100
    else:
        return 1 + 100 / abs(american_odds)


def decimal_to_implied_prob(decimal_odds: float) -> float:
    """Convert decimal odds to implied probability."""
    return 1 / decimal_odds
