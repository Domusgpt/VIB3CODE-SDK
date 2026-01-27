"""
Pitch Tunneling Analysis

Manifold intersection analysis for pitch trajectory deception.
Tunneling is the ability of a pitcher to make two different pitches
travel along the same trajectory for as long as possible before diverging.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
import logging

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class TunnelScore:
    """Tunnel score between two pitch types."""

    pitch_type_a: str
    pitch_type_b: str

    # UPGRADED: Angular divergence metrics (biologically aligned)
    angular_divergence_tunnel: float  # Degrees at tunnel point
    angular_divergence_plate: float   # Degrees at plate

    # Derived score (using angular divergence ratio)
    tunnel_score: float  # plate_angular_div / tunnel_angular_div

    # Legacy distance metrics (kept for compatibility)
    distance_at_tunnel: float  # Distance at decision point
    distance_at_plate: float   # Distance at plate

    # Sample size
    n_pairs: int

    # Velocity differential
    velocity_diff: float

    # UPGRADED: Biological perception flag
    is_perceptually_identical: bool = False  # True if < 0.2° foveal resolution

    def is_elite(self) -> bool:
        """Check if tunnel score is elite (top 10%)."""
        return self.tunnel_score > 3.0

    def is_true_tunnel(self) -> bool:
        """
        Check if pitches are truly indistinguishable to human vision.

        The human fovea's resolution limit is ~0.2°. If pitches diverge
        by less than this at the tunnel point, they are optically
        identical to the batter.
        """
        return self.angular_divergence_tunnel < 0.2


# Constants for biological vision modeling
FOVEAL_RESOLUTION_DEG = 0.2  # Human eye's sharpest resolution limit
BATTER_EYE_DISTANCE = 60.5  # Distance from release to batter's eye (feet)
TUNNEL_DISTANCE = 20.0  # Fixed distance for measuring tunnel (feet from release)


class TunnelAnalyzer:
    """
    Analyzer for pitch tunneling geometry.

    PRODUCTION UPGRADE: Now uses Angular Divergence instead of Euclidean
    distance at fixed time. This models biological reality - the batter's
    eye perceives angles, not absolute positions.

    Key insight: Fixed timestamp (0.175s) ignores velocity differentials.
    A 100mph fastball is much farther downrange than a 75mph curveball
    at the same timestamp. Angular Divergence at a FIXED DISTANCE correctly
    models what the batter perceives.
    """

    def __init__(self, config=None):
        """Initialize tunnel analyzer with configuration."""
        self.config = config or CONFIG.geometric
        self.t_decision = self.config.decision_point_time
        self.t_plate = self.config.plate_time
        self.epsilon = self.config.tunnel_epsilon

        # UPGRADED: Angular divergence parameters
        self.tunnel_distance = TUNNEL_DISTANCE  # Fixed distance (20 ft from release)
        self.foveal_resolution = FOVEAL_RESOLUTION_DEG  # Human vision limit (0.2°)
        self.batter_eye_y = 0.0  # Batter's eye position (at plate)
        self.batter_eye_z = 3.5  # Approximate eye height

    def compute_trajectory(
        self,
        vx0: float, vy0: float, vz0: float,
        ax: float, ay: float, az: float,
        release_x: float, release_z: float,
        t: float
    ) -> Tuple[float, float, float]:
        """
        Compute pitch position at time t using kinematics.

        Physics: pos(t) = pos0 + v0*t + 0.5*a*t^2

        Args:
            vx0, vy0, vz0: Initial velocity components (ft/s)
            ax, ay, az: Acceleration components (ft/s^2)
            release_x, release_z: Release point
            t: Time in seconds

        Returns:
            Tuple of (x, y, z) position in feet
        """
        # Y starts at release point (~55 ft from plate)
        y0 = 55.0

        x = release_x + vx0 * t + 0.5 * ax * t**2
        y = y0 + vy0 * t + 0.5 * ay * t**2
        z = release_z + vz0 * t + 0.5 * az * t**2

        return (x, y, z)

    def compute_trajectory_at_distance(
        self,
        vx0: float, vy0: float, vz0: float,
        ax: float, ay: float, az: float,
        release_x: float, release_z: float,
        target_y: float
    ) -> Tuple[float, float, float, float]:
        """
        UPGRADED: Compute pitch position when it reaches a specific Y distance.

        Instead of fixed time, solves for time to reach target_y distance,
        then computes position. This handles velocity differentials correctly.

        Args:
            vx0, vy0, vz0: Initial velocity components (ft/s)
            ax, ay, az: Acceleration components (ft/s^2)
            release_x, release_z: Release point
            target_y: Target Y position (distance from home plate)

        Returns:
            Tuple of (x, y, z, t) position and time
        """
        y0 = 55.0  # Release point

        # Solve quadratic: target_y = y0 + vy0*t + 0.5*ay*t^2
        # Rearranged: 0.5*ay*t^2 + vy0*t + (y0 - target_y) = 0
        a_coef = 0.5 * ay
        b_coef = vy0
        c_coef = y0 - target_y

        # Quadratic formula (take positive root)
        discriminant = b_coef**2 - 4 * a_coef * c_coef

        if discriminant < 0 or abs(a_coef) < 1e-10:
            # Fallback to linear approximation
            t = (target_y - y0) / vy0 if abs(vy0) > 1e-10 else 0.4
        else:
            t1 = (-b_coef + np.sqrt(discriminant)) / (2 * a_coef)
            t2 = (-b_coef - np.sqrt(discriminant)) / (2 * a_coef)
            # Take the positive, smaller root (first crossing)
            valid_roots = [t for t in [t1, t2] if t > 0]
            t = min(valid_roots) if valid_roots else 0.4

        x = release_x + vx0 * t + 0.5 * ax * t**2
        z = release_z + vz0 * t + 0.5 * az * t**2

        return (x, target_y, z, t)

    def compute_angular_divergence(
        self,
        pos1: Tuple[float, float, float],
        pos2: Tuple[float, float, float],
        eye_pos: Tuple[float, float, float] = None
    ) -> float:
        """
        UPGRADED: Compute angular divergence between two positions as seen
        from the batter's eye.

        This is the biologically-accurate measure of how different two
        pitches appear to the batter at a given point.

        Args:
            pos1: First pitch position (x, y, z)
            pos2: Second pitch position (x, y, z)
            eye_pos: Batter's eye position (default: at plate, eye height)

        Returns:
            Angular divergence in degrees
        """
        if eye_pos is None:
            eye_pos = (0.0, self.batter_eye_y, self.batter_eye_z)

        # Vectors from eye to each pitch position
        v1 = np.array([
            pos1[0] - eye_pos[0],
            pos1[1] - eye_pos[1],
            pos1[2] - eye_pos[2]
        ])
        v2 = np.array([
            pos2[0] - eye_pos[0],
            pos2[1] - eye_pos[1],
            pos2[2] - eye_pos[2]
        ])

        # Compute angle between vectors
        dot_product = np.dot(v1, v2)
        mag1 = np.linalg.norm(v1)
        mag2 = np.linalg.norm(v2)

        if mag1 < 1e-10 or mag2 < 1e-10:
            return 0.0

        cos_angle = np.clip(dot_product / (mag1 * mag2), -1.0, 1.0)
        angle_rad = np.arccos(cos_angle)

        return np.degrees(angle_rad)

    def compute_tunnel_scores(
        self,
        pitches_df: pd.DataFrame,
        use_angular_divergence: bool = True
    ) -> pd.DataFrame:
        """
        UPGRADED: Compute tunnel scores for all consecutive pitch pairs
        using Angular Divergence (biologically-aligned metric).

        The key improvement: Instead of measuring Euclidean distance at a
        fixed time (which ignores velocity differentials), we measure the
        ANGLE subtended by two pitches from the batter's eye at a FIXED
        DISTANCE from release.

        Args:
            pitches_df: DataFrame with pitch telemetry
            use_angular_divergence: If True, use angular divergence (default)
                                   If False, use legacy Euclidean method

        Returns:
            DataFrame with tunnel scores for each pitch
        """
        required_cols = ['vx0', 'vy0', 'vz0', 'ax', 'ay', 'az',
                        'release_pos_x', 'release_pos_z',
                        'plate_x', 'plate_z', 'pitch_type']

        missing = [c for c in required_cols if c not in pitches_df.columns]
        if missing:
            raise ValueError(f"Missing required columns: {missing}")

        df = pitches_df.copy()

        if use_angular_divergence:
            # UPGRADED: Angular Divergence at Fixed Distance
            df = self._compute_angular_tunnel_scores(df)
        else:
            # Legacy: Euclidean at fixed time (kept for comparison)
            df = self._compute_euclidean_tunnel_scores(df)

        return df

    def _compute_angular_tunnel_scores(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        UPGRADED: Compute tunnel scores using Angular Divergence.

        Measures the angle between pitches as seen from the batter's eye
        at a fixed distance from release (20 feet). This correctly handles
        velocity differentials between pitch types.
        """
        # Target Y position for tunnel measurement (20 feet from release = 35 feet from plate)
        tunnel_y = 55.0 - self.tunnel_distance  # 35 feet from plate

        # Vectorized computation of position at tunnel distance
        # Solve for time to reach tunnel_y for each pitch
        a_coef = 0.5 * df['ay'].values
        b_coef = df['vy0'].values
        c_coef = 55.0 - tunnel_y  # y0 - target_y

        # Quadratic solution (vectorized)
        discriminant = b_coef**2 - 4 * a_coef * c_coef
        discriminant = np.maximum(discriminant, 0)  # Handle numerical issues

        # Time to reach tunnel point
        with np.errstate(divide='ignore', invalid='ignore'):
            t_tunnel = np.where(
                np.abs(a_coef) > 1e-10,
                (-b_coef - np.sqrt(discriminant)) / (2 * a_coef),
                c_coef / (-b_coef + 1e-10)
            )
        t_tunnel = np.clip(t_tunnel, 0.01, 0.5)  # Reasonable bounds

        # Position at tunnel point
        df['pos_tunnel_x'] = (
            df['release_pos_x'] +
            df['vx0'] * t_tunnel +
            0.5 * df['ax'] * t_tunnel**2
        )
        df['pos_tunnel_y'] = tunnel_y
        df['pos_tunnel_z'] = (
            df['release_pos_z'] +
            df['vz0'] * t_tunnel +
            0.5 * df['az'] * t_tunnel**2
        )

        # Position at plate
        df['pos_plate_x'] = df['plate_x']
        df['pos_plate_y'] = 0.0  # At home plate
        df['pos_plate_z'] = df['plate_z']

        # Shift for consecutive comparison
        cols_to_shift = ['pos_tunnel_x', 'pos_tunnel_y', 'pos_tunnel_z',
                         'pos_plate_x', 'pos_plate_y', 'pos_plate_z',
                         'pitch_type', 'release_speed']

        for col in cols_to_shift:
            if col in df.columns:
                df[f'prev_{col}'] = df[col].shift(1)

        # Batter's eye position
        eye_x, eye_y, eye_z = 0.0, 0.0, self.batter_eye_z

        # Compute Angular Divergence at Tunnel Point
        # Vector from eye to current pitch tunnel position
        v1_x = df['pos_tunnel_x'] - eye_x
        v1_y = df['pos_tunnel_y'] - eye_y
        v1_z = df['pos_tunnel_z'] - eye_z

        # Vector from eye to previous pitch tunnel position
        v2_x = df['prev_pos_tunnel_x'] - eye_x
        v2_y = df['prev_pos_tunnel_y'] - eye_y
        v2_z = df['prev_pos_tunnel_z'] - eye_z

        # Dot product and magnitudes
        dot = v1_x * v2_x + v1_y * v2_y + v1_z * v2_z
        mag1 = np.sqrt(v1_x**2 + v1_y**2 + v1_z**2)
        mag2 = np.sqrt(v2_x**2 + v2_y**2 + v2_z**2)

        # Angular divergence at tunnel
        cos_angle_tunnel = np.clip(dot / (mag1 * mag2 + 1e-10), -1.0, 1.0)
        df['angular_div_tunnel'] = np.degrees(np.arccos(cos_angle_tunnel))

        # Compute Angular Divergence at Plate
        p1_x = df['pos_plate_x'] - eye_x
        p1_y = df['pos_plate_y'] - eye_y
        p1_z = df['pos_plate_z'] - eye_z

        p2_x = df['prev_pos_plate_x'] - eye_x
        p2_y = df['prev_pos_plate_y'] - eye_y
        p2_z = df['prev_pos_plate_z'] - eye_z

        dot_plate = p1_x * p2_x + p1_y * p2_y + p1_z * p2_z
        mag1_plate = np.sqrt(p1_x**2 + p1_y**2 + p1_z**2)
        mag2_plate = np.sqrt(p2_x**2 + p2_y**2 + p2_z**2)

        cos_angle_plate = np.clip(dot_plate / (mag1_plate * mag2_plate + 1e-10), -1.0, 1.0)
        df['angular_div_plate'] = np.degrees(np.arccos(cos_angle_plate))

        # UPGRADED Tunnel Score: ratio of angular divergences
        df['tunnel_score'] = df['angular_div_plate'] / (df['angular_div_tunnel'] + self.epsilon)

        # Flag "True Tunnels" - pitches that are perceptually identical
        df['is_true_tunnel'] = df['angular_div_tunnel'] < self.foveal_resolution

        # Legacy distance metrics (for backward compatibility)
        df['dist_tunnel'] = np.sqrt(
            (df['pos_tunnel_x'] - df['prev_pos_tunnel_x'])**2 +
            (df['pos_tunnel_z'] - df['prev_pos_tunnel_z'])**2
        )
        df['dist_plate'] = np.sqrt(
            (df['pos_plate_x'] - df['prev_pos_plate_x'])**2 +
            (df['pos_plate_z'] - df['prev_pos_plate_z'])**2
        )

        # Velocity differential
        if 'release_speed' in df.columns and 'prev_release_speed' in df.columns:
            df['velocity_diff'] = np.abs(df['release_speed'] - df['prev_release_speed'])

        # Flag same-pitcher sequences
        if 'pitcher' in df.columns:
            df['same_pitcher'] = df['pitcher'] == df['pitcher'].shift(1)
            df.loc[~df['same_pitcher'], 'tunnel_score'] = np.nan
            df.loc[~df['same_pitcher'], 'is_true_tunnel'] = False

        return df

    def _compute_euclidean_tunnel_scores(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Legacy: Euclidean distance at fixed time.
        Kept for comparison and backward compatibility.
        """
        t = self.t_decision

        df['pos_decision_x'] = (
            df['release_pos_x'] +
            df['vx0'] * t +
            0.5 * df['ax'] * t**2
        )
        df['pos_decision_z'] = (
            df['release_pos_z'] +
            df['vz0'] * t +
            0.5 * df['az'] * t**2
        )

        df['pos_plate_x'] = df['plate_x']
        df['pos_plate_z'] = df['plate_z']

        for col in ['pos_decision_x', 'pos_decision_z',
                    'pos_plate_x', 'pos_plate_z', 'pitch_type']:
            df[f'prev_{col}'] = df[col].shift(1)

        df['dist_tunnel'] = np.sqrt(
            (df['pos_decision_x'] - df['prev_pos_decision_x'])**2 +
            (df['pos_decision_z'] - df['prev_pos_decision_z'])**2
        )

        df['dist_plate'] = np.sqrt(
            (df['pos_plate_x'] - df['prev_pos_plate_x'])**2 +
            (df['pos_plate_z'] - df['prev_pos_plate_z'])**2
        )

        df['tunnel_score'] = df['dist_plate'] / (df['dist_tunnel'] + self.epsilon)

        # Set angular metrics to NaN for legacy mode
        df['angular_div_tunnel'] = np.nan
        df['angular_div_plate'] = np.nan
        df['is_true_tunnel'] = False

        if 'pitcher' in df.columns:
            df['same_pitcher'] = df['pitcher'] == df['pitcher'].shift(1)
            df.loc[~df['same_pitcher'], 'tunnel_score'] = np.nan

        return df

    def compute_arsenal_tunnels(
        self,
        pitches_df: pd.DataFrame,
        min_pairs: int = 50
    ) -> Dict[str, TunnelScore]:
        """
        UPGRADED: Compute tunnel scores for all pitch type pairs using
        Angular Divergence metrics.

        Args:
            pitches_df: DataFrame with single pitcher's pitches
            min_pairs: Minimum number of pairs for reliable score

        Returns:
            Dict mapping (type_a, type_b) to TunnelScore
        """
        df = self.compute_tunnel_scores(pitches_df, use_angular_divergence=True)

        # Group by pitch type pairs
        df['pair'] = df['prev_pitch_type'].astype(str) + '-' + df['pitch_type'].astype(str)

        tunnel_scores = {}

        for pair, group in df.groupby('pair'):
            if len(group) < min_pairs:
                continue

            if '-' not in pair:
                continue

            type_a, type_b = pair.split('-')

            # Skip same pitch type or invalid pairs
            if type_a == type_b or type_a == 'nan' or type_b == 'nan':
                continue

            # Get velocity differential if available
            velocity_diff = group['velocity_diff'].mean() if 'velocity_diff' in group.columns else 0

            # UPGRADED: Include angular divergence metrics
            angular_tunnel = group['angular_div_tunnel'].mean() if 'angular_div_tunnel' in group.columns else 0
            angular_plate = group['angular_div_plate'].mean() if 'angular_div_plate' in group.columns else 0

            # Check for true tunnels (below foveal resolution)
            true_tunnel_rate = group['is_true_tunnel'].mean() if 'is_true_tunnel' in group.columns else 0

            tunnel_scores[pair] = TunnelScore(
                pitch_type_a=type_a,
                pitch_type_b=type_b,
                angular_divergence_tunnel=angular_tunnel,
                angular_divergence_plate=angular_plate,
                tunnel_score=group['tunnel_score'].mean(),
                distance_at_tunnel=group['dist_tunnel'].mean(),
                distance_at_plate=group['dist_plate'].mean(),
                n_pairs=len(group),
                velocity_diff=velocity_diff,
                is_perceptually_identical=true_tunnel_rate > 0.5  # >50% pairs are true tunnels
            )

        return tunnel_scores

    def compute_pitcher_tunnel_matrix(
        self,
        pitches_df: pd.DataFrame
    ) -> pd.DataFrame:
        """
        Compute the full tunnel matrix for a pitcher.

        Returns a matrix where entry (i, j) is the tunnel score
        from pitch type i to pitch type j.

        Args:
            pitches_df: DataFrame with single pitcher's pitches

        Returns:
            DataFrame matrix of tunnel scores
        """
        tunnel_scores = self.compute_arsenal_tunnels(pitches_df)

        # Get unique pitch types
        pitch_types = sorted(set(
            list(pitches_df['pitch_type'].unique())
        ))

        # Create matrix
        matrix = pd.DataFrame(
            index=pitch_types,
            columns=pitch_types,
            dtype=float
        )

        for pair, score in tunnel_scores.items():
            type_a, type_b = pair.split('-')
            if type_a in pitch_types and type_b in pitch_types:
                matrix.loc[type_a, type_b] = score.tunnel_score

        return matrix

    def compute_arsenal_graph_connectivity(
        self,
        tunnel_matrix: pd.DataFrame,
        threshold: float = 2.0
    ) -> Dict:
        """
        Analyze the arsenal as a graph where edges are strong tunnels.

        A highly connected arsenal presents a "single geometric front"
        to the batter, making it hard to differentiate pitch types.

        Args:
            tunnel_matrix: Matrix of tunnel scores
            threshold: Minimum tunnel score for "strong" connection

        Returns:
            Dict with graph metrics
        """
        # Count strong connections
        strong_tunnels = (tunnel_matrix > threshold).sum().sum()
        possible_tunnels = tunnel_matrix.notna().sum().sum()

        # Average tunnel score
        avg_tunnel = tunnel_matrix.mean().mean()

        # Max tunnel score
        max_tunnel = tunnel_matrix.max().max()

        # Connectivity ratio
        connectivity = strong_tunnels / possible_tunnels if possible_tunnels > 0 else 0

        return {
            'strong_tunnel_count': strong_tunnels,
            'possible_tunnels': possible_tunnels,
            'connectivity_ratio': connectivity,
            'avg_tunnel_score': avg_tunnel,
            'max_tunnel_score': max_tunnel
        }

    def identify_elite_tunnel_pairs(
        self,
        pitches_df: pd.DataFrame,
        top_n: int = 3
    ) -> List[TunnelScore]:
        """
        Identify the pitcher's best tunnel combinations.

        Args:
            pitches_df: DataFrame with single pitcher's pitches
            top_n: Number of top pairs to return

        Returns:
            List of top TunnelScore objects
        """
        tunnel_scores = self.compute_arsenal_tunnels(pitches_df)

        # Sort by tunnel score
        sorted_scores = sorted(
            tunnel_scores.values(),
            key=lambda x: x.tunnel_score,
            reverse=True
        )

        return sorted_scores[:top_n]


def compute_tunnel_score_vectorized(df: pd.DataFrame) -> np.ndarray:
    """
    Vectorized tunnel score computation for entire dataset.

    Optimized for GPU acceleration (compatible with cudf).

    Args:
        df: DataFrame with pitch data

    Returns:
        Array of tunnel scores
    """
    t_dec = CONFIG.geometric.decision_point_time
    epsilon = CONFIG.geometric.tunnel_epsilon

    # Extract arrays
    vx0 = df['vx0'].values
    vy0 = df['vy0'].values
    vz0 = df['vz0'].values
    ax = df['ax'].values
    ay = df['ay'].values
    az = df['az'].values
    release_x = df['release_pos_x'].values
    release_z = df['release_pos_z'].values
    plate_x = df['plate_x'].values
    plate_z = df['plate_z'].values

    # Compute decision point positions
    pos_dec_x = release_x + vx0 * t_dec + 0.5 * ax * t_dec**2
    pos_dec_z = release_z + vz0 * t_dec + 0.5 * az * t_dec**2

    # Shift for consecutive comparison
    prev_pos_dec_x = np.roll(pos_dec_x, 1)
    prev_pos_dec_z = np.roll(pos_dec_z, 1)
    prev_plate_x = np.roll(plate_x, 1)
    prev_plate_z = np.roll(plate_z, 1)

    # Euclidean distances
    dist_tunnel = np.sqrt(
        (pos_dec_x - prev_pos_dec_x)**2 +
        (pos_dec_z - prev_pos_dec_z)**2
    )

    dist_plate = np.sqrt(
        (plate_x - prev_plate_x)**2 +
        (plate_z - prev_plate_z)**2
    )

    # Tunnel score
    tunnel_score = dist_plate / (dist_tunnel + epsilon)

    # First row is invalid (no previous pitch)
    tunnel_score[0] = np.nan

    return tunnel_score
