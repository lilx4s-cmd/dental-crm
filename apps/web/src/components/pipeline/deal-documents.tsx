'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { DEAL_DOCUMENT_LABELS, documentsExpectedAt, type DealDocument } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  STORAGE_NOT_CONFIGURED_MESSAGE,
  isStorageNotConfigured,
  useDeleteFile,
  useFileDownload,
  useFiles,
  useUploadFile,
  type StoredFile,
} from '@/hooks/use-files';

// Which stored file category holds each document the process asks for. Teeth photos reuse the
// existing PHOTO category rather than inventing a parallel one — clinically they are the same
// thing, and a patient's photos should not be split across two buckets depending on which screen
// uploaded them.
const CATEGORY_FOR: Record<DealDocument, string> = {
  TEETH_PHOTOS: 'PHOTO',
  PASSPORT: 'PASSPORT',
  FLIGHT_TICKET: 'FLIGHT_TICKET',
};

const ACCEPT: Record<DealDocument, string> = {
  TEETH_PHOTOS: 'image/*',
  PASSPORT: 'image/*,application/pdf',
  FLIGHT_TICKET: 'image/*,application/pdf',
};

/**
 * The paperwork a deal is expected to have by its current stage, and what is actually on file.
 *
 * Driven by the shared stage list rather than a copy here, so moving a requirement earlier in the
 * process is a one-line change that the board, this panel and anything else reading the stages all
 * pick up together.
 */
export function DealDocuments({ dealId, stage }: { dealId: string; stage: string }) {
  const expected = documentsExpectedAt(stage);
  const { data: files, isLoading } = useFiles('LEAD', dealId);
  const upload = useUploadFile();
  const remove = useDeleteFile('LEAD', dealId);
  const download = useFileDownload();
  const [pending, setPending] = useState<DealDocument | null>(null);

  if (expected.length === 0 && (files?.length ?? 0) === 0) return null;

  const filesFor = (doc: DealDocument) => (files ?? []).filter((f) => f.category === CATEGORY_FOR[doc]);

  const handleUpload = async (doc: DealDocument, file: File) => {
    setPending(doc);
    try {
      await upload.mutateAsync({ ownerType: 'LEAD', ownerId: dealId, category: CATEGORY_FOR[doc], file });
      toast.success(`${DEAL_DOCUMENT_LABELS[doc]} uploaded`);
    } catch (e) {
      // Storage being unconfigured is a setup problem, not a problem with the file — say which.
      toast.error(
        isStorageNotConfigured(e)
          ? STORAGE_NOT_CONFIGURED_MESSAGE
          : e instanceof Error
            ? e.message
            : 'Upload failed',
      );
    } finally {
      setPending(null);
    }
  };

  // Anything uploaded that is not one of the expected documents still belongs on screen.
  const expectedCategories = new Set(expected.map((d) => CATEGORY_FOR[d]));
  const others = (files ?? []).filter((f) => !expectedCategories.has(f.category));

  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <FileText className="h-4 w-4" /> Documents
      </h3>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-1.5">
          {expected.map((doc) => (
            <DocumentSlot
              key={doc}
              doc={doc}
              files={filesFor(doc)}
              uploading={pending === doc}
              onUpload={(file) => handleUpload(doc, file)}
              onDownload={download}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}

          {others.map((f) => (
            <FileRow key={f.id} file={f} onDownload={download} onDelete={(id) => remove.mutate(id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentSlot({
  doc,
  files,
  uploading,
  onUpload,
  onDownload,
  onDelete,
}: {
  doc: DealDocument;
  files: StoredFile[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const has = files.length > 0;

  return (
    <div className={cn('rounded-md border p-2', !has && 'border-dashed')}>
      <div className="flex items-center gap-2">
        {has ? (
          <Check className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 text-sm">
          {DEAL_DOCUMENT_LABELS[doc]}
          {has && <span className="ml-1 text-xs text-muted-foreground">({files.length})</span>}
        </span>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={ACCEPT[doc]}
          multiple={doc === 'TEETH_PHOTOS'}
          onChange={(e) => {
            const chosen = Array.from(e.target.files ?? []);
            chosen.forEach(onUpload);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          variant={has ? 'ghost' : 'outline'}
          className="h-7 shrink-0 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Upload className="mr-1 h-3 w-3" />
          )}
          {has ? 'Add' : 'Upload'}
        </Button>
      </div>

      {files.map((f) => (
        <FileRow key={f.id} file={f} nested onDownload={onDownload} onDelete={onDelete} />
      ))}
    </div>
  );
}

function FileRow({
  file,
  nested,
  onDownload,
  onDelete,
}: {
  file: StoredFile;
  nested?: boolean;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs',
        nested ? 'mt-1.5 pl-6' : 'rounded-md border px-2 py-1.5',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
      <span className="shrink-0 text-muted-foreground">{(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
      <button
        type="button"
        aria-label={`Download ${file.fileName}`}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        onClick={() => onDownload(file.id)}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${file.fileName}`}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(file.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
