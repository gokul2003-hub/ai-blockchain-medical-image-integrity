import datetime
from loguru import logger

def create_fhir_consent(permission_id: int, patient_id: int, doctor_id: int, status_active: bool, expires_at: str = None) -> dict:
    """
    Creates a FHIR-compliant 'Consent' JSON resource representing system permission grants.
    """
    logger.info(f"Generating FHIR Consent resource for Permission ID: {permission_id}")
    consent = {
        "resourceType": "Consent",
        "id": f"consent-{permission_id}",
        "status": "active" if status_active else "inactive",
        "scope": {
            "coding": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/consentscope",
                    "code": "patient-privacy"
                }
            ]
        },
        "category": [
            {
                "coding": [
                    {
                        "system": "http://loinc.org",
                        "code": "59284-0",
                        "display": "Consent Document"
                    }
                ]
            }
        ],
        "patient": {
            "reference": f"Patient/{patient_id}",
            "display": f"did:medshare:patient:{patient_id}"
        },
        "dateTime": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "performer": [
            {
                "reference": f"Patient/{patient_id}"
            }
        ],
        "provision": {
            "type": "permit",
            "period": {
                "end": expires_at if expires_at else None
            },
            "actor": [
                {
                    "role": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                                "code": "IRCP",
                                "display": "information recipient"
                            }
                        ]
                    },
                    "reference": {
                        "reference": f"Practitioner/{doctor_id}",
                        "display": f"did:medshare:doctor:{doctor_id}"
                    }
                }
            ],
            "action": [
                {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/consentaction",
                            "code": "access"
                        }
                    ]
                }
            ]
        }
    }
    return consent

def create_fhir_audit_event(log_id: int, user_id: int, role: str, action: str, ip: str, success: bool) -> dict:
    """
    Creates a FHIR-compliant 'AuditEvent' JSON resource representing system accesses.
    """
    logger.info(f"Generating FHIR AuditEvent resource for Log ID: {log_id}")
    audit_event = {
        "resourceType": "AuditEvent",
        "id": f"audit-{log_id}",
        "type": {
            "system": "http://terminology.hl7.org/CodeSystem/audit-event-type",
            "code": "rest",
            "display": "RESTful Operation"
        },
        "action": "R" if action == "DOWNLOAD" else "C" if action == "UPLOAD" else "E",
        "recorded": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "outcome": "0" if success else "4",  # FHIR outcome code (0=success, 4=failure)
        "outcomeDesc": "Transaction validation completed successfully" if success else "Cryptographic verification failure or access denied",
        "agent": [
            {
                "type": {
                    "coding": [
                        {
                            "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                            "code": "INF",
                            "display": "Informant"
                        }
                    ]
                },
                "requestor": True,
                "network": {
                    "address": ip,
                    "type": "2" # IP address type
                },
                "who": {
                    "reference": f"Practitioner/{user_id}" if role in ["doctor", "radiologist"] else f"Patient/{user_id}",
                    "display": f"did:medshare:{role}:{user_id}"
                }
            }
        ],
        "source": {
            "observer": {
                "display": "AI_Blockchain_Framework_Node"
            },
            "type": [
                {
                    "system": "http://terminology.hl7.org/CodeSystem/security-source-type",
                    "code": "4",
                    "display": "Application Server"
                }
            ]
        }
    }
    return audit_event

def create_fhir_document_reference(image_id: int, title: str, patient_id: int, ipfs_cid: str, quality_score: float) -> dict:
    """
    Creates a FHIR-compliant 'DocumentReference' JSON resource for the medical image record.
    """
    logger.info(f"Generating FHIR DocumentReference for Image ID: {image_id}")
    doc_ref = {
        "resourceType": "DocumentReference",
        "id": f"doc-{image_id}",
        "status": "current",
        "type": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "11524-6",
                    "display": "Radiology Report"
                }
            ]
        },
        "subject": {
            "reference": f"Patient/{patient_id}"
        },
        "date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "description": title,
        "content": [
            {
                "attachment": {
                    "contentType": "image/png",
                    "url": f"ipfs://{ipfs_cid}",
                    "title": title
                }
            }
        ],
        "context": {
            "sourcePatientInfo": {
                "reference": f"Patient/{patient_id}"
            }
        }
    }
    return doc_ref
