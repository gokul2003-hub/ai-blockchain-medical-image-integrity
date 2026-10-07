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
        self._z0 = _bytes_to_ic(digest[16:16 + 8], 1.0, 10.0)
        self._w0 = _bytes_to_ic(digest[24:32], 0.1, 1.0)

    # ------------------------------------------------------------------
    # Core integration
    # ------------------------------------------------------------------

    def _integrate(self, steps: int) -> np.ndarray:
        """Run RK4 for *_WARMUP* + *steps* iterations; return the last *steps* states.

        Returns an (steps, 4) array where columns are [x, y, z, w].

        Performance note
        ----------------
        The Chen system has only four state variables, so a NumPy array of
        length 4 costs far more in per-call overhead than plain Python floats
        (every scalar operation becomes an ndarray dispatch). This integrator
        therefore keeps the state in local float64 scalars and inlines the RK4
        stages instead of allocating four throwaway arrays per step.

        The arithmetic is written in exactly the same order as the NumPy
        reference implementation in ``_rk4_step`` / ``_chen_derivatives``, so
        the produced trajectory is **bit-for-bit identical** - this is a pure
        speed change, not a change of cipher.
        """
        x = self._x0
        y = self._y0
        z = self._z0
        w = self._w0

        # Pre-hoist every constant into a local: attribute/global lookups and
        # repeated arithmetic on module globals dominate the loop otherwise.
        A = _A
        B = _B
        C = _C
        D = _D
        dt = _DT
        half_dt = 0.5 * dt
        dt_over_6 = dt / 6.0
        c_minus_a = _C - _A

        # Discard warm-up transient (same recurrence as the reference).
        for _ in range(_WARMUP):
            k1x = A * (y - x)
            k1y = c_minus_a * x - x * z + C * y
            k1z = x * y - B * z
            k1w = x * z + D * w

            s2x = x + half_dt * k1x
            s2y = y + half_dt * k1y
            s2z = z + half_dt * k1z
            s2w = w + half_dt * k1w

            k2x = A * (s2y - s2x)
            k2y = c_minus_a * s2x - s2x * s2z + C * s2y
            k2z = s2x * s2y - B * s2z
            k2w = s2x * s2z + D * s2w

            s3x = x + half_dt * k2x
            s3y = y + half_dt * k2y
            s3z = z + half_dt * k2z
            s3w = w + half_dt * k2w

            k3x = A * (s3y - s3x)
            k3y = c_minus_a * s3x - s3x * s3z + C * s3y
            k3z = s3x * s3y - B * s3z
            k3w = s3x * s3z + D * s3w

            s4x = x + dt * k3x
            s4y = y + dt * k3y
            s4z = z + dt * k3z
            s4w = w + dt * k3w

            k4x = A * (s4y - s4x)
            k4y = c_minus_a * s4x - s4x * s4z + C * s4y
            k4z = s4x * s4y - B * s4z
            k4w = s4x * s4z + D * s4w

            x = x + dt_over_6 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x)
            y = y + dt_over_6 * (k1y + 2.0 * k2y + 2.0 * k3y + k4y)
            z = z + dt_over_6 * (k1z + 2.0 * k2z + 2.0 * k3z + k4z)
            w = w + dt_over_6 * (k1w + 2.0 * k2w + 2.0 * k3w + k4w)

        # Collect *steps* states.
        trajectory = np.empty((steps, 4), dtype=np.float64)
        for i in range(steps):
            k1x = A * (y - x)
            k1y = c_minus_a * x - x * z + C * y
            k1z = x * y - B * z
            k1w = x * z + D * w

            s2x = x + half_dt * k1x
            s2y = y + half_dt * k1y
            s2z = z + half_dt * k1z
            s2w = w + half_dt * k1w

            k2x = A * (s2y - s2x)
            k2y = c_minus_a * s2x - s2x * s2z + C * s2y
            k2z = s2x * s2y - B * s2z
            k2w = s2x * s2z + D * s2w

            s3x = x + half_dt * k2x
            s3y = y + half_dt * k2y
            s3z = z + half_dt * k2z
            s3w = w + half_dt * k2w

            k3x = A * (s3y - s3x)
            k3y = c_minus_a * s3x - s3x * s3z + C * s3y
            k3z = s3x * s3y - B * s3z
            k3w = s3x * s3z + D * s3w

            s4x = x + dt * k3x
            s4y = y + dt * k3y
            s4z = z + dt * k3z
            s4w = w + dt * k3w

            k4x = A * (s4y - s4x)
            k4y = c_minus_a * s4x - s4x * s4z + C * s4y
            k4z = s4x * s4y - B * s4z
            k4w = s4x * s4z + D * s4w

            x = x + dt_over_6 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x)
            y = y + dt_over_6 * (k1y + 2.0 * k2y + 2.0 * k3y + k4y)
            z = z + dt_over_6 * (k1z + 2.0 * k2z + 2.0 * k3z + k4z)
            w = w + dt_over_6 * (k1w + 2.0 * k2w + 2.0 * k3w + k4w)

            trajectory[i, 0] = x
            trajectory[i, 1] = y
            trajectory[i, 2] = z
            trajectory[i, 3] = w

        return trajectory

    # ------------------------------------------------------------------
    # Trajectory extraction (single source of truth)
    # ------------------------------------------------------------------

    @staticmethod
    def _permutation_from_trajectory(trajectory: np.ndarray) -> np.ndarray:
        """Derive permutation indices from the z-component of *trajectory*.

        The argsort of a continuous chaotic sequence is a statistically uniform
        random permutation.
        """
        return np.argsort(trajectory[:, 2], kind="stable")

    @staticmethod
    def _keystream_from_trajectory(trajectory: np.ndarray) -> np.ndarray:
        """Derive one XOR keystream byte per step from the w-component.

        Takes the fractional part of |w| and scales it into [0, 255], which makes
        the stream dependent on all four chaotic dimensions.
        """
        w_frac = np.abs(trajectory[:, 3]) % 1.0
        return (w_frac * 256.0).astype(np.uint8)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_permutation_indices(self, n: int) -> np.ndarray:
        """Return a permutation array of length *n* derived from the chaotic z-trajectory."""
        return self._permutation_from_trajectory(self._integrate(n))

    def permute_and_diffuse(self, data: bytes) -> bytes:
        """Permute *data* then XOR it with a chaotic keystream in a single RK4 pass.

        Combining both stages into one integration keeps the pipeline at the same
        integration cost as permutation alone, while the XOR layer destroys the
        residual structure that permutation alone leaves behind.
        """
        n = len(data)
        trajectory = self._integrate(n)
        indices = self._permutation_from_trajectory(trajectory)
        keystream = self._keystream_from_trajectory(trajectory)

        permuted = np.frombuffer(data, dtype=np.uint8)[indices]
        return np.bitwise_xor(permuted, keystream).tobytes()

    def inverse_diffuse_and_unpermute(self, data: bytes, original_length: int) -> bytes:
        """Exact inverse of :meth:`permute_and_diffuse`.

        Diffusion is undone first (XOR is self-inverse), then the permutation is
        inverted. *data* may carry a trailing AES-GCM authentication tag, which is
        truncated to *original_length* before reconstruction.
        """
        n = original_length
        trajectory = self._integrate(n)
        indices = self._permutation_from_trajectory(trajectory)
        keystream = self._keystream_from_trajectory(trajectory)

        diffused = np.bitwise_xor(np.frombuffer(data[:n], dtype=np.uint8), keystream)
        inverse = np.empty(n, dtype=np.intp)
        inverse[indices] = np.arange(n, dtype=np.intp)
        return diffused[inverse].tobytes()

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

        Each byte is derived from one w-trajectory value, giving a keystream that
        is fast and non-trivially dependent on all four chaotic dimensions.
        """
        return self._keystream_from_trajectory(self._integrate(length)).tobytes()


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


def diffuse(key_bytes: bytes, data: bytes) -> bytes:
    """Apply chaotic XOR diffusion to *data* using the 4D Chen keystream.

    Diffusion is a symmetric stream operation, so :func:`inverse_diffuse` is the
    same transform; it exists as a distinct name so that encryption and
    decryption stages read symmetrically in the pipeline.
    """
    keystream = ChenHyperchaosPermutation(key_bytes).generate_keystream(len(data))
    return np.bitwise_xor(np.frombuffer(data, dtype=np.uint8), np.frombuffer(keystream, dtype=np.uint8)).tobytes()


def inverse_diffuse(key_bytes: bytes, data: bytes) -> bytes:
    """Undo :func:`diffuse`. XOR is its own inverse, so this is the same transform."""
    return diffuse(key_bytes, data)


def permute_and_diffuse(key_bytes: bytes, data: bytes) -> bytes:
    """Run the combined 4D Chen permutation + diffusion stage in one RK4 pass."""
    return ChenHyperchaosPermutation(key_bytes).permute_and_diffuse(data)


def inverse_permute_and_diffuse(key_bytes: bytes, data: bytes, original_length: int) -> bytes:
    """Exact inverse of :func:`permute_and_diffuse`."""
    return ChenHyperchaosPermutation(key_bytes).inverse_diffuse_and_unpermute(data, original_length)
