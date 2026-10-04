import json
from fastapi import WebSocket
from typing import List
from loguru import logger

class ConnectionManager:
    """
    Manages active WebSocket connections for real-time security alerts
    and system upload updates.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket disconnected. Total active connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message_dict: dict):
        """Broadcasts a JSON payload to all connected clients."""
        logger.info(f"Broadcasting WebSocket message: {message_dict}")
        message_str = json.dumps(message_dict)
        stale_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message_str)
            except Exception as e:
                # Handle broken connections gracefully and mark for cleanup
                logger.warning(f"Failed to send websocket payload, connection might be stale: {str(e)}")
                stale_connections.append(connection)

        for stale in stale_connections:
            self.disconnect(stale)

# Global websocket connection manager
ws_manager = ConnectionManager()

# --- Stub Notifications API integrations (SMS / Email) ---

async def send_email_alert(recipient_email: str, subject: str, body: str):
    """
    Stub to integrate with SMTP or SendGrid API.
    Used for notifying patients of permission changes or emergency overrides.
    """
    logger.info(f"SMTP [Email Alert Sent] to {recipient_email} | Subject: {subject}")
    # In production, configure SMTP / SendGrid:
    # send_smtp_message(recipient_email, subject, body)
    pass

async def send_sms_alert(recipient_phone: str, message: str):
    """
    Stub to integrate with Twilio SMS API.
    Used for high-priority security notifications.
    """
    logger.info(f"Twilio [SMS Alert Sent] to {recipient_phone} | Message: {message}")
    # In production, configure Twilio client:
    # twilio_client.messages.create(body=message, to=recipient_phone, from_=...)
    pass
