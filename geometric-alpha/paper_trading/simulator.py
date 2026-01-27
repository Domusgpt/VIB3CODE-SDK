"""
Paper Trading Simulator - FOR TESTING BEFORE REAL MONEY

Complete paper trading system that:
1. Simulates betting without real money
2. Tracks all performance metrics
3. Validates system before live trading
4. Provides detailed reporting

CRITICAL: Run paper trading for at least 3 months and 500+ bets
before considering real money.

Usage:
    from paper_trading.simulator import PaperTradingSimulator

    # Initialize
    simulator = PaperTradingSimulator(
        initial_bankroll=10000,
        validation_mode=True  # Extra strict checks
    )

    # Run simulation
    simulator.start_session("testing_v1")

    # Process each day
    for date in date_range:
        games = fetch_games(date)
        predictions = model.predict(games)
        odds = fetch_odds(games)

        # Simulator handles everything
        simulator.process_day(date, predictions, odds)

    # Get results
    report = simulator.get_validation_report()
    if report.is_ready_for_live:
        print("System validated! Consider live trading.")
    else:
        print(f"Not ready: {report.blocking_issues}")
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
from collections import defaultdict
import json
import logging
from pathlib import Path
from enum import Enum

# Import system components
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from evaluation.trustworthy_system import (
    TrustworthyBettingSystem,
    EdgeValidationFramework,
    ProbabilityCalibrationValidator,
    EmpiricalCorrelationEstimator
)
from optimization.empirical_kelly import EmpiricalKellySolver
from optimization.kelly import BettingOpportunity

logger = logging.getLogger(__name__)


class ValidationStatus(Enum):
    """Status of system validation."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    PASSED = "passed"
    FAILED = "failed"


@dataclass
class PaperBet:
    """Record of a paper trade."""
    bet_id: str
    game_id: str
    date: datetime
    bet_type: str
    selection: str

    # Prediction
    model_prob: float
    market_prob: float
    edge: float
    confidence: float
    trust_score: float

    # Execution
    decimal_odds: float
    stake: float
    potential_payout: float

    # Result (filled after settlement)
    is_settled: bool = False
    won: Optional[bool] = None
    profit: float = 0.0
    closing_odds: Optional[float] = None

    # Metadata
    warnings: List[str] = field(default_factory=list)


@dataclass
class DailyResult:
    """Results for a single day."""
    date: datetime
    n_bets: int
    n_wins: int
    n_losses: int
    total_staked: float
    total_profit: float
    roi: float
    max_exposure: float
    bets: List[PaperBet] = field(default_factory=list)


@dataclass
class ValidationReport:
    """Comprehensive validation report."""
    # Overall status
    is_ready_for_live: bool
    validation_status: ValidationStatus
    confidence_level: float

    # Sample size
    total_bets: int
    total_days: int
    min_bets_required: int = 500
    min_days_required: int = 90

    # Performance metrics
    total_roi: float
    roi_95_ci: Tuple[float, float]
    win_rate: float
    avg_edge: float

    # Statistical tests
    profit_p_value: float
    is_profit_significant: bool

    # Closing Line Value
    mean_clv: float
    clv_positive: bool

    # Calibration
    calibration_ece: float
    is_calibrated: bool

    # Risk metrics
    max_drawdown: float
    sharpe_ratio: float
    risk_of_ruin: float

    # Issues
    blocking_issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Recommendations
    recommendation: str = ""


