# Transport Work — Glossary

| Term | Meaning |
|---|---|
| Transport Work | Business request to move freight — the aggregate root |
| Trip | The operational execution instance of a Transport Work |
| Request | The stage capturing that freight needs to move |
| Planning | The stage defining how the shipment should move |
| Capacity | The stage where capacity is secured — the only stage that branches |
| Capacity Strategy | The method by which capacity is acquired (Manual, Direct Supplier, Marketplace, API, ERP, AI) |
| Dispatch | Commitment of driver and vehicle to a Transport Work |
| Execution | The stage where freight is physically moving |
| Delivery | Confirmation that the shipment arrived, via POD |
| Settlement | Financial closure — Invoice, Supplier Bill, and Transaction all resolve |
| Customer | The party requesting freight movement |
| Supplier | A party who can be assigned or awarded capacity |
| Driver | The individual operating a vehicle |
| Vehicle | The physical asset moving goods |
| Invoice | The receivable document owed by a Customer |
| Supplier Bill | The payable document owed to a Supplier |
| Transaction | A ledger entry recording actual money movement |
| POD | Proof of Delivery |
| Aggregate Root | The object (Transport Work) that owns the lifecycle of every operational artifact created during execution |
