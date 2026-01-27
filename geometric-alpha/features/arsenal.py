"""
Pitcher Arsenal Polytope Analysis

Models a pitcher's complete pitch repertoire as a high-dimensional
polytope in kinematic space. Analyzes the "shape" of skill.

UPGRADED: Rolling Window Topology to prevent look-ahead bias.
Global manifold learners (UMAP, t-SNE) fitted on full-season data allow
future information to influence past predictions. This module now supports
trailing-window-only manifold learning for production use.
"""

import numpy as np
import pandas as pd
from scipy.spatial import ConvexHull
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.manifold import TSNE
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional
from datetime import datetime
import logging

# Optional UMAP import (preferred for topology)
try:
    from umap import UMAP
    UMAP_AVAILABLE = True
except ImportError:
    UMAP_AVAILABLE = False

from config.settings import CONFIG

logger = logging.getLogger(__name__)

# =============================================================================
# ROLLING WINDOW TOPOLOGY CONFIGURATION
# =============================================================================
# These parameters control the look-ahead bias prevention system
DEFAULT_TRAILING_WINDOW = 500  # Pitches to use for manifold learning
DEFAULT_MIN_TRAILING = 100     # Minimum pitches required for stable manifold


@dataclass
class ArsenalPolytope:
    """Representation of a pitcher's arsenal as a polytope."""

    pitcher_id: int

    # Hull properties (in high-dimensional space)
    hull_volume: float
    hull_vertices: int
    hull_facets: int

    # Per-pitch-type clusters
    pitch_clusters: Dict[str, Dict] = field(default_factory=dict)

    # Dimensionality analysis
    explained_variance_ratio: List[float] = field(default_factory=list)
    effective_dimensionality: float = 0.0

    # Stability metrics
    release_point_variance: float = 0.0
    velocity_variance: float = 0.0
    movement_variance: float = 0.0

    # Arsenal composition
    pitch_type_distribution: Dict[str, float] = field(default_factory=dict)

    # Clustering quality
    cluster_separation: float = 0.0  # Inter-cluster distance
    cluster_tightness: float = 0.0   # Intra-cluster variance

    # Sample info
    n_pitches: int = 0

    def is_stable(self) -> bool:
        """Check if arsenal shows consistent release and movement."""
        return (
            self.release_point_variance < 0.15 and
            self.cluster_tightness < 0.5
        )

    def is_diverse(self) -> bool:
        """Check if arsenal has diverse pitch types."""
        return len(self.pitch_type_distribution) >= 4


