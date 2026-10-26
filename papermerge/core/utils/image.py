import logging
import os
import shutil
import subprocess
from pathlib import Path
from uuid import UUID

import imageio_ffmpeg
from pdf2image import convert_from_path
from PIL import Image, ImageDraw, ImageFont

from papermerge.core import constants as const
from papermerge.core import pathlib as core_pathlib
from papermerge.core.types import ImagePreviewSize
from papermerge.core import config

settings = config.get_settings()

# Blob uploads the UI treats as video (see frontend documentPreview.ts)
VIDEO_FILE_EXTENSIONS = frozenset(
    {
        ".mp4",
        ".webm",
        ".ogg",
        ".ogv",
        ".mov",
        ".m4v",
        ".mkv",
    }
)

AUDIO_FILE_EXTENSIONS = frozenset(
    {
        ".mp3",
        ".wav",
        ".oga",
        ".opus",
        ".m4a",
        ".aac",
        ".flac",
    }
)

# Text / code / markup — preview as monospace snippet (frontend documentPreview.ts)
TEXT_SNIPPET_EXTENSIONS = frozenset(
    {
        ".txt",
        ".text",
        ".md",
        ".markdown",
        ".csv",
        ".tsv",
        ".json",
        ".xml",
        ".log",
        ".ini",
        ".env",
        ".yml",
        ".yaml",
        ".css",
        ".scss",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".py",
        ".sh",
        ".bat",
        ".c",
        ".h",
        ".cpp",
        ".hpp",
        ".java",
        ".go",
        ".rs",
        ".sql",
        ".html",
        ".htm",
    }
)

# Raster images stored as blob (not PDF); resize for thumbnail
RASTER_IMAGE_EXTENSIONS = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".bmp",
        ".svg",
        ".avif",
        ".tif",
        ".tiff",
    }
)

PREVIEW_IMAGE_MAP = {
    # size name        : size in pixels
    ImagePreviewSize.sm: settings.papermerge__preview__page_size_sm,
}

logger = logging.getLogger(__name__)


def file_name_generator(size):
    yield str(size)


def _resolve_ffmpeg_exe() -> str:
    """Prefer system ``ffmpeg``; otherwise use ``imageio-ffmpeg``'s bundled binary."""
    system = shutil.which("ffmpeg")
    if system:
        return system
    return imageio_ffmpeg.get_ffmpeg_exe()


def _generate_video_frame_thumbnail(src: Path, out_jpg: Path, size_px: int) -> None:
    """One JPEG frame from a video file using ffmpeg."""
    try:
        ffmpeg = _resolve_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError(
            "Could not locate ffmpeg (install it on PATH or ensure the "
            "imageio-ffmpeg package can provide its bundled binary)."
        ) from exc
    out_jpg.parent.mkdir(parents=True, exist_ok=True)

    def run(ss: str) -> None:
        cmd = [
            ffmpeg,
            "-y",
            "-loglevel",
            "error",
            "-ss",
            ss,
            "-i",
            str(src),
            "-an",
            "-vframes",
            "1",
            "-vf",
            f"scale={size_px}:-1",
            str(out_jpg),
        ]
        subprocess.run(cmd, check=True, capture_output=True)

    try:
        run("0.25")
    except subprocess.CalledProcessError:
        run("0")


def _placeholder_height(size_px: int) -> int:
    return max(48, int(size_px * 200 / 300))


def _ensure_thumbnail_parent(out_jpg: Path) -> None:
    out_jpg.parent.mkdir(parents=True, exist_ok=True)


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    windir = os.environ.get("WINDIR", r"C:\Windows")
    candidates = [
        Path(windir) / "Fonts" / "consola.ttf",
        Path(windir) / "Fonts" / "arial.ttf",
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _extension_badge(ext: str) -> str:
    e = ext.lower().lstrip(".")
    return (e or "file").upper()[:12]


def _save_jpeg(img: Image.Image, out_jpg: Path) -> None:
    _ensure_thumbnail_parent(out_jpg)
    img.convert("RGB").save(str(out_jpg), format="JPEG", quality=85)


def _generate_audio_placeholder_thumbnail(out_jpg: Path, size_px: int) -> None:
    w, h = size_px, _placeholder_height(size_px)
    img = Image.new("RGB", (w, h), "#4c6ef5")
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, h // 2, w, h], fill="#7950f2")
    font = _font(18)
    text = "Audio"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2, (h - th) / 2), text, fill="white", font=font)
    _save_jpeg(img, out_jpg)


