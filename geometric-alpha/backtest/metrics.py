"""
Performance Metrics for Backtesting

Comprehensive metrics for evaluating betting strategy performance.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetrics:
    """Comprehensive performance metrics."""

    # Return metrics
    total_return: float
    annualized_return: float
    avg_daily_return: float

    # Risk metrics
    volatility: float
    annualized_volatility: float
    max_drawdown: float
    avg_drawdown: float

    # Risk-adjusted returns
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float

    # Betting specific
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    expected_value: float

    # CLV metrics
    avg_clv: float
    clv_correlation: float  # Correlation between CLV and actual P&L

    @classmethod
    def from_results(
        cls,
        daily_returns: np.ndarray,
        bet_results: List[Dict],
        risk_free_rate: float = 0.04
    ) -> 'PerformanceMetrics':
        """
        Compute metrics from backtest results.

        Args:
            daily_returns: Array of daily returns
            bet_results: List of bet result dictionaries
            risk_free_rate: Annual risk-free rate
        """
        # Return metrics
        total_return = (1 + daily_returns).prod() - 1
        n_days = len(daily_returns)
        annualized_return = (1 + total_return) ** (252 / n_days) - 1 if n_days > 0 else 0
        avg_daily_return = daily_returns.mean() if len(daily_returns) > 0 else 0

        # Risk metrics
        volatility = daily_returns.std() if len(daily_returns) > 1 else 0
        annualized_volatility = volatility * np.sqrt(252)
        max_drawdown = calculate_max_drawdown(daily_returns)
        avg_drawdown = calculate_avg_drawdown(daily_returns)

        # Risk-adjusted returns
        daily_rf = risk_free_rate / 252
        excess_returns = daily_returns - daily_rf
        sharpe = calculate_sharpe_ratio(daily_returns, risk_free_rate)
        sortino = calculate_sortino_ratio(daily_returns, risk_free_rate)
        calmar = annualized_return / max_drawdown if max_drawdown > 0 else 0

        # Betting specific
        wins = [b for b in bet_results if b.get('pnl', 0) > 0]
        losses = [b for b in bet_results if b.get('pnl', 0) < 0]

        win_rate = len(wins) / len(bet_results) if bet_results else 0
        avg_win = np.mean([b['pnl'] for b in wins]) if wins else 0
        avg_loss = abs(np.mean([b['pnl'] for b in losses])) if losses else 0

        total_wins = sum(b['pnl'] for b in wins)
        total_losses = abs(sum(b['pnl'] for b in losses))
        profit_factor = total_wins / total_losses if total_losses > 0 else 0

        expected_value = sum(b.get('pnl', 0) for b in bet_results) / len(bet_results) if bet_results else 0

        # CLV metrics
        clv_values = [b.get('clv', 0) for b in bet_results if b.get('clv') is not None]
        pnl_values = [b.get('pnl', 0) for b in bet_results if b.get('clv') is not None]

        avg_clv = np.mean(clv_values) if clv_values else 0

        if len(clv_values) > 2 and len(pnl_values) > 2:
            clv_correlation = np.corrcoef(clv_values, pnl_values)[0, 1]
        else:
            clv_correlation = 0

        return cls(
            total_return=total_return,
            annualized_return=annualized_return,
            avg_daily_return=avg_daily_return,
            volatility=volatility,
            annualized_volatility=annualized_volatility,
            max_drawdown=max_drawdown,
            avg_drawdown=avg_drawdown,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            calmar_ratio=calmar,
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            expected_value=expected_value,
            avg_clv=avg_clv,
            clv_correlation=clv_correlation
        )

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            'returns': {
                'total': self.total_return,
                'annualized': self.annualized_return,
                'avg_daily': self.avg_daily_return
            },
            'risk': {
                'volatility': self.volatility,
                'annualized_volatility': self.annualized_volatility,
                'max_drawdown': self.max_drawdown,
                'avg_drawdown': self.avg_drawdown
            },
            'risk_adjusted': {
                'sharpe_ratio': self.sharpe_ratio,
                'sortino_ratio': self.sortino_ratio,
                'calmar_ratio': self.calmar_ratio
            },
            'betting': {
                'win_rate': self.win_rate,
                'avg_win': self.avg_win,
                'avg_loss': self.avg_loss,
                'profit_factor': self.profit_factor,
                'expected_value': self.expected_value
            },
            'clv': {
                'avg_clv': self.avg_clv,
                'clv_correlation': self.clv_correlation
            }
        }

    def summary(self) -> str:
        """Generate human-readable summary."""
        return f"""
