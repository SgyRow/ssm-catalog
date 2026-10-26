import {AccessibilityProvider} from "@/accessibility/AccessibilityContext"
import {Notifications} from "@mantine/notifications"
import * as React from "react"
import * as ReactDOM from "react-dom/client"
import {Provider} from "react-redux"
import {RouterProvider} from "react-router-dom"

import {store} from "@/app/store"
import {cookieLoaded} from "@/features/auth/slice"
import "@/index.css"
import {fetchCurrentUser} from "@/slices/currentUser"
import "@mantine/notifications/styles.css"

import {initializeI18n} from "./initializeI18n"
import router from "./router"
import {isPostAuthRoute} from "./features/public/guestMode"

async function start_app() {
  store.dispatch(cookieLoaded())
  const pathname = window.location.pathname
  if (!isPostAuthRoute(pathname)) {
    store.dispatch(fetchCurrentUser())
  }

  await initializeI18n()

  document.documentElement.setAttribute("data-accessibility", "false")

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <AccessibilityProvider>
        <Provider store={store}>
          <RouterProvider router={router} />
        </Provider>
        <Notifications />
      </AccessibilityProvider>
    </React.StrictMode>
  )
}

start_app()
