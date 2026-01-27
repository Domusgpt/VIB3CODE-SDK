"""
Geometric Predictor

Machine learning ensemble for predicting game outcomes
using geometric features.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional, Any
from sklearn.model_selection import cross_val_score, TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import logging
import pickle
from pathlib import Path

try:
    from xgboost import XGBRegressor, XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

try:
    from lightgbm import LGBMRegressor, LGBMClassifier
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

from config.settings import CONFIG

logger = logging.getLogger(__name__)


@dataclass
class PredictionResult:
    """Result of a game prediction."""

    game_id: str
    home_team: str
    away_team: str

    # Win probability
    home_win_prob: float
    away_win_prob: float

    # Run totals
    expected_home_runs: float
    expected_away_runs: float
    expected_total: float

    # Spread
    expected_margin: float

    # Confidence
    model_confidence: float

    # Feature importance
    top_features: List[Tuple[str, float]] = None

    def get_edge_vs_market(
        self,
        market_home_prob: float
    ) -> float:
        """Calculate edge vs market probability."""
        return self.home_win_prob - market_home_prob


class GeometricPredictor:
    """
    Ensemble predictor using geometric features.

    Combines XGBoost and LightGBM models with specialized
    sub-models for different market types.
    """

    def __init__(self, config=None):
        """Initialize predictor with configuration."""
        self.config = config or CONFIG.model

        # Initialize model containers
        self.models = {}
        self.scalers = {}
        self.feature_importance = {}

        # Track training state
        self.is_trained = False
        self.training_metrics = {}

    def train(
        self,
        features_df: pd.DataFrame,
        targets_df: pd.DataFrame,
        cv_folds: int = None
    ) -> Dict[str, float]:
        """
        Train the prediction ensemble.

        Args:
            features_df: DataFrame with geometric and contextual features
            targets_df: DataFrame with targets (home_win, total_runs, margin)
            cv_folds: Number of cross-validation folds

        Returns:
            Dict of training metrics
        """
        cv_folds = cv_folds or self.config.cv_folds

        # Validate inputs
        if len(features_df) != len(targets_df):
            raise ValueError("Features and targets must have same length")

        # Identify available feature columns
        feature_cols = self._identify_features(features_df)
        logger.info(f"Training with {len(feature_cols)} features on {len(features_df)} samples")

        # Prepare data
        X = features_df[feature_cols].copy()
        X = X.fillna(X.mean())  # Simple imputation

        # Scale features
        self.scalers['main'] = StandardScaler()
        X_scaled = self.scalers['main'].fit_transform(X)

        metrics = {}

        # Train win probability model
        if 'home_win' in targets_df.columns:
            y_win = targets_df['home_win'].values
            metrics['win_model'] = self._train_classification_model(
                X_scaled, y_win, feature_cols, 'win', cv_folds
            )

        # Train total runs model
        if 'total_runs' in targets_df.columns:
            y_total = targets_df['total_runs'].values
            metrics['total_model'] = self._train_regression_model(
                X_scaled, y_total, feature_cols, 'total', cv_folds
            )

        # Train margin model
        if 'margin' in targets_df.columns:
            y_margin = targets_df['margin'].values
            metrics['margin_model'] = self._train_regression_model(
                X_scaled, y_margin, feature_cols, 'margin', cv_folds
            )

        self.is_trained = True
        self.training_metrics = metrics
        self.feature_cols = feature_cols

        logger.info(f"Training complete. Metrics: {metrics}")
        return metrics

    def _identify_features(self, df: pd.DataFrame) -> List[str]:
        """Identify available feature columns."""
        all_features = (
            self.config.geometric_features +
            self.config.contextual_features +
            self.config.environmental_features
        )

        available = [f for f in all_features if f in df.columns]

        # Add any numeric columns not in predefined lists
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        for col in numeric_cols:
            if col not in available and not col.startswith('target_'):
                available.append(col)

        return available

    def _train_classification_model(
        self,
        X: np.ndarray,
        y: np.ndarray,
        feature_cols: List[str],
        name: str,
        cv_folds: int
    ) -> Dict[str, float]:
        """Train binary classification model."""
        models_to_try = []

        if XGBOOST_AVAILABLE:
            xgb_model = XGBClassifier(**self.config.xgb_params)
            models_to_try.append(('xgb', xgb_model))

        if LIGHTGBM_AVAILABLE:
            lgbm_model = LGBMClassifier(**self.config.lgbm_params, verbose=-1)
            models_to_try.append(('lgbm', lgbm_model))

        if not models_to_try:
            logger.warning("No ML libraries available, using dummy model")
            from sklearn.dummy import DummyClassifier
            models_to_try.append(('dummy', DummyClassifier(strategy='prior')))

        # Cross-validation
        tscv = TimeSeriesSplit(n_splits=cv_folds)

        best_score = -np.inf
        best_model = None
        best_name = None

        for model_name, model in models_to_try:
            try:
                scores = cross_val_score(model, X, y, cv=tscv, scoring='roc_auc')
                mean_score = scores.mean()

                logger.info(f"{name}_{model_name} CV AUC: {mean_score:.4f} (+/- {scores.std():.4f})")

                if mean_score > best_score:
                    best_score = mean_score
                    best_model = model
                    best_name = model_name

            except Exception as e:
                logger.warning(f"Failed to train {model_name}: {e}")

        # Train final model on all data
        if best_model is not None:
            best_model.fit(X, y)
            self.models[name] = best_model

            # Extract feature importance
            if hasattr(best_model, 'feature_importances_'):
                importance = dict(zip(feature_cols, best_model.feature_importances_))
                self.feature_importance[name] = importance

        return {
            'best_model': best_name,
            'cv_auc': best_score
        }

    def _train_regression_model(
        self,
        X: np.ndarray,
        y: np.ndarray,
        feature_cols: List[str],
        name: str,
        cv_folds: int
    ) -> Dict[str, float]:
        """Train regression model."""
        models_to_try = []

        if XGBOOST_AVAILABLE:
            xgb_params = self.config.xgb_params.copy()
            xgb_params['objective'] = 'reg:squarederror'
            xgb_model = XGBRegressor(**xgb_params)
            models_to_try.append(('xgb', xgb_model))

        if LIGHTGBM_AVAILABLE:
            lgbm_params = self.config.lgbm_params.copy()
            lgbm_params['objective'] = 'regression'
            lgbm_model = LGBMRegressor(**lgbm_params, verbose=-1)
            models_to_try.append(('lgbm', lgbm_model))

        if not models_to_try:
            from sklearn.linear_model import Ridge
            models_to_try.append(('ridge', Ridge()))

        tscv = TimeSeriesSplit(n_splits=cv_folds)

        best_score = -np.inf
        best_model = None
        best_name = None

        for model_name, model in models_to_try:
            try:
                scores = cross_val_score(model, X, y, cv=tscv, scoring='neg_mean_squared_error')
                mean_score = scores.mean()

                logger.info(f"{name}_{model_name} CV MSE: {-mean_score:.4f}")

                if mean_score > best_score:
                    best_score = mean_score
                    best_model = model
                    best_name = model_name

            except Exception as e:
                logger.warning(f"Failed to train {model_name}: {e}")

        if best_model is not None:
            best_model.fit(X, y)
            self.models[name] = best_model

            if hasattr(best_model, 'feature_importances_'):
                importance = dict(zip(feature_cols, best_model.feature_importances_))
                self.feature_importance[name] = importance

        return {
            'best_model': best_name,
            'cv_mse': -best_score
        }

    def predict(
        self,
        features_df: pd.DataFrame
    ) -> List[PredictionResult]:
        """
        Generate predictions for games.

        Args:
            features_df: DataFrame with game features

        Returns:
            List of PredictionResult objects
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction")

        results = []

        # Prepare features
        X = features_df[self.feature_cols].copy()
        X = X.fillna(X.mean())
        X_scaled = self.scalers['main'].transform(X)

        # Generate predictions
        win_probs = np.ones(len(X)) * 0.5
        total_preds = np.ones(len(X)) * 8.5
        margin_preds = np.zeros(len(X))

        if 'win' in self.models:
            win_probs = self.models['win'].predict_proba(X_scaled)[:, 1]

        if 'total' in self.models:
            total_preds = self.models['total'].predict(X_scaled)

        if 'margin' in self.models:
            margin_preds = self.models['margin'].predict(X_scaled)

        # Get top features
        top_features = self._get_top_features(5)

        for i in range(len(features_df)):
            row = features_df.iloc[i]

            # Calculate run expectations from margin and total
            exp_total = total_preds[i]
            exp_margin = margin_preds[i]

            exp_home_runs = (exp_total + exp_margin) / 2
            exp_away_runs = (exp_total - exp_margin) / 2

            result = PredictionResult(
                game_id=str(row.get('game_id', f'game_{i}')),
                home_team=str(row.get('home_team', 'Home')),
                away_team=str(row.get('away_team', 'Away')),
                home_win_prob=float(win_probs[i]),
                away_win_prob=float(1 - win_probs[i]),
                expected_home_runs=float(exp_home_runs),
                expected_away_runs=float(exp_away_runs),
                expected_total=float(exp_total),
                expected_margin=float(exp_margin),
                model_confidence=self._compute_confidence(X_scaled[i]),
                top_features=top_features
            )

            results.append(result)

        return results

    def _compute_confidence(self, x: np.ndarray) -> float:
        """Compute prediction confidence based on feature values."""
        # Higher confidence when features are within training distribution
        # Lower when extrapolating
        return 0.7  # Placeholder - implement based on feature space analysis

    def _get_top_features(self, n: int = 5) -> List[Tuple[str, float]]:
        """Get top N most important features across all models."""
        combined_importance = {}

        for model_name, importance in self.feature_importance.items():
            for feature, imp in importance.items():
                if feature not in combined_importance:
                    combined_importance[feature] = 0
                combined_importance[feature] += imp

        sorted_features = sorted(
            combined_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )

        return sorted_features[:n]

    def save(self, path: Path):
        """Save trained model to disk."""
        if not self.is_trained:
            raise ValueError("Cannot save untrained model")

        path.mkdir(parents=True, exist_ok=True)

        # Save models
        for name, model in self.models.items():
            model_path = path / f"{name}_model.pkl"
            with open(model_path, 'wb') as f:
                pickle.dump(model, f)

        # Save scalers
        for name, scaler in self.scalers.items():
            scaler_path = path / f"{name}_scaler.pkl"
            with open(scaler_path, 'wb') as f:
                pickle.dump(scaler, f)

        # Save metadata
        metadata = {
            'feature_cols': self.feature_cols,
            'feature_importance': self.feature_importance,
            'training_metrics': self.training_metrics
        }
        meta_path = path / "metadata.pkl"
        with open(meta_path, 'wb') as f:
            pickle.dump(metadata, f)

        logger.info(f"Model saved to {path}")

    def load(self, path: Path):
        """Load trained model from disk."""
        # Load models
        for model_file in path.glob("*_model.pkl"):
            name = model_file.stem.replace('_model', '')
            with open(model_file, 'rb') as f:
                self.models[name] = pickle.load(f)

        # Load scalers
        for scaler_file in path.glob("*_scaler.pkl"):
            name = scaler_file.stem.replace('_scaler', '')
            with open(scaler_file, 'rb') as f:
                self.scalers[name] = pickle.load(f)

        # Load metadata
        meta_path = path / "metadata.pkl"
        if meta_path.exists():
            with open(meta_path, 'rb') as f:
                metadata = pickle.load(f)
                self.feature_cols = metadata.get('feature_cols', [])
                self.feature_importance = metadata.get('feature_importance', {})
                self.training_metrics = metadata.get('training_metrics', {})

        self.is_trained = True
        logger.info(f"Model loaded from {path}")


