"""
Run Expectancy Model

Delta Run Expectancy (ΔRE) prediction for pitch-level outcomes.
Uses the RE24 matrix to value each pitch in terms of expected runs.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
import logging

from config.settings import CONFIG

logger = logging.getLogger(__name__)


# Standard RE24 Matrix (2015-2023 MLB averages)
# Rows: Base state (0-7 encoding runners on base)
# Columns: Outs (0, 1, 2)
RE24_MATRIX = np.array([
    # Outs:  0      1      2
    [0.481, 0.254, 0.098],  # 0: Bases empty
    [0.859, 0.509, 0.224],  # 1: Runner on 1st
    [1.100, 0.664, 0.319],  # 2: Runner on 2nd
    [1.437, 0.884, 0.429],  # 3: Runners on 1st & 2nd
    [1.350, 0.950, 0.353],  # 4: Runner on 3rd
    [1.784, 1.130, 0.478],  # 5: Runners on 1st & 3rd
    [1.964, 1.376, 0.580],  # 6: Runners on 2nd & 3rd
    [2.282, 1.520, 0.736],  # 7: Bases loaded
])


@dataclass
class RE24Matrix:
    """Run Expectancy Matrix wrapper."""

    matrix: np.ndarray

    def get_re(self, base_state: int, outs: int) -> float:
        """
        Get expected runs for a given base-out state.

        Args:
            base_state: 0-7 encoding of runners on base
                - Bit 0: Runner on 1st
                - Bit 1: Runner on 2nd
                - Bit 2: Runner on 3rd
            outs: Number of outs (0, 1, 2)

        Returns:
            Expected runs from this state to end of inning
        """
        if not 0 <= base_state <= 7:
            raise ValueError(f"Invalid base state: {base_state}")
        if not 0 <= outs <= 2:
            raise ValueError(f"Invalid outs: {outs}")

        return self.matrix[base_state, outs]

    def get_delta_re(
        self,
        start_base: int,
        start_outs: int,
        end_base: int,
        end_outs: int,
        runs_scored: int = 0
    ) -> float:
        """
        Calculate the change in run expectancy from an event.

        Args:
            start_base: Starting base state
            start_outs: Starting outs
            end_base: Ending base state
            end_outs: Ending outs
            runs_scored: Runs scored on the play

        Returns:
            Delta run expectancy
        """
        if end_outs >= 3:
            # Inning over
            end_re = 0
        else:
            end_re = self.get_re(end_base, end_outs)

        start_re = self.get_re(start_base, start_outs)

        return runs_scored + end_re - start_re

    @classmethod
    def from_data(cls, pitches_df: pd.DataFrame) -> 'RE24Matrix':
        """
        Compute custom RE24 matrix from historical data.

        Args:
            pitches_df: Historical pitch data with outcomes

        Returns:
            Custom RE24Matrix
        """
        # This would compute actual run expectancies from the data
        # For now, return the standard matrix
        return cls(matrix=RE24_MATRIX.copy())


class RunExpectancyModel:
    """
    Model for predicting run expectancy changes from pitch outcomes.

    Combines base RE24 matrix with geometric features to predict
    the likely outcome and resulting ΔRE for each matchup.
    """

    # Outcome probabilities by pitch location quadrant
    # (simplified - full model would use continuous space)
    OUTCOME_PROBS = {
        'heart': {  # Center of zone
            'strikeout': 0.08,
            'walk': 0.00,
            'single': 0.20,
            'double': 0.05,
            'triple': 0.01,
            'home_run': 0.04,
            'out': 0.62
        },
        'edge': {  # Edge of zone
            'strikeout': 0.15,
            'walk': 0.03,
            'single': 0.18,
            'double': 0.04,
            'triple': 0.005,
            'home_run': 0.02,
            'out': 0.575
        },
        'chase': {  # Outside zone, batter chases
            'strikeout': 0.35,
            'walk': 0.00,
            'single': 0.10,
            'double': 0.02,
            'triple': 0.002,
            'home_run': 0.01,
            'out': 0.518
        },
        'ball': {  # Outside zone, batter takes
            'strikeout': 0.00,
            'walk': 0.25,
            'single': 0.00,
            'double': 0.00,
            'triple': 0.00,
            'home_run': 0.00,
            'out': 0.75
        }
    }

    # ΔRE values for common outcomes (bases empty, 0 outs)
    OUTCOME_DRE = {
        'strikeout': -0.254 + 0.098,  # Go from 0,0 to 0,1 (one out added)
        'walk': 0.859 - 0.481,  # 0,0 to 1,0 (runner on first)
        'single': 0.859 - 0.481 + 0.1,  # Approximate
        'double': 1.100 - 0.481 + 0.1,
        'triple': 1.350 - 0.481 + 0.3,
        'home_run': 1.0 - 0.481,
        'out': -0.254 + 0.098
    }

    def __init__(self):
        """Initialize run expectancy model."""
        self.re_matrix = RE24Matrix(matrix=RE24_MATRIX.copy())

    def predict_pitch_dre(
        self,
        plate_x: float,
        plate_z: float,
        pitch_type: str,
        tunnel_score: float = 1.0,
        umpire_expansion: float = 1.0,
        base_state: int = 0,
        outs: int = 0
    ) -> float:
        """
        Predict expected ΔRE for a pitch.

        Args:
            plate_x: Pitch horizontal location
            plate_z: Pitch vertical location
            pitch_type: Pitch type code
            tunnel_score: Pitcher's tunnel score for this pitch
            umpire_expansion: Umpire's zone expansion factor
            base_state: Current base state
            outs: Current outs

        Returns:
            Expected delta run expectancy
        """
        # Classify pitch location
        zone_type = self._classify_zone(plate_x, plate_z, umpire_expansion)

        # Get base outcome probabilities
        probs = self.OUTCOME_PROBS[zone_type].copy()

        # Adjust for tunnel score
        # Higher tunnel = more strikeouts, fewer hits
        if tunnel_score > 2.0:
            probs['strikeout'] *= 1.2
            probs['single'] *= 0.9
            probs['double'] *= 0.85
            probs['home_run'] *= 0.85

        # Normalize
        total = sum(probs.values())
        probs = {k: v/total for k, v in probs.items()}

        # Calculate expected ΔRE
        expected_dre = 0.0

        for outcome, prob in probs.items():
            # Compute actual ΔRE for this outcome given base-out state
            dre = self._compute_outcome_dre(outcome, base_state, outs)
            expected_dre += prob * dre

        return expected_dre

    def _classify_zone(
        self,
        plate_x: float,
        plate_z: float,
        umpire_expansion: float
    ) -> str:
        """Classify pitch location into zone types."""
        # Rulebook zone boundaries
        zone_width = 17 / 12 / 2  # Half width in feet
        zone_bottom = 1.5
        zone_top = 3.5

        # Adjust for umpire
        adj_width = zone_width * np.sqrt(umpire_expansion)
        adj_bottom = zone_bottom - 0.1 * (umpire_expansion - 1)
        adj_top = zone_top + 0.1 * (umpire_expansion - 1)

        # Classify
        in_x = abs(plate_x) <= zone_width
        in_z = zone_bottom <= plate_z <= zone_top
        edge_x = zone_width < abs(plate_x) <= adj_width
        edge_z = (adj_bottom <= plate_z < zone_bottom) or (zone_top < plate_z <= adj_top)

        if in_x and in_z:
            # Check if heart or edge of zone
            if abs(plate_x) <= zone_width * 0.5 and abs(plate_z - 2.5) <= 0.5:
                return 'heart'
            return 'edge'
        elif edge_x or edge_z:
            return 'chase'
        else:
            return 'ball'

    def _compute_outcome_dre(
        self,
        outcome: str,
        base_state: int,
        outs: int
    ) -> float:
        """Compute actual ΔRE for an outcome given game state."""
        # Simplified model - full implementation would use complete transition matrix
        if outs >= 2 and outcome in ['strikeout', 'out']:
            # Third out - inning ends
            return -self.re_matrix.get_re(base_state, outs)

        # Use pre-computed approximate values
        return self.OUTCOME_DRE.get(outcome, 0.0)

    def predict_matchup_dre(
        self,
        pitcher_features: Dict,
        batter_features: Dict,
        game_state: Dict
    ) -> float:
        """
        Predict expected ΔRE for a pitcher-batter matchup.

        Args:
            pitcher_features: Pitcher's geometric features
            batter_features: Batter's tendencies
            game_state: Current base-out state

        Returns:
            Expected ΔRE for the plate appearance
        """
        # Average pitch count per PA
        avg_pitches = 4.0

        # Get key features
        tunnel_score = pitcher_features.get('tunnel_score_mean', 1.0)
        umpire_expansion = game_state.get('umpire_expansion', 1.0)
        base_state = game_state.get('base_state', 0)
        outs = game_state.get('outs', 0)

        # Simulate average PA
        total_dre = 0.0

        # Weight different pitch locations
        locations = [
            (0.0, 2.5, 0.4),   # Middle middle (40%)
            (0.5, 2.2, 0.2),   # Low away (20%)
            (-0.5, 2.2, 0.15), # Low in (15%)
            (0.3, 3.0, 0.15),  # Up and away (15%)
            (0.8, 2.0, 0.10),  # Chase (10%)
        ]

        for x, z, weight in locations:
            pitch_dre = self.predict_pitch_dre(
                plate_x=x,
                plate_z=z,
                pitch_type='FF',
                tunnel_score=tunnel_score,
                umpire_expansion=umpire_expansion,
                base_state=base_state,
                outs=outs
            )
            total_dre += weight * pitch_dre * avg_pitches

        return total_dre

    def predict_game_runs(
        self,
        home_pitcher_features: Dict,
        away_pitcher_features: Dict,
        home_lineup_features: List[Dict],
        away_lineup_features: List[Dict],
        umpire_features: Dict
    ) -> Tuple[float, float]:
        """
        Predict expected runs for each team.

        Args:
            home_pitcher_features: Home starter's features
            away_pitcher_features: Away starter's features
            home_lineup_features: Home team's lineup
            away_lineup_features: Away team's lineup
            umpire_features: Umpire zone characteristics

        Returns:
            Tuple of (away_runs, home_runs)
        """
        # Simplified model - full version would simulate innings

        # Base run expectancy per PA
        base_re_per_pa = 0.12

        # Adjust for pitcher quality
        home_pitcher_factor = 1 - (home_pitcher_features.get('tunnel_score_mean', 1.0) - 1) * 0.1
        away_pitcher_factor = 1 - (away_pitcher_features.get('tunnel_score_mean', 1.0) - 1) * 0.1

        # Umpire effect
        umpire_expansion = umpire_features.get('expansion_factor', 1.0)
        run_suppression = 1 - (umpire_expansion - 1) * 0.3

        # PAs per game (approximately)
        pas_per_game = 38

        # Calculate expected runs
        away_runs = base_re_per_pa * pas_per_game * home_pitcher_factor * run_suppression
        home_runs = base_re_per_pa * pas_per_game * away_pitcher_factor * run_suppression

        return (away_runs, home_runs)


def encode_base_state(on_1b: bool, on_2b: bool, on_3b: bool) -> int:
    """
    Encode base runners into integer state.

    Args:
        on_1b: Runner on first base
        on_2b: Runner on second base
        on_3b: Runner on third base

    Returns:
        Integer 0-7 encoding the base state
    """
    state = 0
    if on_1b:
        state |= 1
    if on_2b:
        state |= 2
    if on_3b:
        state |= 4
    return state


def decode_base_state(state: int) -> Tuple[bool, bool, bool]:
    """
    Decode integer base state to runner positions.

    Args:
        state: Integer 0-7

    Returns:
        Tuple of (on_1b, on_2b, on_3b)
    """
    return (
        bool(state & 1),
        bool(state & 2),
        bool(state & 4)
    )
