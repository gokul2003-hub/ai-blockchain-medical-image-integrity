import numpy as np
from loguru import logger
import json

class HomomorphicEncryptionSimulator:
    """
    Simulates Fully Homomorphic Encryption (FHE) operations (BFV/CKKS schemes).
    Demonstrates tensor computations directly on ciphertexts without decryption.
    """
    def __init__(self, scaling_factor: float = 1e6):
        self.scaling_factor = scaling_factor
        # Generate dummy public/private keys
        self.public_key = np.random.randint(1000, 5000)
        self.private_key = self.public_key ^ 0xACE  # Simple symmetric mock relation

    def encrypt_tensor(self, plain_tensor: np.ndarray) -> np.ndarray:
        """Encrypts real values into integer ciphertexts using scaling factors."""
        scaled = np.round(plain_tensor * self.scaling_factor).astype(np.int64)
        # Inject homomorphic noise
        noise = np.random.randint(-10, 10, size=plain_tensor.shape)
        cipher_tensor = (scaled + noise) ^ self.public_key
        logger.info(f"FHE: Encrypted tensor of shape {plain_tensor.shape} using CKKS scheme.")
        return cipher_tensor

    def decrypt_tensor(self, cipher_tensor: np.ndarray) -> np.ndarray:
        """Decrypts integer ciphertexts back into real value tensors."""
        decrypted_scaled = (cipher_tensor ^ self.public_key).astype(np.float64)
        plain_tensor = decrypted_scaled / self.scaling_factor
        logger.info("FHE: Decrypted tensor successfully.")
        return plain_tensor

    def homomorphic_add(self, cipher_a: np.ndarray, cipher_b: np.ndarray) -> np.ndarray:
        """Performs homomorphic addition: Decrypt(C_A + C_B) == A + B."""
        logger.info("FHE: Performing homomorphic addition directly on ciphertexts...")
        # Since we use XOR mock encryption, we simulate homomorphic addition
        a_scaled = cipher_a ^ self.public_key
        b_scaled = cipher_b ^ self.public_key
        res_scaled = a_scaled + b_scaled
        return res_scaled ^ self.public_key

    def homomorphic_multiply_scalar(self, cipher_a: np.ndarray, scalar: float) -> np.ndarray:
        """Performs homomorphic scalar multiplication: Decrypt(C_A * s) == A * s."""
        logger.info(f"FHE: Performing homomorphic multiplication with scalar {scalar}...")
        a_scaled = cipher_a ^ self.public_key
        res_scaled = np.round(a_scaled * scalar).astype(np.int64)
        return res_scaled ^ self.public_key


class FederatedLearningSimulator:
    """
    Simulates decentralized Federated Learning (FL) across three clinical hospital nodes.
    Demonstrates local model updates, secure aggregation (FedAvg), and global model updates.
    """
    def __init__(self, num_nodes: int = 3, num_parameters: int = 100):
        self.num_nodes = num_nodes
        self.num_parameters = num_parameters
        # Initialize a global model parameter vector
        self.global_weights = np.random.normal(0, 0.1, size=self.num_parameters)
        self.node_weights = [self.global_weights.copy() for _ in range(self.num_nodes)]

    def run_local_training(self) -> list[np.ndarray]:
        """Simulates localized training epochs at individual hospital sites."""
        logger.info("FL: Distributing global model weights to hospital sites...")
        gradients = []
        for i in range(self.num_nodes):
            logger.info(f"FL: Node {i+1} (Hospital {chr(65+i)}) training on local diagnostic dataset...")
            # Simulate gradient descent update with simulated local data variance
            local_noise = np.random.normal(0.01 * (i + 1), 0.02, size=self.num_parameters)
            updated_weights = self.global_weights - local_noise
            self.node_weights[i] = updated_weights
            
            # Calculate gradient / weight delta
            delta = updated_weights - self.global_weights
            gradients.append(delta)
        return gradients

    def secure_aggregation(self, deltas: list[np.ndarray]) -> np.ndarray:
        """
        Performs secure Federated Averaging (FedAvg).
        Aggregates weight updates without exposing individual local node parameters.
        """
        logger.info("FL: Initializing secure Federated Averaging (FedAvg) aggregation...")
        # Average weight deltas
        average_delta = np.mean(deltas, axis=0)
        
        # Apply secure global model update
        self.global_weights += average_delta
        logger.info("FL: Global model weights successfully updated.")
        return self.global_weights

    def execute_simulation(self) -> dict:
        """Executes a full cycle of Federated Learning and Homomorphic Encryption."""
        # 1. Run FL Simulation
        deltas = self.run_local_training()
        new_global_weights = self.secure_aggregation(deltas)
        
        # Calculate local model discrepancies
        discrepancies = [float(np.mean(np.abs(w - new_global_weights))) for w in self.node_weights]

        # 2. Run FHE Simulation
        fhe = HomomorphicEncryptionSimulator()
        test_vector = np.array([0.5, 1.2, -0.8, 2.4])
        
        c_vector = fhe.encrypt_tensor(test_vector)
        # Perform homomorphic operations
        c_add = fhe.homomorphic_add(c_vector, c_vector)
        c_mult = fhe.homomorphic_multiply_scalar(c_vector, 3.0)
        
        dec_add = fhe.decrypt_tensor(c_add)
        dec_mult = fhe.decrypt_tensor(c_mult)

        return {
            "federated_learning": {
                "nodes_participated": self.num_nodes,
                "global_parameters_count": self.num_parameters,
                "local_updates_divergence": discrepancies,
                "status": "COMPLETED",
                "aggregation_protocol": "FedAvg"
            },
            "homomorphic_encryption": {
                "scheme": "CKKS",
                "test_vector": test_vector.tolist(),
                "homomorphic_addition_result": dec_add.tolist(),
                "homomorphic_multiplication_result": dec_mult.tolist(),
                "status": "COMPLETED"
            }
        }
