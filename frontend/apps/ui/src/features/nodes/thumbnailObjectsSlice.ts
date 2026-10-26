import type {UUID} from "@/types.d/common"
import type {
  GenerateThumbnailInputType,
  LoadThumbnailInputType
} from "@/types.d/node_thumbnail"
import {getBaseURL, getDefaultHeaders} from "@/utils"
import {createAsyncThunk, createSlice} from "@reduxjs/toolkit"
import {generateNodeThumbnailFromFile} from "@/features/nodes/generateClientThumbnail"

export interface ThumbnailState {
  [node_id: UUID]: {
    url: string | null
    error: string | null
  }
}

const initialState: ThumbnailState = {}

interface PayloadType {
  node_id: UUID
  objectURL: string | null
  error: string | null
}

export const generateThumbnail = createAsyncThunk<
  PayloadType,
  GenerateThumbnailInputType
>("images/generateNodeThumbnail", async item => {
  const objectURL = await generateNodeThumbnailFromFile(item.file)
  if (objectURL) {
    return {
      node_id: item.node_id,
      objectURL: objectURL,
      error: null
    }
  }

  return {
    node_id: item.node_id,
    objectURL: null,
    error: "There was an error generating thumbnail image"
  }
})

export const loadThumbnail = createAsyncThunk<
  PayloadType, // 1. Return type of payload (fulfilled result)
  LoadThumbnailInputType // 2. Argument passed into the thunk
>("images/loadNodeThumbnail", async item => {
  const headers = getDefaultHeaders()
  let url

  if (item.status == "failed") {
    return {
      node_id: item.node_id,
      objectURL: null,
      error: "Timeout: failed to load thumbnail"
    }
  }

  if (item.status == "pending") {
    return {node_id: item.node_id, objectURL: null, error: null}
  }

  if (!item.status) {
    return {node_id: item.node_id, objectURL: null, error: null}
  }

  if (!item.url) {
    return {node_id: item.node_id, objectURL: null, error: null}
  }

  if (item.url && !item.url.startsWith("/api/")) {
    // cloud URL e.g. aws cloudfront URL
    url = item.url
  } else {
    // use backend server URL (which may differ from frontend's URL)
    url = `${getBaseURL(true)}${item.url}`
  }

  const fetchHeaders = {...headers}
  delete fetchHeaders["Content-Type"]

  const response = await fetch(url, {
    headers: fetchHeaders,
    credentials: "include"
  })

  if (response.ok) {
    const blob = await response.blob()
    const objectURL = URL.createObjectURL(blob)
    const result = {
      node_id: item.node_id as UUID,
      objectURL,
      error: null
    }

    return result
  }

  return {
    node_id: item.node_id,
    objectURL: null,
    error: "There was an error loading thumbnail image"
  }
})

function clearThumbnailEntry(state: ThumbnailState, node_id: string) {
  const existing = state[node_id]
  if (existing?.url) {
    URL.revokeObjectURL(existing.url)
  }
  delete state[node_id]
}

const thumbnailObjectsSlice = createSlice({
  name: "thumbnailObjects",
  initialState,
  reducers: {
    clearImages(state) {
      for (const value of Object.values(state)) {
        if (value.url) {
          URL.revokeObjectURL(value.url)
        }
      }

      return {}
    }
  },
  extraReducers: builder => {
    builder.addCase(generateThumbnail.fulfilled, (state, action) => {
      const payload = action.payload

      if (payload) {
        const node_id = payload.node_id as UUID
        const newObjectURL = payload.objectURL
        const error = payload.error
        const existingValue = state[node_id]

        if (existingValue && existingValue.url) {
          URL.revokeObjectURL(existingValue.url)
        }

        if (!payload.error && newObjectURL) {
          state[node_id] = {
            url: newObjectURL,
            error: error
          }
        }

        if (payload.error) {
          clearThumbnailEntry(state, node_id)
        }
      }
    })
    builder.addCase(loadThumbnail.fulfilled, (state, action) => {
      const payload = action.payload

      if (payload) {
        const node_id = payload.node_id as UUID
        const newObjectURL = payload.objectURL
        const error = payload.error
        const existingValue = state[node_id]

        if (existingValue && existingValue.url) {
          URL.revokeObjectURL(existingValue.url)
        }

        if (!payload.error && newObjectURL) {
          state[node_id] = {
            url: newObjectURL,
            error: error
          }
        }

        if (payload.error) {
          clearThumbnailEntry(state, node_id)
        }
      }
    })
    builder.addCase(loadThumbnail.rejected, (state, action) => {
      clearThumbnailEntry(state, action.meta.arg.node_id)
    })
  }
})

export const {clearImages} = thumbnailObjectsSlice.actions
export default thumbnailObjectsSlice.reducer
