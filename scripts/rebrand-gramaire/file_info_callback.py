import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from rebrand_logic import rewrite_text


def file_info_callback(filename, mode, blob_id, value):
    path = filename.decode("utf-8", "surrogateescape")
    contents = value.get_contents_by_identifier(blob_id)
    if not contents:
        return filename, mode, blob_id
    if value.is_binary(contents):
        return filename, mode, blob_id
    rewritten = rewrite_text(contents, path)
    if rewritten == contents:
        return filename, mode, blob_id
    return filename, mode, value.insert_file_with_contents(rewritten)
