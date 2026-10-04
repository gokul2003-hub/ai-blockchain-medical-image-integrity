import numpy as np
from loguru import logger

def add_laplace_noise(original_val: float, epsilon: float = 1.0) -> float:
    """
    Applies Laplacian noise to a numerical query result to achieve Differential Privacy (DP).
    Scale parameter (b) = sensitivity / epsilon.
    For count queries, sensitivity = 1.
    """
    if epsilon <= 0:
        logger.warning("Epsilon must be positive. Skipping differential privacy noise injection.")
        return original_val
        
    sensitivity = 1.0
    scale = sensitivity / epsilon
    
    # Generate Laplace noise
    noise = np.random.exponential(scale) - np.random.exponential(scale)
    perturbed_val = original_val + noise
    
    logger.debug(f"Differential Privacy applied. Original: {original_val} | Perturbed: {perturbed_val} | Noise: {noise}")
    return perturbed_val

def add_laplace_noise_int(original_val: int, epsilon: float = 1.0) -> int:
    """
    Applies Laplacian noise to an integer count, rounding to the nearest integer.
    Ensures returned value is not negative.
    """
    perturbed = add_laplace_noise(float(original_val), epsilon)
    # Count results should not be negative
    return max(0, int(round(perturbed)))
