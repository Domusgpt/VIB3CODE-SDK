"""
Data and Feature Pipelines

Structured pipelines for data processing and feature computation.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from datetime import datetime
import logging

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class PipelineStep:
    """Single step in a pipeline."""

    name: str
    func: Callable
    params: Dict[str, Any] = field(default_factory=dict)
    required: bool = True


class DataPipeline:
    """
    Pipeline for data ingestion and preprocessing.

    Handles:
    - Data fetching
    - Cleaning
    - Validation
    - Caching
    """

    def __init__(self):
        """Initialize data pipeline."""
        self.steps: List[PipelineStep] = []
        self.cache: Dict[str, pd.DataFrame] = {}

    def add_step(
        self,
        name: str,
        func: Callable,
        params: Dict[str, Any] = None,
        required: bool = True
    ):
        """Add a step to the pipeline."""
        self.steps.append(PipelineStep(
            name=name,
            func=func,
            params=params or {},
            required=required
        ))

    def run(
        self,
        initial_data: Any = None,
        cache_key: str = None
    ) -> pd.DataFrame:
        """
        Execute the pipeline.

        Args:
            initial_data: Input data
            cache_key: Optional key for caching results

        Returns:
            Processed DataFrame
        """
        # Check cache
        if cache_key and cache_key in self.cache:
            logger.info(f"Using cached data for {cache_key}")
            return self.cache[cache_key]

        data = initial_data

        for step in self.steps:
            logger.info(f"Running step: {step.name}")

            try:
                data = step.func(data, **step.params)
            except Exception as e:
                if step.required:
                    raise RuntimeError(f"Pipeline step {step.name} failed: {e}")
                else:
                    logger.warning(f"Optional step {step.name} failed: {e}")

        # Cache results
        if cache_key:
            self.cache[cache_key] = data

        return data

    def clear_cache(self):
        """Clear the pipeline cache."""
        self.cache.clear()


class FeaturePipeline:
    """
    Pipeline for geometric feature computation.

    Computes:
    - Pitch tunneling features
    - Umpire zone features
    - Defensive coverage features
    - Arsenal polytope features
    """

    def __init__(self):
        """Initialize feature pipeline."""
        self.feature_generators: Dict[str, Callable] = {}
        self.computed_features: Dict[str, pd.DataFrame] = {}

    def register_generator(
        self,
        name: str,
        func: Callable[[pd.DataFrame], pd.DataFrame]
    ):
        """Register a feature generator function."""
        self.feature_generators[name] = func

    def compute(
        self,
        data: pd.DataFrame,
        features: List[str] = None
    ) -> pd.DataFrame:
        """
        Compute features from data.

        Args:
            data: Input DataFrame
            features: List of feature groups to compute (default: all)

        Returns:
            DataFrame with computed features
        """
        features = features or list(self.feature_generators.keys())

        all_features = []

        for feature_name in features:
            if feature_name not in self.feature_generators:
                logger.warning(f"Unknown feature: {feature_name}")
                continue

            logger.info(f"Computing feature: {feature_name}")

            try:
                feature_df = self.feature_generators[feature_name](data)
                self.computed_features[feature_name] = feature_df
                all_features.append(feature_df)
            except Exception as e:
                logger.error(f"Failed to compute {feature_name}: {e}")

        if not all_features:
            return pd.DataFrame()

        # Combine features
        result = all_features[0]
        for df in all_features[1:]:
            # Merge on common index
            common_cols = result.columns.intersection(df.columns)
            if len(common_cols) > 0:
                result = result.merge(df, on=list(common_cols), how='outer')
            else:
                result = pd.concat([result, df], axis=1)

        return result

    def get_feature(self, name: str) -> Optional[pd.DataFrame]:
        """Get a specific computed feature."""
        return self.computed_features.get(name)


def create_standard_data_pipeline() -> DataPipeline:
    """Create the standard data processing pipeline."""
    pipeline = DataPipeline()

    # Step 1: Validate input
    def validate_input(data: pd.DataFrame) -> pd.DataFrame:
        required_cols = ['game_pk', 'pitcher', 'release_speed']
        missing = [c for c in required_cols if c not in data.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")
        return data

    # Step 2: Clean data
    def clean_data(data: pd.DataFrame) -> pd.DataFrame:
        # Remove invalid velocity readings
        mask = (
            (data['release_speed'] >= 60) &
            (data['release_speed'] <= 110)
        )
        return data[mask].copy()

    # Step 3: Convert types
    def convert_types(data: pd.DataFrame) -> pd.DataFrame:
        data['game_date'] = pd.to_datetime(data['game_date'])
        return data

    # Step 4: Sort by time
    def sort_data(data: pd.DataFrame) -> pd.DataFrame:
        return data.sort_values(['game_date', 'game_pk', 'at_bat_number', 'pitch_number'])

    pipeline.add_step("validate", validate_input)
    pipeline.add_step("clean", clean_data)
    pipeline.add_step("types", convert_types)
    pipeline.add_step("sort", sort_data)

    return pipeline


def create_standard_feature_pipeline() -> FeaturePipeline:
    """Create the standard feature computation pipeline."""
    from features.tunneling import TunnelAnalyzer
    from features.umpire_hull import UmpireHullCalculator
    from features.arsenal import ArsenalAnalyzer

    pipeline = FeaturePipeline()

    # Tunnel features
    tunnel_analyzer = TunnelAnalyzer()

    def compute_tunnel_features(data: pd.DataFrame) -> pd.DataFrame:
        tunnel_df = tunnel_analyzer.compute_tunnel_scores(data)

        # Aggregate to game level
        game_features = tunnel_df.groupby('game_pk').agg({
            'tunnel_score': ['mean', 'max', 'std']
        }).reset_index()

        game_features.columns = [
            'game_pk', 'tunnel_score_mean', 'tunnel_score_max', 'tunnel_score_std'
        ]

        return game_features

    # Umpire features
    hull_calc = UmpireHullCalculator()

    def compute_umpire_features(data: pd.DataFrame) -> pd.DataFrame:
        # Filter to called strikes
        called_strikes = data[data['description'] == 'called_strike']

        if len(called_strikes) == 0:
            return pd.DataFrame(columns=['game_pk', 'umpire_expansion'])

        # Compute per-game umpire metrics
        game_features = []

        for game_pk, game_strikes in called_strikes.groupby('game_pk'):
            if len(game_strikes) < 20:
                continue

            metrics = hull_calc.compute_zone_metrics(game_strikes)

            if metrics:
                game_features.append({
                    'game_pk': game_pk,
                    'umpire_expansion': metrics.expansion_factor,
                    'umpire_centroid_z': metrics.centroid_z
                })

        return pd.DataFrame(game_features)

    # Arsenal features
    arsenal_analyzer = ArsenalAnalyzer()

    def compute_arsenal_features(data: pd.DataFrame) -> pd.DataFrame:
        # Compute per-pitcher arsenal metrics
        pitcher_features = []

        for pitcher_id, pitcher_data in data.groupby('pitcher'):
            if len(pitcher_data) < 100:
                continue

            polytope = arsenal_analyzer.compute_arsenal_polytope(pitcher_data, pitcher_id)

            if polytope:
                pitcher_features.append({
                    'pitcher': pitcher_id,
                    'arsenal_hull_volume': polytope.hull_volume,
                    'arsenal_effective_dim': polytope.effective_dimensionality,
                    'arsenal_stability': 1 - polytope.release_point_variance
                })

        return pd.DataFrame(pitcher_features)

    pipeline.register_generator('tunnel', compute_tunnel_features)
    pipeline.register_generator('umpire', compute_umpire_features)
    pipeline.register_generator('arsenal', compute_arsenal_features)

    return pipeline


class BatchProcessor:
    """
    Batch processor for large-scale feature computation.

    Processes data in chunks to handle memory constraints.
    """

    def __init__(
        self,
        batch_size: int = 10000,
        n_jobs: int = 1
    ):
        """
        Initialize batch processor.

        Args:
            batch_size: Number of rows per batch
            n_jobs: Number of parallel jobs
        """
        self.batch_size = batch_size
        self.n_jobs = n_jobs

    def process(
        self,
        data: pd.DataFrame,
        func: Callable[[pd.DataFrame], pd.DataFrame],
        combine: Callable[[List[pd.DataFrame]], pd.DataFrame] = None
    ) -> pd.DataFrame:
        """
        Process data in batches.

        Args:
            data: Input DataFrame
            func: Processing function
            combine: Function to combine batch results

        Returns:
            Combined results
        """
        combine = combine or pd.concat

        n_batches = len(data) // self.batch_size + 1
        results = []

        for i in range(n_batches):
            start = i * self.batch_size
            end = min((i + 1) * self.batch_size, len(data))

            batch = data.iloc[start:end]

            if len(batch) == 0:
                continue

            logger.info(f"Processing batch {i + 1}/{n_batches}")

            try:
                batch_result = func(batch)
                results.append(batch_result)
            except Exception as e:
                logger.error(f"Batch {i + 1} failed: {e}")

        if not results:
            return pd.DataFrame()

        return combine(results, ignore_index=True)
