import "@/utils/pdf"
import SelectablePdfPage from "@/features/document/components/Page/SelectablePdfPage"
import {fileManager} from "@/features/files/fileManager"
import {MantineProvider} from "@mantine/core"
import "@mantine/core/styles.css"
import {useEffect, useState} from "react"
import {createRoot} from "react-dom/client"
import {Zoom} from "viewer"

const params = new URLSearchParams(window.location.search)
const mode = params.get("mode") ?? "canvas"
const scenario = params.get("scenario")

const PLACEHOLDER_IMG =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="

/** Same docVer for searchable PDF; different docVer with no buffer → gate "off" + raster preview (like scanned PDF). */
const DOC_SEARCHABLE = "probe-doc-switch-searchable"
const DOC_SCANNED_PLACEHOLDER = "probe-doc-switch-scanned"

/**
 * Mirrors PageContainer’s `SelectablePdfPage` staying mounted while `docVerId` changes
 * (e.g. open searchable PDF → open scanned/non-text PDF → same searchable PDF again).
 * Intentionally no `key` on `SelectablePdfPage` so React reuses one instance.
 */
const DOC_REMOUNT = "probe-doc-remount-searchable"

/**
 * Mirrors `PageContainer` swapping `SelectablePdfPage` for `BlobMediaPage` (or similar):
 * full unmount of `SelectablePdfPage`, then mount again for the same PDF buffer.
 */
function RemountProbe() {
  const [phase, setPhase] = useState<"pdf" | "blob">("pdf")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      fileManager.clear()
      const res = await fetch("/basicapi.pdf")
      if (!res.ok) {
        throw new Error(`Fixture fetch failed: ${res.status}`)
      }
      const buffer = await res.arrayBuffer()
      if (cancelled) {
        return
      }
      fileManager.store({buffer, docVerID: DOC_REMOUNT})
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <MantineProvider>
      <div style={{width: 960, margin: "0 auto"}}>
        <div style={{display: "flex", gap: 8, marginBottom: 8}}>
          <button
            type="button"
            data-testid="probe-remount-pdf"
            onClick={() => setPhase("pdf")}
          >
            PDF (unmount/remount)
          </button>
          <button
            type="button"
            data-testid="probe-remount-blob"
            onClick={() => setPhase("blob")}
          >
            Blob-only placeholder
          </button>
        </div>
        {ready ? (
          phase === "pdf" ? (
            <SelectablePdfPage
              docVerId={DOC_REMOUNT}
              pageNumber={1}
              angle={0}
              zoomFactor={100}
              fallbackImageURL={PLACEHOLDER_IMG}
              isImageLoading={false}
            />
          ) : (
            <div className="page" style={{textAlign: "center"}}>
              <img
                alt=""
                src={PLACEHOLDER_IMG}
                style={{width: "100%", maxWidth: 640}}
              />
            </div>
          )
        ) : (
          <div data-testid="probe-loading">Loading fixture…</div>
        )}
      </div>
    </MantineProvider>
  )
}

function DocSwitchProbe() {
  const [active, setActive] = useState<"searchable" | "scanned">("searchable")
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      fileManager.clear()
      const res = await fetch("/basicapi.pdf")
      if (!res.ok) {
        throw new Error(`Fixture fetch failed: ${res.status}`)
      }
      const buffer = await res.arrayBuffer()
      if (cancelled) {
        return
      }
      fileManager.store({buffer, docVerID: DOC_SEARCHABLE})
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const docVerId = active === "searchable" ? DOC_SEARCHABLE : DOC_SCANNED_PLACEHOLDER

  return (
    <MantineProvider>
      <div style={{width: 960, margin: "0 auto"}}>
        <div style={{display: "flex", gap: 8, marginBottom: 8}}>
          <button
            type="button"
            data-testid="probe-show-searchable"
            onClick={() => setActive("searchable")}
          >
            Searchable PDF
          </button>
          <button
            type="button"
            data-testid="probe-show-scanned"
            onClick={() => setActive("scanned")}
          >
            No buffer / image preview
          </button>
        </div>
        {ready ? (
          <SelectablePdfPage
            docVerId={docVerId}
            pageNumber={1}
            angle={0}
            zoomFactor={100}
            fallbackImageURL={PLACEHOLDER_IMG}
            isImageLoading={false}
          />
        ) : (
          <div data-testid="probe-loading">Loading fixture…</div>
        )}
      </div>
    </MantineProvider>
  )
}

function ZoomControlsProbe() {
  const [currentPage, setCurrentPage] = useState(2)
  const [submittedPage, setSubmittedPage] = useState(0)
  const [zoomInCount, setZoomInCount] = useState(0)
  const [zoomOutCount, setZoomOutCount] = useState(0)
  const [zoomResetCount, setZoomResetCount] = useState(0)

  return (
    <MantineProvider>
      <div style={{width: 960, margin: "0 auto", paddingTop: 16}}>
        <Zoom
          pageNumber={currentPage}
          pageTotal={9}
          onZoomInClick={() => setZoomInCount(value => value + 1)}
          onZoomOutClick={() => setZoomOutCount(value => value + 1)}
          onFitClick={() => setZoomResetCount(value => value + 1)}
          onPageNumberSubmit={value => {
            setCurrentPage(value)
            setSubmittedPage(value)
          }}
        />
        <div data-testid="probe-current-page">{currentPage}</div>
        <div data-testid="probe-submitted-page">{submittedPage}</div>
        <div data-testid="probe-zoom-in-count">{zoomInCount}</div>
        <div data-testid="probe-zoom-out-count">{zoomOutCount}</div>
        <div data-testid="probe-zoom-reset-count">{zoomResetCount}</div>
      </div>
    </MantineProvider>
  )
}

async function bootLegacy() {
  fileManager.clear()

  const docVerId =
    mode === "canvas" ? "probe-canvas-ver" : "probe-fallback-img-ver"

  if (mode === "canvas") {
    const res = await fetch("/basicapi.pdf")
    if (!res.ok) {
      throw new Error(`Fixture fetch failed: ${res.status}`)
    }
    const buffer = await res.arrayBuffer()
    fileManager.store({buffer, docVerID: docVerId})
  }

  const rootEl = document.getElementById("root")
  if (!rootEl) {
    throw new Error("missing #root")
  }

  createRoot(rootEl).render(
    <MantineProvider>
      <div style={{width: 960, margin: "0 auto"}}>
        <SelectablePdfPage
          docVerId={docVerId}
          pageNumber={1}
          angle={0}
          zoomFactor={100}
          fallbackImageURL={
            mode === "fallback-img" ? PLACEHOLDER_IMG : undefined
          }
          isImageLoading={false}
        />
      </div>
    </MantineProvider>
  )
}

async function boot() {
  const rootEl = document.getElementById("root")
  if (!rootEl) {
    throw new Error("missing #root")
  }

  if (scenario === "doc-switch") {
    createRoot(rootEl).render(<DocSwitchProbe />)
    return
  }

  if (scenario === "doc-switch-remount") {
    createRoot(rootEl).render(<RemountProbe />)
    return
  }

  if (scenario === "zoom-controls") {
    createRoot(rootEl).render(<ZoomControlsProbe />)
    return
  }

  await bootLegacy()
}

void boot()
