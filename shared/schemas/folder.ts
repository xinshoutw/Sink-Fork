import { z } from 'zod'

/**
 * Maximum nesting depth, counted from the root level (a root folder has depth 1).
 * Bounds the ancestor walk used for cycle detection and keeps breadcrumbs readable.
 */
export const MAX_FOLDER_DEPTH = 3

export const FolderIdSchema = z.string().trim().min(1).max(26)
export const FolderNameSchema = z.string().trim().min(1).max(64)

/** `null` explicitly targets the root level; `undefined` means "leave unchanged". */
const ParentIdSchema = FolderIdSchema.nullish()

export const CreateFolderSchema = z.object({
  name: FolderNameSchema,
  parentId: ParentIdSchema,
})

export const EditFolderSchema = z.object({
  id: FolderIdSchema,
  name: FolderNameSchema.optional(),
  parentId: ParentIdSchema,
})

export const DeleteFolderSchema = z.object({
  id: FolderIdSchema,
})

/** Query value that selects links outside every folder. */
export const UNCATEGORIZED_FOLDER = 'none'

/**
 * Folder list filter: absent lists every folder, `none` lists uncategorized
 * links only, anything else is a folder id.
 */
export const FolderFilterSchema = z.preprocess(
  value => value === UNCATEGORIZED_FOLDER ? null : value,
  FolderIdSchema.nullable().optional(),
)

export const MoveLinksSchema = z.object({
  slugs: z.array(z.string().trim().min(1).max(2048)).min(1).max(100),
  folderId: FolderIdSchema.nullable(),
})

export type CreateFolderInput = z.infer<typeof CreateFolderSchema>
export type EditFolderInput = z.infer<typeof EditFolderSchema>
export type MoveLinksInput = z.infer<typeof MoveLinksSchema>

export interface Folder {
  id: string
  name: string
  parentId: string | null
}

/** Folder as it appears in an export or backup file. */
export const PortableFolderSchema = z.object({
  id: FolderIdSchema,
  name: FolderNameSchema,
  parentId: FolderIdSchema.nullish(),
})

export type PortableFolder = z.infer<typeof PortableFolderSchema>

export interface FolderWithCount extends Folder {
  /** Links directly inside this folder, excluding subfolders. */
  linkCount: number
}
