"""
Evaluation module for trustworthy betting validation.

This module provides the foundation for ensuring our betting system
is trustworthy before real-money deployment.

Components:
- ProbabilityCalibrationValidator: Test model calibration (ECE < 0.05)
- EmpiricalCorrelationEstimator: Compute correlations from actual data
- DataDrivenTrustCalculator: Calculate trust from evidence, not arbitrary values
- EdgeValidationFramework: Rigorously test if edge is real
- TrustworthyBettingSystem: Integrated system combining all validators
"""

from .trustworthy_system import (
    # Issue #1 Fix: Probability Calibration
    CalibrationLevel,
    CalibrationResult,
    ProbabilityCalibrationValidator,

    # Issue #2 Fix: Empirical Correlations
    CorrelationEstimate,
    EmpiricalCorrelationEstimator,

    # Issue #3 Fix: Data-Driven Trust
    TrustAssessment,
    DataDrivenTrustCalculator,

    # Issue #4 Fix: Edge Validation
    EdgeValidationResult,
    EdgeValidationFramework,

    # Integrated System
    TrustworthyBettingSystem,
)

__all__ = [
    # Issue #1
    'CalibrationLevel',
    'CalibrationResult',
    'ProbabilityCalibrationValidator',

    # Issue #2
    'CorrelationEstimate',
    'EmpiricalCorrelationEstimator',

    # Issue #3
    'TrustAssessment',
    'DataDrivenTrustCalculator',

    # Issue #4
    'EdgeValidationResult',
    'EdgeValidationFramework',

    # Integrated
    'TrustworthyBettingSystem',
]