class EnsemblePredictor(GeometricPredictor):
    """
    Advanced ensemble combining multiple prediction strategies.

    Includes:
    - Primary geometric features model
    - Historical matchup model
    - Situational adjustment model
    """

    def __init__(self, config=None):
        """Initialize ensemble predictor."""
        super().__init__(config)
        self.sub_models = {}

    def train_ensemble(
        self,
        features_df: pd.DataFrame,
        targets_df: pd.DataFrame,
        matchup_df: Optional[pd.DataFrame] = None,
        situational_df: Optional[pd.DataFrame] = None
    ) -> Dict[str, float]:
        """
        Train complete ensemble with multiple data sources.

        Args:
            features_df: Primary geometric features
            targets_df: Target outcomes
            matchup_df: Historical matchup data
            situational_df: Situational factors

        Returns:
            Training metrics for each sub-model
        """
        metrics = {}

        # Train primary model
        metrics['primary'] = self.train(features_df, targets_df)

        # Train matchup model if data available
        if matchup_df is not None and len(matchup_df) > 100:
            matchup_predictor = GeometricPredictor(self.config)
            metrics['matchup'] = matchup_predictor.train(matchup_df, targets_df)
            self.sub_models['matchup'] = matchup_predictor

        # Train situational model if data available
        if situational_df is not None and len(situational_df) > 100:
            situational_predictor = GeometricPredictor(self.config)
            metrics['situational'] = situational_predictor.train(situational_df, targets_df)
            self.sub_models['situational'] = situational_predictor

        return metrics

    def predict_ensemble(
        self,
        features_df: pd.DataFrame,
        matchup_df: Optional[pd.DataFrame] = None,
        situational_df: Optional[pd.DataFrame] = None
    ) -> List[PredictionResult]:
        """
        Generate ensemble predictions combining all sub-models.

        Args:
            features_df: Primary geometric features
            matchup_df: Historical matchup data
            situational_df: Situational factors

        Returns:
            Combined prediction results
        """
        # Get primary predictions
        primary_results = self.predict(features_df)

        # Combine with sub-model predictions
        if 'matchup' in self.sub_models and matchup_df is not None:
            matchup_results = self.sub_models['matchup'].predict(matchup_df)
            primary_results = self._combine_predictions(
                primary_results, matchup_results, weight=0.3
            )

        if 'situational' in self.sub_models and situational_df is not None:
            situational_results = self.sub_models['situational'].predict(situational_df)
            primary_results = self._combine_predictions(
                primary_results, situational_results, weight=0.2
            )

        return primary_results

    def _combine_predictions(
        self,
        primary: List[PredictionResult],
        secondary: List[PredictionResult],
        weight: float
    ) -> List[PredictionResult]:
        """Combine two sets of predictions with weighting."""
        combined = []

        for p, s in zip(primary, secondary):
            combined_result = PredictionResult(
                game_id=p.game_id,
                home_team=p.home_team,
                away_team=p.away_team,
                home_win_prob=(1 - weight) * p.home_win_prob + weight * s.home_win_prob,
                away_win_prob=(1 - weight) * p.away_win_prob + weight * s.away_win_prob,
                expected_home_runs=(1 - weight) * p.expected_home_runs + weight * s.expected_home_runs,
                expected_away_runs=(1 - weight) * p.expected_away_runs + weight * s.expected_away_runs,
                expected_total=(1 - weight) * p.expected_total + weight * s.expected_total,
                expected_margin=(1 - weight) * p.expected_margin + weight * s.expected_margin,
                model_confidence=min(p.model_confidence, s.model_confidence),
                top_features=p.top_features
            )
            combined.append(combined_result)

        return combined
