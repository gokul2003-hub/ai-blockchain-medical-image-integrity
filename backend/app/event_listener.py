import asyncio
import threading
from loguru import logger
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.blockchain import blockchain_service, WEB3_AVAILABLE
from app.models import Permission

class BlockchainEventListener:
    """
    Asynchronous listener thread running in the background to capture 
    smart contract events (AccessGranted, AccessRevoked) and automatically 
    synchronize local SQL database permissions.
    """
    def __init__(self):
        self.running = False
        self.thread = None

    def start(self):
        if not WEB3_AVAILABLE or not blockchain_service.use_ethereum or not blockchain_service.contract:
            logger.warning("Blockchain client is unavailable or running in simulation. Event listener disabled.")
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._run_listener, daemon=True)
        self.thread.start()
        logger.info("Blockchain background event listener started successfully.")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=2)
            logger.info("Blockchain background event listener stopped.")

    def _run_listener(self):
        # We query for event logs using block polling
        w3 = blockchain_service.w3
        contract = blockchain_service.contract
        
        try:
            last_block = w3.eth.block_number
        except Exception as e:
            logger.error(f"Failed to get current block number: {str(e)}")
            return

        while self.running:
            try:
                current_block = w3.eth.block_number
                if current_block > last_block:
                    logger.debug(f"Scanning blocks {last_block + 1} to {current_block} for access permission events...")
                    
                    # 1. Fetch AccessGranted events
                    granted_events = contract.events.AccessGranted.get_logs(
                        from_block=last_block + 1,
                        to_block=current_block
                    )
                    self._handle_granted_events(granted_events)

                    # 2. Fetch AccessRevoked events
                    revoked_events = contract.events.AccessRevoked.get_logs(
                        from_block=last_block + 1,
                        to_block=current_block
                    )
                    self._handle_revoked_events(revoked_events)

                    last_block = current_block
                
            except Exception as e:
                logger.warning(f"Error scanning blockchain logs: {str(e)}")
                
            # Poll every 10 seconds in background
            import time
            time.sleep(10)

    def _handle_granted_events(self, events):
        db: Session = SessionLocal()
        try:
            for event in events:
                args = event.get("args", {})
                patient_id = args.get("patientId")
                doctor_id = args.get("doctorId")
                expiry = args.get("expiry")
                
                logger.info(f"On-chain AccessGranted detected: Patient {patient_id} -> Doctor {doctor_id}")
                
                # Sync state to local database
                perm = db.query(Permission).filter(
                    Permission.patient_id == patient_id,
                    Permission.doctor_id == doctor_id
                ).first()
                
                import datetime
                exp_dt = datetime.datetime.fromtimestamp(expiry, datetime.timezone.utc) if expiry > 0 else None
                
                if perm:
                    perm.is_active = True
                    perm.expires_at = exp_dt
                else:
                    perm = Permission(
                        patient_id=patient_id,
                        doctor_id=doctor_id,
                        access_type="READ_DOWNLOAD",
                        is_active=True,
                        expires_at=exp_dt
                    )
                    db.add(perm)
            db.commit()
        except Exception as e:
            logger.error(f"Failed to sync granted events: {str(e)}")
            db.rollback()
        finally:
            db.close()

    def _handle_revoked_events(self, events):
        db: Session = SessionLocal()
        try:
            for event in events:
                args = event.get("args", {})
                patient_id = args.get("patientId")
                doctor_id = args.get("doctorId")
                
                logger.info(f"On-chain AccessRevoked detected: Patient {patient_id} -> Doctor {doctor_id}")
                
                # Sync state to local database
                perm = db.query(Permission).filter(
                    Permission.patient_id == patient_id,
                    Permission.doctor_id == doctor_id
                ).first()
                
                if perm:
                    perm.is_active = False
            db.commit()
        except Exception as e:
            logger.error(f"Failed to sync revoked events: {str(e)}")
            db.rollback()
        finally:
            db.close()

# Global event listener instance
event_listener = BlockchainEventListener()
