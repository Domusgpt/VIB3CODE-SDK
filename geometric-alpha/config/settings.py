"""
Geometric Alpha Configuration Settings

Central configuration for the Polytopal Projection Processing system.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict
from pathlib import Path


@dataclass
class DataConfig:
    """Data layer configuration."""

    # Storage paths
    data_dir: Path = Path("./data_lake")
    parquet_dir: Path = Path("./data_lake/parquet")
    cache_dir: Path = Path("./data_lake/cache")

    # Statcast settings
    statcast_start_year: int = 2021
    statcast_end_year: int = 2025

    # Odds API settings
    odds_api_key: Optional[str] = None
    odds_api_base_url: str = "https://api.the-odds-api.com/v4"
    odds_sport: str = "baseball_mlb"

    # Data quality thresholds
    min_pitch_velocity: float = 60.0  # Filter out bad readings
    max_pitch_velocity: float = 110.0
    knn_impute_neighbors: int = 5


@dataclass
class GeometricConfig:
    """Geometric feature engineering configuration."""

    # Tunneling parameters
    decision_point_time: float = 0.175  # seconds (23.8 ft from plate)
    plate_time: float = 0.400  # seconds
    tunnel_epsilon: float = 1e-6  # Avoid division by zero

    # Umpire hull parameters
    umpire_window_games: int = 5  # Trailing window for hull calculation
    rulebook_zone_width: float = 17.0 / 12.0  # 17 inches in feet
    rulebook_zone_height: float = 2.0  # Approximate average height
    zone_expansion_threshold: float = 1.1  # 10% expansion = significant

    # Voronoi parameters
    field_boundary_radius: float = 400  # feet
    edge_proximity_threshold: float = 10.0  # feet from Voronoi edge

    # Arsenal polytope
    arsenal_min_pitches: int = 100  # Min pitches for stable hull
    arsenal_dimensions: List[str] = field(default_factory=lambda: [
        'release_speed', 'release_spin_rate',
        'pfx_x', 'pfx_z',  # Movement
        'release_pos_x', 'release_pos_z',  # Release point
        'vx0', 'vz0'  # Velocity components
    ])


@dataclass
class ModelConfig:
    """Machine learning model configuration."""

    # Feature sets
    geometric_features: List[str] = field(default_factory=lambda: [
        'tunnel_score_mean', 'tunnel_score_max',
        'arsenal_hull_volume', 'arsenal_hull_vertices',
        'release_point_variance',
        'umpire_zone_expansion', 'umpire_centroid_z',
        'defensive_voronoi_edge_density'
    ])

    contextual_features: List[str] = field(default_factory=lambda: [
        'inning', 'score_diff', 'handedness_match',
        'base_out_state', 'pitch_count'
    ])

    environmental_features: List[str] = field(default_factory=lambda: [
        'temperature', 'wind_speed', 'wind_direction',
        'altitude', 'humidity'
    ])

    # Model hyperparameters
    xgb_params: Dict = field(default_factory=lambda: {
        'n_estimators': 500,
        'max_depth': 6,
        'learning_rate': 0.05,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'objective': 'reg:squarederror',
        'random_state': 42
    })

    lgbm_params: Dict = field(default_factory=lambda: {
        'n_estimators': 500,
        'max_depth': 6,
        'learning_rate': 0.05,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'objective': 'regression',
        'random_state': 42
    })

    # Training settings
    train_test_split_year: int = 2024
    cv_folds: int = 5


@dataclass
class OptimizationConfig:
    """Kelly optimization and portfolio configuration."""

    # Kelly settings
    max_exposure: float = 0.25  # Maximum total bankroll per slate
    max_single_bet: float = 0.10  # Maximum single bet fraction
    min_edge_threshold: float = 0.02  # Minimum edge to bet

    # Bankroll management
    initial_bankroll: float = 10000.0
    risk_of_ruin_threshold: float = 0.01  # 1% max acceptable RoR

    # Solver settings
    solver: str = "ECOS"  # ECOS or SCS
    solver_verbose: bool = False


@dataclass
class BacktestConfig:
    """Backtesting and validation configuration."""

    # Time machine settings
    start_date: str = "2024-04-01"
    end_date: str = "2024-09-30"

    # Simulation settings
    commission: float = 0.0  # Sportsbook commission (usually built into odds)
    slippage: float = 0.02  # 2 cents of expected slippage

    # Metrics
    clv_window_minutes: int = 10  # Compare to line N minutes before game

    # Logging
    log_trades: bool = True
    save_daily_snapshots: bool = True


@dataclass
class GeometricAlphaConfig:
    """Master configuration aggregating all subsystems."""

    data: DataConfig = field(default_factory=DataConfig)
    geometric: GeometricConfig = field(default_factory=GeometricConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    optimization: OptimizationConfig = field(default_factory=OptimizationConfig)
    backtest: BacktestConfig = field(default_factory=BacktestConfig)

    def __post_init__(self):
        """Ensure directories exist."""
        self.data.data_dir.mkdir(parents=True, exist_ok=True)
        self.data.parquet_dir.mkdir(parents=True, exist_ok=True)
        self.data.cache_dir.mkdir(parents=True, exist_ok=True)


# Global configuration instance
CONFIG = GeometricAlphaConfig()
