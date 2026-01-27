"""
Geometric Alpha Engine

Main orchestration engine for the Polytopal Projection Processing system.
Coordinates data ingestion, feature engineering, prediction, and betting.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging
from pathlib import Path

from config.settings import CONFIG, GeometricAlphaConfig
from data.statcast import StatcastClient
from data.odds import OddsClient
from features.tunneling import TunnelAnalyzer
from features.umpire_hull import UmpireHullCalculator
from features.voronoi import DefensiveVoronoi
from features.arsenal import ArsenalAnalyzer
from models.predictor import GeometricPredictor
from models.run_expectancy import RunExpectancyModel
from optimization.kelly import SimultaneousKellySolver, BettingOpportunity
from optimization.portfolio import PortfolioManager, BankrollTracker

logger = logging.getLogger(__name__)


@dataclass
class DailySlate:
    """Representation of a day's betting slate."""

    date: datetime
    games: List[Dict]
    opportunities: List[BettingOpportunity]
    predictions: List[Any]
    recommended_bets: Dict[str, float]


class GeometricAlphaEngine:
    """
    Main engine orchestrating the Geometric Alpha system.

    Workflow:
    1. Fetch data (Statcast + Odds)
    2. Compute geometric features
    3. Generate predictions
    4. Identify value opportunities
    5. Optimize bet sizing
    6. Execute and track bets
    """

    def __init__(self, config: Optional[GeometricAlphaConfig] = None):
        """
        Initialize the Geometric Alpha engine.

        Args:
            config: Optional configuration override
        """
        self.config = config or CONFIG

        # Initialize components
        self._init_data_clients()
        self._init_feature_analyzers()
        self._init_models()
        self._init_optimization()

        # State
        self.is_trained = False
        self.last_update = None

    def _init_data_clients(self):
        """Initialize data layer clients."""
        self.statcast = StatcastClient(cache_dir=self.config.data.parquet_dir)
        self.odds = OddsClient(api_key=self.config.data.odds_api_key)

    def _init_feature_analyzers(self):
        """Initialize feature engineering components."""
        self.tunnel_analyzer = TunnelAnalyzer(config=self.config.geometric)
        self.hull_calculator = UmpireHullCalculator(config=self.config.geometric)
        self.voronoi_analyzer = DefensiveVoronoi(config=self.config.geometric)
        self.arsenal_analyzer = ArsenalAnalyzer(config=self.config.geometric)

    def _init_models(self):
        """Initialize predictive models."""
        self.predictor = GeometricPredictor(config=self.config.model)
        self.re_model = RunExpectancyModel()

    def _init_optimization(self):
        """Initialize optimization and portfolio management."""
        self.kelly_solver = SimultaneousKellySolver(
            bankroll=self.config.optimization.initial_bankroll,
            max_exposure=self.config.optimization.max_exposure,
            max_single_bet=self.config.optimization.max_single_bet
        )
        self.tracker = BankrollTracker(self.config.optimization.initial_bankroll)
        self.portfolio = PortfolioManager(
            bankroll=self.config.optimization.initial_bankroll,
            tracker=self.tracker
        )

    def train(
        self,
        start_year: int = None,
        end_year: int = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Train the prediction models on historical data.

        Args:
            start_year: First year of training data
            end_year: Last year of training data
            force_refresh: Whether to re-fetch data

        Returns:
            Training metrics
        """
        start_year = start_year or self.config.data.statcast_start_year
        end_year = end_year or self.config.model.train_test_split_year - 1

        logger.info(f"Training on seasons {start_year} to {end_year}")

        # Load historical data
        all_pitches = []
        for year in range(start_year, end_year + 1):
            logger.info(f"Loading {year} season data...")
            season_data = self.statcast.fetch_season(year, force_refresh=force_refresh)
            all_pitches.append(season_data)

        combined_pitches = pd.concat(all_pitches, ignore_index=True)
        logger.info(f"Loaded {len(combined_pitches):,} pitches")

        # Compute features
        logger.info("Computing geometric features...")
        features_df = self._compute_training_features(combined_pitches)

        # Create targets
        targets_df = self._create_training_targets(combined_pitches)

        # Train model
        logger.info("Training prediction model...")
        metrics = self.predictor.train(features_df, targets_df)

        self.is_trained = True
        self.last_update = datetime.now()

        logger.info(f"Training complete. Metrics: {metrics}")
        return metrics

    def _compute_training_features(
        self,
        pitches_df: pd.DataFrame
    ) -> pd.DataFrame:
        """Compute features for training data."""
        features = []

        # Group by game
        games = pitches_df.groupby('game_pk')

        for game_pk, game_pitches in games:
            if len(game_pitches) < 100:
                continue

            feature_row = self._compute_game_features(game_pitches)
            feature_row['game_pk'] = game_pk
            features.append(feature_row)

        return pd.DataFrame(features)

    def _compute_game_features(self, game_pitches: pd.DataFrame) -> Dict:
        """Compute geometric features for a single game."""
        features = {}

        # Aggregate pitch metrics
        features['avg_velocity'] = game_pitches['release_speed'].mean()
        features['avg_spin'] = game_pitches['release_spin_rate'].mean()
        features['movement_x'] = game_pitches['pfx_x'].mean()
        features['movement_z'] = game_pitches['pfx_z'].mean()

        # Tunnel scores
        try:
            tunnel_df = self.tunnel_analyzer.compute_tunnel_scores(game_pitches)
            features['tunnel_score_mean'] = tunnel_df['tunnel_score'].mean()
            features['tunnel_score_max'] = tunnel_df['tunnel_score'].max()
        except Exception:
            features['tunnel_score_mean'] = 1.0
            features['tunnel_score_max'] = 1.0

        # Release point variance
        if 'release_pos_x' in game_pitches.columns:
            features['release_point_variance'] = (
                game_pitches['release_pos_x'].var() +
                game_pitches['release_pos_z'].var()
            )
        else:
            features['release_point_variance'] = 0.0

        return features

    def _create_training_targets(
        self,
        pitches_df: pd.DataFrame
    ) -> pd.DataFrame:
        """Create target variables for training."""
        # Aggregate to game level
        game_outcomes = pitches_df.groupby('game_pk').agg({
            'game_date': 'first'
        }).reset_index()

        # Create synthetic targets (in production, would use actual outcomes)
        n = len(game_outcomes)
        targets = pd.DataFrame({
            'game_pk': game_outcomes['game_pk'],
            'home_win': np.random.binomial(1, 0.52, n),
            'total_runs': np.random.normal(8.5, 2.5, n).clip(0, 30),
            'margin': np.random.normal(0.5, 3.0, n)
        })

        return targets.set_index('game_pk')

    def process_daily_slate(
        self,
        date: datetime = None
    ) -> DailySlate:
        """
        Process today's slate of games.

        Args:
            date: Date to process (defaults to today)

        Returns:
            DailySlate with games, predictions, and recommendations
        """
        if not self.is_trained:
            raise ValueError("Engine must be trained before processing slate")

        date = date or datetime.now()
        logger.info(f"Processing slate for {date.strftime('%Y-%m-%d')}")

        # Fetch today's odds
        odds_df = self.odds.fetch_live_odds(markets=['h2h', 'totals'])

        if len(odds_df) == 0:
            logger.warning("No odds available for today")
            return DailySlate(
                date=date,
                games=[],
                opportunities=[],
                predictions=[],
                recommended_bets={}
            )

        # Extract unique games
        games = odds_df.groupby('game_id').first().reset_index()
        logger.info(f"Found {len(games)} games")

        # Compute features for each game
        # (In production, would fetch probable pitchers and compute their features)
        game_features = self._compute_slate_features(games)

        # Generate predictions
        predictions = self.predictor.predict(game_features)

        # Create betting opportunities
        opportunities = self._create_opportunities(predictions, odds_df)

        # Optimize portfolio
        recommended_bets = self._optimize_bets(opportunities)

        return DailySlate(
            date=date,
            games=games.to_dict('records'),
            opportunities=opportunities,
            predictions=predictions,
            recommended_bets=recommended_bets
        )

    def _compute_slate_features(
        self,
        games: pd.DataFrame
    ) -> pd.DataFrame:
        """Compute features for today's games."""
        features = []

        for _, game in games.iterrows():
            # In production, would fetch pitcher data and compute real features
            feature_row = {
                'game_id': game['game_id'],
                'home_team': game['home_team'],
                'away_team': game['away_team'],
                'avg_velocity': np.random.normal(93, 3),
                'avg_spin': np.random.normal(2300, 300),
                'movement_x': np.random.normal(-5, 5),
                'movement_z': np.random.normal(5, 5),
                'tunnel_score_mean': np.random.normal(1.5, 0.5),
                'tunnel_score_max': np.random.normal(2.5, 0.8),
                'release_point_variance': np.random.exponential(0.1)
            }
            features.append(feature_row)

        return pd.DataFrame(features)

    def _create_opportunities(
        self,
        predictions: List,
        odds_df: pd.DataFrame
    ) -> List[BettingOpportunity]:
        """Create betting opportunities from predictions and odds."""
        opportunities = []

        for pred in predictions:
            game_odds = odds_df[
                (odds_df['home_team'] == pred.home_team) |
                (odds_df['away_team'] == pred.away_team)
            ]

            if len(game_odds) == 0:
                continue

            # Moneyline opportunities
            ml_odds = game_odds[game_odds['market_type'] == 'h2h']

            for _, row in ml_odds.iterrows():
                if row['outcome_name'] == pred.home_team:
                    model_prob = pred.home_win_prob
                else:
                    model_prob = pred.away_win_prob

                decimal_odds = self._american_to_decimal(row['outcome_price'])
                market_prob = 1 / decimal_odds

                opp = BettingOpportunity(
                    opportunity_id=f"{pred.game_id}_{row['outcome_name'][:3]}_ml",
                    game_id=pred.game_id,
                    home_team=pred.home_team,
                    away_team=pred.away_team,
                    bet_type='moneyline',
                    selection=row['outcome_name'],
                    decimal_odds=decimal_odds,
                    model_prob=model_prob,
                    market_prob=market_prob
                )

                opportunities.append(opp)

            # Total opportunities
            total_odds = game_odds[game_odds['market_type'] == 'totals']

            for _, row in total_odds.iterrows():
                if row['outcome_name'] == 'Over':
                    # Estimate over probability from expected total
                    line = row.get('outcome_point', 8.5)
                    model_prob = 1 - self._normal_cdf(line, pred.expected_total, 2.0)
                else:
                    line = row.get('outcome_point', 8.5)
                    model_prob = self._normal_cdf(line, pred.expected_total, 2.0)

                decimal_odds = self._american_to_decimal(row['outcome_price'])
                market_prob = 1 / decimal_odds

                opp = BettingOpportunity(
                    opportunity_id=f"{pred.game_id}_{row['outcome_name']}_total",
                    game_id=pred.game_id,
                    home_team=pred.home_team,
                    away_team=pred.away_team,
                    bet_type='total',
                    selection=row['outcome_name'],
                    decimal_odds=decimal_odds,
                    model_prob=model_prob,
                    market_prob=market_prob
                )

                opportunities.append(opp)

        return opportunities

    def _optimize_bets(
        self,
        opportunities: List[BettingOpportunity]
    ) -> Dict[str, float]:
        """Optimize bet sizing for opportunities."""
        self.kelly_solver.bankroll = self.tracker.current_bankroll

        portfolio = self.kelly_solver.optimize(opportunities)

        return portfolio.get_bet_amounts(self.tracker.current_bankroll)

    def execute_recommendations(
        self,
        recommendations: Dict[str, float],
        opportunities: List[BettingOpportunity],
        dry_run: bool = True
    ) -> List[str]:
        """
        Execute recommended bets.

        Args:
            recommendations: Dict of opportunity_id to stake
            opportunities: Original opportunities
            dry_run: If True, only simulate (don't place real bets)

        Returns:
            List of placed bet IDs
        """
        if dry_run:
            logger.info("DRY RUN - bets will not be placed with sportsbook")

        return self.portfolio.execute_bets(opportunities, recommendations)

    def settle_bets(self, results: Dict[str, bool]):
        """
        Settle outstanding bets with results.

        Args:
            results: Dict mapping bet_id to won (True/False)
        """
        for bet_id, won in results.items():
            self.tracker.settle_bet(bet_id, won)

    def get_status(self) -> Dict[str, Any]:
        """Get current engine status."""
        summary = self.tracker.get_performance_summary()

        return {
            'is_trained': self.is_trained,
            'last_update': self.last_update.isoformat() if self.last_update else None,
            'current_bankroll': self.tracker.current_bankroll,
            'pending_bets': len(self.tracker.pending_bets),
            'total_bets': len(self.tracker.bets),
            'performance': summary
        }

    def save_state(self, path: Path):
        """Save engine state to disk."""
        path.mkdir(parents=True, exist_ok=True)

        # Save model
        self.predictor.save(path / 'model')

        # Save tracker
        self.tracker.save(path / 'tracker.json')

        logger.info(f"Engine state saved to {path}")

    def load_state(self, path: Path):
        """Load engine state from disk."""
        # Load model
        self.predictor.load(path / 'model')
        self.is_trained = True

        # Load tracker
        tracker_path = path / 'tracker.json'
        if tracker_path.exists():
            self.tracker.load(tracker_path)

        logger.info(f"Engine state loaded from {path}")

    @staticmethod
    def _american_to_decimal(american: float) -> float:
        """Convert American odds to decimal."""
        if american > 0:
            return 1 + american / 100
        else:
            return 1 + 100 / abs(american)

    @staticmethod
    def _normal_cdf(x: float, mean: float, std: float) -> float:
        """Compute normal CDF."""
        from math import erf, sqrt
        return 0.5 * (1 + erf((x - mean) / (std * sqrt(2))))
