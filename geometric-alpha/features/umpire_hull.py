"""
Umpire Strike Zone Convex Hull Analysis

Constructs the geometry of each umpire's called strike zone
using convex hull analysis. Identifies zone expansion, contraction,
and centroid drift.
"""

import numpy as np
import pandas as pd
from scipy.spatial import ConvexHull, Delaunay
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
import logging

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class UmpireZoneMetrics:
    """Metrics describing an umpire's strike zone geometry."""

    umpire_id: int

    # Hull properties
    hull_area: float          # Area of convex hull
    hull_vertices: int        # Number of vertices
    hull_perimeter: float     # Perimeter length

    # Relative to rulebook zone
    expansion_factor: float   # Area ratio vs rulebook
    area_delta: float         # Absolute area difference

    # Centroid analysis
    centroid_x: float         # X position of zone center
    centroid_z: float         # Z position of zone center
    centroid_drift_x: float   # Drift from rulebook center
    centroid_drift_z: float   # Drift from rulebook center

    # Shape analysis
    aspect_ratio: float       # Width / Height
    symmetry_score: float     # Left-right symmetry

    # Sample info
    n_called_strikes: int
    n_games: int

    def is_expanded(self) -> bool:
        """Check if zone is significantly expanded."""
        return self.expansion_factor > CONFIG.geometric.zone_expansion_threshold

    def is_low_zone(self) -> bool:
        """Check if zone centroid is significantly low."""
        return self.centroid_z < 2.3

    def is_high_zone(self) -> bool:
        """Check if zone centroid is significantly high."""
        return self.centroid_z > 2.7


