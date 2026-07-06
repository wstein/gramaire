import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from rebrand_logic import rewrite_text


def blob_callback(blob, metadata=None):
    if not blob.data:
        return
    if b"\0" in blob.data[:8192]:
        return
    path = metadata.get("path") if metadata else None
    if path is None:
        path = metadata.get("filename") if metadata else None
    if path is None:
        path = b""
    if isinstance(path, bytes):
        path = path.decode("utf-8", "surrogateescape")
    rewritten = rewrite_text(blob.data, path)
    if rewritten != blob.data:
        blob.data = rewritten
