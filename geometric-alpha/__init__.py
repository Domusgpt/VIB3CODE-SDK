"""
Geometric Alpha: Polytopal Projection Processing for Sports Derivatives

A comprehensive architecture for applying geometric cognition and
topological data analysis to sports betting markets.

Core concepts:
- Pitch Tunneling: Manifold intersection analysis
- Umpire Zones: Convex hull expansion/contraction
- Defensive Coverage: Voronoi tessellation analysis
- Arsenal Polytopes: High-dimensional skill representation

Usage:
    from geometric_alpha import GeometricAlphaEngine

    engine = GeometricAlphaEngine()
    engine.train(start_year=2021, end_year=2023)
    slate = engine.process_daily_slate()

© 2025 Paul Phillips - Clear Seas Solutions LLC
"""

__version__ = "0.1.0"
__author__ = "Paul Phillips"
__email__ = "Paul@clearseassolutions.com"

from core.engine import GeometricAlphaEngine
from config.settings import CONFIG, GeometricAlphaConfig

__all__ = [
    'GeometricAlphaEngine',
    'CONFIG',
    'GeometricAlphaConfig',
    '__version__'
]
