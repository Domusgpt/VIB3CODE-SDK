"""
Portfolio Management and Bankroll Tracking

Tools for managing betting portfolios and tracking bankroll
over time with proper risk management.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging
from pathlib import Path
import json

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class BetRecord:
    """Record of a placed bet."""

    bet_id: str
    timestamp: datetime
    game_id: str

    # Bet details
    bet_type: str
    selection: str
    stake: float
    odds: float  # Decimal odds

    # Model info
    model_prob: float
    market_prob: float
    edge: float

    # Outcome (filled after settlement)
    result: Optional[str] = None  # 'win', 'loss', 'push'
    pnl: Optional[float] = None
    closing_odds: Optional[float] = None  # For CLV calculation

    @property
    def potential_win(self) -> float:
        """Calculate potential win amount."""
        return self.stake * (self.odds - 1)

    @property
    def clv(self) -> float:
        """Calculate Closing Line Value."""
        if self.closing_odds is None:
            return 0.0

        # Convert odds to implied prob
        placed_prob = 1 / self.odds
        closing_prob = 1 / self.closing_odds

        return closing_prob - placed_prob

    def settle(self, won: bool, push: bool = False) -> float:
        """
        Settle the bet and return P&L.

        Args:
            won: Whether the bet won
            push: Whether the bet pushed (refunded)

        Returns:
            Profit/Loss amount
        """
        if push:
            self.result = 'push'
            self.pnl = 0.0
        elif won:
            self.result = 'win'
            self.pnl = self.potential_win
        else:
            self.result = 'loss'
            self.pnl = -self.stake

        return self.pnl


@dataclass
class BankrollSnapshot:
    """Point-in-time snapshot of bankroll state."""

    timestamp: datetime
    bankroll: float
    pending_exposure: float  # Outstanding bets
    available: float  # Bankroll - pending

    # Performance metrics
    total_wagered: float
    total_won: float
    total_lost: float
    net_profit: float
    roi: float  # Net profit / total wagered

    # Additional metrics
    win_rate: float
    avg_clv: float
    n_bets: int


class BankrollTracker:
    """
    Tracks bankroll changes and betting performance over time.

    Provides metrics for:
    - P&L tracking
    - ROI calculation
    - CLV analysis
    - Risk of ruin estimation
    """

    def __init__(self, initial_bankroll: float = None):
        """
        Initialize bankroll tracker.

        Args:
            initial_bankroll: Starting bankroll amount
        """
        self.initial_bankroll = initial_bankroll or CONFIG.optimization.initial_bankroll
        self.current_bankroll = self.initial_bankroll

        self.bets: List[BetRecord] = []
        self.snapshots: List[BankrollSnapshot] = []

        # Running totals
        self.total_wagered = 0.0
        self.total_won = 0.0
        self.total_lost = 0.0
        self.pending_bets: Dict[str, BetRecord] = {}

    def place_bet(self, bet: BetRecord) -> bool:
        """
        Record a placed bet.

        Args:
            bet: BetRecord to place

        Returns:
            True if bet was placed successfully
        """
        available = self.current_bankroll - sum(
            b.stake for b in self.pending_bets.values()
        )

        if bet.stake > available:
            logger.warning(
                f"Insufficient funds: {bet.stake:.2f} > {available:.2f}"
            )
            return False

        self.bets.append(bet)
        self.pending_bets[bet.bet_id] = bet
        self.total_wagered += bet.stake

        logger.info(
            f"Bet placed: {bet.bet_id} | {bet.selection} @ {bet.odds:.2f} | "
            f"Stake: ${bet.stake:.2f}"
        )

        return True

    def settle_bet(
        self,
        bet_id: str,
        won: bool,
        push: bool = False,
        closing_odds: Optional[float] = None
    ) -> float:
        """
        Settle an outstanding bet.

        Args:
            bet_id: ID of bet to settle
            won: Whether bet won
            push: Whether bet pushed
            closing_odds: Closing line odds (for CLV)

        Returns:
            P&L from the bet
        """
        if bet_id not in self.pending_bets:
            logger.warning(f"Bet {bet_id} not found in pending")
            return 0.0

        bet = self.pending_bets.pop(bet_id)

        if closing_odds:
            bet.closing_odds = closing_odds

        pnl = bet.settle(won, push)

        # Update bankroll
        if won:
            self.total_won += bet.stake + pnl
            self.current_bankroll += pnl
        elif not push:
            self.total_lost += bet.stake
            self.current_bankroll -= bet.stake

        logger.info(
            f"Bet settled: {bet_id} | {bet.result} | "
            f"P&L: ${pnl:+.2f} | Bankroll: ${self.current_bankroll:.2f}"
        )

        return pnl

    def take_snapshot(self) -> BankrollSnapshot:
        """Take a snapshot of current bankroll state."""
        settled_bets = [b for b in self.bets if b.result is not None]

        win_count = sum(1 for b in settled_bets if b.result == 'win')
        total_settled = len(settled_bets)

        clv_values = [b.clv for b in settled_bets if b.closing_odds is not None]

        pending_exposure = sum(b.stake for b in self.pending_bets.values())

        snapshot = BankrollSnapshot(
            timestamp=datetime.now(),
            bankroll=self.current_bankroll,
            pending_exposure=pending_exposure,
            available=self.current_bankroll - pending_exposure,
            total_wagered=self.total_wagered,
            total_won=self.total_won,
            total_lost=self.total_lost,
            net_profit=self.current_bankroll - self.initial_bankroll,
            roi=(self.current_bankroll - self.initial_bankroll) / self.total_wagered
                if self.total_wagered > 0 else 0.0,
            win_rate=win_count / total_settled if total_settled > 0 else 0.0,
            avg_clv=np.mean(clv_values) if clv_values else 0.0,
            n_bets=len(self.bets)
        )

        self.snapshots.append(snapshot)
        return snapshot

    def get_performance_summary(self) -> Dict[str, Any]:
        """Generate comprehensive performance summary."""
        settled_bets = [b for b in self.bets if b.result is not None]

        if not settled_bets:
            return {'status': 'no_settled_bets'}

        wins = [b for b in settled_bets if b.result == 'win']
        losses = [b for b in settled_bets if b.result == 'loss']

        # Calculate metrics
        total_pnl = sum(b.pnl for b in settled_bets)
        avg_stake = np.mean([b.stake for b in settled_bets])
        avg_odds = np.mean([b.odds for b in settled_bets])

        # CLV analysis
        clv_bets = [b for b in settled_bets if b.closing_odds is not None]
        if clv_bets:
            avg_clv = np.mean([b.clv for b in clv_bets])
            positive_clv_rate = sum(1 for b in clv_bets if b.clv > 0) / len(clv_bets)
        else:
            avg_clv = 0.0
            positive_clv_rate = 0.0

        # By bet type
        by_type = {}
        for bet_type in set(b.bet_type for b in settled_bets):
            type_bets = [b for b in settled_bets if b.bet_type == bet_type]
            type_wins = sum(1 for b in type_bets if b.result == 'win')
            type_pnl = sum(b.pnl for b in type_bets)
            by_type[bet_type] = {
                'n_bets': len(type_bets),
                'win_rate': type_wins / len(type_bets),
                'pnl': type_pnl
            }

        return {
            'total_bets': len(settled_bets),
            'wins': len(wins),
            'losses': len(losses),
            'win_rate': len(wins) / len(settled_bets),
            'total_pnl': total_pnl,
            'roi': total_pnl / self.total_wagered if self.total_wagered > 0 else 0,
            'avg_stake': avg_stake,
            'avg_odds': avg_odds,
            'avg_clv': avg_clv,
            'positive_clv_rate': positive_clv_rate,
            'current_bankroll': self.current_bankroll,
            'peak_bankroll': max(s.bankroll for s in self.snapshots)
                            if self.snapshots else self.current_bankroll,
            'max_drawdown': self._calculate_max_drawdown(),
            'by_bet_type': by_type
        }

    def _calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown from peak."""
        if not self.snapshots:
            return 0.0

        peak = self.initial_bankroll
        max_dd = 0.0

        for snapshot in self.snapshots:
            peak = max(peak, snapshot.bankroll)
            drawdown = (peak - snapshot.bankroll) / peak
            max_dd = max(max_dd, drawdown)

        return max_dd

    def estimate_risk_of_ruin(
        self,
        target_ruin: float = 0.0,
        n_simulations: int = 1000
    ) -> float:
        """
        Estimate probability of reaching ruin.

        Uses Monte Carlo simulation based on historical bet performance.

        Args:
            target_ruin: Bankroll level considered "ruin" (default 0)
            n_simulations: Number of simulations to run

        Returns:
            Estimated probability of ruin
        """
        settled_bets = [b for b in self.bets if b.result is not None]

        if len(settled_bets) < 20:
            logger.warning("Insufficient history for RoR estimation")
            return 0.5  # Unknown

        # Extract bet outcomes as returns
        returns = []
        for bet in settled_bets:
            if bet.result == 'win':
                returns.append(bet.odds - 1)  # Net win per unit
            else:
                returns.append(-1)  # Net loss per unit

        returns = np.array(returns)

        # Average stake as fraction of bankroll
        avg_stake_frac = np.mean([b.stake for b in settled_bets]) / self.initial_bankroll

        ruin_count = 0

        for _ in range(n_simulations):
            bankroll = self.current_bankroll
            n_future_bets = 100  # Simulate 100 more bets

            for _ in range(n_future_bets):
                # Random outcome from historical distribution
                outcome = np.random.choice(returns)
                stake = bankroll * avg_stake_frac

                bankroll += stake * outcome

                if bankroll <= target_ruin:
                    ruin_count += 1
                    break

        return ruin_count / n_simulations

    def export_to_dataframe(self) -> pd.DataFrame:
        """Export bet history to DataFrame."""
        records = []

        for bet in self.bets:
            records.append({
                'bet_id': bet.bet_id,
                'timestamp': bet.timestamp,
                'game_id': bet.game_id,
                'bet_type': bet.bet_type,
                'selection': bet.selection,
                'stake': bet.stake,
                'odds': bet.odds,
                'model_prob': bet.model_prob,
                'market_prob': bet.market_prob,
                'edge': bet.edge,
                'result': bet.result,
                'pnl': bet.pnl,
                'closing_odds': bet.closing_odds,
                'clv': bet.clv if bet.closing_odds else None
            })

        return pd.DataFrame(records)

    def save(self, path: Path):
        """Save tracker state to disk."""
        data = {
            'initial_bankroll': self.initial_bankroll,
            'current_bankroll': self.current_bankroll,
            'total_wagered': self.total_wagered,
            'total_won': self.total_won,
            'total_lost': self.total_lost,
            'bets': [
                {
                    'bet_id': b.bet_id,
                    'timestamp': b.timestamp.isoformat(),
                    'game_id': b.game_id,
                    'bet_type': b.bet_type,
                    'selection': b.selection,
                    'stake': b.stake,
                    'odds': b.odds,
                    'model_prob': b.model_prob,
                    'market_prob': b.market_prob,
                    'edge': b.edge,
                    'result': b.result,
                    'pnl': b.pnl,
                    'closing_odds': b.closing_odds
                }
                for b in self.bets
            ]
        }

        with open(path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"Tracker saved to {path}")

    def load(self, path: Path):
        """Load tracker state from disk."""
        with open(path) as f:
            data = json.load(f)

        self.initial_bankroll = data['initial_bankroll']
        self.current_bankroll = data['current_bankroll']
        self.total_wagered = data['total_wagered']
        self.total_won = data['total_won']
        self.total_lost = data['total_lost']

        self.bets = []
        for b in data['bets']:
            bet = BetRecord(
                bet_id=b['bet_id'],
                timestamp=datetime.fromisoformat(b['timestamp']),
                game_id=b['game_id'],
                bet_type=b['bet_type'],
                selection=b['selection'],
                stake=b['stake'],
                odds=b['odds'],
                model_prob=b['model_prob'],
                market_prob=b['market_prob'],
                edge=b['edge'],
                result=b.get('result'),
                pnl=b.get('pnl'),
                closing_odds=b.get('closing_odds')
            )
            self.bets.append(bet)

        # Rebuild pending bets
        self.pending_bets = {
            b.bet_id: b for b in self.bets if b.result is None
        }

        logger.info(f"Tracker loaded from {path}")