class PaperTradingSimulator:
    """
    Complete paper trading simulation system.

    Provides everything needed to test the betting system
    without risking real money.
    """

    # Validation thresholds
    MIN_BETS_FOR_VALIDATION = 500
    MIN_DAYS_FOR_VALIDATION = 90
    MAX_ACCEPTABLE_ECE = 0.05
    MIN_CLV_FOR_EDGE = 0.005  # 0.5%
    MAX_ACCEPTABLE_DRAWDOWN = 0.30  # 30%
    PROFIT_SIGNIFICANCE_THRESHOLD = 0.05

    def __init__(
        self,
        initial_bankroll: float = 10000,
        validation_mode: bool = True,
        max_exposure: float = 0.25,
        max_single_bet: float = 0.05
    ):
        """
        Initialize paper trading simulator.

        Args:
            initial_bankroll: Starting bankroll
            validation_mode: If True, applies extra strict validation
            max_exposure: Maximum total exposure as fraction of bankroll
            max_single_bet: Maximum single bet as fraction of bankroll
        """
        self.initial_bankroll = initial_bankroll
        self.current_bankroll = initial_bankroll
        self.validation_mode = validation_mode
        self.max_exposure = max_exposure
        self.max_single_bet = max_single_bet

        # Tracking
        self.bets: List[PaperBet] = []
        self.daily_results: List[DailyResult] = []
        self.bankroll_history: List[Tuple[datetime, float]] = []

        # Validation components
        self.trustworthy_system = TrustworthyBettingSystem()
        self.edge_validator = EdgeValidationFramework(min_bets=self.MIN_BETS_FOR_VALIDATION)
        self.calibration_validator = ProbabilityCalibrationValidator()
        self.correlation_estimator = EmpiricalCorrelationEstimator()

        # Kelly solver with empirical correlations
        self.kelly_solver = EmpiricalKellySolver(
            bankroll=initial_bankroll,
            max_exposure=max_exposure,
            max_single_bet=max_single_bet,
            correlation_estimator=self.correlation_estimator
        )

        # Session tracking
        self.session_id: Optional[str] = None
        self.session_start: Optional[datetime] = None
        self.is_active = False

        # Performance tracking
        self.peak_bankroll = initial_bankroll
        self.max_drawdown = 0.0

    def start_session(self, session_id: str):
        """Start a new paper trading session."""
        self.session_id = session_id
        self.session_start = datetime.now()
        self.is_active = True

        self.bankroll_history.append((self.session_start, self.current_bankroll))

        logger.info(f"Started paper trading session: {session_id}")
        logger.info(f"Initial bankroll: ${self.initial_bankroll:,.2f}")
        logger.info(f"Validation mode: {self.validation_mode}")

    def process_day(
        self,
        date: datetime,
        predictions: List[Dict],
        market_odds: List[Dict],
        actual_outcomes: Optional[List[Dict]] = None
    ) -> DailyResult:
        """
        Process a single day of paper trading.

        Args:
            date: The date being processed
            predictions: Model predictions with format:
                [{'game_id': str, 'home_win_prob': float, 'confidence': float, 'trust': float}]
            market_odds: Market odds with format:
                [{'game_id': str, 'bet_type': str, 'decimal_odds': float}]
            actual_outcomes: Outcomes for settlement (optional, can settle later)
                [{'game_id': str, 'home_won': bool, 'total_runs': int, ...}]

        Returns:
            DailyResult for this day
        """
        if not self.is_active:
            raise ValueError("No active session. Call start_session() first.")

        logger.info(f"Processing {date.strftime('%Y-%m-%d')}")

        # Build betting opportunities
        opportunities = self._build_opportunities(predictions, market_odds)

        if not opportunities:
            return DailyResult(
                date=date,
                n_bets=0, n_wins=0, n_losses=0,
                total_staked=0, total_profit=0, roi=0, max_exposure=0
            )

        # Run Kelly optimization
        portfolio = self.kelly_solver.optimize(opportunities)

        # Place paper bets
        day_bets = []
        total_staked = 0.0

        for opp in opportunities:
            allocation = portfolio.allocations.get(opp.opportunity_id, 0)

            if allocation > 0.001:
                stake = allocation * self.current_bankroll

                # Create paper bet
                bet = PaperBet(
                    bet_id=f"{date.strftime('%Y%m%d')}_{opp.opportunity_id}",
                    game_id=opp.game_id,
                    date=date,
                    bet_type=opp.bet_type,
                    selection=opp.selection,
                    model_prob=opp.model_prob,
                    market_prob=opp.market_prob,
                    edge=opp.edge,
                    confidence=0.7,  # Will be updated with actual confidence
                    trust_score=0.7,  # Will be updated with actual trust
                    decimal_odds=opp.decimal_odds,
                    stake=stake,
                    potential_payout=stake * opp.decimal_odds
                )

                # Add warnings if in validation mode
                if self.validation_mode:
                    if opp.edge < 0.03:
                        bet.warnings.append(f"Small edge: {opp.edge:.2%}")
                    if stake > self.current_bankroll * 0.03:
                        bet.warnings.append(f"Large bet: {stake/self.current_bankroll:.1%} of bankroll")

                day_bets.append(bet)
                self.bets.append(bet)
                total_staked += stake

                # Record for calibration
                self.calibration_validator.record(opp.model_prob, False)  # Will update on settlement

        # Settle bets if outcomes provided
        if actual_outcomes:
            self._settle_bets(day_bets, actual_outcomes)

        # Calculate daily metrics
        n_wins = sum(1 for b in day_bets if b.won == True)
        n_losses = sum(1 for b in day_bets if b.won == False)
        total_profit = sum(b.profit for b in day_bets)

        roi = total_profit / total_staked if total_staked > 0 else 0

        # Update bankroll
        self.current_bankroll += total_profit
        self.bankroll_history.append((date, self.current_bankroll))

        # Track drawdown
        if self.current_bankroll > self.peak_bankroll:
            self.peak_bankroll = self.current_bankroll
        else:
            drawdown = (self.peak_bankroll - self.current_bankroll) / self.peak_bankroll
            self.max_drawdown = max(self.max_drawdown, drawdown)

        daily_result = DailyResult(
            date=date,
            n_bets=len(day_bets),
            n_wins=n_wins,
            n_losses=n_losses,
            total_staked=total_staked,
            total_profit=total_profit,
            roi=roi,
            max_exposure=portfolio.total_exposure,
            bets=day_bets
        )

        self.daily_results.append(daily_result)

        logger.info(
            f"  Bets: {len(day_bets)}, "
            f"Profit: ${total_profit:+,.2f}, "
            f"Bankroll: ${self.current_bankroll:,.2f}"
        )

        return daily_result

    def _build_opportunities(
        self,
        predictions: List[Dict],
        market_odds: List[Dict]
    ) -> List[BettingOpportunity]:
        """Build betting opportunities from predictions and odds."""
        opportunities = []

        # Index odds by game_id
        odds_by_game = defaultdict(list)
        for odds in market_odds:
            odds_by_game[odds['game_id']].append(odds)

        for pred in predictions:
            game_id = pred['game_id']

            if game_id not in odds_by_game:
                continue

            for odds in odds_by_game[game_id]:
                # Determine model probability for this bet type
                if odds.get('bet_type') == 'moneyline':
                    if odds.get('selection') == 'home':
                        model_prob = pred['home_win_prob']
                    else:
                        model_prob = 1 - pred['home_win_prob']
                elif odds.get('bet_type') == 'total':
                    # For totals, would need separate model prediction
                    continue
                else:
                    continue

                decimal_odds = odds['decimal_odds']
                market_prob = 1 / decimal_odds

                opp = BettingOpportunity(
                    opportunity_id=f"{game_id}_{odds['bet_type']}_{odds.get('selection', '')}",
                    game_id=game_id,
                    home_team=pred.get('home_team', 'Home'),
                    away_team=pred.get('away_team', 'Away'),
                    bet_type=odds['bet_type'],
                    selection=odds.get('selection', ''),
                    decimal_odds=decimal_odds,
                    model_prob=model_prob,
                    market_prob=market_prob
                )

                opportunities.append(opp)

        return opportunities

    def _settle_bets(self, bets: List[PaperBet], outcomes: List[Dict]):
        """Settle bets with actual outcomes."""
        outcomes_by_game = {o['game_id']: o for o in outcomes}

        for bet in bets:
            outcome = outcomes_by_game.get(bet.game_id)
            if outcome is None:
                continue

            # Determine if bet won
            if bet.bet_type == 'moneyline':
                if bet.selection == 'home':
                    bet.won = outcome.get('home_won', False)
                else:
                    bet.won = not outcome.get('home_won', True)
            elif bet.bet_type == 'total':
                total = outcome.get('total_runs', 0)
                line = outcome.get('total_line', 8.5)
                if bet.selection == 'over':
                    bet.won = total > line
                else:
                    bet.won = total < line

            # Calculate profit
            if bet.won:
                bet.profit = bet.stake * (bet.decimal_odds - 1)
            else:
                bet.profit = -bet.stake

            bet.is_settled = True
            bet.closing_odds = outcome.get('closing_odds')

            # Record for edge validation
            self.edge_validator.record_bet(
                model_prob=bet.model_prob,
                market_prob=bet.market_prob,
                decimal_odds=bet.decimal_odds,
                stake=bet.stake,
                won=bet.won,
                closing_odds=bet.closing_odds
            )

            # Record for correlation estimation
            bet_outcomes = {
                f"{bet.bet_type}_{bet.selection}": bet.won
            }
            self.correlation_estimator.record_game_outcomes(
                game_id=bet.game_id,
                outcomes=bet_outcomes,
                game_date=bet.date
            )

    def settle_pending_bets(self, outcomes: List[Dict]):
        """Settle any pending bets with new outcome data."""
        pending = [b for b in self.bets if not b.is_settled]
        if pending:
            self._settle_bets(pending, outcomes)
            logger.info(f"Settled {len(pending)} pending bets")

    def get_validation_report(self) -> ValidationReport:
        """
        Generate comprehensive validation report.

        This determines if the system is ready for live trading.
        """
        settled_bets = [b for b in self.bets if b.is_settled]
        n_bets = len(settled_bets)
        n_days = len(self.daily_results)

        # Initialize issues lists
        blocking_issues = []
        warnings = []

        # =============================================================
        # CHECK 1: SAMPLE SIZE
        # =============================================================
        if n_bets < self.MIN_BETS_FOR_VALIDATION:
            blocking_issues.append(
                f"Insufficient bets: {n_bets} < {self.MIN_BETS_FOR_VALIDATION} required"
            )

        if n_days < self.MIN_DAYS_FOR_VALIDATION:
            blocking_issues.append(
                f"Insufficient days: {n_days} < {self.MIN_DAYS_FOR_VALIDATION} required"
            )

        # =============================================================
        # CHECK 2: PROFITABILITY
        # =============================================================
        if n_bets > 0:
            profits = np.array([b.profit for b in settled_bets])
            stakes = np.array([b.stake for b in settled_bets])

            total_profit = np.sum(profits)
            total_staked = np.sum(stakes)
            total_roi = total_profit / total_staked if total_staked > 0 else 0

            # Statistical significance test
            from scipy import stats
            t_stat, p_value = stats.ttest_1samp(profits, 0)
            is_profit_significant = p_value < self.PROFIT_SIGNIFICANCE_THRESHOLD and total_profit > 0

            # Bootstrap CI for ROI
            bootstrap_rois = []
            for _ in range(1000):
                idx = np.random.choice(len(profits), len(profits), replace=True)
                boot_roi = np.sum(profits[idx]) / np.sum(stakes[idx])
                bootstrap_rois.append(boot_roi)
            roi_ci = (np.percentile(bootstrap_rois, 2.5), np.percentile(bootstrap_rois, 97.5))

            if not is_profit_significant:
                blocking_issues.append(
                    f"Profit not statistically significant (p={p_value:.3f})"
                )

            if roi_ci[0] < 0:
                warnings.append(f"ROI confidence interval includes zero: [{roi_ci[0]:.2%}, {roi_ci[1]:.2%}]")
        else:
            total_roi = 0
            roi_ci = (0, 0)
            p_value = 1.0
            is_profit_significant = False

        # =============================================================
        # CHECK 3: CLOSING LINE VALUE
        # =============================================================
        edge_result = self.edge_validator.validate_edge()
        mean_clv = edge_result.clv_mean
        clv_positive = mean_clv > self.MIN_CLV_FOR_EDGE

        if not clv_positive and n_bets >= 100:
            blocking_issues.append(
                f"Negative or insignificant CLV: {mean_clv:.4f} (need > {self.MIN_CLV_FOR_EDGE:.4f})"
            )

        # =============================================================
        # CHECK 4: CALIBRATION
        # =============================================================
        cal_result = self.calibration_validator.test_calibration()
        calibration_ece = cal_result.expected_calibration_error
        is_calibrated = calibration_ece < self.MAX_ACCEPTABLE_ECE

        if not is_calibrated and n_bets >= 100:
            blocking_issues.append(
                f"Model not calibrated: ECE={calibration_ece:.3f} (need < {self.MAX_ACCEPTABLE_ECE:.3f})"
            )

        # =============================================================
        # CHECK 5: RISK METRICS
        # =============================================================
        if self.max_drawdown > self.MAX_ACCEPTABLE_DRAWDOWN:
            blocking_issues.append(
                f"Excessive drawdown: {self.max_drawdown:.1%} (max {self.MAX_ACCEPTABLE_DRAWDOWN:.1%})"
            )

        # Sharpe ratio (annualized)
        if len(self.daily_results) > 1:
            daily_returns = [d.roi for d in self.daily_results if d.n_bets > 0]
            if len(daily_returns) > 10:
                sharpe = np.mean(daily_returns) / np.std(daily_returns) * np.sqrt(252)
            else:
                sharpe = 0.0
        else:
            sharpe = 0.0

        # Risk of ruin estimate
        if n_bets > 0 and total_roi > 0:
            # Simplified risk of ruin
            win_rate = sum(1 for b in settled_bets if b.won) / n_bets
            avg_win = np.mean([b.profit for b in settled_bets if b.won]) if any(b.won for b in settled_bets) else 0
            avg_loss = abs(np.mean([b.profit for b in settled_bets if not b.won])) if any(not b.won for b in settled_bets) else 1
            risk_of_ruin = ((1 - win_rate) / win_rate) ** (self.current_bankroll / avg_loss) if win_rate > 0 and avg_loss > 0 else 1.0
            risk_of_ruin = min(1.0, risk_of_ruin)
        else:
            risk_of_ruin = 1.0

        # =============================================================
        # OVERALL STATUS
        # =============================================================
        is_ready = len(blocking_issues) == 0 and n_bets >= self.MIN_BETS_FOR_VALIDATION

        if is_ready:
            status = ValidationStatus.PASSED
            confidence_level = min(0.95, 0.5 + (n_bets - 500) / 2000)
            recommendation = (
                "System has passed validation. Consider starting live trading with "
                "1/4 of your intended bankroll for the first month."
            )
        elif n_bets < self.MIN_BETS_FOR_VALIDATION:
            status = ValidationStatus.IN_PROGRESS
            confidence_level = n_bets / self.MIN_BETS_FOR_VALIDATION * 0.5
            recommendation = (
                f"Continue paper trading. Need {self.MIN_BETS_FOR_VALIDATION - n_bets} more bets "
                "to complete validation."
            )
        else:
            status = ValidationStatus.FAILED
            confidence_level = 0.0
            recommendation = (
                "System has FAILED validation. DO NOT trade live. "
                f"Issues: {'; '.join(blocking_issues)}"
            )

        return ValidationReport(
            is_ready_for_live=is_ready,
            validation_status=status,
            confidence_level=confidence_level,
            total_bets=n_bets,
            total_days=n_days,
            total_roi=total_roi,
            roi_95_ci=roi_ci,
            win_rate=sum(1 for b in settled_bets if b.won) / n_bets if n_bets > 0 else 0,
            avg_edge=np.mean([b.edge for b in settled_bets]) if settled_bets else 0,
            profit_p_value=p_value,
            is_profit_significant=is_profit_significant,
            mean_clv=mean_clv,
            clv_positive=clv_positive,
            calibration_ece=calibration_ece,
            is_calibrated=is_calibrated,
            max_drawdown=self.max_drawdown,
            sharpe_ratio=sharpe,
            risk_of_ruin=risk_of_ruin,
            blocking_issues=blocking_issues,
            warnings=warnings,
            recommendation=recommendation
        )

    def get_performance_summary(self) -> str:
        """Generate human-readable performance summary."""
        settled = [b for b in self.bets if b.is_settled]
        n_bets = len(settled)

        if n_bets == 0:
            return "No settled bets yet."

        total_profit = sum(b.profit for b in settled)
        total_staked = sum(b.stake for b in settled)
        roi = total_profit / total_staked if total_staked > 0 else 0
        win_rate = sum(1 for b in settled if b.won) / n_bets

        report = f"""
================================================================================
                    PAPER TRADING PERFORMANCE SUMMARY
================================================================================

SESSION: {self.session_id}
PERIOD: {self.session_start.strftime('%Y-%m-%d') if self.session_start else 'N/A'} to {datetime.now().strftime('%Y-%m-%d')}

BANKROLL
--------
Starting: ${self.initial_bankroll:,.2f}
Current:  ${self.current_bankroll:,.2f}
Change:   ${self.current_bankroll - self.initial_bankroll:+,.2f} ({(self.current_bankroll/self.initial_bankroll - 1)*100:+.1f}%)

BETTING PERFORMANCE
-------------------
Total Bets: {n_bets}
Wins: {sum(1 for b in settled if b.won)}
Losses: {sum(1 for b in settled if not b.won)}
Win Rate: {win_rate:.1%}

Total Staked: ${total_staked:,.2f}
Total Profit: ${total_profit:+,.2f}
ROI: {roi:.2%}

RISK METRICS
------------
Max Drawdown: {self.max_drawdown:.1%}
Peak Bankroll: ${self.peak_bankroll:,.2f}

VALIDATION STATUS
-----------------
"""
        report_obj = self.get_validation_report()
        report += f"Status: {report_obj.validation_status.value.upper()}\n"
        report += f"Ready for Live: {'YES' if report_obj.is_ready_for_live else 'NO'}\n"

        if report_obj.blocking_issues:
            report += "\nBlocking Issues:\n"
            for issue in report_obj.blocking_issues:
                report += f"  ✗ {issue}\n"

        report += f"\n{report_obj.recommendation}\n"
        report += "\n================================================================================"

        return report

    def save_session(self, path: str):
        """Save session to disk for later analysis."""
        save_path = Path(path)
        save_path.mkdir(parents=True, exist_ok=True)

        # Save bets
        bets_data = [
            {
                'bet_id': b.bet_id,
                'game_id': b.game_id,
                'date': b.date.isoformat(),
                'bet_type': b.bet_type,
                'selection': b.selection,
                'model_prob': b.model_prob,
                'market_prob': b.market_prob,
                'edge': b.edge,
                'decimal_odds': b.decimal_odds,
                'stake': b.stake,
                'won': b.won,
                'profit': b.profit,
                'closing_odds': b.closing_odds
            }
            for b in self.bets
        ]

        with open(save_path / "bets.json", 'w') as f:
            json.dump(bets_data, f, indent=2)

        # Save session metadata
        metadata = {
            'session_id': self.session_id,
            'session_start': self.session_start.isoformat() if self.session_start else None,
            'initial_bankroll': self.initial_bankroll,
            'current_bankroll': self.current_bankroll,
            'max_drawdown': self.max_drawdown,
            'peak_bankroll': self.peak_bankroll,
            'validation_mode': self.validation_mode
        }

        with open(save_path / "metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)

        # Save validation report
        report = self.get_validation_report()
        with open(save_path / "validation_report.json", 'w') as f:
            json.dump({
                'is_ready_for_live': report.is_ready_for_live,
                'status': report.validation_status.value,
                'total_bets': report.total_bets,
                'total_roi': report.total_roi,
                'calibration_ece': report.calibration_ece,
                'mean_clv': report.mean_clv,
                'blocking_issues': report.blocking_issues,
                'recommendation': report.recommendation
            }, f, indent=2)

        logger.info(f"Session saved to {save_path}")


# =============================================================================
# HELPER: Quick paper trading test
# =============================================================================

def run_quick_paper_test(n_days: int = 30) -> PaperTradingSimulator:
    """
    Run a quick paper trading test with synthetic data.

    For testing the simulator itself, not for actual validation.
    """
    simulator = PaperTradingSimulator(
        initial_bankroll=10000,
        validation_mode=True
    )

    simulator.start_session("quick_test")

    np.random.seed(42)

    for day in range(n_days):
        date = datetime.now() - timedelta(days=n_days-day)

        # Generate synthetic predictions
        n_games = np.random.randint(5, 15)
        predictions = []
        market_odds = []
        outcomes = []

        for i in range(n_games):
            game_id = f"game_{day}_{i}"
            true_prob = np.random.beta(5, 5)
            model_prob = np.clip(true_prob + np.random.normal(0, 0.05), 0.3, 0.7)

            predictions.append({
                'game_id': game_id,
                'home_team': f'Home_{i}',
                'away_team': f'Away_{i}',
                'home_win_prob': model_prob
            })

            # Add some juice to the odds
            decimal_odds = 1 / true_prob * 0.95
            market_odds.append({
                'game_id': game_id,
                'bet_type': 'moneyline',
                'selection': 'home',
                'decimal_odds': decimal_odds
            })

            # Generate outcome
            home_won = np.random.random() < true_prob
            outcomes.append({
                'game_id': game_id,
                'home_won': home_won
            })

        simulator.process_day(date, predictions, market_odds, outcomes)

    print(simulator.get_performance_summary())
    return simulator


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_quick_paper_test(60)