def _generate_text_snippet_thumbnail(src: Path, out_jpg: Path, size_px: int) -> None:
    w, h = size_px, _placeholder_height(size_px)
    raw = src.read_bytes()[:24_000]
    text = raw.decode("utf-8", errors="replace")
    img = Image.new("RGB", (w, h), "#f1f3f5")
    draw = ImageDraw.Draw(img)
    font = _font(12)
    lines = text.replace("\r\n", "\n").split("\n")
    y = 14
    line_h = 15
    max_lines = max(1, (h - 20) // line_h)
    for i in range(min(max_lines, len(lines))):
        draw.text((8, y), lines[i][:72], fill="#212529", font=font)
        y += line_h
    _save_jpeg(img, out_jpg)


def _generate_raster_image_thumbnail(src: Path, out_jpg: Path, size_px: int) -> None:
    try:
        with Image.open(src) as im:
            im = im.convert("RGB")
            try:
                resample = Image.Resampling.LANCZOS
            except AttributeError:
                resample = Image.LANCZOS  # type: ignore[attr-defined]
            im.thumbnail((size_px, size_px * 3), resample)
            _ensure_thumbnail_parent(out_jpg)
            im.save(str(out_jpg), format="JPEG", quality=85)
    except OSError:
        _generate_generic_badge_thumbnail(
            out_jpg, size_px, _extension_badge(src.suffix)
        )


def _generate_generic_badge_thumbnail(
    out_jpg: Path, size_px: int, label: str
) -> None:
    w, h = size_px, _placeholder_height(size_px)
    img = Image.new("RGB", (w, h), "#495057")
    draw = ImageDraw.Draw(img)
    font = _font(16)
    bbox = draw.textbbox((0, 0), label, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((w - tw) / 2, (h - th) / 2), label, fill="#e9ecef", font=font)
    _save_jpeg(img, out_jpg)


def gen_doc_thumbnail(
    page_id: UUID,
    doc_ver_id: UUID,
    page_number: int,
    file_name: str,
    size: int = const.DEFAULT_THUMBNAIL_SIZE,
):
    """
    Writes the small (sm) JPG thumbnail for a document page.

    PDF: rasterize page ``page_number`` (Poppler / PyMuPDF). Video: ffmpeg frame.
    Audio, text/code, and raster images: Pillow-based thumbnails. Other blobs:
    generic badge. Non-PDF types must not use ``generate_preview`` (PDF-only).
    """
    thb_path = core_pathlib.abs_thumbnail_path(str(page_id))
    media_path = core_pathlib.abs_docver_path(str(doc_ver_id), file_name)
    ext = Path(file_name).suffix.lower()
    size_px = settings.papermerge__preview__page_size_sm

    if ext in VIDEO_FILE_EXTENSIONS:
        _generate_video_frame_thumbnail(media_path, thb_path, size_px=size_px)
        return

    if ext in AUDIO_FILE_EXTENSIONS:
        _generate_audio_placeholder_thumbnail(thb_path, size_px)
        return

    if ext in TEXT_SNIPPET_EXTENSIONS:
        _generate_text_snippet_thumbnail(media_path, thb_path, size_px)
        return

    if ext in RASTER_IMAGE_EXTENSIONS:
        _generate_raster_image_thumbnail(media_path, thb_path, size_px)
        return

    if ext == ".pdf":
        generate_preview(
            pdf_path=media_path,
            output_folder=thb_path.parent,
            page_number=page_number,
            size_px=size_px,
            size_name=ImagePreviewSize.sm.value,
        )
        return

    _generate_generic_badge_thumbnail(thb_path, size_px, _extension_badge(ext))


def _generate_preview_pymupdf(
    pdf_path: Path,
    out_jpg: Path,
    page_number: int,
    max_width_px: int,
) -> None:
    """Rasterize one PDF page to JPEG without external Poppler (Windows-friendly)."""
    import fitz

    doc = fitz.open(pdf_path)
    try:
        page = doc.load_page(page_number - 1)
        rect = page.rect
        if rect.width <= 0:
            raise ValueError("Invalid page width")
        zoom = max_width_px / rect.width
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(str(out_jpg), output="jpeg", jpg_quality=85)
    finally:
        doc.close()


def generate_preview(
    pdf_path: Path,
    output_folder: Path,
    size_px: int,
    size_name: str,
    page_number: int = 1,
):
    """Generate jpg thumbnail/preview images of PDF document"""
    kwargs = {
        "pdf_path": str(pdf_path),
        "output_folder": str(output_folder),
        "fmt": "jpg",
        "first_page": page_number,
        "last_page": page_number,
        "single_file": True,
        "size": (size_px, None),
        "output_file": file_name_generator(size_name),
    }

    output_folder.mkdir(exist_ok=True, parents=True)
    out_jpg = output_folder / f"{size_name}.jpg"

    try:
        convert_from_path(**kwargs)
    except Exception as poppler_exc:
        logger.warning(
            "pdf2image (Poppler) failed for %s: %s; using PyMuPDF fallback",
            pdf_path,
            poppler_exc,
        )
        try:
            _generate_preview_pymupdf(pdf_path, out_jpg, page_number, size_px)
        except Exception as pymupdf_exc:
            logger.warning(
                "PyMuPDF thumbnail generation failed for %s: %s",
                pdf_path,
                pymupdf_exc,
            )
            raise poppler_exc from pymupdf_exc
