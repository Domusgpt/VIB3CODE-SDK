"""
The-Odds-API Client

Integration for fetching historical and live betting odds.
Supports Moneyline, Totals, and Spreads markets.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path
import logging
import time

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class MarketData:
    """Structured betting market data."""

    # Game identification
    game_id: str
    sport: str
    home_team: str
    away_team: str
    commence_time: datetime

    # Market type: h2h (moneyline), totals, spreads
    market_type: str

    # Outcomes
    outcomes: List[Dict[str, Any]] = field(default_factory=list)

    # Bookmaker info
    bookmaker: str = ""
    last_update: Optional[datetime] = None

    def get_implied_probability(self, outcome_name: str) -> float:
        """
        Convert American odds to implied probability.

        For negative odds: prob = |odds| / (|odds| + 100)
        For positive odds: prob = 100 / (odds + 100)
        """
        for outcome in self.outcomes:
            if outcome.get('name') == outcome_name:
                price = outcome.get('price', 0)

                if price < 0:
                    return abs(price) / (abs(price) + 100)
                else:
                    return 100 / (price + 100)

        return 0.5  # Default if not found

    def get_decimal_odds(self, outcome_name: str) -> float:
        """Convert American odds to decimal odds."""
        for outcome in self.outcomes:
            if outcome.get('name') == outcome_name:
                price = outcome.get('price', 0)

                if price < 0:
                    return 1 + (100 / abs(price))
                else:
                    return 1 + (price / 100)

        return 2.0  # Default even odds

    def get_juice(self) -> float:
        """
        Calculate the bookmaker's vig (juice).

        Juice = Sum of implied probabilities - 1
        """
        if not self.outcomes:
            return 0.0

        total_implied = sum(
            self.get_implied_probability(o.get('name', ''))
            for o in self.outcomes
        )

        return total_implied - 1.0


class OddsClient:
    """
    Client for fetching betting odds from The-Odds-API.

    Supports:
    - Historical odds for backtesting
    - Live odds for production betting
    - Multiple market types (h2h, totals, spreads)
    """

    MARKET_TYPES = ['h2h', 'totals', 'spreads']

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Odds API client.

        Args:
            api_key: The-Odds-API key (defaults to config)
        """
        self.api_key = api_key or CONFIG.data.odds_api_key
        self.base_url = CONFIG.data.odds_api_base_url
        self.sport = CONFIG.data.odds_sport

        if not self.api_key:
            logger.warning("No API key provided. Using mock data mode.")

    def fetch_live_odds(
        self,
        markets: List[str] = None,
        bookmakers: List[str] = None
    ) -> pd.DataFrame:
        """
        Fetch current live odds for MLB.

        Args:
            markets: List of market types ('h2h', 'totals', 'spreads')
            bookmakers: List of specific bookmakers to include

        Returns:
            DataFrame with current odds
        """
        markets = markets or ['h2h']
        markets_str = ','.join(markets)

        if not self.api_key:
            return self._generate_mock_odds()

        url = f"{self.base_url}/sports/{self.sport}/odds"
        params = {
            'apiKey': self.api_key,
            'regions': 'us',
            'markets': markets_str,
            'oddsFormat': 'american'
        }

        if bookmakers:
            params['bookmakers'] = ','.join(bookmakers)

        response = self._make_request(url, params)

        if response is None:
            return self._generate_mock_odds()

        return self._parse_odds_response(response)

    def fetch_historical(
        self,
        start_date: str,
        end_date: str,
        markets: List[str] = None
    ) -> pd.DataFrame:
        """
        Fetch historical odds for backtesting.

        Note: Historical data may require a premium API subscription
        or separate data source.

        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            markets: List of market types

        Returns:
            DataFrame with historical odds
        """
        markets = markets or ['h2h', 'totals']

        if not self.api_key:
            return self._generate_mock_historical(start_date, end_date)

        # The-Odds-API historical endpoint
        url = f"{self.base_url}/sports/{self.sport}/odds-history"

        all_odds = []
        current_date = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)

        while current_date <= end:
            date_str = current_date.strftime('%Y-%m-%dT12:00:00Z')

            params = {
                'apiKey': self.api_key,
                'regions': 'us',
                'markets': ','.join(markets),
                'oddsFormat': 'american',
                'date': date_str
            }

            response = self._make_request(url, params)

            if response:
                day_odds = self._parse_odds_response(response)
                day_odds['query_date'] = current_date
                all_odds.append(day_odds)

            current_date += timedelta(days=1)

            # Rate limiting
            time.sleep(0.5)

        if not all_odds:
            return self._generate_mock_historical(start_date, end_date)

        return pd.concat(all_odds, ignore_index=True)

    def fetch_closing_lines(
        self,
        game_ids: List[str]
    ) -> pd.DataFrame:
        """
        Fetch closing lines for specific games.

        The closing line is the final odds before game start,
        used for calculating CLV (Closing Line Value).

        Args:
            game_ids: List of game identifiers

        Returns:
            DataFrame with closing lines
        """
        # In production, this would fetch from historical API
        # or a stored database of closing lines
        logger.info(f"Fetching closing lines for {len(game_ids)} games")

        if not self.api_key:
            return self._generate_mock_closing_lines(game_ids)

        # Implementation depends on data source
        # This is a placeholder for the actual API integration
        return self._generate_mock_closing_lines(game_ids)

    def _make_request(
        self,
        url: str,
        params: Dict[str, Any],
        retries: int = 4
    ) -> Optional[Dict]:
        """
        Make API request with exponential backoff retry.

        Args:
            url: API endpoint URL
            params: Query parameters
            retries: Number of retries on failure

        Returns:
            JSON response or None on failure
        """
        if not REQUESTS_AVAILABLE:
            logger.error("requests library not available")
            return None

        for attempt in range(retries):
            try:
                response = requests.get(url, params=params, timeout=30)
                response.raise_for_status()
                return response.json()

            except requests.exceptions.RequestException as e:
                wait_time = 2 ** (attempt + 1)  # 2, 4, 8, 16 seconds
                logger.warning(
                    f"Request failed (attempt {attempt + 1}/{retries}): {e}. "
                    f"Retrying in {wait_time}s..."
                )
                time.sleep(wait_time)

        logger.error(f"Failed to fetch from {url} after {retries} attempts")
        return None

    def _parse_odds_response(self, response: List[Dict]) -> pd.DataFrame:
        """Parse The-Odds-API response into structured DataFrame."""
        records = []

        for event in response:
            game_id = event.get('id', '')
            home_team = event.get('home_team', '')
            away_team = event.get('away_team', '')
            commence_time = pd.to_datetime(event.get('commence_time'))

            for bookmaker in event.get('bookmakers', []):
                bookmaker_name = bookmaker.get('key', '')
                last_update = pd.to_datetime(bookmaker.get('last_update'))

                for market in bookmaker.get('markets', []):
                    market_type = market.get('key', '')

                    for outcome in market.get('outcomes', []):
                        record = {
                            'game_id': game_id,
                            'home_team': home_team,
                            'away_team': away_team,
                            'commence_time': commence_time,
                            'bookmaker': bookmaker_name,
                            'market_type': market_type,
                            'outcome_name': outcome.get('name', ''),
                            'outcome_price': outcome.get('price', 0),
                            'outcome_point': outcome.get('point'),
                            'last_update': last_update
                        }
                        records.append(record)

        return pd.DataFrame(records)

    def _generate_mock_odds(self, n_games: int = 15) -> pd.DataFrame:
        """Generate mock odds data for testing."""
        np.random.seed(42)

        teams = [
            ('New York Yankees', 'NYY'),
            ('Boston Red Sox', 'BOS'),
            ('Los Angeles Dodgers', 'LAD'),
            ('Houston Astros', 'HOU'),
            ('Atlanta Braves', 'ATL'),
            ('Philadelphia Phillies', 'PHI'),
            ('Chicago Cubs', 'CHC'),
            ('San Francisco Giants', 'SFG'),
            ('Toronto Blue Jays', 'TOR'),
            ('Tampa Bay Rays', 'TBR'),
            ('Minnesota Twins', 'MIN'),
            ('Baltimore Orioles', 'BAL'),
            ('Texas Rangers', 'TEX'),
            ('Arizona Diamondbacks', 'ARI'),
            ('Seattle Mariners', 'SEA'),
            ('San Diego Padres', 'SDP')
        ]

        records = []
        base_time = datetime.now() + timedelta(hours=6)

        for i in range(n_games):
            home_idx, away_idx = np.random.choice(len(teams), 2, replace=False)
            home_team = teams[home_idx][0]
            away_team = teams[away_idx][0]

            game_id = f"mock_{i:04d}"
            game_time = base_time + timedelta(hours=i // 3, minutes=(i % 3) * 20)

            # Generate moneyline odds (favorite between -200 and -110)
            home_is_favorite = np.random.random() > 0.5
            favorite_odds = np.random.randint(-200, -105)
            underdog_odds = int(-100 * 100 / abs(favorite_odds) + 10)

            if home_is_favorite:
                home_odds, away_odds = favorite_odds, underdog_odds
            else:
                home_odds, away_odds = underdog_odds, favorite_odds

            # Moneyline
            records.append({
                'game_id': game_id,
                'home_team': home_team,
                'away_team': away_team,
                'commence_time': game_time,
                'bookmaker': 'pinnacle',
                'market_type': 'h2h',
                'outcome_name': home_team,
                'outcome_price': home_odds,
                'outcome_point': None,
                'last_update': datetime.now()
            })
            records.append({
                'game_id': game_id,
                'home_team': home_team,
                'away_team': away_team,
                'commence_time': game_time,
                'bookmaker': 'pinnacle',
                'market_type': 'h2h',
                'outcome_name': away_team,
                'outcome_price': away_odds,
                'outcome_point': None,
                'last_update': datetime.now()
            })

            # Totals
            total_line = np.random.choice([7.5, 8.0, 8.5, 9.0, 9.5])
            for side in ['Over', 'Under']:
                records.append({
                    'game_id': game_id,
                    'home_team': home_team,
                    'away_team': away_team,
                    'commence_time': game_time,
                    'bookmaker': 'pinnacle',
                    'market_type': 'totals',
                    'outcome_name': side,
                    'outcome_price': -110,
                    'outcome_point': total_line,
                    'last_update': datetime.now()
                })

        return pd.DataFrame(records)

    def _generate_mock_historical(
        self,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Generate mock historical odds for backtesting."""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)

        all_records = []
        current = start

        while current <= end:
            day_odds = self._generate_mock_odds(n_games=15)
            day_odds['commence_time'] = pd.to_datetime(current) + pd.to_timedelta(
                day_odds.index % 15 * 20, unit='m'
            ) + timedelta(hours=18)  # Evening games
            day_odds['query_date'] = current
            all_records.append(day_odds)

            current += timedelta(days=1)

        return pd.concat(all_records, ignore_index=True)

    def _generate_mock_closing_lines(
        self,
        game_ids: List[str]
    ) -> pd.DataFrame:
        """Generate mock closing lines."""
        records = []

        for game_id in game_ids:
            # Slight movement from opening to closing
            opening_odds = np.random.randint(-180, -110)
            movement = np.random.randint(-15, 16)
            closing_odds = opening_odds + movement

            records.append({
                'game_id': game_id,
                'market_type': 'h2h',
                'opening_price': opening_odds,
                'closing_price': closing_odds,
                'line_movement': movement
            })

        return pd.DataFrame(records)


def american_to_decimal(american_odds: float) -> float:
    """Convert American odds to decimal odds."""
    if american_odds < 0:
        return 1 + (100 / abs(american_odds))
    else:
        return 1 + (american_odds / 100)


def american_to_probability(american_odds: float) -> float:
    """Convert American odds to implied probability (without vig)."""
    if american_odds < 0:
        return abs(american_odds) / (abs(american_odds) + 100)
    else:
        return 100 / (american_odds + 100)


def remove_vig(prob_a: float, prob_b: float) -> tuple:
    """
    Remove vig from two-outcome market to get true probabilities.

    Args:
        prob_a: Implied probability of outcome A
        prob_b: Implied probability of outcome B

    Returns:
        Tuple of (true_prob_a, true_prob_b)
    """
    total = prob_a + prob_b
    return (prob_a / total, prob_b / total)
