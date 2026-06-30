# @pulse/platform-command-store

**Sprint 3** — Full command lifecycle per [COMMAND_ENVELOPE.md](../../oms/docs/contracts/COMMAND_ENVELOPE.md).

Implement **stale timeout worker from day one:**

```
PROCESSING → STALE → RETRYING → COMPLETED | FAILED
```

Replay returns stored `responsePayload` from `COMPLETED`.
