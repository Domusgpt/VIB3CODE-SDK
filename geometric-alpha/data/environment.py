"""
Environmental Context Data

Stadium geometry, weather conditions, and their effects on ball flight.
"""

import numpy as np
from dataclasses import dataclass
from typing import Optional, Dict
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class StadiumContext:
    """Stadium-specific context affecting ball flight."""

    venue_id: int
    name: str
    city: str
    state: str

    # Physical properties
    altitude_ft: float  # Elevation in feet
    latitude: float
    longitude: float

    # Dimensions (in feet)
    lf_distance: float  # Left field wall distance
    cf_distance: float  # Center field wall distance
    rf_distance: float  # Right field wall distance

    lf_wall_height: float  # Left field wall height
    cf_wall_height: float  # Center field wall height
    rf_wall_height: float  # Right field wall height

    # Environmental factors
    is_dome: bool = False
    has_retractable_roof: bool = False

    def get_air_density_factor(self, temperature_f: float = 70.0) -> float:
        """
        Calculate relative air density compared to sea level standard.

        Air density decreases with altitude and increases with temperature.
        Lower air density = less drag = ball carries further.

        Returns:
            Factor where 1.0 = sea level standard, <1.0 = thinner air
        """
        # Barometric formula approximation
        # Pressure decreases ~3.5% per 1000 ft
        pressure_factor = np.exp(-self.altitude_ft / 29000)

        # Temperature effect (ideal gas law)
        # Standard temp = 59°F = 288K
        temp_k = (temperature_f + 459.67) * 5/9
        temp_factor = 288 / temp_k

        return pressure_factor * temp_factor

    def get_carry_factor(self, temperature_f: float = 70.0) -> float:
        """
        Get multiplier for how much extra a fly ball will carry.

        Returns:
            Factor where 1.0 = average, >1.0 = ball carries further
        """
        air_density = self.get_air_density_factor(temperature_f)

        # Empirically, ~5% less air density = ~2% more carry
        return 1 + (1 - air_density) * 0.4


@dataclass
class EnvironmentData:
    """Weather and environmental conditions for a game."""

    game_pk: int
    venue_id: int
    game_datetime: datetime

    # Weather
    temperature_f: float
    humidity_pct: float
    wind_speed_mph: float
    wind_direction_deg: float  # 0 = from CF, 90 = from RF, 180 = from HP, 270 = from LF

    # Derived
    feels_like_f: Optional[float] = None
    dew_point_f: Optional[float] = None

    # Game conditions
    roof_status: str = "open"  # open, closed, retractable-open, retractable-closed
    precipitation: str = "none"  # none, light, moderate, heavy
    sky: str = "clear"  # clear, partly cloudy, overcast, dome

    def get_wind_effect_vector(self) -> tuple:
        """
        Convert wind to x, y components relative to home plate.

        Returns:
            Tuple of (x_component, y_component) in mph
            - Positive x = wind blowing toward RF
            - Positive y = wind blowing toward CF (behind pitcher)
        """
        # Convert degrees to radians, adjusting for baseball orientation
        rad = np.radians(self.wind_direction_deg)

        # Wind direction indicates where wind is coming FROM
        # We want where it's going TO
        x = -self.wind_speed_mph * np.sin(rad)
        y = -self.wind_speed_mph * np.cos(rad)

        return (x, y)

    def get_ball_carry_modifier(self) -> float:
        """
        Calculate total modifier for ball carry based on conditions.

        Combines temperature, humidity, and wind effects.
        """
        # Temperature effect: ~1 ft per 10°F above 70
        temp_modifier = 1 + (self.temperature_f - 70) * 0.002

        # Humidity effect: humid air is actually less dense
        # ~0.5% less dense at 100% humidity vs dry
        humidity_modifier = 1 + self.humidity_pct * 0.00005

        # Wind effect depends on direction (simplified)
        wind_x, wind_y = self.get_wind_effect_vector()
        # Wind blowing out (+y) helps carry
        wind_modifier = 1 + wind_y * 0.005

        return temp_modifier * humidity_modifier * wind_modifier


