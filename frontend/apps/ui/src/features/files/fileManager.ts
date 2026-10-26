type UUID = string

type FileItem = {
  nodeID?: UUID
  buffer: ArrayBuffer
  docVerID?: UUID
}

class FileManager {
  private files: FileItem[] = []
  private docVerBufferListeners = new Map<UUID, Set<() => void>>()

  /** React and other UI can subscribe; invoked when a buffer is stored or updated for this doc version id. */
  subscribeDocVerBuffer(docVerID: UUID, listener: () => void): () => void {
    let set = this.docVerBufferListeners.get(docVerID)
    if (!set) {
      set = new Set()
      this.docVerBufferListeners.set(docVerID, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) {
        this.docVerBufferListeners.delete(docVerID)
      }
    }
  }

  private emitDocVerBuffer(docVerID: UUID | undefined): void {
    if (!docVerID) {
      return
    }
    const set = this.docVerBufferListeners.get(docVerID)
    if (!set) {
      return
    }
    for (const fn of set) {
      try {
        fn()
      } catch (e) {
        console.error(e)
      }
    }
  }

  store(item: FileItem): void {
    // Deduplicate by docVerID when present; otherwise by a concrete nodeID.
    // Entries where both identifiers are undefined MUST NOT collide with each other
    // (historical bug: opening any new document wiped the buffer of the previous one).
    this.files = this.files.filter(file => {
      if (item.docVerID && file.docVerID === item.docVerID) {
        return false
      }
      if (item.nodeID && file.nodeID === item.nodeID) {
        return false
      }
      return true
    })
    this.files.push(item)
    this.emitDocVerBuffer(item.docVerID)
  }

  get(nodeID: UUID): FileItem | undefined {
    return this.files.find(file => file.nodeID === nodeID)
  }

  getBuffer(nodeID: UUID): ArrayBuffer | undefined {
    const item = this.get(nodeID)
    return item?.buffer
  }

  getAll(): FileItem[] {
    return [...this.files] // Return a copy to prevent external mutations
  }

  getByDocVerID(docVerID: UUID): FileItem | undefined {
    return this.files.find(file => file.docVerID === docVerID)
  }

  update(nodeID: UUID, updates: Partial<Omit<FileItem, "nodeID">>): boolean {
    const index = this.files.findIndex(file => file.nodeID === nodeID)
    if (index === -1) return false

    const prev = this.files[index]
    this.files[index] = {
      ...prev,
      ...updates
    }
    const next = this.files[index]
    if (
      next.docVerID &&
      (updates.docVerID !== undefined || updates.buffer !== undefined)
    ) {
      this.emitDocVerBuffer(next.docVerID)
    }
    return true
  }

  delete(nodeID: UUID): boolean {
    const initialLength = this.files.length
    this.files = this.files.filter(file => file.nodeID !== nodeID)
    return this.files.length < initialLength
  }

  deleteByDocVerID(docVerID: UUID): number {
    const initialLength = this.files.length
    this.files = this.files.filter(file => file.docVerID !== docVerID)
    return initialLength - this.files.length // Return count of deleted items
  }

  has(nodeID: UUID): boolean {
    return this.files.some(file => file.nodeID === nodeID)
  }

  count(): number {
    return this.files.length
  }

  clear(): void {
    this.files = []
  }

  filter(predicate: (item: FileItem) => boolean): FileItem[] {
    return this.files.filter(predicate)
  }

  getTotalSize(): number {
    return this.files.reduce((total, file) => total + file.buffer.byteLength, 0)
  }
}

export const fileManager = new FileManager()

// Usage examples:
/*
// Store a file
fileManager.store({
  nodeID: 'node-123',
  buffer: arrayBuffer,
  docVerID: 'doc-456'
})

// Get a file
const fileItem = fileManager.get('node-123')
const buffer = fileManager.getBuffer('node-123')

// Get all files for a document version
const docFiles = fileManager.getByDocVerID('doc-456')

// Update a file (e.g., add docVerID to existing file)
*/