class PortfolioManager:
    """
    High-level portfolio management combining optimization and tracking.
    """

    def __init__(
        self,
        bankroll: float = None,
        tracker: Optional[BankrollTracker] = None
    ):
        """
        Initialize portfolio manager.

        Args:
            bankroll: Starting bankroll
            tracker: Optional existing tracker
        """
        from .kelly import SimultaneousKellySolver

        self.bankroll = bankroll or CONFIG.optimization.initial_bankroll
        self.tracker = tracker or BankrollTracker(self.bankroll)
        self.solver = SimultaneousKellySolver(bankroll=self.bankroll)

    def process_opportunities(
        self,
        opportunities: List[Any]
    ) -> Dict[str, float]:
        """
        Process betting opportunities and return recommended bets.

        Args:
            opportunities: List of BettingOpportunity objects

        Returns:
            Dict mapping opportunity_id to recommended stake
        """
        # Update solver with current bankroll
        self.solver.bankroll = self.tracker.current_bankroll

        # Get optimal portfolio
        portfolio = self.solver.optimize(opportunities)

        # Convert to dollar amounts
        bets = portfolio.get_bet_amounts(self.tracker.current_bankroll)

        logger.info(f"Portfolio optimization complete: {len(bets)} bets")
        logger.info(portfolio.summary())

        return bets

    def execute_bets(
        self,
        opportunities: List[Any],
        allocations: Dict[str, float]
    ) -> List[str]:
        """
        Execute bets from optimized allocations.

        Args:
            opportunities: Original opportunity list
            allocations: Dict of opportunity_id to stake

        Returns:
            List of placed bet IDs
        """
        placed_ids = []
        opp_map = {o.opportunity_id: o for o in opportunities}

        for opp_id, stake in allocations.items():
            if stake < 1.0:  # Skip tiny bets
                continue

            opp = opp_map.get(opp_id)
            if opp is None:
                continue

            bet = BetRecord(
                bet_id=f"bet_{datetime.now().strftime('%Y%m%d%H%M%S')}_{opp_id[:8]}",
                timestamp=datetime.now(),
                game_id=opp.game_id,
                bet_type=opp.bet_type,
                selection=opp.selection,
                stake=stake,
                odds=opp.decimal_odds,
                model_prob=opp.model_prob,
                market_prob=opp.market_prob,
                edge=opp.edge
            )

            if self.tracker.place_bet(bet):
                placed_ids.append(bet.bet_id)

        return placed_ids
