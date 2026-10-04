"""Audit Log API — read access to the existing AuditLog table.

Serves the admin security/audit view that the frontend already calls
(GET /api/audit/logs). Read-only, admin-role guarded.
"""
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, RoleChecker
from app.models import AuditLog, User
from app.schemas import AuditLogResponse

router = APIRouter(prefix="/audit", tags=["Audit Logs"])

# Security/audit access: administrative roles only
admin_guard = RoleChecker(["super_admin", "hospital_admin"])


@router.get("/logs", response_model=List[AuditLogResponse])
async def list_audit_logs(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_guard),
):
    """Most recent audit-log entries, newest first (admin roles only)."""
    return (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
