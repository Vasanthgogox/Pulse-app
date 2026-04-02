# Driver avatar icons

This folder contains the 10 preset driver avatars used in the driver app (profile picker and signup).

- **Current files:** `driver-1.png` … `driver-10.png` are placeholders (minimal 1×1 PNGs).
- **Replace with your icons:** Overwrite these files with your cartoon driver images (same names), or use the script below to generate them from a JSON export.

## Generating from JSON (optional)

If you have a JSON file with an `assets` array where each item has `dataUrl` (base64) and `fileName`:

1. Save that JSON as `driver-icons.json` in the project root.
2. Run: `node scripts/save-driver-icons.js`
3. The script writes each `dataUrl` as a PNG into this folder using `fileName`.
