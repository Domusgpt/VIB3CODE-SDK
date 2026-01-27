"""
Training module for Geometric Alpha.

Provides complete model training pipeline with validation.
"""

from .pipeline import (
    ModelTrainingPipeline,
    TrainingConfig,
    TrainingResult,
    create_synthetic_training_data,
)

__all__ = [
    'ModelTrainingPipeline',
    'TrainingConfig',
    'TrainingResult',
    'create_synthetic_training_data',
]
