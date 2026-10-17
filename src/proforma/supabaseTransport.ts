import type { Scope, Transport, PageRow, Detail } from './client';
import { ProformaError } from './model';

/** Proposed public gateway contract. No private-schema access, silent retry or sale fallback. */
export type RpcPort = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
export function proformaTransport(port: RpcPort): Transport {
  async function call(name: string, scope: Scope, args: Record<string, unknown>, signal?: AbortSignal) {
    if (signal?.aborted) throw new ProformaError('REQUEST_ABORTED');
    const result = await port.rpc(name, { p_org: scope.organizationId, p_store: scope.storeId, ...args });
    if (signal?.aborted) throw new ProformaError('REQUEST_ABORTED');
    if (result.error) throw new Error(result.error.message);
    if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) throw new ProformaError('INVALID_RESPONSE');
    const envelope = result.data as Record<string, unknown>;
    if (envelope.organizationId !== scope.organizationId || envelope.storeId !== scope.storeId) throw new ProformaError('RESPONSE_SCOPE_MISMATCH');
    return envelope;
  }
  return {
    async page(input) {
      const result = await call('proforma_page_v1', input, { p_before: input.before, p_limit: input.limit }, input.signal);
      if (!Array.isArray(result.rows) || result.rows.length > input.limit) throw new ProformaError('INVALID_PAGE');
      if (result.nextBefore != null && (typeof result.nextBefore !== 'string' || !/^[1-9]\d*$/.test(result.nextBefore))) throw new ProformaError('INVALID_CURSOR');
      for (const row of result.rows) {
        if (!row || typeof row.id !== 'string' || typeof row.reference !== 'string' || !Number.isInteger(row.revision) || row.revision < 1) throw new ProformaError('INVALID_PAGE');
      }
      return { rows: result.rows as PageRow[], nextBefore: result.nextBefore as string | null };
    },
    async detail(input) {
      const result = await call('proforma_detail_v1', input, { p_document: input.documentId }, input.signal);
      const detail = result.detail as Detail | undefined;
      if (!detail?.document || detail.document.id !== input.documentId || detail.document.organization_id !== input.organizationId || detail.document.store_id !== input.storeId) throw new ProformaError('RESPONSE_SCOPE_MISMATCH');
      return detail;
    },
    async command(input) {
      const result = await call('proforma_command_v1', input, {
        p_request: input.requestId, p_document: input.documentId, p_expected: input.expectedRevision,
        p_operation: input.operation, p_body: input.body,
      });
      return result.result;
    },
  };
}