Performance Metrics Summary
===========================

RETURNS
-------
Total Return:      {self.total_return:.2%}
Annualized Return: {self.annualized_return:.2%}

RISK
----
Volatility (Ann.): {self.annualized_volatility:.2%}
Max Drawdown:      {self.max_drawdown:.2%}

RISK-ADJUSTED
-------------
Sharpe Ratio:  {self.sharpe_ratio:.2f}
Sortino Ratio: {self.sortino_ratio:.2f}
Calmar Ratio:  {self.calmar_ratio:.2f}

BETTING
-------
Win Rate:      {self.win_rate:.1%}
Avg Win:       ${self.avg_win:.2f}
Avg Loss:      ${self.avg_loss:.2f}
Profit Factor: {self.profit_factor:.2f}
Expected Value: ${self.expected_value:.2f} per bet

CLV
---
Average CLV:     {self.avg_clv:.4f}
CLV Correlation: {self.clv_correlation:.2f}
"""


def calculate_sharpe_ratio(
    returns: np.ndarray,
    risk_free_rate: float = 0.04,
    annualize: bool = True
) -> float:
    """
    Calculate Sharpe Ratio.

    Args:
        returns: Array of period returns
        risk_free_rate: Annual risk-free rate
        annualize: Whether to annualize the ratio

    Returns:
        Sharpe ratio
    """
    if len(returns) < 2:
        return 0.0

    # Daily risk-free rate
    rf_daily = (1 + risk_free_rate) ** (1/252) - 1

    excess_returns = returns - rf_daily

    if excess_returns.std() == 0:
        return 0.0

    sharpe = excess_returns.mean() / excess_returns.std()

    if annualize:
        sharpe *= np.sqrt(252)

    return float(sharpe)


def calculate_sortino_ratio(
    returns: np.ndarray,
    risk_free_rate: float = 0.04,
    annualize: bool = True
) -> float:
    """
    Calculate Sortino Ratio (uses downside deviation).

    Args:
        returns: Array of period returns
        risk_free_rate: Annual risk-free rate
        annualize: Whether to annualize the ratio

    Returns:
        Sortino ratio
    """
    if len(returns) < 2:
        return 0.0

    rf_daily = (1 + risk_free_rate) ** (1/252) - 1
    excess_returns = returns - rf_daily

    # Downside returns only
    downside_returns = excess_returns[excess_returns < 0]

    if len(downside_returns) < 2 or downside_returns.std() == 0:
        return 0.0

    sortino = excess_returns.mean() / downside_returns.std()

    if annualize:
        sortino *= np.sqrt(252)

    return float(sortino)


def calculate_max_drawdown(returns: np.ndarray) -> float:
    """
    Calculate maximum drawdown.

    Args:
        returns: Array of period returns

    Returns:
        Maximum drawdown as a positive decimal
    """
    if len(returns) == 0:
        return 0.0

    # Compute cumulative returns
    cum_returns = (1 + returns).cumprod()

    # Running maximum
    running_max = np.maximum.accumulate(cum_returns)

    # Drawdown at each point
    drawdowns = (running_max - cum_returns) / running_max

    return float(drawdowns.max())


def calculate_avg_drawdown(returns: np.ndarray) -> float:
    """
    Calculate average drawdown.

    Args:
        returns: Array of period returns

    Returns:
        Average drawdown as a positive decimal
    """
    if len(returns) == 0:
        return 0.0

    cum_returns = (1 + returns).cumprod()
    running_max = np.maximum.accumulate(cum_returns)
    drawdowns = (running_max - cum_returns) / running_max

    # Only consider periods in drawdown
    in_drawdown = drawdowns[drawdowns > 0]

    if len(in_drawdown) == 0:
        return 0.0

    return float(in_drawdown.mean())


def calculate_information_ratio(
    returns: np.ndarray,
    benchmark_returns: np.ndarray
) -> float:
    """
    Calculate Information Ratio vs benchmark.

    Args:
        returns: Strategy returns
        benchmark_returns: Benchmark returns

    Returns:
        Information ratio
    """
    if len(returns) != len(benchmark_returns) or len(returns) < 2:
        return 0.0

    excess = returns - benchmark_returns

    if excess.std() == 0:
        return 0.0

    return float(excess.mean() / excess.std() * np.sqrt(252))


def calculate_kelly_fraction(
    returns: np.ndarray
) -> float:
    """
    Calculate optimal Kelly fraction from historical returns.

    Args:
        returns: Array of bet returns (e.g., 0.5 for +50%, -1 for total loss)

    Returns:
        Optimal Kelly fraction
    """
    if len(returns) < 10:
        return 0.0

    # Estimate win probability and average win/loss
    wins = returns[returns > 0]
    losses = returns[returns < 0]

    if len(wins) == 0 or len(losses) == 0:
        return 0.0

    p = len(wins) / len(returns)
    avg_win = wins.mean()
    avg_loss = abs(losses.mean())

    if avg_loss == 0:
        return 0.0

    # Kelly formula: f* = (bp - q) / b
    # where b = avg_win / avg_loss, p = win probability, q = 1-p
    b = avg_win / avg_loss

    kelly = (b * p - (1 - p)) / b

    return max(0, kelly)


def calculate_var(
    returns: np.ndarray,
    confidence: float = 0.95
) -> float:
    """
    Calculate Value at Risk.

    Args:
        returns: Array of returns
        confidence: Confidence level

    Returns:
        VaR as a positive decimal (potential loss)
    """
    if len(returns) == 0:
        return 0.0

    return float(-np.percentile(returns, (1 - confidence) * 100))


def calculate_cvar(
    returns: np.ndarray,
    confidence: float = 0.95
) -> float:
    """
    Calculate Conditional Value at Risk (Expected Shortfall).

    Args:
        returns: Array of returns
        confidence: Confidence level

    Returns:
        CVaR as a positive decimal
    """
    if len(returns) == 0:
        return 0.0

    var = calculate_var(returns, confidence)
    tail_returns = returns[returns <= -var]

    if len(tail_returns) == 0:
        return var

    return float(-tail_returns.mean())


def analyze_streaks(bet_results: List[Dict]) -> Dict:
    """
    Analyze winning and losing streaks.

    Args:
        bet_results: List of bet result dictionaries

    Returns:
        Streak analysis
    """
    if not bet_results:
        return {'max_win_streak': 0, 'max_loss_streak': 0}

    outcomes = [1 if b.get('pnl', 0) > 0 else -1 for b in bet_results]

    # Find streaks
    max_win_streak = 0
    max_loss_streak = 0
    current_streak = 0
    current_type = 0

    for outcome in outcomes:
        if outcome == current_type:
            current_streak += 1
        else:
            current_type = outcome
            current_streak = 1

        if current_type == 1:
            max_win_streak = max(max_win_streak, current_streak)
        else:
            max_loss_streak = max(max_loss_streak, current_streak)

    return {
        'max_win_streak': max_win_streak,
        'max_loss_streak': max_loss_streak,
        'avg_win_streak': max_win_streak / max(1, len([r for r in bet_results if r.get('pnl', 0) > 0])),
        'avg_loss_streak': max_loss_streak / max(1, len([r for r in bet_results if r.get('pnl', 0) < 0]))
    }


def calculate_clv_metrics(bet_results: List[Dict]) -> Dict:
    """
    Calculate Closing Line Value metrics.

    CLV is the best predictor of long-term profitability.

    Args:
        bet_results: List of bet result dictionaries

    Returns:
        CLV metrics
    """
    clv_bets = [b for b in bet_results if b.get('closing_odds') is not None]

    if not clv_bets:
        return {
            'avg_clv': 0.0,
            'positive_clv_rate': 0.0,
            'clv_pnl_correlation': 0.0
        }

    clv_values = []
    pnl_values = []

    for bet in clv_bets:
        placed_prob = 1 / bet['odds']
        closing_prob = 1 / bet['closing_odds']
        clv = closing_prob - placed_prob

        clv_values.append(clv)
        pnl_values.append(bet.get('pnl', 0))

    clv_array = np.array(clv_values)
    pnl_array = np.array(pnl_values)

    # Correlation
    if len(clv_array) > 2:
        correlation = np.corrcoef(clv_array, pnl_array)[0, 1]
    else:
        correlation = 0.0

    return {
        'avg_clv': float(clv_array.mean()),
        'positive_clv_rate': float((clv_array > 0).mean()),
        'clv_pnl_correlation': float(correlation) if not np.isnan(correlation) else 0.0,
        'total_clv_edge': float(clv_array.sum())
    }