class UmpireHullCalculator:
    """
    Calculator for umpire strike zone convex hulls.

    Uses scipy.spatial.ConvexHull to construct the geometric
    representation of each umpire's called strikes.
    """

    # Rulebook zone dimensions (in feet)
    RULEBOOK_WIDTH = 17.0 / 12.0  # 17 inches
    RULEBOOK_TOP = 3.5  # Average top of zone
    RULEBOOK_BOTTOM = 1.5  # Average bottom of zone
    RULEBOOK_CENTER_X = 0.0
    RULEBOOK_CENTER_Z = 2.5

    def __init__(self, config=None):
        """Initialize hull calculator."""
        self.config = config or CONFIG.geometric
        self._rulebook_area = self._compute_rulebook_area()

    def _compute_rulebook_area(self) -> float:
        """Compute the theoretical rulebook zone area."""
        width = self.RULEBOOK_WIDTH
        height = self.RULEBOOK_TOP - self.RULEBOOK_BOTTOM
        return width * height

    def compute_zone_hull(
        self,
        called_strikes: pd.DataFrame
    ) -> Optional[ConvexHull]:
        """
        Compute convex hull of called strikes.

        Args:
            called_strikes: DataFrame with plate_x, plate_z columns

        Returns:
            ConvexHull object or None if insufficient data
        """
        if len(called_strikes) < 4:
            logger.warning("Insufficient data for hull computation")
            return None

        points = called_strikes[['plate_x', 'plate_z']].values

        try:
            hull = ConvexHull(points)
            return hull
        except Exception as e:
            logger.error(f"Hull computation failed: {e}")
            return None

    def compute_zone_metrics(
        self,
        called_strikes: pd.DataFrame,
        umpire_id: int = 0,
        n_games: int = 1
    ) -> Optional[UmpireZoneMetrics]:
        """
        Compute comprehensive zone metrics from called strikes.

        Args:
            called_strikes: DataFrame with plate_x, plate_z
            umpire_id: Umpire identifier
            n_games: Number of games in sample

        Returns:
            UmpireZoneMetrics object
        """
        hull = self.compute_zone_hull(called_strikes)
        if hull is None:
            return None

        points = called_strikes[['plate_x', 'plate_z']].values

        # Hull metrics
        hull_area = hull.volume  # In 2D, volume = area
        hull_perimeter = self._compute_perimeter(hull, points)
        hull_vertices = len(hull.vertices)

        # Centroid
        centroid_x, centroid_z = self._compute_centroid(hull, points)

        # Expansion factor
        expansion_factor = hull_area / self._rulebook_area
        area_delta = hull_area - self._rulebook_area

        # Centroid drift
        centroid_drift_x = centroid_x - self.RULEBOOK_CENTER_X
        centroid_drift_z = centroid_z - self.RULEBOOK_CENTER_Z

        # Aspect ratio and symmetry
        aspect_ratio = self._compute_aspect_ratio(hull, points)
        symmetry_score = self._compute_symmetry(points, centroid_x)

        return UmpireZoneMetrics(
            umpire_id=umpire_id,
            hull_area=hull_area,
            hull_vertices=hull_vertices,
            hull_perimeter=hull_perimeter,
            expansion_factor=expansion_factor,
            area_delta=area_delta,
            centroid_x=centroid_x,
            centroid_z=centroid_z,
            centroid_drift_x=centroid_drift_x,
            centroid_drift_z=centroid_drift_z,
            aspect_ratio=aspect_ratio,
            symmetry_score=symmetry_score,
            n_called_strikes=len(called_strikes),
            n_games=n_games
        )

    def _compute_perimeter(
        self,
        hull: ConvexHull,
        points: np.ndarray
    ) -> float:
        """Compute hull perimeter length."""
        vertices = points[hull.vertices]
        perimeter = 0.0

        for i in range(len(vertices)):
            j = (i + 1) % len(vertices)
            perimeter += np.linalg.norm(vertices[j] - vertices[i])

        return perimeter

    def _compute_centroid(
        self,
        hull: ConvexHull,
        points: np.ndarray
    ) -> Tuple[float, float]:
        """Compute centroid of convex hull."""
        vertices = points[hull.vertices]

        # Use signed area method for polygon centroid
        n = len(vertices)
        cx = cy = 0.0
        area = 0.0

        for i in range(n):
            j = (i + 1) % n
            cross = vertices[i, 0] * vertices[j, 1] - vertices[j, 0] * vertices[i, 1]
            area += cross
            cx += (vertices[i, 0] + vertices[j, 0]) * cross
            cy += (vertices[i, 1] + vertices[j, 1]) * cross

        area *= 0.5
        if abs(area) < 1e-10:
            # Degenerate case - use simple mean
            return vertices[:, 0].mean(), vertices[:, 1].mean()

        cx /= (6 * area)
        cy /= (6 * area)

        return cx, cy

    def _compute_aspect_ratio(
        self,
        hull: ConvexHull,
        points: np.ndarray
    ) -> float:
        """Compute aspect ratio (width / height) of zone."""
        vertices = points[hull.vertices]

        width = vertices[:, 0].max() - vertices[:, 0].min()
        height = vertices[:, 1].max() - vertices[:, 1].min()

        if height < 1e-10:
            return 1.0

        return width / height

    def _compute_symmetry(
        self,
        points: np.ndarray,
        center_x: float
    ) -> float:
        """
        Compute left-right symmetry score.

        1.0 = perfectly symmetric, 0.0 = completely asymmetric
        """
        left_points = points[points[:, 0] < center_x]
        right_points = points[points[:, 0] >= center_x]

        if len(left_points) == 0 or len(right_points) == 0:
            return 0.0

        # Compare distributions of z-values
        left_z_dist = np.histogram(left_points[:, 1], bins=10, range=(1.0, 4.0))[0]
        right_z_dist = np.histogram(right_points[:, 1], bins=10, range=(1.0, 4.0))[0]

        # Normalize
        left_z_dist = left_z_dist / (left_z_dist.sum() + 1e-10)
        right_z_dist = right_z_dist / (right_z_dist.sum() + 1e-10)

        # Similarity (1 - total variation distance)
        similarity = 1 - 0.5 * np.abs(left_z_dist - right_z_dist).sum()

        return similarity

    def compute_all_umpire_zones(
        self,
        pitches_df: pd.DataFrame,
        min_games: int = 3,
        min_strikes: int = 50
    ) -> Dict[int, UmpireZoneMetrics]:
        """
        Compute zone metrics for all umpires in dataset.

        Args:
            pitches_df: DataFrame with pitch data
            min_games: Minimum games for reliable metrics
            min_strikes: Minimum called strikes

        Returns:
            Dict mapping umpire_id to UmpireZoneMetrics
        """
        # Filter to called strikes only
        called_strikes = pitches_df[
            pitches_df['description'] == 'called_strike'
        ].copy()

        if 'umpire_id' not in called_strikes.columns:
            logger.warning("No umpire_id column found")
            return {}

        results = {}

        for umpire_id, group in called_strikes.groupby('umpire_id'):
            n_games = group['game_pk'].nunique()

            if n_games < min_games or len(group) < min_strikes:
                continue

            metrics = self.compute_zone_metrics(
                group,
                umpire_id=umpire_id,
                n_games=n_games
            )

            if metrics:
                results[umpire_id] = metrics

        logger.info(f"Computed zone metrics for {len(results)} umpires")
        return results

    def compute_rolling_zone(
        self,
        pitches_df: pd.DataFrame,
        umpire_id: int,
        window_games: int = None
    ) -> List[UmpireZoneMetrics]:
        """
        Compute rolling zone metrics over trailing game window.

        Args:
            pitches_df: DataFrame with pitch data
            umpire_id: Target umpire
            window_games: Number of trailing games

        Returns:
            List of metrics for each window
        """
        window = window_games or self.config.umpire_window_games

        # Filter to umpire's called strikes
        umpire_pitches = pitches_df[
            (pitches_df.get('umpire_id') == umpire_id) &
            (pitches_df['description'] == 'called_strike')
        ].copy()

        if len(umpire_pitches) == 0:
            return []

        # Sort by game date
        umpire_pitches = umpire_pitches.sort_values('game_date')

        # Get unique games
        games = umpire_pitches['game_pk'].unique()

        results = []

        for i in range(window, len(games) + 1):
            window_games_list = games[i - window:i]
            window_data = umpire_pitches[
                umpire_pitches['game_pk'].isin(window_games_list)
            ]

            metrics = self.compute_zone_metrics(
                window_data,
                umpire_id=umpire_id,
                n_games=window
            )

            if metrics:
                results.append(metrics)

        return results


