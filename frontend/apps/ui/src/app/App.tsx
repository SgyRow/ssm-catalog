import {AppShell} from "@mantine/core"
import "@mantine/core/styles.css"
import "@mantine/dates/styles.css"
import {useViewportSize} from "@mantine/hooks"
import {useEffect, useRef} from "react"
import {useDispatch, useSelector} from "react-redux"
import {Outlet} from "react-router-dom"

import {HEADER_HEIGHT_DEFAULT} from "@/accessibility/constants"
import Header from "@/components/Header/Header"
import NavBar from "@/components/NavBar"
import {updateOutlet} from "@/features/ui/uiSlice"
import {
  selectCurrentUserError,
  selectCurrentUserStatus
} from "@/slices/currentUser"

import Uploader from "@/components/Uploader"
import {navigateToLogin} from "@/features/public/guestMode"
import {selectNavBarWidth} from "@/features/ui/uiSlice"
import "./App.css"

function App() {
  const {height, width} = useViewportSize()
  const headerHeight = HEADER_HEIGHT_DEFAULT
  const dispatch = useDispatch()
  const navBarWidth = useSelector(selectNavBarWidth)
  const status = useSelector(selectCurrentUserStatus)
  const error = useSelector(selectCurrentUserError)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref?.current) {
      let value = 0
      const styles = window.getComputedStyle(ref?.current)
      value = parseInt(styles.marginTop)
      value += parseInt(styles.paddingTop)
      dispatch(updateOutlet(value))
    }
  }, [width, height, dispatch])

  useEffect(() => {
    if (status === "failed") {
      navigateToLogin()
    }
  }, [status])

  if (status == "failed") {
    return <>{error}</>
  }

  return (
    <>
      <AppShell
        header={{height: headerHeight}}
        navbar={{
          width: navBarWidth,
          breakpoint: 0
        }}
      >
        <AppShell.Header>
          <Header />
        </AppShell.Header>

        <AppShell.Navbar>
          <NavBar />
        </AppShell.Navbar>

        <AppShell.Main ref={ref}>
          <Outlet />
          <Uploader />
        </AppShell.Main>
      </AppShell>
    </>
  )
}

export default App
