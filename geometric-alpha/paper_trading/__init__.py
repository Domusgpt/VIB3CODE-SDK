"""
Paper Trading module for testing before live betting.

Run paper trading for at least 3 months and 500+ bets
before considering real money.
"""

from .simulator import (
    PaperTradingSimulator,
    PaperBet,
    DailyResult,
    ValidationReport,
    ValidationStatus,
    run_quick_paper_test,
)

__all__ = [
    'PaperTradingSimulator',
    'PaperBet',
    'DailyResult',
    'ValidationReport',
    'ValidationStatus',
    'run_quick_paper_test',
]