def point_in_zone(
    plate_x: float,
    plate_z: float,
    hull: ConvexHull,
    hull_points: np.ndarray
) -> bool:
    """
    Check if a pitch location falls within the umpire's zone hull.

    Args:
        plate_x: Pitch x location
        plate_z: Pitch z location
        hull: ConvexHull object
        hull_points: Original points used to create hull

    Returns:
        True if point is inside the hull
    """
    try:
        # Create Delaunay triangulation for point-in-polygon test
        hull_vertices = hull_points[hull.vertices]
        delaunay = Delaunay(hull_vertices)
        return delaunay.find_simplex(np.array([[plate_x, plate_z]])) >= 0
    except Exception:
        return False


def compute_zone_agreement(
    metrics_a: UmpireZoneMetrics,
    metrics_b: UmpireZoneMetrics
) -> float:
    """
    Compute similarity between two umpire zones.

    Args:
        metrics_a: First umpire's metrics
        metrics_b: Second umpire's metrics

    Returns:
        Similarity score (0.0 to 1.0)
    """
    # Compare key metrics with weighted combination
    area_diff = abs(metrics_a.hull_area - metrics_b.hull_area)
    centroid_x_diff = abs(metrics_a.centroid_x - metrics_b.centroid_x)
    centroid_z_diff = abs(metrics_a.centroid_z - metrics_b.centroid_z)
    aspect_diff = abs(metrics_a.aspect_ratio - metrics_b.aspect_ratio)

    # Normalize differences
    area_score = max(0, 1 - area_diff / 1.0)  # 1 sq ft difference = 0
    centroid_score = max(0, 1 - np.sqrt(centroid_x_diff**2 + centroid_z_diff**2) / 0.5)
    aspect_score = max(0, 1 - aspect_diff / 0.5)

    # Weighted average
    return 0.4 * area_score + 0.4 * centroid_score + 0.2 * aspect_score
