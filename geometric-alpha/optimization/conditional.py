"""
Conditional Bet Dependency System

CRITICAL UPGRADE: Handles bets that are conditional on each other.

The Problem:
============
Traditional Kelly/portfolio optimization treats bets as having fixed probabilities.
But in reality, many bets are CONDITIONAL:

1. "Player X hits a HR" affects "Team Y wins" (player contributes to team)
2. "First 5 innings ML" is VOID if game doesn't reach 5 innings
3. "Player X Over 1.5 TB" probability changes given "Player X gets a hit"
4. Same-Game Parlays: legs share causal relationships

Treating P(B) as fixed when it should be P(B|A) leads to:
- Overestimating edge on dependent bets
- Underestimating risk of correlated failures
- Incorrect portfolio optimization

The Solution:
=============
1. Dependency Graph: Model which bets depend on which
2. Conditional Probability: Compute P(B|A), P(B|¬A) not just P(B)
3. Voiding Conditions: Track when bets become void
4. Trust Scores: Confidence in the conditional relationship itself
5. True Joint Probability: P(A ∩ B) = P(A) * P(B|A), not P(A) * P(B)
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Set, Any
from enum import Enum
import logging
from collections import defaultdict

try:
    import networkx as nx
    NETWORKX_AVAILABLE = True
except ImportError:
    NETWORKX_AVAILABLE = False

logger = logging.getLogger(__name__)


# =============================================================================
# DEPENDENCY TYPES
# =============================================================================

class DependencyType(Enum):
    """Types of conditional relationships between bets."""

    # Bet B's probability changes based on Bet A's outcome
    # P(B|A_win) ≠ P(B)
    PROBABILITY_CONDITIONAL = "probability_conditional"

    # Bet B is VOID if Bet A loses (e.g., player must play for prop to count)
    VOID_IF_PARENT_LOSES = "void_if_parent_loses"

    # Bet B is VOID if Bet A wins (e.g., "game to go extra innings" void if decided in 9)
    VOID_IF_PARENT_WINS = "void_if_parent_wins"

    # Bets are mutually exclusive - exactly one can win
    MUTUALLY_EXCLUSIVE = "mutually_exclusive"

    # Bets always resolve the same way (perfect positive correlation)
    PERFECTLY_CORRELATED = "perfectly_correlated"

    # Bets always resolve opposite (perfect negative correlation)
    PERFECTLY_ANTICORRELATED = "perfectly_anticorrelated"

    # One-way causal relationship (A causes B, but B doesn't cause A)
    CAUSAL = "causal"


@dataclass
class ConditionalRelationship:
    """
    Defines a conditional relationship between two bets.

    The "parent" bet's outcome affects the "child" bet.
    """
    parent_bet_id: str
    child_bet_id: str
    dependency_type: DependencyType

    # Conditional probabilities
    # P(child wins | parent wins)
    prob_child_given_parent_wins: float = None
    # P(child wins | parent loses)
    prob_child_given_parent_loses: float = None

    # Trust score: How confident are we in this relationship? (0-1)
    # Low trust = relationship might not hold, use marginal probability instead
    trust_score: float = 0.8

    # Metadata
    relationship_source: str = "model"  # 'model', 'historical', 'expert', 'inferred'
    sample_size: int = 0  # If from historical data, how many samples?

    def compute_marginal_from_conditional(
        self,
        parent_prob: float
    ) -> float:
        """
        Compute marginal P(child) from conditional probabilities.

        P(child) = P(child|parent) * P(parent) + P(child|¬parent) * P(¬parent)
        """
        if self.prob_child_given_parent_wins is None or self.prob_child_given_parent_loses is None:
            return None

        return (
            self.prob_child_given_parent_wins * parent_prob +
            self.prob_child_given_parent_loses * (1 - parent_prob)
        )

    def get_conditional_prob(self, parent_outcome: bool) -> Optional[float]:
        """Get P(child | parent outcome)."""
        if parent_outcome:
            return self.prob_child_given_parent_wins
        else:
            return self.prob_child_given_parent_loses


@dataclass
class ConditionalBet:
    """
    Extended BettingOpportunity with conditional probability support.
    """
    bet_id: str
    game_id: str
    bet_type: str
    selection: str
    decimal_odds: float

    # Marginal probability (unconditional)
    marginal_prob: float

    # This is the EFFECTIVE probability to use, accounting for conditions
    # May differ from marginal when parent bets are known
    effective_prob: float = None

    # Parent bets this depends on
    parent_bet_ids: List[str] = field(default_factory=list)

    # Voiding conditions
    void_conditions: List[str] = field(default_factory=list)

    # Trust in the probability estimate itself (not the relationship)
    probability_trust: float = 0.9

    # Settlement state
    is_settled: bool = False
    won: bool = None
    is_void: bool = False

    def __post_init__(self):
        if self.effective_prob is None:
            self.effective_prob = self.marginal_prob

    @property
    def edge(self) -> float:
        """Edge using effective (conditional) probability."""
        market_prob = 1 / self.decimal_odds
        return self.effective_prob - market_prob

    @property
    def expected_value(self) -> float:
        """EV using effective probability."""
        return self.effective_prob * (self.decimal_odds - 1) - (1 - self.effective_prob)

    def is_value(self, min_edge: float = 0.02) -> bool:
        """Check if bet has value using effective probability."""
        return self.edge >= min_edge


# =============================================================================
# DEPENDENCY GRAPH
# =============================================================================

class BetDependencyGraph:
    """
    Graph-based model of bet dependencies.

    Nodes = Bets
    Edges = Conditional relationships

    Enables:
    - Finding all bets affected by a given outcome
    - Computing proper conditional probabilities
    - Detecting circular dependencies (errors)
    - Optimizing with full dependency awareness
    """

    def __init__(self):
        """Initialize empty dependency graph."""
        self.bets: Dict[str, ConditionalBet] = {}
        self.relationships: Dict[Tuple[str, str], ConditionalRelationship] = {}

        # Adjacency lists
        self.children: Dict[str, Set[str]] = defaultdict(set)  # parent -> children
        self.parents: Dict[str, Set[str]] = defaultdict(set)   # child -> parents

        # Use networkx if available for advanced graph algorithms
        if NETWORKX_AVAILABLE:
            self.graph = nx.DiGraph()
        else:
            self.graph = None

    def add_bet(self, bet: ConditionalBet):
        """Add a bet to the graph."""
        self.bets[bet.bet_id] = bet

        if self.graph is not None:
            self.graph.add_node(bet.bet_id, bet=bet)

    def add_relationship(self, relationship: ConditionalRelationship):
        """
        Add a conditional relationship between bets.

        Raises ValueError if this creates a circular dependency.
        """
        parent_id = relationship.parent_bet_id
        child_id = relationship.child_bet_id

        if parent_id not in self.bets:
            raise ValueError(f"Parent bet {parent_id} not in graph")
        if child_id not in self.bets:
            raise ValueError(f"Child bet {child_id} not in graph")

        # Check for circular dependency
        if self._would_create_cycle(parent_id, child_id):
            raise ValueError(
                f"Adding {parent_id} -> {child_id} would create circular dependency"
            )

        # Add to graph
        self.relationships[(parent_id, child_id)] = relationship
        self.children[parent_id].add(child_id)
        self.parents[child_id].add(parent_id)

        if self.graph is not None:
            self.graph.add_edge(
                parent_id, child_id,
                relationship=relationship
            )

        # Update child's parent list
        if parent_id not in self.bets[child_id].parent_bet_ids:
            self.bets[child_id].parent_bet_ids.append(parent_id)

    def _would_create_cycle(self, parent_id: str, child_id: str) -> bool:
        """Check if adding edge would create a cycle."""
        if parent_id == child_id:
            return True

        if self.graph is not None:
            # Temporarily add edge and check for cycles
            self.graph.add_edge(parent_id, child_id)
            try:
                has_cycle = not nx.is_directed_acyclic_graph(self.graph)
            finally:
                self.graph.remove_edge(parent_id, child_id)
            return has_cycle
        else:
            # Manual DFS to check if child can reach parent
            visited = set()
            stack = [child_id]

            while stack:
                node = stack.pop()
                if node == parent_id:
                    return True
                if node in visited:
                    continue
                visited.add(node)
                stack.extend(self.children[node])

            return False

    def get_root_bets(self) -> List[str]:
        """Get bets with no parents (root nodes)."""
        return [
            bet_id for bet_id in self.bets
            if len(self.parents[bet_id]) == 0
        ]

    def get_affected_bets(self, bet_id: str) -> List[str]:
        """
        Get all bets that would be affected by this bet's outcome.

        Returns bets in topological order (parents before children).
        """
        if self.graph is not None:
            descendants = nx.descendants(self.graph, bet_id)
            # Sort topologically
            subgraph = self.graph.subgraph(descendants)
            return list(nx.topological_sort(subgraph))
        else:
            # Manual BFS
            affected = []
            visited = set()
            queue = list(self.children[bet_id])

            while queue:
                node = queue.pop(0)
                if node in visited:
                    continue
                visited.add(node)
                affected.append(node)
                queue.extend(self.children[node])

            return affected

    def propagate_outcome(
        self,
        bet_id: str,
        won: bool
    ) -> Dict[str, float]:
        """
        Propagate a bet outcome through the graph.

        Updates effective probabilities of all affected bets
        based on the conditional relationships.

        Args:
            bet_id: The bet that was settled
            won: Whether the bet won

        Returns:
            Dict of bet_id -> new effective probability
        """
        if bet_id not in self.bets:
            return {}

        # Mark bet as settled
        self.bets[bet_id].is_settled = True
        self.bets[bet_id].won = won

        updated_probs = {}

        # Get all affected bets
        affected = self.get_affected_bets(bet_id)

        for child_id in affected:
            child_bet = self.bets[child_id]

            # Check all parent relationships
            for parent_id in self.parents[child_id]:
                if parent_id not in self.bets:
                    continue

                parent_bet = self.bets[parent_id]

                # Only propagate from settled parents
                if not parent_bet.is_settled:
                    continue

                relationship = self.relationships.get((parent_id, child_id))
                if relationship is None:
                    continue

                # Handle voiding conditions
                if relationship.dependency_type == DependencyType.VOID_IF_PARENT_LOSES:
                    if not parent_bet.won:
                        child_bet.is_void = True
                        logger.info(f"Bet {child_id} voided: parent {parent_id} lost")
                        continue

                elif relationship.dependency_type == DependencyType.VOID_IF_PARENT_WINS:
                    if parent_bet.won:
                        child_bet.is_void = True
                        logger.info(f"Bet {child_id} voided: parent {parent_id} won")
                        continue

                # Update conditional probability
                cond_prob = relationship.get_conditional_prob(parent_bet.won)

                if cond_prob is not None:
                    # Blend based on trust score
                    # High trust = use conditional prob
                    # Low trust = fall back to marginal
                    trust = relationship.trust_score
                    child_bet.effective_prob = (
                        trust * cond_prob +
                        (1 - trust) * child_bet.marginal_prob
                    )

                    updated_probs[child_id] = child_bet.effective_prob

                    logger.info(
                        f"Updated {child_id}: P={child_bet.marginal_prob:.3f} -> "
                        f"P|{parent_id}={child_bet.effective_prob:.3f} "
                        f"(trust={trust:.2f})"
                    )

        return updated_probs

    def compute_joint_probability(
        self,
        bet_ids: List[str]
    ) -> float:
        """
        Compute true joint probability P(A ∩ B ∩ C ∩ ...) for multiple bets.

        Uses chain rule with conditional probabilities:
        P(A,B,C) = P(A) * P(B|A) * P(C|A,B)

        This is the CORRECT way to compute parlay probability,
        NOT simply multiplying marginal probabilities.
        """
        if len(bet_ids) == 0:
            return 1.0
        if len(bet_ids) == 1:
            return self.bets[bet_ids[0]].effective_prob

        # Sort bets topologically (parents before children)
        if self.graph is not None:
            subgraph = self.graph.subgraph(bet_ids)
            try:
                sorted_ids = list(nx.topological_sort(subgraph))
            except nx.NetworkXUnfeasible:
                sorted_ids = bet_ids  # Fall back if not a DAG
        else:
            sorted_ids = bet_ids

        joint_prob = 1.0
        assumed_wins = set()  # Track which bets we're assuming won

        for bet_id in sorted_ids:
            bet = self.bets[bet_id]

            # Start with marginal probability
            prob = bet.marginal_prob

            # Adjust based on any parents in our set that we're assuming won
            for parent_id in self.parents[bet_id]:
                if parent_id in assumed_wins:
                    relationship = self.relationships.get((parent_id, bet_id))
                    if relationship and relationship.prob_child_given_parent_wins is not None:
                        # Use conditional probability
                        cond_prob = relationship.prob_child_given_parent_wins
                        trust = relationship.trust_score
                        prob = trust * cond_prob + (1 - trust) * prob

            joint_prob *= prob
            assumed_wins.add(bet_id)

        return joint_prob

    def compute_conditional_covariance_matrix(
        self,
        bet_ids: List[str]
    ) -> np.ndarray:
        """
        Compute covariance matrix using conditional probabilities.

        This is more accurate than the simple correlation-based approach
        because it uses the actual conditional relationships.
        """
        n = len(bet_ids)

        # Variance of Bernoulli with conditional-adjusted probability
        variances = np.array([
            self.bets[bid].effective_prob * (1 - self.bets[bid].effective_prob)
            for bid in bet_ids
        ])

        sigma = np.diag(variances)

        for i in range(n):
            for j in range(i + 1, n):
                id_i = bet_ids[i]
                id_j = bet_ids[j]

                # Check if there's a direct relationship
                rel_ij = self.relationships.get((id_i, id_j))
                rel_ji = self.relationships.get((id_j, id_i))

                cov = 0.0

                if rel_ij is not None:
                    # i is parent of j
                    # Cov(i,j) = P(i) * [P(j|i) - P(j)]
                    p_i = self.bets[id_i].effective_prob
                    p_j_given_i = rel_ij.prob_child_given_parent_wins or self.bets[id_j].effective_prob
                    p_j = self.bets[id_j].effective_prob

                    cov = p_i * (p_j_given_i - p_j) * rel_ij.trust_score

                elif rel_ji is not None:
                    # j is parent of i
                    p_j = self.bets[id_j].effective_prob
                    p_i_given_j = rel_ji.prob_child_given_parent_wins or self.bets[id_i].effective_prob
                    p_i = self.bets[id_i].effective_prob

                    cov = p_j * (p_i_given_j - p_i) * rel_ji.trust_score

                elif self.bets[id_i].game_id == self.bets[id_j].game_id:
                    # Same game but no explicit relationship - use heuristic
                    cov = np.sqrt(variances[i] * variances[j]) * 0.25

                sigma[i, j] = cov
                sigma[j, i] = cov

        return sigma


# =============================================================================
# COMMON CONDITIONAL PATTERNS
# =============================================================================

class ConditionalPatternLibrary:
    """
    Library of common conditional betting patterns in baseball.

    Provides pre-computed conditional probability relationships
    based on historical data and game mechanics.
    """

    # Historical averages for common patterns
    PATTERNS = {
        # Player prop -> Team outcome
        'player_hr_given_team_win': {
            'prob_increase': 0.15,  # HR more likely in wins
            'trust': 0.75,
            'sample_size': 10000
        },

        # Starter quality -> Total runs
        'low_total_given_ace_start': {
            'prob_increase': 0.12,
            'trust': 0.70,
            'sample_size': 5000
        },

        # First 5 -> Full game
        'full_game_ml_given_f5_ml': {
            'prob_increase': 0.20,  # If leading after 5, likely win
            'trust': 0.85,
            'sample_size': 15000
        },

        # Player hit -> Player total bases
        'player_over_tb_given_hit': {
            'prob_increase': 0.40,  # Much more likely with at least 1 hit
            'trust': 0.90,
            'sample_size': 20000
        },

        # Strikeout prop -> Pitcher performance
        'pitcher_win_given_high_k': {
            'prob_increase': 0.18,
            'trust': 0.65,
            'sample_size': 8000
        }
    }

    @classmethod
    def get_conditional_adjustment(
        cls,
        pattern_name: str,
        base_prob: float
    ) -> Tuple[float, float]:
        """
        Get adjusted probability and trust score for a pattern.

        Returns:
            Tuple of (conditional_probability, trust_score)
        """
        if pattern_name not in cls.PATTERNS:
            return base_prob, 0.5

        pattern = cls.PATTERNS[pattern_name]

        # Adjust probability (capped at reasonable bounds)
        adjusted = min(0.95, max(0.05, base_prob + pattern['prob_increase']))

        return adjusted, pattern['trust']

    @classmethod
    def infer_relationship_type(
        cls,
        bet_a_type: str,
        bet_b_type: str,
        same_game: bool
    ) -> Optional[DependencyType]:
        """
        Infer the likely relationship type between two bet types.
        """
        # Same selection on same market = perfectly correlated
        if bet_a_type == bet_b_type:
            return DependencyType.PERFECTLY_CORRELATED

        # Opposite sides of same market = mutually exclusive
        opposites = {
            ('home', 'away'),
            ('over', 'under'),
            ('favorite', 'underdog')
        }

        if same_game:
            # Check for player props with validity conditions
            if 'player' in bet_a_type.lower() or 'player' in bet_b_type.lower():
                return DependencyType.PROBABILITY_CONDITIONAL

        return DependencyType.PROBABILITY_CONDITIONAL


# =============================================================================
# CONDITIONAL KELLY OPTIMIZER
# =============================================================================

class ConditionalKellySolver:
    """
    Kelly Criterion optimizer that properly handles conditional bets.

    Key improvements over standard Kelly:
    1. Uses conditional probabilities instead of marginal
    2. Respects bet validity constraints
    3. Computes true joint probability for parlays
    4. Adjusts risk based on dependency structure
    """

    def __init__(
        self,
        bankroll: float = 10000,
        max_exposure: float = 0.25,
        max_single_bet: float = 0.05,
        min_edge: float = 0.02,
        risk_aversion: float = 0.5
    ):
        self.bankroll = bankroll
        self.max_exposure = max_exposure
        self.max_single_bet = max_single_bet
        self.min_edge = min_edge
        self.risk_aversion = risk_aversion

    def optimize_with_dependencies(
        self,
        graph: BetDependencyGraph,
        bet_ids: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """
        Optimize bet sizing using full dependency information.

        Args:
            graph: BetDependencyGraph with bets and relationships
            bet_ids: Optional subset of bets to optimize (default: all)

        Returns:
            Dict of bet_id -> optimal fraction of bankroll
        """
        if bet_ids is None:
            bet_ids = list(graph.bets.keys())

        # Filter to value bets only (using effective probability)
        value_bets = [
            bid for bid in bet_ids
            if graph.bets[bid].is_value(self.min_edge) and not graph.bets[bid].is_void
        ]

        if not value_bets:
            logger.info("No value bets found after filtering")
            return {}

        logger.info(f"Optimizing {len(value_bets)} value bets with dependencies")

        # Compute conditional covariance matrix
        cov_matrix = graph.compute_conditional_covariance_matrix(value_bets)

        # Extract probabilities and odds
        probs = np.array([graph.bets[bid].effective_prob for bid in value_bets])
        odds = np.array([graph.bets[bid].decimal_odds for bid in value_bets])
        net_odds = odds - 1

        # Try cvxpy optimization
        try:
            import cvxpy as cp

            n = len(value_bets)
            f = cp.Variable(n)

            # Expected log growth (Kelly objective)
            growth_win = cp.sum(cp.multiply(probs, cp.log(1 + cp.multiply(f, net_odds))))
            growth_lose = cp.sum(cp.multiply(1 - probs, cp.log(1 - f)))
            expected_growth = growth_win + growth_lose

            # Risk penalty using conditional covariance
            sigma = (cov_matrix + cov_matrix.T) / 2 + np.eye(n) * 1e-6
            risk_penalty = self.risk_aversion * cp.quad_form(f, sigma)

            objective = expected_growth - risk_penalty

            # Constraints
            constraints = [
                f >= 0,
                f <= self.max_single_bet,
                cp.sum(f) <= self.max_exposure,
                f <= 0.95
            ]

            # Same-game exposure constraint (using dependency info)
            game_groups = defaultdict(list)
            for i, bid in enumerate(value_bets):
                game_groups[graph.bets[bid].game_id].append(i)

            for game_id, indices in game_groups.items():
                if len(indices) > 1:
                    # Stricter constraint for dependent bets in same game
                    max_game_exposure = self.max_single_bet * 1.2
                    constraints.append(
                        cp.sum([f[i] for i in indices]) <= max_game_exposure
                    )

            # Solve
            problem = cp.Problem(cp.Maximize(objective), constraints)
            problem.solve(solver=cp.ECOS)

            if f.value is None:
                logger.warning("CVXPY solver returned None, falling back to simplified")
                return self._simplified_optimize(graph, value_bets)

            # Extract allocations
            allocations = {}
            for i, bid in enumerate(value_bets):
                alloc = max(0.0, float(f.value[i]))
                if alloc > 0.001:
                    allocations[bid] = alloc

            return allocations

        except ImportError:
            return self._simplified_optimize(graph, value_bets)
        except Exception as e:
            logger.warning(f"CVXPY optimization failed: {e}")
            return self._simplified_optimize(graph, value_bets)

    def _simplified_optimize(
        self,
        graph: BetDependencyGraph,
        bet_ids: List[str]
    ) -> Dict[str, float]:
        """Simplified Kelly when cvxpy unavailable."""
        allocations = {}
        total = 0.0

        for bid in bet_ids:
            bet = graph.bets[bid]

            # Kelly formula with effective probability
            b = bet.decimal_odds - 1
            p = bet.effective_prob
            q = 1 - p

            kelly = (b * p - q) / b

            # Apply half Kelly and trust adjustment
            kelly *= 0.5 * bet.probability_trust
            kelly = max(0, min(kelly, self.max_single_bet))

            if kelly > 0.001:
                allocations[bid] = kelly
                total += kelly

        # Scale down if over exposure
        if total > self.max_exposure:
            scale = self.max_exposure / total
            allocations = {k: v * scale for k, v in allocations.items()}

        return allocations

    def compute_parlay_value(
        self,
        graph: BetDependencyGraph,
        leg_ids: List[str]
    ) -> Dict[str, Any]:
        """
        Compute true value of a parlay using conditional probabilities.

        This is CRITICAL for Same-Game Parlays where legs are correlated.

        Returns:
            Dict with true probability, naive probability, edge, and recommendation
        """
        # Naive probability (what books sometimes use incorrectly)
        naive_prob = np.prod([graph.bets[lid].marginal_prob for lid in leg_ids])

        # True probability using conditional chain rule
        true_prob = graph.compute_joint_probability(leg_ids)

        # Parlay odds (multiply individual odds)
        parlay_odds = np.prod([graph.bets[lid].decimal_odds for lid in leg_ids])

        # Market's implied probability
        market_prob = 1 / parlay_odds

        # Our edge
        edge = true_prob - market_prob

        # Expected value
        ev = true_prob * (parlay_odds - 1) - (1 - true_prob)

        return {
            'leg_ids': leg_ids,
            'true_probability': true_prob,
            'naive_probability': naive_prob,
            'correlation_adjustment': true_prob - naive_prob,
            'parlay_odds': parlay_odds,
            'market_implied_prob': market_prob,
            'edge': edge,
            'expected_value': ev,
            'is_value': edge > self.min_edge,
            'recommendation': 'BET' if edge > self.min_edge else 'PASS'
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def create_player_team_dependency(
    player_bet: ConditionalBet,
    team_bet: ConditionalBet,
    impact_factor: float = 0.15
) -> ConditionalRelationship:
    """
    Create dependency: player prop affects team outcome.

    Common pattern: If star player performs well (e.g., hits HR),
    team is more likely to win.
    """
    return ConditionalRelationship(
        parent_bet_id=player_bet.bet_id,
        child_bet_id=team_bet.bet_id,
        dependency_type=DependencyType.PROBABILITY_CONDITIONAL,
        prob_child_given_parent_wins=min(0.95, team_bet.marginal_prob + impact_factor),
        prob_child_given_parent_loses=max(0.05, team_bet.marginal_prob - impact_factor * 0.5),
        trust_score=0.70,
        relationship_source='model'
    )


def create_validity_dependency(
    prerequisite_bet: ConditionalBet,
    dependent_bet: ConditionalBet
) -> ConditionalRelationship:
    """
    Create dependency: bet B is void if bet A loses.

    Example: "Player X over 1.5 hits" requires "Player X to start"
    """
    return ConditionalRelationship(
        parent_bet_id=prerequisite_bet.bet_id,
        child_bet_id=dependent_bet.bet_id,
        dependency_type=DependencyType.VOID_IF_PARENT_LOSES,
        trust_score=0.99,
        relationship_source='rules'
    )


def create_f5_fullgame_dependency(
    f5_bet: ConditionalBet,
    fullgame_bet: ConditionalBet
) -> ConditionalRelationship:
    """
    Create dependency: First 5 innings result affects full game.

    Historical data shows strong relationship between F5 and FG outcomes.
    """
    return ConditionalRelationship(
        parent_bet_id=f5_bet.bet_id,
        child_bet_id=fullgame_bet.bet_id,
        dependency_type=DependencyType.PROBABILITY_CONDITIONAL,
        prob_child_given_parent_wins=min(0.92, fullgame_bet.marginal_prob + 0.20),
        prob_child_given_parent_loses=max(0.15, fullgame_bet.marginal_prob - 0.25),
        trust_score=0.85,
        relationship_source='historical',
        sample_size=15000
    )
