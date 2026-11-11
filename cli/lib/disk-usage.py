#!/usr/bin/env python3
"""Logical and physical size of files and folders, clone-aware on APFS (used by `walkthrough clean`).

    python3 -I cli/lib/disk-usage.py <path> [<path> ...]

Prints one JSON object: {"apfs": bool, "items": {<path>: usage}} where usage is

    {"exists", "files", "logical", "allocated", "private", "unknownShared", "families": {<cloneid>: [shared, refcnt, count]}}

logical    sum of file sizes (what Finder and `ls` show; clones each count in full)
allocated  sum of allocated blocks (what `du` shows; on APFS clones each still count in full)
private    bytes no other file shares (APFS ATTR_CMNEXT_PRIVATESIZE): what removing the file frees
           for certain. Without APFS it equals allocated.
families   clone groups (ATTR_CMNEXT_CLONEID, ATTR_CMNEXT_CLONE_REFCNT): for files that are clones of
           each other, the shared bytes, how many files on the volume share them (refcnt) and how many
           of those were seen under this path (count). The shared bytes are freed only when every
           member goes.
unknownShared  bytes a file shares with a clone that was modified since (it left the clone group):
           counted as neither on disk here nor freed.

Symlinks are never followed; a hard-linked file's blocks are counted once.
"""
import json
import os
import stat
import struct
import sys

APFS = False
_getattrlist = None
if sys.platform == "darwin":
    try:
        import ctypes
        import ctypes.util

        _libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)

        class _AttrList(ctypes.Structure):
            _fields_ = [
                ("bitmapcount", ctypes.c_ushort),
                ("reserved", ctypes.c_uint16),
                ("commonattr", ctypes.c_uint32),
                ("volattr", ctypes.c_uint32),
                ("dirattr", ctypes.c_uint32),
                ("fileattr", ctypes.c_uint32),
                ("forkattr", ctypes.c_uint32),
            ]

        ATTR_CMN_RETURNED_ATTRS = 0x80000000
        ATTR_CMNEXT_PRIVATESIZE = 0x00000008
        ATTR_CMNEXT_CLONEID = 0x00000100
        ATTR_CMNEXT_CLONE_REFCNT = 0x00001000
        FSOPT_NOFOLLOW = 0x00000001
        FSOPT_ATTR_CMN_EXTENDED = 0x00000020
        _WANT = ATTR_CMNEXT_PRIVATESIZE | ATTR_CMNEXT_CLONEID | ATTR_CMNEXT_CLONE_REFCNT

        def _getattrlist(path):
            """(private, cloneid, refcnt) for a regular file, or None when the volume does not say."""
            al = _AttrList(5, 0, ATTR_CMN_RETURNED_ATTRS, 0, 0, 0, _WANT)
            buf = ctypes.create_string_buffer(64)
            if _libc.getattrlist(os.fsencode(path), ctypes.byref(al), buf, 64, FSOPT_NOFOLLOW | FSOPT_ATTR_CMN_EXTENDED) != 0:
                return None
            raw = buf.raw
            returned = struct.unpack_from("5I", raw, 4)[4]
            if not returned & ATTR_CMNEXT_PRIVATESIZE:
                return None
            off = 24
            private = struct.unpack_from("q", raw, off)[0]
            off += 8
            cloneid = refcnt = None
            if returned & ATTR_CMNEXT_CLONEID:
                cloneid = struct.unpack_from("Q", raw, off)[0]
                off += 8
            if returned & ATTR_CMNEXT_CLONE_REFCNT:
                refcnt = struct.unpack_from("I", raw, off)[0]
            return private, cloneid, refcnt
    except Exception:  # no ctypes, no libc: plain sizes
        _getattrlist = None


def usage(top, seen):
    global APFS
    u = {"exists": False, "files": 0, "logical": 0, "allocated": 0, "private": 0, "unknownShared": 0, "families": {}}
    try:
        st0 = os.lstat(top)
    except OSError:
        return u
    u["exists"] = True

    def add(path, st):
        global APFS
        if stat.S_ISDIR(st.st_mode):
            blocks = st.st_blocks * 512
            u["allocated"] += blocks
            u["private"] += blocks
            return
        u["files"] += 1
        u["logical"] += st.st_size
        key = (st.st_dev, st.st_ino)
        if st.st_nlink > 1:
            if key in seen:
                return
            seen.add(key)
        alloc = st.st_blocks * 512
        u["allocated"] += alloc
        info = _getattrlist(path) if (_getattrlist and stat.S_ISREG(st.st_mode)) else None
        if info is None:
            u["private"] += alloc
            return
        APFS = True
        private, cloneid, refcnt = info
        private = max(0, min(private, alloc))
        u["private"] += private
        shared = alloc - private
        if shared <= 0:
            return
        if refcnt and refcnt > 1 and cloneid is not None:
            fam = u["families"].setdefault(str(cloneid), [shared, refcnt, 0])
            fam[2] += 1
        else:
            u["unknownShared"] += shared

    if not stat.S_ISDIR(st0.st_mode):
        add(top, st0)
        return u
    add(top, st0)
    for root, dirs, files in os.walk(top, followlinks=False):
        for name in dirs + files:
            p = os.path.join(root, name)
            try:
                st = os.lstat(p)
            except OSError:
                continue
            if stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode):
                # the folder's own blocks; its contents come with the walk
                blocks = st.st_blocks * 512
                u["allocated"] += blocks
                u["private"] += blocks
            else:
                add(p, st)
    return u


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0 if argv else 2
    seen = set()
    items = {p: usage(p, seen) for p in argv}
    print(json.dumps({"apfs": APFS, "items": items}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
