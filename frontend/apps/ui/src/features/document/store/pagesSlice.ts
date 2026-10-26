import {RootState} from "@/app/types"
import type {PageType} from "@/types"
import {createEntityAdapter, createSlice} from "@reduxjs/toolkit"

const pageAdapter = createEntityAdapter<PageType>()
const initialState = pageAdapter.getInitialState()

/**
 * This slice is used for convenient access to page url (page.jpg_url, page.svg_url)
 * in `getPageImage` endpoint
 */
const pagesSlice = createSlice({
  name: "pages",
  initialState,
  reducers: {}
})

export default pagesSlice.reducer

export const {selectEntities: selectNodeEntities} = pageAdapter.getSelectors(
  (state: RootState) => state.pages
)