# MLB Stadium database
MLB_STADIUMS: Dict[int, StadiumContext] = {
    # Coors Field - Denver (highest elevation)
    2347: StadiumContext(
        venue_id=2347, name="Coors Field", city="Denver", state="CO",
        altitude_ft=5280, latitude=39.756, longitude=-104.994,
        lf_distance=347, cf_distance=415, rf_distance=350,
        lf_wall_height=8, cf_wall_height=8, rf_wall_height=14,
        is_dome=False
    ),

    # Chase Field - Phoenix (retractable roof)
    15: StadiumContext(
        venue_id=15, name="Chase Field", city="Phoenix", state="AZ",
        altitude_ft=1059, latitude=33.445, longitude=-112.067,
        lf_distance=330, cf_distance=407, rf_distance=335,
        lf_wall_height=7.5, cf_wall_height=25, rf_wall_height=7.5,
        is_dome=False, has_retractable_roof=True
    ),

    # Tropicana Field - Tampa (dome)
    12: StadiumContext(
        venue_id=12, name="Tropicana Field", city="St. Petersburg", state="FL",
        altitude_ft=44, latitude=27.768, longitude=-82.653,
        lf_distance=315, cf_distance=404, rf_distance=322,
        lf_wall_height=9.5, cf_wall_height=9.5, rf_wall_height=9.5,
        is_dome=True
    ),

    # Yankee Stadium
    3313: StadiumContext(
        venue_id=3313, name="Yankee Stadium", city="Bronx", state="NY",
        altitude_ft=13, latitude=40.829, longitude=-73.926,
        lf_distance=318, cf_distance=408, rf_distance=314,
        lf_wall_height=8, cf_wall_height=8, rf_wall_height=8,
        is_dome=False
    ),

    # Oracle Park - San Francisco (marine layer)
    2395: StadiumContext(
        venue_id=2395, name="Oracle Park", city="San Francisco", state="CA",
        altitude_ft=0, latitude=37.778, longitude=-122.389,
        lf_distance=339, cf_distance=399, rf_distance=309,
        lf_wall_height=8, cf_wall_height=8, rf_wall_height=24,
        is_dome=False
    ),

    # Fenway Park - Boston
    3: StadiumContext(
        venue_id=3, name="Fenway Park", city="Boston", state="MA",
        altitude_ft=20, latitude=42.346, longitude=-71.097,
        lf_distance=310, cf_distance=390, rf_distance=302,
        lf_wall_height=37, cf_wall_height=17, rf_wall_height=3,  # Green Monster!
        is_dome=False
    ),

    # Dodger Stadium - Los Angeles
    22: StadiumContext(
        venue_id=22, name="Dodger Stadium", city="Los Angeles", state="CA",
        altitude_ft=515, latitude=34.074, longitude=-118.24,
        lf_distance=330, cf_distance=395, rf_distance=330,
        lf_wall_height=4, cf_wall_height=4, rf_wall_height=4,
        is_dome=False
    ),

    # Wrigley Field - Chicago
    17: StadiumContext(
        venue_id=17, name="Wrigley Field", city="Chicago", state="IL",
        altitude_ft=595, latitude=41.948, longitude=-87.655,
        lf_distance=355, cf_distance=400, rf_distance=353,
        lf_wall_height=11.5, cf_wall_height=11.5, rf_wall_height=11.5,
        is_dome=False
    ),

    # Minute Maid Park - Houston
    2392: StadiumContext(
        venue_id=2392, name="Minute Maid Park", city="Houston", state="TX",
        altitude_ft=44, latitude=29.757, longitude=-95.355,
        lf_distance=315, cf_distance=409, rf_distance=326,
        lf_wall_height=19, cf_wall_height=8, rf_wall_height=7,
        is_dome=False, has_retractable_roof=True
    ),

    # Globe Life Field - Texas
    5325: StadiumContext(
        venue_id=5325, name="Globe Life Field", city="Arlington", state="TX",
        altitude_ft=551, latitude=32.747, longitude=-97.084,
        lf_distance=329, cf_distance=407, rf_distance=326,
        lf_wall_height=8, cf_wall_height=8, rf_wall_height=8,
        is_dome=False, has_retractable_roof=True
    ),
}


