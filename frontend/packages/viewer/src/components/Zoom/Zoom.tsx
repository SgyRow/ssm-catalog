import {ActionIcon, Group, Input} from "@mantine/core"
import {
  IconMaximize,
  IconZoomIn,
  IconZoomOut
} from "@tabler/icons-react"
import {useEffect, useState} from "react"
import classes from "./Zoom.module.css"

interface Args {
  pageNumber: number
  pageTotal: number
  onZoomInClick?: () => void
  onZoomOutClick?: () => void
  onFitClick?: () => void
  onPageNumberSubmit?: (pageNumber: number) => void
}

export default function Zoom({
  pageNumber,
  pageTotal,
  onZoomInClick,
  onZoomOutClick,
  onFitClick,
  onPageNumberSubmit
}: Args) {
  const [inputPageNumber, setInputPageNumber] = useState(`${pageNumber}`)

  useEffect(() => {
    setInputPageNumber(`${pageNumber}`)
  }, [pageNumber])

  const submitPageNumber = () => {
    if (!onPageNumberSubmit) {
      return
    }

    const parsedPageNumber = Number(inputPageNumber)
    const normalizedValue = Number.isFinite(parsedPageNumber)
      ? parsedPageNumber
      : pageNumber
    const clampedValue = Math.min(Math.max(1, normalizedValue), pageTotal || 1)
    setInputPageNumber(`${clampedValue}`)
    onPageNumberSubmit(clampedValue)
  }

  return (
    <Group justify={"center"} wrap="nowrap" className={classes.zoom}>
      <ActionIcon
        variant="subtle"
        className={classes.zoomControl}
        size="lg"
        onClick={onZoomInClick}
        aria-label="zoom-in"
      >
        <IconZoomIn />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        className={classes.zoomControl}
        size="lg"
        onClick={onZoomOutClick}
        aria-label="zoom-out"
      >
        <IconZoomOut />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        className={classes.zoomControl}
        size="lg"
        onClick={onFitClick}
        aria-label="zoom-reset"
      >
        <IconMaximize />
      </ActionIcon>
      <Input
        type="number"
        className={classes.pageInput}
        aria-label="page-number-input"
        value={inputPageNumber}
        min={1}
        max={pageTotal || 1}
        onChange={event => setInputPageNumber(event.currentTarget.value)}
        onKeyDownCapture={event => {
          if (event.key === "Enter") {
            submitPageNumber()
          }
        }}
      />
      <span className={classes.pageTotal}>/ {pageTotal}</span>
    </Group>
  )
}