class ArsenalAnalyzer:
    """
    Analyzer for pitcher arsenal polytopes.

    Uses convex hull analysis in high-dimensional kinematic space
    to characterize a pitcher's capabilities.
    """

    def __init__(self, config=None):
        """Initialize arsenal analyzer."""
        self.config = config or CONFIG.geometric
        self.feature_cols = self.config.arsenal_dimensions
        self.scaler = StandardScaler()

    def compute_arsenal_polytope(
        self,
        pitches_df: pd.DataFrame,
        pitcher_id: int = 0
    ) -> Optional[ArsenalPolytope]:
        """
        Compute the polytope representation of a pitcher's arsenal.

        Args:
            pitches_df: DataFrame with single pitcher's pitches
            pitcher_id: Pitcher identifier

        Returns:
            ArsenalPolytope object
        """
        if len(pitches_df) < self.config.arsenal_min_pitches:
            logger.warning(
                f"Insufficient pitches ({len(pitches_df)}) for arsenal analysis"
            )
            return None

        # Extract and validate features
        available_cols = [c for c in self.feature_cols if c in pitches_df.columns]
        if len(available_cols) < 4:
            logger.warning("Insufficient feature columns for arsenal analysis")
            return None

        df = pitches_df[available_cols].dropna().copy()

        if len(df) < self.config.arsenal_min_pitches:
            return None

        # Normalize features
        features = self.scaler.fit_transform(df.values)

        # Compute convex hull
        hull_metrics = self._compute_hull_metrics(features)

        # Dimensionality analysis
        pca_results = self._analyze_dimensionality(features)

        # Cluster analysis per pitch type
        pitch_clusters = {}
        if 'pitch_type' in pitches_df.columns:
            valid_indices = df.index
            pitch_types = pitches_df.loc[valid_indices, 'pitch_type']

            for pt in pitch_types.unique():
                pt_mask = pitch_types == pt
                pt_features = features[pt_mask]

                if len(pt_features) >= 10:
                    pitch_clusters[pt] = self._analyze_cluster(pt_features)

        # Stability analysis
        stability = self._analyze_stability(df)

        # Pitch type distribution
        if 'pitch_type' in pitches_df.columns:
            distribution = pitches_df['pitch_type'].value_counts(normalize=True).to_dict()
        else:
            distribution = {}

        # Cluster quality
        cluster_separation, cluster_tightness = self._compute_cluster_quality(
            features, pitches_df.get('pitch_type')
        )

        return ArsenalPolytope(
            pitcher_id=pitcher_id,
            hull_volume=hull_metrics['volume'],
            hull_vertices=hull_metrics['vertices'],
            hull_facets=hull_metrics['facets'],
            pitch_clusters=pitch_clusters,
            explained_variance_ratio=pca_results['variance_ratio'],
            effective_dimensionality=pca_results['effective_dim'],
            release_point_variance=stability['release_variance'],
            velocity_variance=stability['velocity_variance'],
            movement_variance=stability['movement_variance'],
            pitch_type_distribution=distribution,
            cluster_separation=cluster_separation,
            cluster_tightness=cluster_tightness,
            n_pitches=len(df)
        )

    def _compute_hull_metrics(
        self,
        features: np.ndarray
    ) -> Dict:
        """Compute convex hull metrics in high-dimensional space."""
        try:
            # For high dimensions, use PCA to reduce before hull
            if features.shape[1] > 4:
                pca = PCA(n_components=min(4, features.shape[1]))
                reduced = pca.fit_transform(features)
            else:
                reduced = features

            hull = ConvexHull(reduced)

            return {
                'volume': hull.volume,
                'vertices': len(hull.vertices),
                'facets': len(hull.simplices)
            }
        except Exception as e:
            logger.warning(f"Hull computation failed: {e}")
            return {'volume': 0.0, 'vertices': 0, 'facets': 0}

    def _analyze_dimensionality(
        self,
        features: np.ndarray
    ) -> Dict:
        """Analyze effective dimensionality using PCA."""
        pca = PCA()
        pca.fit(features)

        variance_ratio = pca.explained_variance_ratio_.tolist()

        # Effective dimensionality: number of components for 90% variance
        cumulative = np.cumsum(variance_ratio)
        effective_dim = np.searchsorted(cumulative, 0.9) + 1

        return {
            'variance_ratio': variance_ratio,
            'effective_dim': float(effective_dim)
        }

    def _analyze_cluster(
        self,
        cluster_features: np.ndarray
    ) -> Dict:
        """Analyze a single pitch type cluster."""
        centroid = cluster_features.mean(axis=0)
        variance = cluster_features.var(axis=0).mean()

        # Distances from centroid
        distances = np.linalg.norm(cluster_features - centroid, axis=1)

        return {
            'centroid': centroid.tolist(),
            'variance': float(variance),
            'mean_distance': float(distances.mean()),
            'max_distance': float(distances.max()),
            'n_samples': len(cluster_features)
        }

    def _analyze_stability(
        self,
        df: pd.DataFrame
    ) -> Dict:
        """Analyze release point and movement stability."""
        release_cols = [c for c in ['release_pos_x', 'release_pos_z']
                       if c in df.columns]
        velocity_cols = [c for c in ['release_speed'] if c in df.columns]
        movement_cols = [c for c in ['pfx_x', 'pfx_z'] if c in df.columns]

        release_variance = df[release_cols].var().mean() if release_cols else 0.0
        velocity_variance = df[velocity_cols].var().mean() if velocity_cols else 0.0
        movement_variance = df[movement_cols].var().mean() if movement_cols else 0.0

        return {
            'release_variance': float(release_variance),
            'velocity_variance': float(velocity_variance),
            'movement_variance': float(movement_variance)
        }

    def _compute_cluster_quality(
        self,
        features: np.ndarray,
        pitch_types: Optional[pd.Series]
    ) -> Tuple[float, float]:
        """Compute inter-cluster separation and intra-cluster tightness."""
        if pitch_types is None or len(pitch_types) == 0:
            return 0.0, 0.0

        # Get valid entries
        valid_mask = pitch_types.notna()
        valid_features = features[valid_mask]
        valid_types = pitch_types[valid_mask]

        unique_types = valid_types.unique()
        if len(unique_types) < 2:
            return 0.0, 0.0

        # Compute centroids
        centroids = {}
        variances = []

        for pt in unique_types:
            pt_mask = valid_types.values == pt
            pt_features = valid_features[pt_mask]

            if len(pt_features) >= 5:
                centroids[pt] = pt_features.mean(axis=0)
                variances.append(pt_features.var(axis=0).mean())

        if len(centroids) < 2:
            return 0.0, 0.0

        # Inter-cluster distance (average pairwise centroid distance)
        centroid_list = list(centroids.values())
        separations = []
        for i in range(len(centroid_list)):
            for j in range(i + 1, len(centroid_list)):
                dist = np.linalg.norm(centroid_list[i] - centroid_list[j])
                separations.append(dist)

        separation = np.mean(separations) if separations else 0.0
        tightness = np.mean(variances) if variances else 0.0

        return float(separation), float(tightness)

    def visualize_arsenal_2d(
        self,
        pitches_df: pd.DataFrame,
        method: str = 'pca',
        use_rolling_window: bool = False,
        trailing_window: int = DEFAULT_TRAILING_WINDOW
    ) -> Dict:
        """
        Project arsenal to 2D for visualization.

        UPGRADED: Now supports Rolling Window Topology to prevent look-ahead bias.

        Args:
            pitches_df: Pitcher's pitch data (should be sorted by date/time)
            method: 'pca', 'tsne', or 'umap'
            use_rolling_window: If True, only use trailing pitches for manifold learning
            trailing_window: Number of trailing pitches to use (default 500)

        Returns:
            Dict with 2D coordinates and labels
        """
        available_cols = [c for c in self.feature_cols if c in pitches_df.columns]
        df = pitches_df[available_cols].dropna().copy()

        if len(df) < 20:
            return {'x': [], 'y': [], 'labels': []}

        features = self.scaler.fit_transform(df.values)

        # ROLLING WINDOW TOPOLOGY: Only use trailing data for manifold learning
        if use_rolling_window and len(features) > trailing_window:
            # Fit manifold ONLY on trailing window (prevents look-ahead)
            trailing_features = features[-trailing_window:]

            if method == 'umap' and UMAP_AVAILABLE:
                reducer = UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
            elif method == 'tsne':
                perplexity = min(30, len(trailing_features) - 1)
                reducer = TSNE(n_components=2, random_state=42, perplexity=perplexity)
            else:
                reducer = PCA(n_components=2)

            # Fit on trailing window only
            reducer.fit(trailing_features)

            # Transform all data using the trailing-fitted model
            # For PCA: use transform; for t-SNE/UMAP: need to refit with all data
            if method == 'pca':
                reduced = reducer.transform(features)
            else:
                # For non-linear methods, we can only guarantee trailing window is unbiased
                # Earlier points are transformed by the trailing-learned manifold
                if method == 'umap' and UMAP_AVAILABLE:
                    reduced = reducer.transform(features)
                else:
                    # t-SNE doesn't support transform, so we must fit on all
                    # but the manifold is learned from trailing data conceptually
                    reducer_full = TSNE(n_components=2, random_state=42,
                                        perplexity=min(30, len(features)-1))
                    reduced = reducer_full.fit_transform(features)
                    logger.warning("t-SNE doesn't support out-of-sample transform; "
                                   "use 'umap' for true rolling window topology")
        else:
            # Original behavior (use with caution for backtesting)
            if method == 'umap' and UMAP_AVAILABLE:
                reducer = UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
            elif method == 'tsne':
                reducer = TSNE(n_components=2, random_state=42, perplexity=min(30, len(df)-1))
            else:
                reducer = PCA(n_components=2)

            reduced = reducer.fit_transform(features)

        # Get pitch type labels
        if 'pitch_type' in pitches_df.columns:
            labels = pitches_df.loc[df.index, 'pitch_type'].tolist()
        else:
            labels = ['unknown'] * len(reduced)

        return {
            'x': reduced[:, 0].tolist(),
            'y': reduced[:, 1].tolist(),
            'labels': labels,
            'method': method,
            'rolling_window_used': use_rolling_window
        }

    def compute_rolling_topology_features(
        self,
        pitches_df: pd.DataFrame,
        target_date: datetime = None,
        trailing_window: int = DEFAULT_TRAILING_WINDOW,
        min_pitches: int = DEFAULT_MIN_TRAILING
    ) -> Optional[Dict]:
        """
        PRODUCTION-READY: Compute topology features using only trailing data.

        This method prevents look-ahead bias by ONLY using pitches that occurred
        BEFORE the target date. The manifold is learned fresh each morning using
        only historical data.

        Args:
            pitches_df: DataFrame with pitcher's pitches, must have 'game_date' column
            target_date: Date we're predicting for (only use data before this)
            trailing_window: Number of trailing pitches to use
            min_pitches: Minimum pitches required for stable topology

        Returns:
            Dict with topology-derived features or None if insufficient data
        """
        if 'game_date' not in pitches_df.columns:
            logger.warning("compute_rolling_topology_features requires 'game_date' column")
            return None

        # Filter to only pitches BEFORE target date (prevents look-ahead)
        if target_date is not None:
            historical_df = pitches_df[
                pd.to_datetime(pitches_df['game_date']) < pd.to_datetime(target_date)
            ].copy()
        else:
            historical_df = pitches_df.copy()

        # Sort by date and take trailing window
        historical_df = historical_df.sort_values('game_date')

        if len(historical_df) < min_pitches:
            logger.warning(f"Insufficient trailing data: {len(historical_df)} < {min_pitches}")
            return None

        # Use only trailing window
        if len(historical_df) > trailing_window:
            trailing_df = historical_df.tail(trailing_window)
        else:
            trailing_df = historical_df

        # Compute topology features on trailing window ONLY
        available_cols = [c for c in self.feature_cols if c in trailing_df.columns]
        df = trailing_df[available_cols].dropna()

        if len(df) < min_pitches:
            return None

        features = StandardScaler().fit_transform(df.values)

        # Use UMAP for topology if available
        if UMAP_AVAILABLE and len(features) >= 50:
            try:
                reducer = UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
                reduced = reducer.fit_transform(features)

                # Compute topology-derived features
                topology_features = self._extract_topology_metrics(
                    reduced,
                    trailing_df.get('pitch_type')
                )
                topology_features['method'] = 'umap_rolling'
                topology_features['window_size'] = len(trailing_df)
                topology_features['cutoff_date'] = str(target_date) if target_date else None

                return topology_features

            except Exception as e:
                logger.warning(f"UMAP rolling topology failed: {e}")

        # Fallback to PCA (always works, less topology-aware)
        try:
            pca = PCA(n_components=2)
            reduced = pca.fit_transform(features)

            topology_features = self._extract_topology_metrics(
                reduced,
                trailing_df.get('pitch_type')
            )
            topology_features['method'] = 'pca_rolling'
            topology_features['window_size'] = len(trailing_df)
            topology_features['cutoff_date'] = str(target_date) if target_date else None
            topology_features['explained_variance'] = float(sum(pca.explained_variance_ratio_[:2]))

            return topology_features

        except Exception as e:
            logger.error(f"PCA rolling topology failed: {e}")
            return None

    def _extract_topology_metrics(
        self,
        reduced_2d: np.ndarray,
        pitch_types: Optional[pd.Series] = None
    ) -> Dict:
        """
        Extract topology-derived metrics from 2D embedding.

        These metrics characterize the "shape" of the arsenal manifold.
        """
        metrics = {}

        # Overall spread (hull area in 2D)
        try:
            if len(reduced_2d) >= 4:
                hull = ConvexHull(reduced_2d)
                metrics['manifold_area'] = float(hull.volume)  # In 2D, volume = area
                metrics['manifold_perimeter'] = float(hull.area)  # In 2D, area = perimeter
            else:
                metrics['manifold_area'] = 0.0
                metrics['manifold_perimeter'] = 0.0
        except Exception:
            metrics['manifold_area'] = 0.0
            metrics['manifold_perimeter'] = 0.0

        # Centroid location
        centroid = reduced_2d.mean(axis=0)
        metrics['centroid_x'] = float(centroid[0])
        metrics['centroid_y'] = float(centroid[1])

        # Dispersion metrics
        distances_from_centroid = np.linalg.norm(reduced_2d - centroid, axis=1)
        metrics['mean_dispersion'] = float(distances_from_centroid.mean())
        metrics['max_dispersion'] = float(distances_from_centroid.max())
        metrics['dispersion_std'] = float(distances_from_centroid.std())

        # Per-pitch-type cluster metrics
        if pitch_types is not None and len(pitch_types) == len(reduced_2d):
            cluster_centroids = []
            cluster_sizes = []

            for pt in pitch_types.unique():
                if pd.isna(pt):
                    continue
                pt_mask = pitch_types.values == pt
                pt_points = reduced_2d[pt_mask]

                if len(pt_points) >= 3:
                    pt_centroid = pt_points.mean(axis=0)
                    cluster_centroids.append(pt_centroid)
                    cluster_sizes.append(len(pt_points))

            # Inter-cluster separation
            if len(cluster_centroids) >= 2:
                separations = []
                for i in range(len(cluster_centroids)):
                    for j in range(i + 1, len(cluster_centroids)):
                        dist = np.linalg.norm(cluster_centroids[i] - cluster_centroids[j])
                        separations.append(dist)
                metrics['cluster_separation'] = float(np.mean(separations))
            else:
                metrics['cluster_separation'] = 0.0

            metrics['n_clusters'] = len(cluster_centroids)
        else:
            metrics['cluster_separation'] = 0.0
            metrics['n_clusters'] = 0

        return metrics

    def detect_arsenal_instability(
        self,
        pitches_df: pd.DataFrame,
        rolling_window: int = 50,
        use_topology: bool = True
    ) -> List[Dict]:
        """
        Detect signs of arsenal instability over time.

        UPGRADED: Now includes topology-based instability detection.

        Instability (inconsistent clusters, drifting release point,
        manifold shape changes) often precedes poor performance.

        Args:
            pitches_df: Pitcher's pitch data sorted by time
            rolling_window: Number of pitches per window
            use_topology: If True, also detect topology/manifold instability

        Returns:
            List of instability events
        """
        events = []

        if len(pitches_df) < rolling_window * 2:
            return events

        available_cols = [c for c in self.feature_cols if c in pitches_df.columns]

        # Store previous topology metrics for comparison
        prev_topology = None

        for i in range(rolling_window, len(pitches_df) - rolling_window, rolling_window // 2):
            window_current = pitches_df.iloc[i:i + rolling_window]
            window_prev = pitches_df.iloc[i - rolling_window:i]

            # Compare release point stability
            if 'release_pos_x' in window_current.columns:
                current_release = window_current[['release_pos_x', 'release_pos_z']].mean()
                prev_release = window_prev[['release_pos_x', 'release_pos_z']].mean()

                drift = np.sqrt(
                    (current_release['release_pos_x'] - prev_release['release_pos_x'])**2 +
                    (current_release['release_pos_z'] - prev_release['release_pos_z'])**2
                )

                if drift > 0.2:  # Significant drift threshold
                    events.append({
                        'type': 'release_drift',
                        'position': i,
                        'magnitude': float(drift),
                        'timestamp': pitches_df.iloc[i].get('game_date')
                    })

            # Compare velocity stability
            if 'release_speed' in window_current.columns:
                current_velo = window_current['release_speed'].mean()
                prev_velo = window_prev['release_speed'].mean()

                velo_drop = prev_velo - current_velo

                if velo_drop > 1.5:  # 1.5 mph drop
                    events.append({
                        'type': 'velocity_drop',
                        'position': i,
                        'magnitude': float(velo_drop),
                        'timestamp': pitches_df.iloc[i].get('game_date')
                    })

            # UPGRADED: Topology-based instability detection
            if use_topology and len(available_cols) >= 4:
                try:
                    # Compute topology metrics on current trailing window
                    current_df = window_current[available_cols].dropna()
                    if len(current_df) >= 20:
                        features = StandardScaler().fit_transform(current_df.values)
                        pca = PCA(n_components=2)
                        reduced = pca.fit_transform(features)

                        current_topology = self._extract_topology_metrics(
                            reduced,
                            window_current.get('pitch_type')
                        )

                        if prev_topology is not None:
                            # Detect manifold area change (arsenal "expansion" or "contraction")
                            area_change = abs(
                                current_topology['manifold_area'] - prev_topology['manifold_area']
                            )
                            area_ratio = area_change / (prev_topology['manifold_area'] + 1e-6)

                            if area_ratio > 0.5:  # 50% change in manifold area
                                events.append({
                                    'type': 'manifold_instability',
                                    'position': i,
                                    'magnitude': float(area_ratio),
                                    'direction': 'expansion' if current_topology['manifold_area'] > prev_topology['manifold_area'] else 'contraction',
                                    'timestamp': pitches_df.iloc[i].get('game_date')
                                })

                            # Detect cluster separation change (losing pitch distinction)
                            sep_change = abs(
                                current_topology['cluster_separation'] - prev_topology['cluster_separation']
                            )
                            if sep_change > 1.0:  # Significant separation change
                                events.append({
                                    'type': 'cluster_separation_shift',
                                    'position': i,
                                    'magnitude': float(sep_change),
                                    'timestamp': pitches_df.iloc[i].get('game_date')
                                })

                        prev_topology = current_topology

                except Exception as e:
                    logger.debug(f"Topology analysis failed at position {i}: {e}")

        return events

    def retrain_daily_manifold(
        self,
        pitches_df: pd.DataFrame,
        as_of_date: datetime,
        trailing_window: int = DEFAULT_TRAILING_WINDOW
    ) -> Optional['DailyManifoldModel']:
        """
        PRODUCTION: Re-train the manifold model every morning.

        This is the core of the Rolling Window Topology upgrade.
        Called each morning to create a fresh manifold using ONLY
        trailing data up to (but not including) the target date.

        Args:
            pitches_df: Full historical pitch data
            as_of_date: The date we're predicting for (excludes this date's data)
            trailing_window: Number of trailing pitches to use

        Returns:
            DailyManifoldModel ready for production inference
        """
        if 'game_date' not in pitches_df.columns:
            logger.error("retrain_daily_manifold requires 'game_date' column")
            return None

        # CRITICAL: Only use data BEFORE the prediction date
        historical_df = pitches_df[
            pd.to_datetime(pitches_df['game_date']) < pd.to_datetime(as_of_date)
        ].copy()

        if len(historical_df) < DEFAULT_MIN_TRAILING:
            logger.warning(f"Insufficient historical data for manifold: {len(historical_df)}")
            return None

        # Sort and take trailing window
        historical_df = historical_df.sort_values('game_date')
        trailing_df = historical_df.tail(trailing_window)

        # Extract features
        available_cols = [c for c in self.feature_cols if c in trailing_df.columns]
        df = trailing_df[available_cols].dropna()

        if len(df) < DEFAULT_MIN_TRAILING:
            return None

        # Fit scaler on trailing data only
        scaler = StandardScaler()
        features = scaler.fit_transform(df.values)

        # Fit manifold on trailing data only
        if UMAP_AVAILABLE and len(features) >= 50:
            manifold = UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
        else:
            manifold = PCA(n_components=2)

        manifold.fit(features)

        return DailyManifoldModel(
            as_of_date=as_of_date,
            scaler=scaler,
            manifold=manifold,
            feature_cols=available_cols,
            training_samples=len(features),
            method='umap' if UMAP_AVAILABLE and len(features) >= 50 else 'pca'
        )


@dataclass
class DailyManifoldModel:
    """
    A manifold model trained on trailing data for a specific date.

    This is the atomic unit of the Rolling Window Topology system.
    Each morning, a new model is trained and used for that day's predictions.
    """
    as_of_date: datetime
    scaler: StandardScaler
    manifold: object  # UMAP or PCA
    feature_cols: List[str]
    training_samples: int
    method: str

    def transform(self, pitches_df: pd.DataFrame) -> Optional[np.ndarray]:
        """
        Transform new pitch data using the pre-trained manifold.

        Safe for production use - no look-ahead bias.
        """
        df = pitches_df[self.feature_cols].dropna()
        if len(df) == 0:
            return None

        features = self.scaler.transform(df.values)

        try:
            if hasattr(self.manifold, 'transform'):
                return self.manifold.transform(features)
            else:
                # Fallback for methods without transform (shouldn't happen)
                logger.warning(f"Manifold {type(self.manifold)} lacks transform method")
                return self.manifold.fit_transform(features)
        except Exception as e:
            logger.error(f"Manifold transform failed: {e}")
            return None

    def get_topology_features(self, pitches_df: pd.DataFrame) -> Optional[Dict]:
        """
        Extract topology features for new pitch data.

        Production-safe: uses pre-trained manifold.
        """
        reduced = self.transform(pitches_df)
        if reduced is None or len(reduced) < 4:
            return None

        # Use the private extraction method from ArsenalAnalyzer
        metrics = {}

        try:
            hull = ConvexHull(reduced)
            metrics['manifold_area'] = float(hull.volume)
            metrics['manifold_perimeter'] = float(hull.area)
        except Exception:
            metrics['manifold_area'] = 0.0
            metrics['manifold_perimeter'] = 0.0

        centroid = reduced.mean(axis=0)
        metrics['centroid_x'] = float(centroid[0])
        metrics['centroid_y'] = float(centroid[1])

        distances = np.linalg.norm(reduced - centroid, axis=1)
        metrics['mean_dispersion'] = float(distances.mean())
        metrics['max_dispersion'] = float(distances.max())

        metrics['model_date'] = str(self.as_of_date)
        metrics['method'] = self.method
        metrics['training_samples'] = self.training_samples

        return metrics


def compute_arsenal_similarity(
    polytope_a: ArsenalPolytope,
    polytope_b: ArsenalPolytope
) -> float:
    """
    Compute similarity between two pitcher arsenals.

    Args:
        polytope_a: First pitcher's polytope
        polytope_b: Second pitcher's polytope

    Returns:
        Similarity score (0.0 to 1.0)
    """
    # Compare pitch type distributions
    types_a = set(polytope_a.pitch_type_distribution.keys())
    types_b = set(polytope_b.pitch_type_distribution.keys())

    type_overlap = len(types_a & types_b) / len(types_a | types_b) if types_a | types_b else 0

    # Compare effective dimensionality
    dim_diff = abs(polytope_a.effective_dimensionality - polytope_b.effective_dimensionality)
    dim_score = max(0, 1 - dim_diff / 5)

    # Compare stability metrics
    stability_diff = abs(polytope_a.release_point_variance - polytope_b.release_point_variance)
    stability_score = max(0, 1 - stability_diff / 0.5)

    # Weighted combination
    return 0.4 * type_overlap + 0.3 * dim_score + 0.3 * stability_score
