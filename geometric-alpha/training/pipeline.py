"""
Model Training Pipeline - FIXES ISSUE #1

Complete training pipeline with:
1. Proper data loading and validation
2. Time-series cross-validation
3. Calibration testing (ECE < 0.05 required)
4. Feature importance analysis
5. Model serialization
6. Integration with TrustworthyBettingSystem

This replaces the untrained model problem by providing
a proper workflow from raw data to validated model.
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any
from pathlib import Path
from datetime import datetime, timedelta
import logging
import pickle
import json

from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    roc_auc_score, brier_score_loss, log_loss,
    mean_squared_error, mean_absolute_error
)

try:
    from xgboost import XGBClassifier, XGBRegressor
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

try:
    from lightgbm import LGBMClassifier, LGBMRegressor
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False

# Import our trustworthy system
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from evaluation.trustworthy_system import (
    ProbabilityCalibrationValidator,
    CalibrationResult,
    CalibrationLevel
)

logger = logging.getLogger(__name__)


@dataclass
class TrainingConfig:
    """Configuration for model training."""
    # Data requirements
    min_training_samples: int = 1000
    min_validation_samples: int = 200
    test_split_ratio: float = 0.2

    # Cross-validation
    cv_folds: int = 5

    # Model hyperparameters
    xgb_params: Dict = field(default_factory=lambda: {
        'n_estimators': 200,
        'max_depth': 6,
        'learning_rate': 0.05,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'min_child_weight': 3,
        'reg_alpha': 0.1,
        'reg_lambda': 1.0,
        'random_state': 42
    })

    lgbm_params: Dict = field(default_factory=lambda: {
        'n_estimators': 200,
        'max_depth': 6,
        'learning_rate': 0.05,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'min_child_samples': 20,
        'reg_alpha': 0.1,
        'reg_lambda': 1.0,
        'random_state': 42,
        'verbose': -1
    })

    # Calibration requirements
    max_acceptable_ece: float = 0.05  # Must be under 5% ECE

    # Feature columns
    geometric_features: List[str] = field(default_factory=lambda: [
        'tunnel_score', 'arsenal_volume', 'arsenal_spread',
        'umpire_zone_area', 'defense_voronoi_coverage',
        'pitcher_release_consistency', 'pitch_sequence_entropy'
    ])

    contextual_features: List[str] = field(default_factory=lambda: [
        'home_team_win_pct', 'away_team_win_pct',
        'home_pitcher_era', 'away_pitcher_era',
        'home_bullpen_era', 'away_bullpen_era',
        'home_batting_avg', 'away_batting_avg'
    ])


@dataclass
class TrainingResult:
    """Results from model training."""
    is_successful: bool
    model_name: str

    # Performance metrics
    cv_auc_mean: float = 0.0
    cv_auc_std: float = 0.0
    test_auc: float = 0.0
    test_brier: float = 0.0
    test_log_loss: float = 0.0

    # Calibration
    calibration_ece: float = 1.0
    calibration_level: str = "unusable"
    is_calibrated: bool = False

    # Feature importance
    feature_importance: Dict[str, float] = field(default_factory=dict)
    top_features: List[Tuple[str, float]] = field(default_factory=list)

    # Training metadata
    n_training_samples: int = 0
    n_test_samples: int = 0
    training_date: str = ""

    # Warnings
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            'is_successful': self.is_successful,
            'model_name': self.model_name,
            'metrics': {
                'cv_auc_mean': self.cv_auc_mean,
                'cv_auc_std': self.cv_auc_std,
                'test_auc': self.test_auc,
                'test_brier': self.test_brier,
                'test_log_loss': self.test_log_loss
            },
            'calibration': {
                'ece': self.calibration_ece,
                'level': self.calibration_level,
                'is_calibrated': self.is_calibrated
            },
            'top_features': self.top_features,
            'samples': {
                'training': self.n_training_samples,
                'test': self.n_test_samples
            },
            'training_date': self.training_date,
            'warnings': self.warnings
        }


class ModelTrainingPipeline:
    """
    Complete model training pipeline with validation.

    FIXES ISSUE #1: No trained probability model

    This pipeline ensures:
    1. Sufficient training data
    2. Proper time-series validation (no look-ahead)
    3. Calibration testing
    4. Feature importance tracking
    5. Model persistence

    Usage:
        pipeline = ModelTrainingPipeline()

        # Load your historical data
        features_df = load_features()  # Your feature engineering output
        targets_df = load_targets()    # Game outcomes

        # Train with full validation
        result = pipeline.train_and_validate(features_df, targets_df)

        if result.is_calibrated:
            print("Model is ready for betting!")
            pipeline.save_model("models/production")
        else:
            print(f"Model needs calibration: ECE = {result.calibration_ece:.3f}")
    """

    def __init__(self, config: TrainingConfig = None):
        self.config = config or TrainingConfig()

        self.model = None
        self.scaler = None
        self.feature_cols = []
        self.is_trained = False
        self.calibration_validator = ProbabilityCalibrationValidator()
        self.training_result: Optional[TrainingResult] = None

    def train_and_validate(
        self,
        features_df: pd.DataFrame,
        targets_df: pd.DataFrame,
        target_col: str = 'home_win'
    ) -> TrainingResult:
        """
        Train model with full validation pipeline.

        Args:
            features_df: Feature DataFrame (must have date column for time-series split)
            targets_df: Target DataFrame with outcome columns
            target_col: Which target to predict ('home_win', 'total_runs', 'margin')

        Returns:
            TrainingResult with all metrics and validation status
        """
        warnings = []

        # =========================================================
        # STEP 1: DATA VALIDATION
        # =========================================================
        logger.info("Step 1: Validating training data...")

        if len(features_df) < self.config.min_training_samples:
            return TrainingResult(
                is_successful=False,
                model_name="none",
                warnings=[f"Insufficient data: {len(features_df)} < {self.config.min_training_samples} required"]
            )

        if target_col not in targets_df.columns:
            return TrainingResult(
                is_successful=False,
                model_name="none",
                warnings=[f"Target column '{target_col}' not found in targets_df"]
            )

        # Identify available features
        self.feature_cols = self._identify_features(features_df)
        if len(self.feature_cols) < 5:
            warnings.append(f"Only {len(self.feature_cols)} features available - model may underfit")

        logger.info(f"Found {len(self.feature_cols)} features, {len(features_df)} samples")

        # =========================================================
        # STEP 2: PREPARE DATA
        # =========================================================
        logger.info("Step 2: Preparing training data...")

        # Align features and targets
        common_idx = features_df.index.intersection(targets_df.index)
        X = features_df.loc[common_idx, self.feature_cols].copy()
        y = targets_df.loc[common_idx, target_col].values

        # Handle missing values
        missing_before = X.isnull().sum().sum()
        X = X.fillna(X.median())
        if missing_before > 0:
            warnings.append(f"Imputed {missing_before} missing values with median")

        # Time-series split (last 20% for testing)
        split_idx = int(len(X) * (1 - self.config.test_split_ratio))
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        if len(X_test) < self.config.min_validation_samples:
            warnings.append(f"Small test set: {len(X_test)} samples")

        # Scale features
        self.scaler = StandardScaler()
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)

        # =========================================================
        # STEP 3: CROSS-VALIDATION
        # =========================================================
        logger.info("Step 3: Running cross-validation...")

        best_model = None
        best_cv_score = -np.inf
        best_model_name = "none"
        cv_scores = []

        tscv = TimeSeriesSplit(n_splits=self.config.cv_folds)

        models_to_try = []
        if XGBOOST_AVAILABLE:
            models_to_try.append(('xgboost', XGBClassifier(**self.config.xgb_params)))
        if LIGHTGBM_AVAILABLE:
            models_to_try.append(('lightgbm', LGBMClassifier(**self.config.lgbm_params)))

        if not models_to_try:
            from sklearn.linear_model import LogisticRegression
            models_to_try.append(('logistic', LogisticRegression(max_iter=1000)))
            warnings.append("Using LogisticRegression - install xgboost/lightgbm for better performance")

        for model_name, model in models_to_try:
            try:
                fold_scores = []
                for train_idx, val_idx in tscv.split(X_train_scaled):
                    X_fold_train = X_train_scaled[train_idx]
                    y_fold_train = y_train[train_idx]
                    X_fold_val = X_train_scaled[val_idx]
                    y_fold_val = y_train[val_idx]

                    model.fit(X_fold_train, y_fold_train)
                    y_pred_proba = model.predict_proba(X_fold_val)[:, 1]
                    auc = roc_auc_score(y_fold_val, y_pred_proba)
                    fold_scores.append(auc)

                mean_score = np.mean(fold_scores)
                std_score = np.std(fold_scores)

                logger.info(f"{model_name} CV AUC: {mean_score:.4f} (+/- {std_score:.4f})")

                if mean_score > best_cv_score:
                    best_cv_score = mean_score
                    best_model_name = model_name
                    cv_scores = fold_scores

            except Exception as e:
                logger.warning(f"Failed to train {model_name}: {e}")
                warnings.append(f"{model_name} training failed: {str(e)}")

        if best_cv_score < 0.52:
            warnings.append(f"Poor CV performance (AUC={best_cv_score:.3f}) - model may not have predictive power")

        # =========================================================
        # STEP 4: TRAIN FINAL MODEL
        # =========================================================
        logger.info(f"Step 4: Training final {best_model_name} model...")

        # Recreate best model and train on all training data
        if best_model_name == 'xgboost':
            self.model = XGBClassifier(**self.config.xgb_params)
        elif best_model_name == 'lightgbm':
            self.model = LGBMClassifier(**self.config.lgbm_params)
        else:
            from sklearn.linear_model import LogisticRegression
            self.model = LogisticRegression(max_iter=1000)

        self.model.fit(X_train_scaled, y_train)

        # =========================================================
        # STEP 5: TEST SET EVALUATION
        # =========================================================
        logger.info("Step 5: Evaluating on test set...")

        y_test_proba = self.model.predict_proba(X_test_scaled)[:, 1]

        test_auc = roc_auc_score(y_test, y_test_proba)
        test_brier = brier_score_loss(y_test, y_test_proba)
        test_logloss = log_loss(y_test, y_test_proba)

        logger.info(f"Test AUC: {test_auc:.4f}, Brier: {test_brier:.4f}, LogLoss: {test_logloss:.4f}")

        # =========================================================
        # STEP 6: CALIBRATION TESTING (CRITICAL!)
        # =========================================================
        logger.info("Step 6: Testing probability calibration...")

        # Record all test predictions for calibration analysis
        self.calibration_validator = ProbabilityCalibrationValidator()
        for i in range(len(y_test)):
            self.calibration_validator.record(
                predicted_prob=float(y_test_proba[i]),
                actual_outcome=bool(y_test[i])
            )

        calibration_result = self.calibration_validator.test_calibration()

        is_calibrated = calibration_result.is_trustworthy

        if not is_calibrated:
            warnings.append(
                f"Model is NOT calibrated (ECE={calibration_result.expected_calibration_error:.3f}). "
                f"Must be < {self.config.max_acceptable_ece:.3f} for betting."
            )

        # =========================================================
        # STEP 7: FEATURE IMPORTANCE
        # =========================================================
        logger.info("Step 7: Extracting feature importance...")

        feature_importance = {}
        if hasattr(self.model, 'feature_importances_'):
            for i, col in enumerate(self.feature_cols):
                feature_importance[col] = float(self.model.feature_importances_[i])

        top_features = sorted(
            feature_importance.items(),
            key=lambda x: x[1],
            reverse=True
        )[:10]

        # =========================================================
        # STEP 8: COMPILE RESULTS
        # =========================================================
        self.is_trained = True

        self.training_result = TrainingResult(
            is_successful=True,
            model_name=best_model_name,
            cv_auc_mean=float(np.mean(cv_scores)),
            cv_auc_std=float(np.std(cv_scores)),
            test_auc=float(test_auc),
            test_brier=float(test_brier),
            test_log_loss=float(test_logloss),
            calibration_ece=calibration_result.expected_calibration_error,
            calibration_level=calibration_result.level.value,
            is_calibrated=is_calibrated,
            feature_importance=feature_importance,
            top_features=top_features,
            n_training_samples=len(X_train),
            n_test_samples=len(X_test),
            training_date=datetime.now().isoformat(),
            warnings=warnings
        )

        logger.info(f"Training complete. Calibrated: {is_calibrated}")
        return self.training_result

    def _identify_features(self, df: pd.DataFrame) -> List[str]:
        """Identify available feature columns."""
        all_features = (
            self.config.geometric_features +
            self.config.contextual_features
        )

        available = [f for f in all_features if f in df.columns]

        # Add any numeric columns not in predefined lists
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        exclude_patterns = ['target_', 'outcome', 'result', 'won', 'id', 'date']

        for col in numeric_cols:
            if col not in available:
                if not any(pattern in col.lower() for pattern in exclude_patterns):
                    available.append(col)

        return available

    def predict(self, features_df: pd.DataFrame) -> np.ndarray:
        """
        Generate probability predictions.

        Args:
            features_df: Features for prediction

        Returns:
            Array of win probabilities
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before prediction. Call train_and_validate() first.")

        X = features_df[self.feature_cols].copy()
        X = X.fillna(X.median())
        X_scaled = self.scaler.transform(X)

        return self.model.predict_proba(X_scaled)[:, 1]

    def predict_with_calibration(self, features_df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict with calibration adjustment.

        Returns:
            Tuple of (raw_probabilities, calibrated_probabilities)
        """
        raw_probs = self.predict(features_df)

        calibrated_probs = np.array([
            self.calibration_validator.get_calibration_adjustment(p)
            for p in raw_probs
        ])

        return raw_probs, calibrated_probs

    def save_model(self, path: str):
        """Save trained model and all artifacts."""
        if not self.is_trained:
            raise ValueError("Cannot save untrained model")

        save_path = Path(path)
        save_path.mkdir(parents=True, exist_ok=True)

        # Save model
        with open(save_path / "model.pkl", 'wb') as f:
            pickle.dump(self.model, f)

        # Save scaler
        with open(save_path / "scaler.pkl", 'wb') as f:
            pickle.dump(self.scaler, f)

        # Save feature columns
        with open(save_path / "features.json", 'w') as f:
            json.dump(self.feature_cols, f)

        # Save calibration validator
        with open(save_path / "calibration.pkl", 'wb') as f:
            pickle.dump(self.calibration_validator, f)

        # Save training result
        if self.training_result:
            with open(save_path / "training_result.json", 'w') as f:
                json.dump(self.training_result.to_dict(), f, indent=2)

        logger.info(f"Model saved to {save_path}")

    def load_model(self, path: str):
        """Load trained model from disk."""
        load_path = Path(path)

        with open(load_path / "model.pkl", 'rb') as f:
            self.model = pickle.load(f)

        with open(load_path / "scaler.pkl", 'rb') as f:
            self.scaler = pickle.load(f)

        with open(load_path / "features.json", 'r') as f:
            self.feature_cols = json.load(f)

        if (load_path / "calibration.pkl").exists():
            with open(load_path / "calibration.pkl", 'rb') as f:
                self.calibration_validator = pickle.load(f)

        self.is_trained = True
        logger.info(f"Model loaded from {load_path}")

    def get_training_report(self) -> str:
        """Generate human-readable training report."""
        if not self.training_result:
            return "No training results available. Run train_and_validate() first."

        r = self.training_result

        report = f"""
================================================================================
                    MODEL TRAINING REPORT
================================================================================

MODEL: {r.model_name}
DATE: {r.training_date}

DATA
----
Training samples: {r.n_training_samples}
Test samples: {r.n_test_samples}
Features used: {len(self.feature_cols)}

CROSS-VALIDATION
----------------
AUC: {r.cv_auc_mean:.4f} (+/- {r.cv_auc_std:.4f})

TEST SET PERFORMANCE
--------------------
AUC: {r.test_auc:.4f}
Brier Score: {r.test_brier:.4f}
Log Loss: {r.test_log_loss:.4f}

CALIBRATION (CRITICAL FOR BETTING)
----------------------------------
ECE: {r.calibration_ece:.4f}
Level: {r.calibration_level.upper()}
Is Calibrated: {'YES ✓' if r.is_calibrated else 'NO ✗'}
Threshold: ECE < {self.config.max_acceptable_ece:.3f}

{'✓ Model is READY for betting' if r.is_calibrated else '✗ Model FAILS calibration - DO NOT USE FOR BETTING'}

TOP FEATURES
------------
"""
        for i, (feat, imp) in enumerate(r.top_features[:10], 1):
            report += f"{i}. {feat}: {imp:.4f}\n"

        if r.warnings:
            report += "\nWARNINGS\n--------\n"
            for w in r.warnings:
                report += f"⚠ {w}\n"

        report += "\n================================================================================"

        return report


# =============================================================================
# DATA LOADING HELPERS
# =============================================================================

def load_training_data_from_statcast(
    start_year: int = 2021,
    end_year: int = 2024
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Load and prepare training data from Statcast.

    This is a template - implement based on your data sources.

    Returns:
        Tuple of (features_df, targets_df)
    """
    # Import data loading modules
    try:
        from data.statcast import StatcastClient
        from features.tunneling import compute_tunnel_features
        from features.arsenal import compute_arsenal_features

        client = StatcastClient()

        all_features = []
        all_targets = []

        for year in range(start_year, end_year + 1):
            logger.info(f"Loading {year} data...")

            # Fetch pitch data
            pitch_df = client.fetch_season(year)

            if pitch_df is None or len(pitch_df) == 0:
                logger.warning(f"No data for {year}")
                continue

            # Compute features by game
            # (This is a simplified example - real implementation would be more complex)
            game_features = pitch_df.groupby('game_pk').apply(
                lambda g: pd.Series({
                    'tunnel_score': compute_tunnel_features(g).get('mean_tunnel', 0.5),
                    'arsenal_volume': compute_arsenal_features(g).get('volume', 1.0),
                    # Add more features...
                })
            )

            all_features.append(game_features)

            # Get game outcomes
            game_outcomes = pitch_df.groupby('game_pk').apply(
                lambda g: pd.Series({
                    'home_win': g['home_score'].iloc[-1] > g['away_score'].iloc[-1] if 'home_score' in g else 0.5,
                    'total_runs': g['home_score'].iloc[-1] + g['away_score'].iloc[-1] if 'home_score' in g else 8.5,
                })
            )
            all_targets.append(game_outcomes)

        if not all_features:
            raise ValueError("No training data loaded")

        features_df = pd.concat(all_features)
        targets_df = pd.concat(all_targets)

        return features_df, targets_df

    except ImportError as e:
        logger.error(f"Cannot load data - missing modules: {e}")
        raise


def create_synthetic_training_data(n_samples: int = 5000) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Create synthetic training data for testing the pipeline.

    THIS IS FOR TESTING ONLY - use real data for production.
    """
    np.random.seed(42)

    # Create features with some predictive signal
    features = pd.DataFrame({
        'tunnel_score': np.random.beta(5, 5, n_samples),
        'arsenal_volume': np.random.lognormal(0, 0.5, n_samples),
        'arsenal_spread': np.random.uniform(0.3, 0.8, n_samples),
        'umpire_zone_area': np.random.normal(2.5, 0.3, n_samples),
        'defense_voronoi_coverage': np.random.uniform(0.7, 0.95, n_samples),
        'pitcher_release_consistency': np.random.beta(8, 2, n_samples),
        'pitch_sequence_entropy': np.random.uniform(1.5, 3.5, n_samples),
        'home_team_win_pct': np.random.beta(5, 5, n_samples),
        'away_team_win_pct': np.random.beta(5, 5, n_samples),
        'home_pitcher_era': np.random.lognormal(1.2, 0.4, n_samples),
        'away_pitcher_era': np.random.lognormal(1.2, 0.4, n_samples),
    })

    # Create target with signal from features
    # True relationship: home_win_prob = 0.5 + 0.1 * (home_win_pct - away_win_pct) + noise
    true_prob = (
        0.5 +
        0.15 * (features['home_team_win_pct'] - features['away_team_win_pct']) +
        0.05 * (features['tunnel_score'] - 0.5) +
        0.03 * (features['arsenal_volume'] - 1) +
        np.random.normal(0, 0.05, n_samples)
    )
    true_prob = np.clip(true_prob, 0.2, 0.8)

    targets = pd.DataFrame({
        'home_win': np.random.binomial(1, true_prob),
        'total_runs': np.random.poisson(8.5, n_samples),
        'margin': np.random.normal(0, 3, n_samples)
    })

    return features, targets


# =============================================================================
# CLI INTERFACE
# =============================================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train Geometric Alpha model")
    parser.add_argument('--data-path', type=str, help="Path to training data")
    parser.add_argument('--output-path', type=str, default="models/trained", help="Where to save model")
    parser.add_argument('--use-synthetic', action='store_true', help="Use synthetic data for testing")

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    pipeline = ModelTrainingPipeline()

    if args.use_synthetic:
        logger.info("Using synthetic data for testing...")
        features_df, targets_df = create_synthetic_training_data(5000)
    else:
        logger.info(f"Loading data from {args.data_path}...")
        # Implement your data loading here
        raise NotImplementedError("Implement data loading for your data source")

    result = pipeline.train_and_validate(features_df, targets_df)

    print(pipeline.get_training_report())

    if result.is_successful:
        pipeline.save_model(args.output_path)
        print(f"\nModel saved to {args.output_path}")
