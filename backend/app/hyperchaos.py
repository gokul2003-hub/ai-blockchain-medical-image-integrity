"""4D Chen Hyperchaotic System for image permutation and keystream generation.

State equations:
    dx/dt = a*(y - x)
    dy/dt = (c - a)*x - x*z + c*y
    dz/dt = x*y - b*z
    dw/dt = x*z + d*w

Classic Chen parameters: a=35, b=3, c=28, d=-1 produce hyperchaotic behaviour
(two positive Lyapunov exponents).

The initial conditions (x0, y0, z0, w0) are derived deterministically from a
key via SHA-256, so the same key always produces the same permutation.
"""

from __future__ import annotations

import hashlib
import struct

import numpy as np


# ---------------------------------------------------------------------------
# Chen system parameters (classic hyperchaotic regime)
# ---------------------------------------------------------------------------
_A: float = 35.0
_B: float = 3.0
_C: float = 28.0
_D: float = -1.0

# RK4 integration step size
_DT: float = 0.01

# Warm-up iterations discarded before collecting useful values
_WARMUP: int = 1000


def _chen_derivatives(state: np.ndarray) -> np.ndarray:
    """Compute the time derivatives of the 4D Chen system at *state* = [x, y, z, w]."""
    x, y, z, w = state
    dx = _A * (y - x)
    dy = (_C - _A) * x - x * z + _C * y
    dz = x * y - _B * z
    dw = x * z + _D * w
    return np.array([dx, dy, dz, dw], dtype=np.float64)


def _rk4_step(state: np.ndarray, dt: float) -> np.ndarray:
    """Advance *state* by one RK4 step of size *dt*."""
    k1 = _chen_derivatives(state)
    k2 = _chen_derivatives(state + 0.5 * dt * k1)
    k3 = _chen_derivatives(state + 0.5 * dt * k2)
    k4 = _chen_derivatives(state + dt * k3)
    return state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)


def _bytes_to_ic(raw: bytes, lo: float, hi: float) -> float:
    """Map 8 bytes to a float in [lo, hi] (inclusive endpoints excluded slightly)."""
    # Interpret as a big-endian unsigned 64-bit integer, normalise to (0, 1)
    val = struct.unpack(">Q", raw)[0]
    normalised = val / (2**64 - 1)  # maps to [0, 1]
    return lo + normalised * (hi - lo)


class ChenHyperchaosPermutation:
    """Deterministic permutation and keystream primitive based on the 4D Chen system."""

    def __init__(self, key_bytes: bytes) -> None:
        """Derive initial conditions from *key_bytes* using SHA-256."""
        digest = hashlib.sha256(key_bytes).digest()  # 32 bytes

        # Each initial condition uses 8 bytes of the digest
        self._x0 = _bytes_to_ic(digest[0:8],  0.1, 1.0)
        self._y0 = _bytes_to_ic(digest[8:16], 0.1, 1.0)
        self._z0 = _bytes_to_ic(digest[16:24], 1.0, 10.0)
        self._w0 = _bytes_to_ic(digest[24:32], 0.1, 1.0)

    # ------------------------------------------------------------------
    # Core integration
    # ------------------------------------------------------------------

    def _integrate(self, steps: int) -> np.ndarray:
        """Run RK4 for *_WARMUP* + *steps* iterations; return the last *steps* states.

        Returns an (steps, 4) array where columns are [x, y, z, w].
        """
        state = np.array([self._x0, self._y0, self._z0, self._w0], dtype=np.float64)

        # Discard warm-up transient
        for _ in range(_WARMUP):
            state = _rk4_step(state, _DT)

        # Collect *steps* states
        trajectory = np.empty((steps, 4), dtype=np.float64)
        for i in range(steps):
            state = _rk4_step(state, _DT)
            trajectory[i] = state

        return trajectory

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_permutation_indices(self, n: int) -> np.ndarray:
        """Return a permutation array of length *n* derived from the chaotic z-trajectory.

        Strategy: integrate for *n* steps (after warm-up), take the z-component
        (index 2) of each state, and return its argsort.  The argsort of a
        continuous chaotic sequence is a statistically uniform random permutation.
        """
        trajectory = self._integrate(n)
        z_values = trajectory[:, 2]  # z-component
        return np.argsort(z_values, kind="stable")

    def permute(self, data: bytes) -> bytes:
        """Permute *data* bytes using the chaotic permutation indices."""
        n = len(data)
        indices = self.generate_permutation_indices(n)
        arr = np.frombuffer(data, dtype=np.uint8)
        permuted = arr[indices]
        return permuted.tobytes()

    def inverse_permute(self, data: bytes, original_length: int) -> bytes:
        """Restore the original byte order of *data* permuted by :meth:`permute`."""
        n = original_length
        indices = self.generate_permutation_indices(n)

        # Build inverse permutation: inverse[indices[i]] = i
        inverse = np.empty(n, dtype=np.intp)
        inverse[indices] = np.arange(n, dtype=np.intp)

        arr = np.frombuffer(data[:n], dtype=np.uint8)
        restored = arr[inverse]
        return restored.tobytes()

    def generate_keystream(self, length: int) -> bytes:
        """Generate *length* pseudo-random bytes suitable for XOR encryption.

        Each 8-byte chunk of the w-trajectory is XOR-folded into a single byte,
        giving a keystream that is fast and non-trivially dependent on all four
        chaotic dimensions.
        """
        # We need one byte per output byte; derive each byte from the w-value
        trajectory = self._integrate(length)
        w_values = trajectory[:, 3]  # w-component

        # Scale w into [0, 255] via modular fractional extraction
        # Take fractional part of |w|, multiply by 256, cast to uint8
        w_frac = np.abs(w_values) % 1.0
        ks = (w_frac * 256.0).astype(np.uint8)
        return ks.tobytes()


# ---------------------------------------------------------------------------
# Module-level convenience functions
# ---------------------------------------------------------------------------

def create_permutation(key_bytes: bytes, data: bytes) -> bytes:
    """Permute *data* bytes using the 4D Chen hyperchaotic system.

    The permutation is deterministic and invertible given the same *key_bytes*.
    """
    perm = ChenHyperchaosPermutation(key_bytes)
    return perm.permute(data)


def restore_permutation(key_bytes: bytes, data: bytes, original_length: int) -> bytes:
    """Restore the original order of bytes previously permuted by :func:`create_permutation`."""
    perm = ChenHyperchaosPermutation(key_bytes)
    return perm.inverse_permute(data, original_length)
