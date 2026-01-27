"""
Defensive Voronoi Tessellation Analysis

Models defensive coverage using Voronoi diagrams.
Identifies "seams" in the defense where batted balls are most
likely to fall for hits.
"""

import numpy as np
import pandas as pd
from scipy.spatial import Voronoi, voronoi_plot_2d
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional
import logging

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class VoronoiMetrics:
    """Metrics for defensive coverage analysis."""

    # Team/game identification
    team_id: Optional[str] = None
    game_pk: Optional[int] = None

    # Coverage metrics
    total_coverage_area: float = 0.0
    avg_cell_area: float = 0.0
    min_cell_area: float = 0.0
    max_cell_area: float = 0.0

    # Edge analysis
    total_edge_length: float = 0.0
    avg_edge_length: float = 0.0

    # Gap analysis
    seam_density: float = 0.0  # Proportion of field in "seam" regions
    largest_gap: float = 0.0

    # Position-specific
    infield_coverage: float = 0.0
    outfield_coverage: float = 0.0

    # Sprint speed adjustment
    sprint_speed_adjusted: bool = False


@dataclass
class FielderPosition:
    """Fielder starting position with speed metric."""

    position_code: int  # 1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF
    position_name: str
    x: float  # feet from home plate (positive = right field line)
    y: float  # feet from home plate (toward center field)
    sprint_speed: float = 27.0  # ft/s (MLB average ~27)

    def effective_range(self, hang_time: float = 4.0) -> float:
        """
        Calculate effective range based on sprint speed.

        Args:
            hang_time: Typical hang time for fly balls

        Returns:
            Maximum distance fielder can cover
        """
        # Account for reaction time (~0.4s) and deceleration
        effective_time = max(0, hang_time - 0.4) * 0.85
        return self.sprint_speed * effective_time


