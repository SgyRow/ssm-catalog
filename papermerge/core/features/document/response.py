from pathlib import Path
import mimetypes
import re
from urllib.parse import quote

from fastapi.responses import FileResponse

# Chrome treats a raw comma in Content-Disposition as a second header and
# aborts the request with ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION.
# Keep the ASCII fallback conservative; the original name goes in filename*.
_ASCII_FILENAME_RE = re.compile(r"[^A-Za-z0-9._()\[\] -]+")


def content_disposition_header(disposition_type: str, filename: str) -> str:
    kind = "inline" if disposition_type == "inline" else "attachment"
    ascii_name = filename.encode("ascii", "ignore").decode("ascii")
    ascii_name = _ASCII_FILENAME_RE.sub("_", ascii_name)
    ascii_name = re.sub(r"[ _]+", " ", ascii_name).strip(" ._") or "download"
    encoded = quote(filename, safe="")
    return f"{kind}; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded}"


class DocumentFileResponse(FileResponse):
    def __init__(self, path, filename: str = None, content_disposition_type: str = "attachment", **kwargs):
        # Auto-detect content type from path, then from the logical file name.
        content_type, _ = mimetypes.guess_type(path)
        if not content_type and filename:
            content_type, _ = mimetypes.guess_type(filename)
        if not content_type:
            extension = Path(path).suffix.lower() or (
                Path(filename).suffix.lower() if filename else ""
            )
            content_type_map = {
                '.pdf': 'application/pdf',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.tiff': 'image/tiff',
                '.tif': 'image/tiff',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.txt': 'text/plain',
                '.html': 'text/html',
                '.htm': 'text/html',
                '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                '.doc': 'application/msword',
            }
            content_type = content_type_map.get(extension, 'application/octet-stream')

        # If no filename provided, use the file's name
        if filename is None:
            filename = Path(path).name

        headers = dict(kwargs.get('headers') or {})
        headers['Content-Disposition'] = content_disposition_header(
            content_disposition_type, filename
        )
        kwargs['headers'] = headers

        # Do not pass filename: Starlette would add another Content-Disposition.
        super().__init__(
            path=path,
            media_type=content_type,
            **kwargs
        )