def get_stadium(venue_id: int) -> Optional[StadiumContext]:
    """Get stadium context by venue ID."""
    return MLB_STADIUMS.get(venue_id)


def normalize_trajectory_to_neutral(
    exit_velocity: float,
    launch_angle: float,
    environment: EnvironmentData,
    stadium: StadiumContext
) -> tuple:
    """
    Normalize batted ball trajectory to neutral conditions.

    Removes environmental effects to assess raw skill.

    Args:
        exit_velocity: Exit velocity in mph
        launch_angle: Launch angle in degrees
        environment: Current game environment
        stadium: Stadium context

    Returns:
        Tuple of (normalized_ev, normalized_la)
    """
    # Get total carry modifier
    carry_mod = environment.get_ball_carry_modifier()
    altitude_mod = stadium.get_carry_factor(environment.temperature_f)

    total_mod = carry_mod * altitude_mod

    # Adjust exit velocity to remove environmental advantage
    # Higher carry = need less EV to achieve same distance
    normalized_ev = exit_velocity / np.sqrt(total_mod)

    # Launch angle doesn't change much with environment
    # but optimal angle shifts slightly
    optimal_shift = (total_mod - 1) * 5  # ~5 deg shift per 100% carry change
    normalized_la = launch_angle - optimal_shift

    return (normalized_ev, normalized_la)


def project_trajectory_to_environment(
    exit_velocity: float,
    launch_angle: float,
    spray_angle: float,
    environment: EnvironmentData,
    stadium: StadiumContext
) -> Dict:
    """
    Project batted ball outcome given specific environment.

    Args:
        exit_velocity: Exit velocity in mph
        launch_angle: Launch angle in degrees
        spray_angle: Spray angle (-45 to 45, 0 = CF)
        environment: Target game environment
        stadium: Target stadium

    Returns:
        Dict with projected distance, hang time, and result
    """
    # Simplified trajectory model
    # In production, use full physics simulation

    carry_mod = environment.get_ball_carry_modifier()
    altitude_mod = stadium.get_carry_factor(environment.temperature_f)
    total_mod = carry_mod * altitude_mod

    # Base distance calculation (simplified)
    la_rad = np.radians(launch_angle)
    base_distance = (
        exit_velocity ** 2 *
        np.sin(2 * la_rad) /
        32.174 *  # gravity
        1.5  # empirical scaling
    )

    # Apply environmental modifier
    projected_distance = base_distance * total_mod

    # Apply wind
    wind_x, wind_y = environment.get_wind_effect_vector()
    spray_rad = np.radians(spray_angle)

    # Wind effect on distance
    wind_along = wind_y * np.cos(spray_rad) + wind_x * np.sin(spray_rad)
    wind_distance_effect = wind_along * 0.5  # ~0.5 ft per mph wind

    projected_distance += wind_distance_effect

    # Determine if it's a HR
    if spray_angle < -22.5:
        wall_distance = stadium.lf_distance
        wall_height = stadium.lf_wall_height
    elif spray_angle > 22.5:
        wall_distance = stadium.rf_distance
        wall_height = stadium.rf_wall_height
    else:
        wall_distance = stadium.cf_distance
        wall_height = stadium.cf_wall_height

    # Simplified HR determination
    is_hr = projected_distance > wall_distance + 10

    # Hang time
    hang_time = 2 * exit_velocity * np.sin(la_rad) / 32.174

    return {
        'projected_distance': projected_distance,
        'hang_time': hang_time,
        'is_home_run': is_hr,
        'wall_distance': wall_distance,
        'clearance': projected_distance - wall_distance if is_hr else 0
    }
