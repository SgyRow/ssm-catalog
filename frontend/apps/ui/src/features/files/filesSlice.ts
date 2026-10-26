import {uploaderFileItemUpdated} from "@/features/ui/uiSlice"
import type {FolderType, NodeType} from "@/types"
import type {UUID} from "@/types.d/common"
import {formatApiErrorDetail} from "@/utils/apiError"
import {getBaseURL, getDefaultHeaders} from "@/utils"
import {createAsyncThunk, createSlice, PayloadAction} from "@reduxjs/toolkit"
import axios from "axios"
import {t} from "i18next"
import {UploadFileOutput} from "../nodes/types"
import {fileManager} from "./fileManager"

type FilesAddedType = {
  nodeID: string
  objectURL: string
  fileName: string
  type: string
  size: number
}

type UploadFileInput = {
  file: File
  refreshTarget: boolean
  target: FolderType
  ocr: boolean
}

type CreateDocumentType = {
  title: string
  parent_id: string
  ctype: "document"
  lang: string
  ocr: boolean
}

export const uploadFile = createAsyncThunk<UploadFileOutput, UploadFileInput>(
  "upload/file",
  async (args: UploadFileInput, thunkApi) => {
    /** Uploading a file involves two steps:
     * 1. POST /api/nodes/ - create node database entry (without associated file)
     * 2. POST /api/documents/<id from previous step>/upload/
     */
    const baseUrl = getBaseURL()
    let defaultHeaders = getDefaultHeaders()
    const data1: CreateDocumentType = {
      title: args.file.name,
      parent_id: args.target.id,
      ctype: "document",
      lang: "rus",
      ocr: args.ocr
    }
    const buffer = await args.file.arrayBuffer()

    thunkApi.dispatch(
      uploaderFileItemUpdated({
        item: {
          source: null,
          target: args.target,
          file_name: args.file.name
        },
        status: "uploading",
        error: null
      })
    )

    let response1
    const nodesURL = `${baseUrl}/api/nodes/`

    try {
      response1 = await axios.post(nodesURL, data1, {
        headers: defaultHeaders,
        validateStatus: () => true
      })
    } catch (error: unknown) {
      /* Will happen when nodesURL points to invalid location */
      console.error(`Error while POSTing to nodesURL=${nodesURL}`)
      console.error(error)
      thunkApi.dispatch(
        uploaderFileItemUpdated({
          item: {
            source: null,
            target: args.target,
            file_name: args.file.name
          },
          status: "failure",
          error: t("upload.error.node_creation")
        })
      )
      return {
        file_name: args.file.name,
        source: null,
        target: args.target
      }
    }

    if (response1.status >= 400) {
      thunkApi.dispatch(
        uploaderFileItemUpdated({
          item: {
            source: null,
            target: args.target,
            file_name: args.file.name
          },
          status: "failure",
          error: formatApiErrorDetail(response1.data?.detail)
        })
      )
      return {
        file_name: args.file.name,
        source: null,
        target: args.target
      }
    }

    const createdNode = response1.data as NodeType

    fileManager.store({
      nodeID: createdNode.id,
      buffer: buffer
    })

    thunkApi.dispatch(
      filesAdded({
        nodeID: createdNode.id,
        objectURL: URL.createObjectURL(args.file),
        fileName: args.file.name,
        size: args.file.size,
        type: args.file.type
      })
    )

    const form_data = new FormData()

    form_data.append("file", args.file)

    defaultHeaders["Content-Type"] = "multipart/form-data"

    let response2
    const uploadURL = `${baseUrl}/api/documents/${createdNode.id}/upload`

    try {
      response2 = await axios.post(uploadURL, form_data, {
        headers: defaultHeaders,
        validateStatus: () => true
      })
    } catch (error: unknown) {
      /* Will happen when uploadURL points to invalid location */
      console.error(`Error while uploading file to uploadURL=${uploadURL}`)
      console.error(error)
      thunkApi.dispatch(
        uploaderFileItemUpdated({
          item: {
            source: null,
            target: args.target,
            file_name: args.file.name
          },
          status: "failure",
          error: t("upload.error.file_upload")
        })
      )
      return {
        file_name: args.file.name,
        source: null,
        target: args.target
      }
    }

    if (response2.status == 200 || response2.status == 201) {
      // Attach the freshly-created docVerID to the in-memory buffer so the
      // text layer works the first time the user opens the document (without
      // this, `fileManager.getByDocVerID` misses and the viewer has to
      // re-download the PDF before rendering the selectable layer).
      const uploadedDoc = response2.data as {
        versions?: Array<{id: string; number: number}>
      } | null
      if (uploadedDoc?.versions && uploadedDoc.versions.length > 0) {
        const latestVersion = [...uploadedDoc.versions].sort(
          (a, b) => b.number - a.number
        )[0]
        fileManager.update(createdNode.id, {docVerID: latestVersion.id})
      }
      thunkApi.dispatch(
        uploaderFileItemUpdated({
          item: {
            source: createdNode,
            target: args.target,
            file_name: args.file.name
          },
          status: "success",
          error: null
        })
      )
    }
    if (response2.status >= 400) {
      thunkApi.dispatch(
        uploaderFileItemUpdated({
          item: {
            source: null,
            target: args.target,
            file_name: args.file.name
          },
          status: "failure",
          error: formatApiErrorDetail(response2.data?.detail)
        })
      )
      return {
        file_name: args.file.name,
        source: null,
        target: args.target
      }
    }

    return {
      file_name: args.file.name,
      source: createdNode,
      target: args.target
    }
  }
)

export type FileItem = {
  nodeID: UUID
  fileName: string
  size: number
  type: string
  objectURL?: string
  docVerID?: UUID
}

export type FilesState = {
  files: Array<FileItem>
}

const initialState: FilesState = {
  files: []
}

export const filesSlice = createSlice({
  name: "files",
  initialState,
  reducers: {
    filesAdded(state, action: PayloadAction<FilesAddedType>) {
      state.files = [...state.files, action.payload]
    }
  }
})

export default filesSlice.reducer
export const {filesAdded} = filesSlice.actions
