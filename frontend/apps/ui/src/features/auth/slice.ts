import {createSlice} from "@reduxjs/toolkit"
import Cookies from "js-cookie"

const COOKIE_NAME = "access_token"

export interface AuthState {
  token: string | null
}

const initialState: AuthState = {
  token: null
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    cookieLoaded: state => {
      const token = Cookies.get(COOKIE_NAME)
      if (token) {
        state.token = token
      }
    }
  }
})

export const {cookieLoaded} = authSlice.actions
export default authSlice.reducer
