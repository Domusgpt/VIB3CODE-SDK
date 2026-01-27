#!/usr/bin/env python3
"""
Geometric Alpha CLI

Command-line interface for the Polytopal Projection Processing system.
"""

import argparse
import sys
from pathlib import Path
from datetime import datetime
import json

from utils.logging import setup_logging, get_logger
from config.settings import CONFIG

logger = get_logger(__name__)


def cmd_train(args):
    """Train the prediction models."""
    from core.engine import GeometricAlphaEngine

    logger.info("Initializing Geometric Alpha Engine...")
    engine = GeometricAlphaEngine()

    logger.info(f"Training on years {args.start_year} to {args.end_year}...")
    metrics = engine.train(
        start_year=args.start_year,
        end_year=args.end_year,
        force_refresh=args.refresh
    )

    print("\nTraining Complete!")
    print("=" * 40)
    for model, model_metrics in metrics.items():
        print(f"\n{model}:")
        for metric, value in model_metrics.items():
            print(f"  {metric}: {value}")

    if args.save:
        save_path = Path(args.save)
        engine.save_state(save_path)
        print(f"\nModel saved to {save_path}")


def cmd_predict(args):
    """Generate predictions for today's slate."""
    from core.engine import GeometricAlphaEngine

    logger.info("Loading Geometric Alpha Engine...")
    engine = GeometricAlphaEngine()

    if args.load:
        engine.load_state(Path(args.load))
    else:
        logger.warning("No model loaded - using untrained predictions")

    # Process today's slate
    date = datetime.strptime(args.date, "%Y-%m-%d") if args.date else datetime.now()
    slate = engine.process_daily_slate(date)

    print(f"\nSlate for {date.strftime('%Y-%m-%d')}")
    print("=" * 50)
    print(f"Games: {len(slate.games)}")
    print(f"Opportunities: {len(slate.opportunities)}")
    print(f"Value Bets: {len(slate.recommended_bets)}")

    if slate.recommended_bets:
        print("\nRecommended Bets:")
        print("-" * 40)
        for opp_id, stake in sorted(slate.recommended_bets.items(), key=lambda x: -x[1]):
            print(f"  {opp_id}: ${stake:.2f}")

    if args.output:
        output_data = {
            'date': date.strftime('%Y-%m-%d'),
            'games': slate.games,
            'recommendations': slate.recommended_bets
        }
        with open(args.output, 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"\nOutput saved to {args.output}")


def cmd_backtest(args):
    """Run a backtest simulation."""
    from backtest.simulator import BacktestSimulator

    logger.info(f"Running backtest: {args.start} to {args.end}")

    simulator = BacktestSimulator(
        initial_bankroll=args.bankroll,
        start_date=args.start,
        end_date=args.end
    )

    result = simulator.run(verbose=not args.quiet)

    print(result.summary())

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(result.to_dict(), f, indent=2)
        print(f"\nResults saved to {args.output}")


def cmd_status(args):
    """Show engine status."""
    from core.engine import GeometricAlphaEngine

    engine = GeometricAlphaEngine()

    if args.load:
        engine.load_state(Path(args.load))

    status = engine.get_status()

    print("\nGeometric Alpha Status")
    print("=" * 40)
    print(f"Trained: {status['is_trained']}")
    print(f"Last Update: {status['last_update'] or 'Never'}")
    print(f"Bankroll: ${status['current_bankroll']:,.2f}")
    print(f"Pending Bets: {status['pending_bets']}")
    print(f"Total Bets: {status['total_bets']}")

    if status['performance']:
        perf = status['performance']
        print(f"\nPerformance:")
        print(f"  Win Rate: {perf.get('win_rate', 0):.1%}")
        print(f"  ROI: {perf.get('roi', 0):.2%}")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Geometric Alpha - Polytopal Sports Betting System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Train the model
  python -m geometric_alpha train --start-year 2021 --end-year 2023 --save ./model

  # Generate today's predictions
  python -m geometric_alpha predict --load ./model

  # Run a backtest
  python -m geometric_alpha backtest --start 2024-04-01 --end 2024-09-30 --bankroll 10000

  # Check status
  python -m geometric_alpha status --load ./model
        """
    )

    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    parser.add_argument(
        '--log-file',
        type=str,
        help='Log file path'
    )

    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # Train command
    train_parser = subparsers.add_parser('train', help='Train prediction models')
    train_parser.add_argument(
        '--start-year', type=int, default=2021,
        help='First year of training data'
    )
    train_parser.add_argument(
        '--end-year', type=int, default=2023,
        help='Last year of training data'
    )
    train_parser.add_argument(
        '--refresh', action='store_true',
        help='Force refresh of cached data'
    )
    train_parser.add_argument(
        '--save', type=str,
        help='Path to save trained model'
    )

    # Predict command
    predict_parser = subparsers.add_parser('predict', help='Generate predictions')
    predict_parser.add_argument(
        '--date', type=str,
        help='Date to predict (YYYY-MM-DD, default: today)'
    )
    predict_parser.add_argument(
        '--load', type=str,
        help='Path to load trained model'
    )
    predict_parser.add_argument(
        '--output', '-o', type=str,
        help='Output file for predictions'
    )

    # Backtest command
    backtest_parser = subparsers.add_parser('backtest', help='Run backtest simulation')
    backtest_parser.add_argument(
        '--start', type=str, required=True,
        help='Start date (YYYY-MM-DD)'
    )
    backtest_parser.add_argument(
        '--end', type=str, required=True,
        help='End date (YYYY-MM-DD)'
    )
    backtest_parser.add_argument(
        '--bankroll', type=float, default=10000,
        help='Initial bankroll'
    )
    backtest_parser.add_argument(
        '--quiet', '-q', action='store_true',
        help='Suppress progress output'
    )
    backtest_parser.add_argument(
        '--output', '-o', type=str,
        help='Output file for results'
    )

    # Status command
    status_parser = subparsers.add_parser('status', help='Show engine status')
    status_parser.add_argument(
        '--load', type=str,
        help='Path to load engine state'
    )

    args = parser.parse_args()

    # Setup logging
    log_level = 'DEBUG' if args.verbose else 'INFO'
    log_file = Path(args.log_file) if args.log_file else None
    setup_logging(level=log_level, log_file=log_file)

    # Execute command
    if args.command == 'train':
        cmd_train(args)
    elif args.command == 'predict':
        cmd_predict(args)
    elif args.command == 'backtest':
        cmd_backtest(args)
    elif args.command == 'status':
        cmd_status(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
