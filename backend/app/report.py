import os
import datetime
from pathlib import Path
from typing import Optional
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

from app.config import REPORTS_DIR

def generate_forensic_pdf(
    image_id: int,
    image_title: str,
    image_type: str,
    patient_name: str,
    uploader_name: str,
    hospital_name: str,
    blockchain_hash: str,
    block_index: int,
    original_hash: str,
    current_hash: str,
    integrity_status: str,  # "VERIFIED" or "TAMPERED"
    tampered_percentage: float,
    confidence_score: float,
    heatmap_path: Optional[str],
    user_agent: str,
    ip_address: str
) -> str:
    """
    Generates a beautiful, professional digital forensic PDF report.
    Returns: The file path of the generated PDF.
    """
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_filename = f"forensic_report_img_{image_id}_{int(datetime.datetime.utcnow().timestamp())}.pdf"
    pdf_path = REPORTS_DIR / report_filename

    # Initialize document
    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=letter,
        rightMargin=40, leftMargin=40,
        topMargin=40, bottomMargin=40
    )
    
    story = []
    
    # Styles
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=20,
        textColor=colors.HexColor("#1A202C"), # Slate-900
        spaceAfter=15,
        alignment=0 # Left aligned
    )
    
    header_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#2B6CB0"), # Medical Blue
        spaceBefore=10,
        spaceAfter=10
    )
    
    body_style = ParagraphStyle(
        "BodyTextCustom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=14,
        textColor=colors.HexColor("#4A5568") # Dark Grey
    )
    
    status_verified_style = ParagraphStyle(
        "StatusVerified",
        parent=body_style,
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#38A169") # Green
    )

    status_tampered_style = ParagraphStyle(
        "StatusTampered",
        parent=body_style,
        fontName="Helvetica-Bold",
        fontSize=12,
        textColor=colors.HexColor("#E53E3E") # Red
    )

    # 1. Header Banner
    story.append(Paragraph("DIGITAL FORENSIC ANALYSIS REPORT", title_style))
    story.append(Paragraph(f"Generated on: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}", body_style))
    story.append(Spacer(1, 15))
    
    # Divider line
    divider = Table([[""]], colWidths=[530], rowHeights=[2])
    divider.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#2B6CB0")),
    ]))
    story.append(divider)
    story.append(Spacer(1, 15))

    # 2. Executive Summary / Integrity Status
    story.append(Paragraph("1. Verification Executive Summary", header_style))
    
    status_label = "INTEGRITY SECURE (VERIFIED)" if integrity_status == "VERIFIED" else "INTEGRITY COMPROMISED (TAMPERING DETECTED)"
    status_paragraph_style = status_verified_style if integrity_status == "VERIFIED" else status_tampered_style
    
    summary_text = (
        "This medical image has been cryptographically validated against the decentralized immutable ledger. "
        "The integrity check succeeded. No unauthorized changes were detected."
        if integrity_status == "VERIFIED" else
        "WARNING: Cryptographic mismatch detected between the original uploaded image hash and the retrieved cloud storage image. "
        "AI model was invoked to localize the modified region."
    )
    
    summary_data = [
        [Paragraph("Integrity Status:", body_style), Paragraph(status_label, status_paragraph_style)],
        [Paragraph("Security Summary:", body_style), Paragraph(summary_text, body_style)]
    ]
    
    summary_table = Table(summary_data, colWidths=[120, 410])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F7FAFC")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 8),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 15))

    # 3. Metadata Table
    story.append(Paragraph("2. Medical Image Metadata", header_style))
    
    metadata_data = [
        [Paragraph("Image ID:", body_style), Paragraph(str(image_id), body_style), 
         Paragraph("Image Type:", body_style), Paragraph(image_type, body_style)],
        [Paragraph("Image Title:", body_style), Paragraph(image_title, body_style), 
         Paragraph("Patient Profile:", body_style), Paragraph(patient_name, body_style)],
        [Paragraph("Uploader User:", body_style), Paragraph(uploader_name, body_style), 
         Paragraph("Hospital Branch:", body_style), Paragraph(hospital_name, body_style)]
    ]
    
    metadata_table = Table(metadata_data, colWidths=[90, 175, 90, 175])
    metadata_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#EDF2F7")),
        ('BACKGROUND', (2,0), (2,-1), colors.HexColor("#EDF2F7")),
    ]))
    story.append(metadata_table)
    story.append(Spacer(1, 15))

    # 4. Cryptographic Ledger Verification details
    story.append(Paragraph("3. Cryptographic & Blockchain Verification Ledger", header_style))
    
    crypto_data = [
        [Paragraph("Original Image SHA-3 Hash:", body_style), Paragraph(original_hash, body_style)],
        [Paragraph("Retrieved Image SHA-3 Hash:", body_style), Paragraph(current_hash, body_style)],
        [Paragraph("Blockchain Tx Hash:", body_style), Paragraph(blockchain_hash, body_style)],
        [Paragraph("Blockchain Block Index:", body_style), Paragraph(f"Block #{block_index}", body_style)]
    ]
    crypto_table = Table(crypto_data, colWidths=[160, 370])
    crypto_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#EDF2F7")),
    ]))
    story.append(crypto_table)
    story.append(Spacer(1, 15))

    # 5. AI Tamper Localization (if tampered)
    if integrity_status == "TAMPERED":
        story.append(Paragraph("4. AI Tamper Localization Analysis", header_style))
        
        # Generate VLM Clinical Forensic Narrative
        from app.vlm_forensics import vlm_forensics
        vlm_summary = vlm_forensics.generate_forensic_summary(
            image_title, image_type, tampered_percentage, confidence_score, []
        )
        
        ai_data = [
            [Paragraph("AI Localization Model:", body_style), Paragraph("Hybrid Swin-UNet + SRM Noise Filter", body_style)],
            [Paragraph("VLM Analysis Engine:", body_style), Paragraph(vlm_summary["vlm_model"], body_style)],
            [Paragraph("Tampered Area Percentage:", body_style), Paragraph(f"{tampered_percentage}% of total pixels", body_style)],
            [Paragraph("Localization Confidence Score:", body_style), Paragraph(f"{confidence_score * 100:.2f}%", body_style)],
            [Paragraph("Clinical Severity Assessment:", body_style), Paragraph(vlm_summary["severity_level"], body_style)],
            [Paragraph("VLM Clinical Narrative:", body_style), Paragraph(vlm_summary["forensic_narrative"], body_style)],
            [Paragraph("Medical Recommendation:", body_style), Paragraph(vlm_summary["clinical_recommendation"], body_style)]
        ]
        ai_table = Table(ai_data, colWidths=[160, 370])
        ai_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('PADDING', (0,0), (-1,-1), 6),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E53E3E")),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#FED7D7")),
            ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#FFF5F5")),
        ]))
        story.append(ai_table)
        story.append(Spacer(1, 15))
        
        # 6. Heatmap visualization embedding
        if heatmap_path and os.path.exists(heatmap_path):
            try:
                # Resize image for PDF page (make it fit in 220x220 square)
                img_element = Image(heatmap_path, width=2.5*inch, height=2.5*inch)
                img_element.hAlign = 'CENTER'
                
                vis_section = [
                    Paragraph("5. AI Localization Heatmap Overlay", header_style),
                    Spacer(1, 5),
                    Paragraph("The localized tampered region highlighted in red bounding box and JET colormap:", body_style),
                    Spacer(1, 8),
                    img_element
                ]
                story.append(KeepTogether(vis_section))
            except Exception as e:
                story.append(Paragraph(f"[Error embedding heatmap image: {e}]", body_style))
    
    story.append(Spacer(1, 20))
    
    # 7. Device Metadata & Auditor Sign-off
    story.append(Paragraph("6. Audit Metadata & Signatures", header_style))
    audit_data = [
        [Paragraph("Client IP Address:", body_style), Paragraph(ip_address, body_style)],
        [Paragraph("Client User Agent:", body_style), Paragraph(user_agent, body_style)],
        [Paragraph("Forensic Analyst Signature:", body_style), Paragraph("System Cryptographic Verifier (AUTOGEN)", body_style)]
    ]
    audit_table = Table(audit_data, colWidths=[160, 370])
    audit_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#CBD5E0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor("#EDF2F7")),
    ]))
    story.append(audit_table)

    # Build the document
    doc.build(story)
    return str(pdf_path.resolve())
