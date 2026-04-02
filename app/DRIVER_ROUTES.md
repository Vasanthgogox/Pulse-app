# Driver-related routes (why two “driver” folders)

- **`app/(driver)/`** — **Driver app** (route group). When a user signs in with **role = driver**, the root index redirects to `/(driver)`. This folder contains the **driver-facing UI**: Radar, HUD, Logs, Fiscal, Pilot. The `(driver)` parentheses mean it does **not** add a path segment; the driver simply lands on the first screen of this layout.

- **`app/driver/`** — **Dispatcher / fleet view**. Used when someone in the main app (e.g. Resources > Drivers) opens a driver’s detail. The URL is **`/driver/[id]`** (e.g. `/driver/abc-123`). This is **not** the driver’s own app; it’s the “view driver” screen for admins/dispatchers.

So: one folder is “the app the driver uses,” the other is “the screen to view a driver by id.”
