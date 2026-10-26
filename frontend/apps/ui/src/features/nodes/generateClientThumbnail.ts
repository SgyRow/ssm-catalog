import {
  getBlobViewerCategory,
  getFileExtension
} from "@/features/document/documentPreview"
import {generatePreview} from "@/utils/pdf"
import {rtfToPlainText} from "@/utils/rtfToPlainText"
import {renderAsync} from "docx-preview"
import html2canvas from "html2canvas"

const RASTER_IMAGE_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif",
  ".tif",
  ".tiff"
])

function captureVideoFrame(
  file: File,
  maxWidth: number
): Promise<string | null> {
  return new Promise(resolve => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    const url = URL.createObjectURL(file)
    video.src = url

    const cleanup = () => {
      URL.revokeObjectURL(url)
    }

    video.onerror = () => {
      cleanup()
      resolve(null)
    }

    video.onloadeddata = () => {
      try {
        const t =
          video.duration > 0 && Number.isFinite(video.duration)
            ? Math.min(0.25, video.duration * 0.05)
            : 0.1
        video.currentTime = t
      } catch {
        cleanup()
        resolve(null)
      }
    }

    video.onseeked = () => {
      try {
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) {
          cleanup()
          resolve(null)
          return
        }
        const scale = maxWidth / w
        const canvas = document.createElement("canvas")
        canvas.width = maxWidth
        canvas.height = Math.max(1, Math.round(h * scale))
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          cleanup()
          resolve(null)
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(b => {
          cleanup()
          resolve(b ? URL.createObjectURL(b) : null)
        }, "image/png")
      } catch {
        cleanup()
        resolve(null)
      }
    }
  })
}

function audioPlaceholder(
  maxWidth: number,
  maxHeight: number
): Promise<string | null> {
  const canvas = document.createElement("canvas")
  canvas.width = maxWidth
  canvas.height = maxHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return Promise.resolve(null)
  }
  const g = ctx.createLinearGradient(0, 0, maxWidth, maxHeight)
  g.addColorStop(0, "#4c6ef5")
  g.addColorStop(1, "#7950f2")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, maxWidth, maxHeight)
  ctx.fillStyle = "white"
  ctx.font = "bold 15px system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("Audio", maxWidth / 2, maxHeight / 2)
  return new Promise(resolve => {
    canvas.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), "image/png")
  })
}

async function captureTextThumbnail(
  file: File,
  maxWidth: number,
  maxHeight: number
): Promise<string | null> {
  const slice = file.slice(0, 24_000)
  let text = await slice.text()
  if (getFileExtension(file.name) === ".rtf") {
    text = rtfToPlainText(text)
  }
  const canvas = document.createElement("canvas")
  canvas.width = maxWidth
  canvas.height = maxHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return null
  }
  ctx.fillStyle = "#f1f3f5"
  ctx.fillRect(0, 0, maxWidth, maxHeight)
  ctx.fillStyle = "#212529"
  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace"
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  let y = 18
  const lineHeight = 15
  const maxLines = Math.max(1, Math.floor((maxHeight - 20) / lineHeight))
  for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
    ctx.fillText(lines[i].slice(0, 72), 8, y)
    y += lineHeight
  }
  return new Promise(resolve => {
    canvas.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), "image/png")
  })
}

async function thumbnailFromDocx(
  file: File,
  maxWidth: number
): Promise<string | null> {
  const host = document.createElement("div")
  host.style.cssText =
    "position:fixed;left:-20000px;top:0;width:720px;max-height:2400px;overflow:hidden;visibility:hidden;pointer-events:none"
  document.body.appendChild(host)
  try {
    const buf = await file.arrayBuffer()
    await renderAsync(buf, host, undefined, {
      className: "docx-node-thumb",
      inWrapper: true,
      breakPages: true,
      ignoreFonts: true
    })
    const section =
      host.querySelector("section.docx-node-thumb") ||
      host.querySelector(".docx-node-thumb-wrapper")
    const target = (section || host) as HTMLElement
    const canvas = await html2canvas(target, {
      scale: 1,
      useCORS: true,
      logging: false,
      width: Math.min(target.scrollWidth, 720),
      height: Math.min(target.scrollHeight, 1200)
    })
    const out = document.createElement("canvas")
    const tw = canvas.width
    const th = canvas.height
    if (!tw || !th) {
      return null
    }
    out.width = maxWidth
    out.height = Math.max(1, Math.round((th * maxWidth) / tw))
    const octx = out.getContext("2d")
    if (!octx) {
      return null
    }
    octx.drawImage(canvas, 0, 0, out.width, out.height)
    return new Promise(resolve => {
      out.toBlob(b => resolve(b ? URL.createObjectURL(b) : null), "image/png")
    })
  } catch (e) {
    console.error("DOCX thumbnail failed", e)
    return null
  } finally {
    host.remove()
  }
}

/**
 * Best-effort preview image for commander right after upload (before server thumbnail).
 */
export async function generateNodeThumbnailFromFile(
  file: File
): Promise<string | null> {
  const ext = getFileExtension(file.name)
  try {
    if (ext === ".pdf") {
      return await generatePreview({file, width: 300, pageNumber: 1})
    }
    if (RASTER_IMAGE_EXT.has(ext)) {
      return URL.createObjectURL(file)
    }

    const cat = getBlobViewerCategory(file.name)
    if (cat === "video") {
      return await captureVideoFrame(file, 300)
    }
    if (cat === "audio") {
      return await audioPlaceholder(300, 200)
    }
    if (cat === "docx") {
      return await thumbnailFromDocx(file, 300)
    }
    if (cat === "text" || cat === "html" || cat === "rtf") {
      return await captureTextThumbnail(file, 300, 200)
    }
  } catch (e) {
    console.error("generateNodeThumbnailFromFile", e)
  }
  return null
}
