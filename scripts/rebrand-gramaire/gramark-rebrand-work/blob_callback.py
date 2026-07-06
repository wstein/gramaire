import importlib.util

spec = importlib.util.spec_from_file_location('rebrand_logic', r'/Users/werner/github.com/wstein/gramark-berta/scripts/rebrand-gramaire/rebrand_logic.py')
rebrand_logic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rebrand_logic)


def callback(blob, metadata=None):
    if not blob.data:
        return
    if b'\0' in blob.data[:8192]:
        return
    path = metadata.get('path') if metadata else None
    if path is None:
        path = metadata.get('filename') if metadata else None
    if path is None:
        path = b''
    if isinstance(path, bytes):
        path = path.decode('utf-8', 'surrogateescape')
    rewritten = rebrand_logic.rewrite_text(blob.data, path)
    if rewritten != blob.data:
        blob.data = rewritten
