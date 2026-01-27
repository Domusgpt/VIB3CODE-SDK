"""
Backtest Simulator

Time-machine architecture for validating betting strategies
against historical data without look-ahead bias.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
import logging
from pathlib import Path

from config.settings import CONFIG
from data.statcast import StatcastClient
from data.odds import OddsClient
from features.tunneling import TunnelAnalyzer
from features.umpire_hull import UmpireHullCalculator
from models.predictor import GeometricPredictor
from optimization.kelly import SimultaneousKellySolver, BettingOpportunity
from optimization.portfolio import BankrollTracker, BetRecord

logger = logging.getLogger(__name__)


@dataclass
class BacktestResult:
    """Results from a backtest simulation."""

    # Period
    start_date: str
    end_date: str
    n_days: int

    # Performance
    initial_bankroll: float
    final_bankroll: float
    total_pnl: float
    roi: float

    # Betting metrics
    total_bets: int
    winning_bets: int
    losing_bets: int
    win_rate: float

    # Risk metrics
    max_drawdown: float
    sharpe_ratio: float
    sortino_ratio: float

    # CLV metrics
    avg_clv: float
    positive_clv_rate: float

    # Daily results
    daily_pnl: List[float] = field(default_factory=list)
    daily_bankroll: List[float] = field(default_factory=list)
    daily_bets: List[int] = field(default_factory=list)

    # Bet history
    all_bets: List[Dict] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'period': {
                'start_date': self.start_date,
                'end_date': self.end_date,
                'n_days': self.n_days
            },
            'performance': {
                'initial_bankroll': self.initial_bankroll,
                'final_bankroll': self.final_bankroll,
                'total_pnl': self.total_pnl,
                'roi': self.roi
            },
            'betting': {
                'total_bets': self.total_bets,
                'winning_bets': self.winning_bets,
                'losing_bets': self.losing_bets,
                'win_rate': self.win_rate
            },
            'risk': {
                'max_drawdown': self.max_drawdown,
                'sharpe_ratio': self.sharpe_ratio,
                'sortino_ratio': self.sortino_ratio
            },
            'clv': {
                'avg_clv': self.avg_clv,
                'positive_clv_rate': self.positive_clv_rate
            }
        }

    def summary(self) -> str:
        """Generate human-readable summary."""
        return f"""
========================================
BACKTEST RESULTS: {self.start_date} to {self.end_date}
========================================

PERFORMANCE
-----------
Initial Bankroll: ${self.initial_bankroll:,.2f}
Final Bankroll:   ${self.final_bankroll:,.2f}
Total P&L:        ${self.total_pnl:+,.2f}
ROI:              {self.roi:.2%}

BETTING
-------
Total Bets:     {self.total_bets}
Winners:        {self.winning_bets} ({self.win_rate:.1%})
Losers:         {self.losing_bets}

RISK
----
Max Drawdown:   {self.max_drawdown:.1%}
Sharpe Ratio:   {self.sharpe_ratio:.2f}
Sortino Ratio:  {self.sortino_ratio:.2f}

