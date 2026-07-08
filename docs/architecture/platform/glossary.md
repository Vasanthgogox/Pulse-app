# Pulse Platform — Glossary

| Term | Meaning |
|---|---|
| Platform | The Pulse ecosystem — identity, workspace, products, and the shared services connecting them |
| Workspace | The operating boundary and owner of all business data |
| Product | A business capability (Core, Commerce, Finance, POD, Fleet, etc.) — not an independent application |
| Experience | A UI optimized for a persona or device within a product (Desktop, Driver Mobile, Warehouse Scanner, Customer Portal, etc.) |
| Module | A functional area inside a product |
| Feature | An individual capability |
| Entity | Shared business data owned by the Workspace |
| Product Registry | The canonical, declarative list of every product and its metadata (`08-product-registry.md`) |
| Adapter | A thin compatibility layer letting an existing file (e.g. `suiteProducts.ts`) keep its external API unchanged while delegating to the new canonical registry underneath |
| Pulse Home | The post-login landing surface, and the user's starting point in Pulse — launches directly if one product is available, shows a home surface (products, activity, alerts, etc.) if more than one |

See also `docs/architecture/glossary.md` (Transport Work's glossary) — Transport Work is domain architecture that operates *inside* products (Core, Pilot) under these same Platform rules; the two glossaries describe different layers and are not expected to merge.
