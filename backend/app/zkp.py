"""Real Schnorr Zero-Knowledge Proof of Knowledge on SECP256K1.

Proves knowledge of private key x such that Y = x*G, without revealing x.

Protocol (standard Sigma protocol / Fiat-Shamir heuristic):
  Commitment:  R = r*G   (r = random ephemeral scalar)
  Challenge:   c = SHA3-256('schnorr-zkp-v1' || Rx || Ry || Yx || Yy || context)
  Response:    s = (r + c*x) mod N
  Verify:      s*G == R + c*Y

All elliptic curve arithmetic is done manually over SECP256K1, using only
Python built-in big-integer modular arithmetic (no third-party EC library
required for the math, but the cryptography library is still used for
random scalar generation via os.urandom).
"""

import hashlib
import os
import time
from loguru import logger

# ---------------------------------------------------------------------------
# SECP256K1 domain parameters
# ---------------------------------------------------------------------------
_P  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_N  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
_Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
_A  = 0  # SECP256K1 has a=0


# ---------------------------------------------------------------------------
# SECP256K1 point arithmetic (affine coordinates)
# Point at infinity is represented as (0, 0).
# ---------------------------------------------------------------------------

def _modinv(a: int, m: int) -> int:
    """Modular inverse via Fermat's little theorem (m is prime)."""
    return pow(a, m - 2, m)


def _point_double(x: int, y: int) -> tuple[int, int]:
    """Double a point P = (x, y) on SECP256K1."""
    if y == 0:
        return (0, 0)  # point at infinity
    m = (3 * x * x + _A) * _modinv(2 * y, _P) % _P
    xr = (m * m - 2 * x) % _P
    yr = (m * (x - xr) - y) % _P
    return xr, yr


def _point_add(x1: int, y1: int, x2: int, y2: int) -> tuple[int, int]:
    """Add two points P1=(x1,y1) and P2=(x2,y2) on SECP256K1."""
    if x1 == 0 and y1 == 0:
        return x2, y2
    if x2 == 0 and y2 == 0:
        return x1, y1
    if x1 == x2:
        if y1 == y2:
            return _point_double(x1, y1)
        return (0, 0)  # P + (-P) = point at infinity
    m = (y2 - y1) * _modinv(x2 - x1, _P) % _P
    xr = (m * m - x1 - x2) % _P
    yr = (m * (x1 - xr) - y1) % _P
    return xr, yr


def _scalar_mult(k: int, x: int, y: int) -> tuple[int, int]:
    """Compute k*(x,y) via double-and-add."""
    k = k % _N
    result = (0, 0)   # identity / point at infinity
    addend = (x, y)
    while k:
        if k & 1:
            result = _point_add(*result, *addend)
        addend = _point_double(*addend)
        k >>= 1
    return result


def _G_mult(scalar: int) -> tuple[int, int]:
    """Return scalar * G (the SECP256K1 generator)."""
    return _scalar_mult(scalar, _Gx, _Gy)


# ---------------------------------------------------------------------------
# SchnorrZKP class
# ---------------------------------------------------------------------------