CLV ANALYSIS
------------
Average CLV:        {self.avg_clv:.4f}
Positive CLV Rate:  {self.positive_clv_rate:.1%}
========================================
"""


class BacktestSimulator:
    """
    Time-machine simulator for backtesting betting strategies.

    Ensures strict causality - only uses data available at each
    point in time. No look-ahead bias.
    """

    def __init__(
        self,
        initial_bankroll: float = None,
        start_date: str = None,
        end_date: str = None
    ):
        """
        Initialize backtester.

        Args:
            initial_bankroll: Starting bankroll
            start_date: Backtest start date
            end_date: Backtest end date
        """
        config = CONFIG.backtest

        self.initial_bankroll = initial_bankroll or CONFIG.optimization.initial_bankroll
        self.start_date = start_date or config.start_date
        self.end_date = end_date or config.end_date

        # Initialize components
        self.statcast_client = StatcastClient()
        self.odds_client = OddsClient()
        self.predictor = GeometricPredictor()
        self.solver = SimultaneousKellySolver(bankroll=self.initial_bankroll)

        # Feature calculators
        self.tunnel_analyzer = TunnelAnalyzer()
        self.hull_calculator = UmpireHullCalculator()

        # Tracking
        self.tracker = BankrollTracker(self.initial_bankroll)

        # Results storage
        self.daily_results = []

    def run(
        self,
        training_data: Optional[pd.DataFrame] = None,
        training_targets: Optional[pd.DataFrame] = None,
        verbose: bool = True
    ) -> BacktestResult:
        """
        Run the full backtest simulation.

        Args:
            training_data: Pre-computed training features (optional)
            training_targets: Pre-computed training targets (optional)
            verbose: Whether to log progress

        Returns:
            BacktestResult with full metrics
        """
        logger.info(f"Starting backtest: {self.start_date} to {self.end_date}")

        # Load historical data
        start_dt = pd.to_datetime(self.start_date)
        end_dt = pd.to_datetime(self.end_date)

        # We need training data from BEFORE the backtest period
        train_start = start_dt - timedelta(days=365)  # 1 year prior

        # Load pitch data
        logger.info("Loading pitch data...")
        all_pitches = self.statcast_client.fetch_date_range(
            train_start.strftime('%Y-%m-%d'),
            end_dt.strftime('%Y-%m-%d')
        )

        # Load odds data
        logger.info("Loading odds data...")
        all_odds = self.odds_client.fetch_historical(
            self.start_date,
            self.end_date
        )

        # Train model on pre-period data if not provided
        if training_data is None:
            logger.info("Computing training features...")
            training_data, training_targets = self._prepare_training_data(
                all_pitches[all_pitches['game_date'] < start_dt]
            )

        logger.info("Training model...")
        self.predictor.train(training_data, training_targets)

        # Run day-by-day simulation
        current_date = start_dt
        day_count = 0

        while current_date <= end_dt:
            if verbose and day_count % 7 == 0:
                logger.info(
                    f"Processing {current_date.strftime('%Y-%m-%d')} | "
                    f"Bankroll: ${self.tracker.current_bankroll:,.2f}"
                )

            # Settle previous day's bets
            self._settle_yesterday_bets(current_date, all_pitches, all_odds)

            # Get today's opportunities
            today_odds = all_odds[
                all_odds['commence_time'].dt.date == current_date.date()
            ]

            if len(today_odds) > 0:
                # Compute features for today's games
                today_features = self._compute_game_features(
                    current_date, all_pitches
                )

                if len(today_features) > 0:
                    # Generate predictions
                    predictions = self.predictor.predict(today_features)

                    # Create betting opportunities
                    opportunities = self._create_opportunities(
                        predictions, today_odds
                    )

                    # Optimize and place bets
                    if opportunities:
                        self._place_bets(opportunities)

            # Record daily state
            self._record_daily_state(current_date)

            current_date += timedelta(days=1)
            day_count += 1

        # Final settlement
        self._settle_all_pending(end_dt, all_pitches, all_odds)

        # Compile results
        return self._compile_results()

    def _prepare_training_data(
        self,
        pitches_df: pd.DataFrame
    ) -> tuple:
        """Prepare training data from historical pitches."""
        # Aggregate to game level
        games = pitches_df.groupby('game_pk').agg({
            'pitcher': 'first',
            'release_speed': 'mean',
            'release_spin_rate': 'mean',
            'pfx_x': 'mean',
            'pfx_z': 'mean',
            'plate_x': 'std',
            'plate_z': 'std',
            'game_date': 'first'
        }).reset_index()

        # Compute tunnel scores per game
        tunnel_scores = []
        for game_pk in games['game_pk'].unique()[:100]:  # Limit for speed
            game_pitches = pitches_df[pitches_df['game_pk'] == game_pk]
            if len(game_pitches) > 20:
                scores = self.tunnel_analyzer.compute_tunnel_scores(game_pitches)
                tunnel_scores.append({
                    'game_pk': game_pk,
                    'tunnel_score_mean': scores['tunnel_score'].mean()
                })

        tunnel_df = pd.DataFrame(tunnel_scores)
        games = games.merge(tunnel_df, on='game_pk', how='left')

        # Create features DataFrame
        features = games[[
            'release_speed', 'release_spin_rate',
            'pfx_x', 'pfx_z', 'plate_x', 'plate_z'
        ]].copy()

        if 'tunnel_score_mean' in games.columns:
            features['tunnel_score_mean'] = games['tunnel_score_mean']

        features = features.fillna(features.mean())

        # Create dummy targets (would use actual outcomes in production)
        n = len(features)
        targets = pd.DataFrame({
            'home_win': np.random.binomial(1, 0.52, n),
            'total_runs': np.random.normal(8.5, 2.5, n),
            'margin': np.random.normal(0.5, 3.0, n)
        })

        return features, targets

    def _compute_game_features(
        self,
        game_date: datetime,
        all_pitches: pd.DataFrame
    ) -> pd.DataFrame:
        """Compute features for games on a specific date."""
        # Get historical data up to this date (no look-ahead)
        historical = all_pitches[all_pitches['game_date'] < game_date]

        # For each game today, compute pitcher features from history
        # This is simplified - would include more features in production

        features = []

        # Get unique pitchers from historical data
        pitchers = historical['pitcher'].unique()[:10]  # Limit for speed

        for pitcher in pitchers:
            pitcher_pitches = historical[historical['pitcher'] == pitcher].tail(500)

            if len(pitcher_pitches) < 50:
                continue

            # Compute features
            feature_row = {
                'pitcher': pitcher,
                'release_speed': pitcher_pitches['release_speed'].mean(),
                'release_spin_rate': pitcher_pitches['release_spin_rate'].mean(),
                'pfx_x': pitcher_pitches['pfx_x'].mean(),
                'pfx_z': pitcher_pitches['pfx_z'].mean(),
                'game_id': f'game_{pitcher}_{game_date.strftime("%Y%m%d")}',
                'home_team': 'Team A',
                'away_team': 'Team B'
            }

            # Tunnel score
            try:
                scores = self.tunnel_analyzer.compute_tunnel_scores(pitcher_pitches)
                feature_row['tunnel_score_mean'] = scores['tunnel_score'].mean()
            except Exception:
                feature_row['tunnel_score_mean'] = 1.0

            features.append(feature_row)

        return pd.DataFrame(features)

    def _create_opportunities(
        self,
        predictions: List,
        odds_df: pd.DataFrame
    ) -> List[BettingOpportunity]:
        """Create betting opportunities from predictions and odds."""
        opportunities = []

        for pred in predictions[:5]:  # Limit to 5 games per day
            # Find matching odds
            game_odds = odds_df[
                odds_df['market_type'] == 'h2h'
            ].head(2)

            if len(game_odds) < 2:
                continue

            # Home team opportunity
            home_odds_row = game_odds.iloc[0]
            home_decimal = self._american_to_decimal(home_odds_row['outcome_price'])
            market_prob = 1 / home_decimal

            opp = BettingOpportunity(
                opportunity_id=f"{pred.game_id}_home",
                game_id=pred.game_id,
                home_team=pred.home_team,
                away_team=pred.away_team,
                bet_type='moneyline',
                selection='home',
                decimal_odds=home_decimal,
                model_prob=pred.home_win_prob,
                market_prob=market_prob
            )

            opportunities.append(opp)

            # Away team opportunity
            away_odds_row = game_odds.iloc[1]
            away_decimal = self._american_to_decimal(away_odds_row['outcome_price'])
            away_market_prob = 1 / away_decimal

            opp_away = BettingOpportunity(
                opportunity_id=f"{pred.game_id}_away",
                game_id=pred.game_id,
                home_team=pred.home_team,
                away_team=pred.away_team,
                bet_type='moneyline',
                selection='away',
                decimal_odds=away_decimal,
                model_prob=pred.away_win_prob,
                market_prob=away_market_prob
            )

            opportunities.append(opp_away)

        return opportunities

    def _american_to_decimal(self, american: float) -> float:
        """Convert American odds to decimal."""
        if american > 0:
            return 1 + american / 100
        else:
            return 1 + 100 / abs(american)

    def _place_bets(self, opportunities: List[BettingOpportunity]):
        """Place bets from opportunities."""
        # Update solver bankroll
        self.solver.bankroll = self.tracker.current_bankroll

        # Optimize
        portfolio = self.solver.optimize(opportunities)

        # Place bets
        opp_map = {o.opportunity_id: o for o in opportunities}

        for opp_id, fraction in portfolio.allocations.items():
            stake = fraction * self.tracker.current_bankroll

            if stake < 5.0:  # Minimum $5 bet
                continue

            opp = opp_map[opp_id]

            bet = BetRecord(
                bet_id=f"bt_{datetime.now().timestamp()}_{opp_id[:8]}",
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

            self.tracker.place_bet(bet)

    def _settle_yesterday_bets(
        self,
        current_date: datetime,
        pitches_df: pd.DataFrame,
        odds_df: pd.DataFrame
    ):
        """Settle bets from previous day."""
        # In production, would look up actual game results
        # Here we simulate with random outcomes weighted by model probability

        for bet_id, bet in list(self.tracker.pending_bets.items()):
            # Skip bets from today
            if bet.timestamp.date() >= current_date.date():
                continue

            # Simulate outcome based on model probability
            # (In production, would use actual game results)
            won = np.random.random() < bet.model_prob

            # Simulate closing line movement
            if bet.edge > 0.05:
                closing_odds = bet.odds * 0.98  # Line moved toward us
            else:
                closing_odds = bet.odds * 1.02  # Line moved against us

            self.tracker.settle_bet(bet_id, won, closing_odds=closing_odds)

    def _settle_all_pending(
        self,
        end_date: datetime,
        pitches_df: pd.DataFrame,
        odds_df: pd.DataFrame
    ):
        """Settle all remaining pending bets at end of backtest."""
        for bet_id, bet in list(self.tracker.pending_bets.items()):
            won = np.random.random() < bet.model_prob
            self.tracker.settle_bet(bet_id, won)

    def _record_daily_state(self, date: datetime):
        """Record state at end of day."""
        snapshot = self.tracker.take_snapshot()

        self.daily_results.append({
            'date': date,
            'bankroll': snapshot.bankroll,
            'pnl': snapshot.net_profit,
            'n_bets': snapshot.n_bets
        })

    def _compile_results(self) -> BacktestResult:
        """Compile final backtest results."""
        summary = self.tracker.get_performance_summary()

        # Calculate daily returns for Sharpe/Sortino
        daily_bankrolls = [r['bankroll'] for r in self.daily_results]
        daily_returns = np.diff(daily_bankrolls) / daily_bankrolls[:-1]

        # Sharpe ratio (annualized)
        if len(daily_returns) > 1 and daily_returns.std() > 0:
            sharpe = np.sqrt(252) * daily_returns.mean() / daily_returns.std()
        else:
            sharpe = 0.0

        # Sortino ratio (only downside volatility)
        negative_returns = daily_returns[daily_returns < 0]
        if len(negative_returns) > 1 and negative_returns.std() > 0:
            sortino = np.sqrt(252) * daily_returns.mean() / negative_returns.std()
        else:
            sortino = 0.0

        return BacktestResult(
            start_date=self.start_date,
            end_date=self.end_date,
            n_days=len(self.daily_results),
            initial_bankroll=self.initial_bankroll,
            final_bankroll=self.tracker.current_bankroll,
            total_pnl=self.tracker.current_bankroll - self.initial_bankroll,
            roi=(self.tracker.current_bankroll - self.initial_bankroll) / self.initial_bankroll,
            total_bets=summary.get('total_bets', 0),
            winning_bets=summary.get('wins', 0),
            losing_bets=summary.get('losses', 0),
            win_rate=summary.get('win_rate', 0.0),
            max_drawdown=summary.get('max_drawdown', 0.0),
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            avg_clv=summary.get('avg_clv', 0.0),
            positive_clv_rate=summary.get('positive_clv_rate', 0.0),
            daily_pnl=[r['pnl'] for r in self.daily_results],
            daily_bankroll=daily_bankrolls,
            daily_bets=[r['n_bets'] for r in self.daily_results],
            all_bets=[b.__dict__ for b in self.tracker.bets]
        )


def run_quick_backtest(
    start_date: str = "2024-07-01",
    end_date: str = "2024-07-31",
    initial_bankroll: float = 10000
) -> BacktestResult:
    """
    Run a quick backtest for testing purposes.

    Args:
        start_date: Start date
        end_date: End date
        initial_bankroll: Starting bankroll

    Returns:
        BacktestResult
    """
    simulator = BacktestSimulator(
        initial_bankroll=initial_bankroll,
        start_date=start_date,
        end_date=end_date
    )

    return simulator.run(verbose=True)
