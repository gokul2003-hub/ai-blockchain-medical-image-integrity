/**
 * Behavioural tests for the doctor-facing upload pipeline panel.
 *
 * These exercise real component logic: the mapping from backend stage codes to
 * clinician-facing labels, the stage-position arithmetic, the fallback when the
 * backend sends no stage list, and - most importantly - the honesty rule that a
 * stage position is never presented as a measured execution percentage.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  ProcessingPipelinePanel,
  type ProcessingJob,
} from './ProcessingPipelinePanel'

const STAGES = [
  'QUEUED',
  'PREPROCESSING',
  'ENCRYPTING',
  'HASHING',
  'DIT_CREATING',
  'STORING',
  'BLOCKCHAIN_RECORDING',
  'AI_QUEUED',
  'AI_PROCESSING',
  'FORENSIC_ANALYSIS',
  'RISK_ASSESSMENT',
  'COMPLETED',
]

function job(overrides: Partial<ProcessingJob> = {}): ProcessingJob {
  return {
    image_id: 29,
    job_id: '4dec545b-2bd2-4914-b61b-77151e473bf1',
    status: 'ENCRYPTING',
    progress: 25,
    progress_basis: 'pipeline_stage',
    stages: STAGES,
    ...overrides,
  }
}

describe('ProcessingPipelinePanel - stage mapping', () => {
  it('maps a real backend stage code to its clinician-facing label', () => {
    render(<ProcessingPipelinePanel job={job({ status: 'ENCRYPTING' })} />)

    // ENCRYPTING is rendered alongside its human description - the raw code
    // stays visible as a stage chip, and the label carries the meaning.
    expect(
      screen.getByText('4D Chen encryption (AES-256-GCM)')
    ).toBeInTheDocument()
  })

  it('maps the AI forensics stage to the SRM + Swin-UNet description', () => {
    render(<ProcessingPipelinePanel job={job({ status: 'AI_PROCESSING' })} />)

    expect(
      screen.getByText('AI forensics (SRM + Hybrid Swin-UNet)')
    ).toBeInTheDocument()
  })

  it('renders every real backend stage from the provided stage list', () => {
    render(<ProcessingPipelinePanel job={job()} />)

    expect(screen.getByText('SHA-3 integrity hashing')).toBeInTheDocument()
    expect(screen.getByText('Digital Integrity Twin')).toBeInTheDocument()
    expect(screen.getByText('Blockchain audit ledger')).toBeInTheDocument()
    expect(
      screen.getByText('Forensic localization + Grad-CAM')
    ).toBeInTheDocument()
    expect(screen.getByText('Risk & trust assessment')).toBeInTheDocument()
  })
})

describe('ProcessingPipelinePanel - stage position arithmetic', () => {
  it('reports 1-based position of the current stage within the pipeline', () => {
    // ENCRYPTING is index 2 of 12 -> "Pipeline stage 3 of 12".
    render(<ProcessingPipelinePanel job={job({ status: 'ENCRYPTING' })} />)

    expect(screen.getByText(/Pipeline stage 3 of 12/)).toBeInTheDocument()
  })

  it('reports stage 1 for the first stage', () => {
    render(<ProcessingPipelinePanel job={job({ status: 'QUEUED' })} />)

    expect(screen.getByText(/Pipeline stage 1 of 12/)).toBeInTheDocument()
  })

  it('never reports a position below 1 for an unknown stage', () => {
    // indexOf() returns -1 for a status the backend has not told us about.
    render(<ProcessingPipelinePanel job={job({ status: 'MYSTERY_STAGE' })} />)

    expect(screen.getByText(/Pipeline stage 1 of 12/)).toBeInTheDocument()
  })

  it('falls back to the full canonical stage list when none is supplied', () => {
    render(<ProcessingPipelinePanel job={job({ stages: [] })} />)

    // STAGE_LABEL defines 12 stages; the fallback must use all of them.
    expect(screen.getByText(/of 12/)).toBeInTheDocument()
  })
})

describe('ProcessingPipelinePanel - progress honesty', () => {
  it('marks stage-based progress as such', () => {
    render(
      <ProcessingPipelinePanel
        job={job({ progress: 25, progress_basis: 'pipeline_stage' })}
      />
    )

    expect(screen.getByText(/\(stage-based\)/)).toBeInTheDocument()
  })

  it('omits the stage-based marker when the basis is not pipeline_stage', () => {
    render(
      <ProcessingPipelinePanel
        job={job({ progress: 60, progress_basis: 'server_percentage' })}
      />
    )

    expect(screen.queryByText(/\(stage-based\)/)).not.toBeInTheDocument()
  })

  it('omits the stage-based marker when the backend sends no basis at all', () => {
    render(
      <ProcessingPipelinePanel job={job({ progress_basis: undefined })} />
    )

    expect(screen.queryByText(/\(stage-based\)/)).not.toBeInTheDocument()
  })
})

describe('ProcessingPipelinePanel - terminal states', () => {
  it('renders the completed stage label when the job finishes', () => {
    render(
      <ProcessingPipelinePanel
        job={job({ status: 'COMPLETED', progress: 100 })}
      />
    )

    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText(/Pipeline stage 12 of 12/)).toBeInTheDocument()
  })
})