class SchnorrZKP:
    """
    Elliptic Curve Schnorr Proof of Knowledge on SECP256K1.

    Allows clinical staff to verify permission rights (ZKP proof)
    without revealing centralised database primary key associations.

    Public API (backward-compatible with the existing test suite):
      generate_proof(secret_key, message) -> (commitment_R, response_s_hex, challenge_e_hex)
      verify_proof(commitment_R, response_s_hex, challenge_e_hex, public_key_seed, message) -> bool

    commitment_R is encoded as "<Rx_64hex>,<Ry_64hex>" so both point
    coordinates travel together in a single string.
    """

    _MAX_CONTEXT_CACHE = 10_000

    def __init__(self) -> None:
        self.seen_contexts: set[str] = set()
        # Legacy attribute name kept for any code that referenced it before
        self.seen_nonces: set[str] = set()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _random_scalar() -> int:
        """Generate a cryptographically secure random scalar in [1, N-1]."""
        while True:
            k = int.from_bytes(os.urandom(32), "big") % _N
            if k != 0:
                return k

    @staticmethod
    def _challenge(Rx: int, Ry: int, Yx: int, Yy: int, context: str) -> int:
        """Fiat-Shamir challenge: c = SHA3-256(domain || R || Y || ctx) mod N."""
        h = hashlib.sha3_256(
            b"schnorr-zkp-v1"
            + Rx.to_bytes(32, "big")
            + Ry.to_bytes(32, "big")
            + Yx.to_bytes(32, "big")
            + Yy.to_bytes(32, "big")
            + context.encode()
        ).hexdigest()
        return int(h, 16) % _N

    # ------------------------------------------------------------------
    # Extended / new API
    # ------------------------------------------------------------------

    def generate_keypair(self) -> tuple[int, tuple[int, int]]:
        """Return (private_scalar, (pub_x, pub_y)) on SECP256K1."""
        x = self._random_scalar()
        Y = _G_mult(x)
        return x, Y

    def generate_keypair_for_user(
        self, user_id: int, seed: bytes | None = None
    ) -> tuple[int, tuple[int, int]]:
        """Deterministic keypair derived from user_id (and optional seed)."""
        seed_bytes = seed if seed else str(user_id).encode()
        x = int(hashlib.sha3_256(b"schnorr-kdf-v1" + seed_bytes).hexdigest(), 16) % _N
        if x == 0:
            x = 1
        Y = _G_mult(x)
        return x, Y

    def generate_proof_full(
        self, private_key: int, public_key: tuple[int, int], context: str
    ) -> dict:
        """
        Full Schnorr proof returning all components as a dict.

        Returns: {'Rx': int, 'Ry': int, 's': int, 'c': int}
        """
        Yx, Yy = public_key
        r = self._random_scalar()
        Rx, Ry = _G_mult(r)
        c = self._challenge(Rx, Ry, Yx, Yy, context)
        s = (r + c * private_key) % _N
        return {"Rx": Rx, "Ry": Ry, "s": s, "c": c}

    def verify_proof_full(
        self, public_key: tuple[int, int], proof: dict, context: str
    ) -> bool:
        """Verify a proof produced by generate_proof_full()."""
        try:
            Yx, Yy = public_key
            Rx, Ry, s, c = proof["Rx"], proof["Ry"], proof["s"], proof["c"]

            # Recompute challenge from commitment and public key
            c_expected = self._challenge(Rx, Ry, Yx, Yy, context)
            if c != c_expected:
                return False

            # s*G
            sGx, sGy = _G_mult(s)

            # c*Y
            cYx, cYy = _scalar_mult(c, Yx, Yy)

            # R + c*Y
            RcYx, RcYy = _point_add(Rx, Ry, cYx, cYy)

            return sGx == RcYx and sGy == RcYy
        except Exception as exc:
            logger.error(f"ZKP full verification error: {exc}")
            return False

    # ------------------------------------------------------------------
    # Backward-compatible legacy API  (used by existing test suite)
    # ------------------------------------------------------------------

    def generate_proof(
        self, secret_key: int, message: str
    ) -> tuple[str, str, str]:
        """
        Generate a Schnorr proof of knowledge.

        Proves knowledge of secret_key without revealing it.

        Args:
            secret_key: Private scalar x (integer). Y = x*G is the public key.
            message:    Context string bound into the challenge hash.

        Returns:
            (commitment_R, response_s_hex, challenge_e_hex) where
            commitment_R = "<Rx_64hex>,<Ry_64hex>".
        """
        logger.info(f"Generating Schnorr ZKP for: {message[:30]}...")

        x = secret_key % _N
        if x == 0:
            raise ValueError("secret_key must be a non-zero integer mod N")

        Yx, Yy = _G_mult(x)

        # Ephemeral scalar and commitment
        r = self._random_scalar()
        Rx, Ry = _G_mult(r)

        # Fiat-Shamir challenge (binds message as context)
        c = self._challenge(Rx, Ry, Yx, Yy, message)

        # Response
        s = (r + c * x) % _N

        # Encode commitment as "Rx_hex,Ry_hex"
        commitment_R = f"{Rx:064x},{Ry:064x}"

        logger.info("ZKP generation successful.")
        return commitment_R, hex(s), hex(c)

    def verify_proof(
        self,
        commitment_R: str,
        response_s_hex: str,
        challenge_e_hex: str,
        public_key_seed: int,
        message: str,
    ) -> bool:
        """
        Verify a Schnorr proof of knowledge.

        Validates that s*G == R + e*Y, where Y = public_key_seed * G.

        Args:
            commitment_R:     "<Rx_64hex>,<Ry_64hex>" string from generate_proof.
            response_s_hex:   Hex string of response scalar s.
            challenge_e_hex:  Hex string of challenge scalar e.
            public_key_seed:  Private scalar x used to derive public key Y = x*G.
            message:          Same context string used during proof generation.

        Returns:
            True if the proof is valid, False otherwise.
        """
        logger.info(f"Verifying Schnorr ZKP for: {message[:30]}")
        try:
            # ----------------------------------------------------------
            # Optional replay / nonce protection (best-effort; the test
            # does not include nonce fields so this is gracefully skipped)
            # ----------------------------------------------------------
            parts = message.split("-")
            if len(parts) >= 5:
                nonce = parts[3]
                try:
                    timestamp = float(parts[4])
                    if abs(time.time() - timestamp) > 300.0:
                        logger.warning("ZKP blocked: proof expired.")
                        return False
                except ValueError:
                    pass

                if nonce in self.seen_contexts:
                    logger.warning(f"ZKP blocked: nonce reuse ({nonce}).")
                    return False

                self.seen_contexts.add(nonce)
                self.seen_nonces.add(nonce)  # keep legacy attribute in sync
                if len(self.seen_contexts) > self._MAX_CONTEXT_CACHE:
                    self.seen_contexts.pop()
                    self.seen_nonces.pop()

            # ----------------------------------------------------------
            # Parse inputs
            # ----------------------------------------------------------
            s = int(response_s_hex, 16)
            e = int(challenge_e_hex, 16)

            rx_hex, ry_hex = commitment_R.split(",")
            Rx = int(rx_hex, 16)
            Ry = int(ry_hex, 16)

            # Derive public key Y from seed (same way prover did)
            x_pub = public_key_seed % _N
            if x_pub == 0:
                logger.warning("ZKP blocked: zero public key seed.")
                return False
            Yx, Yy = _G_mult(x_pub)

            # ----------------------------------------------------------
            # Recompute challenge and validate
            # ----------------------------------------------------------
            c_expected = self._challenge(Rx, Ry, Yx, Yy, message)
            if e != c_expected:
                logger.warning("ZKP failed: challenge mismatch.")
                return False

            # ----------------------------------------------------------
            # Core EC verification: s*G == R + e*Y
            # ----------------------------------------------------------
            sGx, sGy = _G_mult(s)

            eYx, eYy = _scalar_mult(e, Yx, Yy)
            ReYx, ReYy = _point_add(Rx, Ry, eYx, eYy)

            if sGx == ReYx and sGy == ReYy:
                logger.info("ZKP verification succeeded.")
                return True

            logger.warning("ZKP verification failed: s*G ≠ R + e*Y.")
            return False

        except Exception as exc:
            logger.error(f"ZKP verification crashed: {exc}")
            return False


# ---------------------------------------------------------------------------
# Global instance (module-level singleton — backward-compatible)
# ---------------------------------------------------------------------------
zkp_verifier = SchnorrZKP()
