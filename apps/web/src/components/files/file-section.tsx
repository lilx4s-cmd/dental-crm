'use client';

import { useRef, useState } from 'react';
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

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

/** A category somebody can file something under, and what a file input should accept for it. */
export interface FileCategoryOption {
  category: string;
  label: string;
  accept?: string;
  multiple?: boolean;
}

/** The clinical categories a patient record collects. */
export const CLINICAL_FILE_CATEGORIES: FileCategoryOption[] = [
  { category: 'XRAY', label: 'X-ray', accept: 'image/*,application/pdf', multiple: true },
  { category: 'CT_SCAN', label: 'CT scan', accept: 'image/*,application/pdf,.dcm', multiple: true },
  { category: 'PHOTO', label: 'Clinical photo', accept: 'image/*', multiple: true },
  { category: 'BEFORE_PHOTO', label: 'Before', accept: 'image/*', multiple: true },
  { category: 'AFTER_PHOTO', label: 'After', accept: 'image/*', multiple: true },
  { category: 'PASSPORT', label: 'Passport', accept: 'image/*,application/pdf' },
  { category: 'DOCUMENT', label: 'Other document', accept: 'image/*,application/pdf', multiple: true },
];

/**
 * Files attached to any record.
 *
 * The storage backend has always supported this — polymorphic owner, private bucket, short-lived
 * signed URLs, and categories for X-rays and CT scans. The only upload surface in the product was
 * hardcoded to leads and to three travel documents, so there was no way to put a radiograph on a
 * patient: the clinical file categories existed and nothing could reach them.
 *
 * Deliberately not a slot-per-category grid like the deal panel. A deal has a fixed checklist it
 * must satisfy; a patient record accumulates whatever the case produced, so this leads with the
 * files that exist and offers the categories as a way to add more.
 */
export function FileSection({
  ownerType,
  ownerId,
  categories,
  title = 'Files',
  emptyHint,
}: {
  ownerType: string;
  ownerId: string;
  categories: FileCategoryOption[];
  title?: string;
  emptyHint?: string;
}) {
  const { data: files, isLoading } = useFiles(ownerType, ownerId);
  const upload = useUploadFile();
  const remove = useDeleteFile(ownerType, ownerId);
  const download = useFileDownload();
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosenCategory, setChosenCategory] = useState<FileCategoryOption | null>(null);

  const handleFiles = async (option: FileCategoryOption, chosen: File[]) => {
    setPending(option.category);
    try {
      // Sequential rather than parallel: each upload asks the API for its own signed URL, and
      // firing ten at once against Supabase gains nothing but makes a partial failure harder to
      // report on.
      for (const file of chosen) {
        await upload.mutateAsync({ ownerType, ownerId, category: option.category, file });
      }
      toast.success(chosen.length === 1 ? `${option.label} uploaded` : `${chosen.length} files uploaded`);
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

  const labelFor = (category: string) =>
    categories.find((c) => c.category === category)?.label ?? category.replace(/_/g, ' ').toLowerCase();

  // Grouped by category so a record with thirty photos and one passport does not bury the passport.
  const grouped = categories
    .map((option) => ({ option, items: (files ?? []).filter((f) => f.category === option.category) }))
    .filter((g) => g.items.length > 0);

  const known = new Set(categories.map((c) => c.category));
  const others = (files ?? []).filter((f) => !known.has(f.category));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FileText className="h-4 w-4" /> {title}
          {files && files.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({files.length})</span>
          )}
        </h3>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={chosenCategory?.accept}
        multiple={chosenCategory?.multiple}
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          if (chosenCategory && chosen.length) void handleFiles(chosenCategory, chosen);
          e.target.value = '';
        }}
      />

      {/* One button per category. Choosing the category before the file means the upload is filed
          correctly without anybody having to classify it afterwards — which is the step that never
          happens. */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((option) => (
          <Button
            key={option.category}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={pending !== null}
            onClick={() => {
              setChosenCategory(option);
              // Set state, then open the picker on the next tick so `accept` and `multiple` are
              // applied to the input before the dialog reads them.
              setTimeout(() => inputRef.current?.click(), 0);
            }}
          >
            {pending === option.category ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Upload className="mr-1 h-3 w-3" />
            )}
            {option.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (files?.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">
          {emptyHint ?? 'Nothing on file yet. Choose a category above to add something.'}
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ option, items }) => (
            <div key={option.category} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {option.label} <span className="font-normal">({items.length})</span>
              </p>
              {items.map((f) => (
                <FileRow key={f.id} file={f} onDownload={download} onDelete={(id) => remove.mutate(id)} />
              ))}
            </div>
          ))}

          {others.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Other</p>
              {others.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  label={labelFor(f.category)}
                  onDownload={download}
                  onDelete={(id) => remove.mutate(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  label,
  onDownload,
  onDelete,
}: {
  file: StoredFile;
  label?: string;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs')}>
      <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
      {label && <span className="shrink-0 capitalize text-muted-foreground">{label}</span>}
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
