import { Injectable, InternalServerErrorException } from '@nestjs/common';

export interface ProcessorDocumentIn {
  docId: string;
  type: string;
  storageKey: string;
}

export interface ProcessRequest {
  claimId: string;
  documents: ProcessorDocumentIn[];
  claim?: Record<string, unknown>;
  packageVersion?: number;
}

/** Calls services/processor's `POST /process` (§7.1). api is the only caller — the processor
 * itself never touches the database; it just returns the assembled EvidencePackage. */
@Injectable()
export class ProcessorClient {
  private baseUrl = process.env.PROCESSOR_URL || 'http://localhost:8000';

  async process(req: ProcessRequest): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
    } catch (err) {
      throw new InternalServerErrorException(`processor unreachable at ${this.baseUrl}: ${err}`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new InternalServerErrorException(`processor returned ${res.status}: ${body}`);
    }
    return res.json();
  }
}