class DefensiveVoronoi:
    """
    Voronoi tessellation for defensive coverage analysis.

    Partitions the baseball field into regions based on which
    fielder can most quickly reach each point.
    """

    # Field dimensions (in feet)
    INFIELD_RADIUS = 95  # Infield dirt cutout
    OUTFIELD_FENCE = 400  # Average OF fence
    FOUL_LINE_ANGLE = 45  # Degrees from center

    # Default fielder positions (average MLB positioning)
    DEFAULT_POSITIONS = [
        FielderPosition(3, "1B", 85, 45, 26.5),    # First baseman
        FielderPosition(4, "2B", 45, 110, 27.5),   # Second baseman
        FielderPosition(5, "3B", -85, 45, 26.0),   # Third baseman
        FielderPosition(6, "SS", -35, 120, 28.0),  # Shortstop
        FielderPosition(7, "LF", -180, 280, 27.5), # Left fielder
        FielderPosition(8, "CF", 0, 350, 28.5),    # Center fielder
        FielderPosition(9, "RF", 180, 280, 27.5),  # Right fielder
    ]

    def __init__(self, config=None):
        """Initialize Voronoi analyzer."""
        self.config = config or CONFIG.geometric
        self.boundary_radius = self.config.field_boundary_radius
        self.edge_threshold = self.config.edge_proximity_threshold

    def compute_voronoi(
        self,
        positions: List[FielderPosition] = None,
        use_speed_weights: bool = True
    ) -> Tuple[Voronoi, np.ndarray]:
        """
        Compute Voronoi tessellation for defensive alignment.

        Args:
            positions: List of fielder positions
            use_speed_weights: Whether to weight by sprint speed

        Returns:
            Tuple of (Voronoi object, weighted points array)
        """
        positions = positions or self.DEFAULT_POSITIONS

        # Extract points
        points = np.array([[p.x, p.y] for p in positions])

        if use_speed_weights:
            # Adjust points based on sprint speed
            # Faster players "pull" the Voronoi boundaries toward them
            avg_speed = np.mean([p.sprint_speed for p in positions])
            weights = np.array([p.sprint_speed / avg_speed for p in positions])

            # Weight adjustment moves points toward their own region
            # (This is a simplified approximation of weighted Voronoi)
            weighted_points = points.copy()
            for i, (p, w) in enumerate(zip(positions, weights)):
                # Expand range for faster players
                scale = 1 + (w - 1) * 0.2
                weighted_points[i] = points[i] * scale
        else:
            weighted_points = points

        # Add boundary points to create bounded Voronoi
        boundary_points = self._create_boundary_points()
        all_points = np.vstack([weighted_points, boundary_points])

        # Compute Voronoi
        vor = Voronoi(all_points)

        return vor, weighted_points

    def _create_boundary_points(self, n_points: int = 50) -> np.ndarray:
        """Create boundary points to bound the Voronoi diagram."""
        # Create circular boundary
        angles = np.linspace(0, 2 * np.pi, n_points, endpoint=False)
        boundary = np.column_stack([
            self.boundary_radius * 1.5 * np.cos(angles),
            self.boundary_radius * 1.5 * np.sin(angles)
        ])

        # Add far-field points
        far_points = np.array([
            [0, self.boundary_radius * 2],
            [-self.boundary_radius * 2, 0],
            [self.boundary_radius * 2, 0],
            [0, -self.boundary_radius]
        ])

        return np.vstack([boundary, far_points])

    def compute_coverage_metrics(
        self,
        positions: List[FielderPosition] = None
    ) -> VoronoiMetrics:
        """
        Compute comprehensive defensive coverage metrics.

        Args:
            positions: Fielder positions

        Returns:
            VoronoiMetrics object
        """
        positions = positions or self.DEFAULT_POSITIONS
        vor, weighted_points = self.compute_voronoi(positions)

        # Compute cell areas for the 7 fielders (excluding boundary points)
        n_fielders = len(positions)
        cell_areas = []

        for i in range(n_fielders):
            region_idx = vor.point_region[i]
            region = vor.regions[region_idx]

            if -1 in region or len(region) == 0:
                # Unbounded region
                cell_areas.append(0)
                continue

            # Compute polygon area
            vertices = vor.vertices[region]
            area = self._polygon_area(vertices)
            cell_areas.append(area)

        cell_areas = np.array(cell_areas)

        # Edge analysis
        edge_lengths = []
        for ridge_points, ridge_vertices in zip(vor.ridge_points, vor.ridge_vertices):
            # Only consider ridges between fielders
            if ridge_points[0] < n_fielders and ridge_points[1] < n_fielders:
                if -1 not in ridge_vertices:
                    v1, v2 = vor.vertices[ridge_vertices]
                    length = np.linalg.norm(v2 - v1)
                    edge_lengths.append(length)

        edge_lengths = np.array(edge_lengths) if edge_lengths else np.array([0])

        # Seam density estimation
        seam_density = self._estimate_seam_density(vor, n_fielders)

        # Infield vs outfield coverage
        infield_coverage, outfield_coverage = self._compute_zone_coverage(
            vor, positions, n_fielders
        )

        return VoronoiMetrics(
            total_coverage_area=cell_areas.sum(),
            avg_cell_area=cell_areas.mean() if len(cell_areas) > 0 else 0,
            min_cell_area=cell_areas.min() if len(cell_areas) > 0 else 0,
            max_cell_area=cell_areas.max() if len(cell_areas) > 0 else 0,
            total_edge_length=edge_lengths.sum(),
            avg_edge_length=edge_lengths.mean() if len(edge_lengths) > 0 else 0,
            seam_density=seam_density,
            largest_gap=edge_lengths.max() if len(edge_lengths) > 0 else 0,
            infield_coverage=infield_coverage,
            outfield_coverage=outfield_coverage,
            sprint_speed_adjusted=True
        )

    def _polygon_area(self, vertices: np.ndarray) -> float:
        """Compute area of polygon using shoelace formula."""
        n = len(vertices)
        if n < 3:
            return 0.0

        area = 0.0
        for i in range(n):
            j = (i + 1) % n
            area += vertices[i, 0] * vertices[j, 1]
            area -= vertices[j, 0] * vertices[i, 1]

        return abs(area) / 2

    def _estimate_seam_density(
        self,
        vor: Voronoi,
        n_fielders: int
    ) -> float:
        """
        Estimate the proportion of fair territory in "seam" regions.

        Seams are areas near Voronoi edges where coverage is uncertain.
        """
        # Sample points across fair territory
        n_samples = 1000
        sample_points = self._sample_fair_territory(n_samples)

        seam_count = 0

        for point in sample_points:
            # Check distance to nearest Voronoi edge
            min_edge_dist = self._distance_to_nearest_edge(point, vor, n_fielders)

            if min_edge_dist < self.edge_threshold:
                seam_count += 1

        return seam_count / n_samples

    def _sample_fair_territory(self, n_samples: int) -> np.ndarray:
        """Generate random points in fair territory."""
        points = []

        while len(points) < n_samples:
            # Random point in square
            x = np.random.uniform(-self.boundary_radius, self.boundary_radius)
            y = np.random.uniform(0, self.boundary_radius)

            # Check if in fair territory (within foul lines)
            angle = np.degrees(np.arctan2(x, y))
            if abs(angle) <= self.FOUL_LINE_ANGLE:
                distance = np.sqrt(x**2 + y**2)
                if distance <= self.boundary_radius:
                    points.append([x, y])

        return np.array(points)

    def _distance_to_nearest_edge(
        self,
        point: np.ndarray,
        vor: Voronoi,
        n_fielders: int
    ) -> float:
        """Compute distance from point to nearest Voronoi edge."""
        min_dist = float('inf')

        for ridge_points, ridge_vertices in zip(vor.ridge_points, vor.ridge_vertices):
            # Only consider edges between fielders
            if ridge_points[0] >= n_fielders or ridge_points[1] >= n_fielders:
                continue

            if -1 in ridge_vertices:
                continue

            v1, v2 = vor.vertices[ridge_vertices]

            # Point-to-line-segment distance
            dist = self._point_to_segment_distance(point, v1, v2)
            min_dist = min(min_dist, dist)

        return min_dist

    def _point_to_segment_distance(
        self,
        point: np.ndarray,
        v1: np.ndarray,
        v2: np.ndarray
    ) -> float:
        """Compute distance from point to line segment."""
        # Vector from v1 to v2
        line_vec = v2 - v1
        line_len = np.linalg.norm(line_vec)

        if line_len < 1e-10:
            return np.linalg.norm(point - v1)

        line_unit = line_vec / line_len

        # Project point onto line
        point_vec = point - v1
        proj_length = np.dot(point_vec, line_unit)

        # Clamp to segment
        proj_length = max(0, min(line_len, proj_length))

        # Closest point on segment
        closest = v1 + proj_length * line_unit

        return np.linalg.norm(point - closest)

    def _compute_zone_coverage(
        self,
        vor: Voronoi,
        positions: List[FielderPosition],
        n_fielders: int
    ) -> Tuple[float, float]:
        """Compute coverage ratios for infield and outfield zones."""
        # Sample points
        infield_samples = []
        outfield_samples = []

        for _ in range(500):
            x = np.random.uniform(-200, 200)
            y = np.random.uniform(0, 400)

            distance = np.sqrt(x**2 + y**2)
            angle = np.degrees(np.arctan2(x, y))

            if abs(angle) <= self.FOUL_LINE_ANGLE and distance <= self.boundary_radius:
                if distance <= self.INFIELD_RADIUS:
                    infield_samples.append([x, y])
                else:
                    outfield_samples.append([x, y])

        # Compute coverage (inverse of seam density)
        def coverage_at_points(points):
            if len(points) == 0:
                return 0.0

            covered = 0
            for point in points:
                dist = self._distance_to_nearest_edge(point, vor, n_fielders)
                if dist >= self.edge_threshold:
                    covered += 1
            return covered / len(points)

        infield_coverage = coverage_at_points(infield_samples)
        outfield_coverage = coverage_at_points(outfield_samples)

        return infield_coverage, outfield_coverage

    def analyze_spray_chart_vs_defense(
        self,
        spray_chart: pd.DataFrame,
        positions: List[FielderPosition] = None
    ) -> Dict:
        """
        Analyze batter's spray chart against defensive alignment.

        Args:
            spray_chart: DataFrame with hc_x, hc_y (hit coordinates)
            positions: Defensive positions

        Returns:
            Dict with analysis results
        """
        positions = positions or self.DEFAULT_POSITIONS
        vor, weighted_points = self.compute_voronoi(positions)

        n_fielders = len(positions)

        if 'hc_x' not in spray_chart.columns or 'hc_y' not in spray_chart.columns:
            logger.warning("Spray chart missing hit coordinate columns")
            return {'edge_hit_rate': 0.0, 'vulnerable_zones': []}

        # Convert hit coordinates to field coordinates
        # Statcast hc_x, hc_y are in different coordinate system
        hits = spray_chart[['hc_x', 'hc_y']].dropna().values

        # Transform coordinates (Statcast uses different origin)
        # hc_x: 0-250 with 125 being center field
        # hc_y: 0-250 with 0 being home plate
        transformed_hits = []
        for hc_x, hc_y in hits:
            x = (hc_x - 125) * 2.5  # Rough scaling to feet
            y = (250 - hc_y) * 2.0
            if y > 0:  # Only fair territory
                transformed_hits.append([x, y])

        if not transformed_hits:
            return {'edge_hit_rate': 0.0, 'vulnerable_zones': []}

        transformed_hits = np.array(transformed_hits)

        # Analyze hits near Voronoi edges
        edge_hits = 0
        for hit in transformed_hits:
            dist = self._distance_to_nearest_edge(hit, vor, n_fielders)
            if dist < self.edge_threshold:
                edge_hits += 1

        edge_hit_rate = edge_hits / len(transformed_hits)

        # Identify most vulnerable zones
        vulnerable_zones = self._identify_vulnerable_zones(
            transformed_hits, vor, n_fielders
        )

        return {
            'edge_hit_rate': edge_hit_rate,
            'total_hits_analyzed': len(transformed_hits),
            'edge_hits': edge_hits,
            'vulnerable_zones': vulnerable_zones
        }

    def _identify_vulnerable_zones(
        self,
        hits: np.ndarray,
        vor: Voronoi,
        n_fielders: int
    ) -> List[Dict]:
        """Identify areas where hits frequently fall near edges."""
        # Grid-based density estimation
        grid_size = 50
        x_bins = np.linspace(-300, 300, grid_size)
        y_bins = np.linspace(0, 450, grid_size)

        vulnerable = []

        for i in range(len(x_bins) - 1):
            for j in range(len(y_bins) - 1):
                x_center = (x_bins[i] + x_bins[i+1]) / 2
                y_center = (y_bins[j] + y_bins[j+1]) / 2

                # Count hits in this cell
                cell_mask = (
                    (hits[:, 0] >= x_bins[i]) & (hits[:, 0] < x_bins[i+1]) &
                    (hits[:, 1] >= y_bins[j]) & (hits[:, 1] < y_bins[j+1])
                )
                hit_count = cell_mask.sum()

                if hit_count >= 3:  # Minimum hits to be significant
                    edge_dist = self._distance_to_nearest_edge(
                        np.array([x_center, y_center]), vor, n_fielders
                    )

                    if edge_dist < self.edge_threshold * 2:
                        vulnerable.append({
                            'x': x_center,
                            'y': y_center,
                            'hit_count': hit_count,
                            'edge_distance': edge_dist
                        })

        # Sort by hit count
        vulnerable.sort(key=lambda x: x['hit_count'], reverse=True)

        return vulnerable[:5]  # Top 5 vulnerable zones
