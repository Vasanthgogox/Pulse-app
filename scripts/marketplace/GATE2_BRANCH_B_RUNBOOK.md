# Gate 2 — Branch B QA runbook

**Goal:** Branch B (campaign snapshot while post projection is inactive) must look like a normal commercial opportunity, plus Sponsored treatment.

## 1. List candidates

```bash
supabase db query --linked -o table -f scripts/marketplace/gate2_list_branch_b_candidates.sql
```

Pick a row with `indent_open = true`, `has` snapshot price, `post_active = true`.

## 2. Force Branch B

Edit `scripts/marketplace/gate2_force_branch_b.sql` — set the `post_id` uuid — then:

```bash
supabase db query --linked -o table -f scripts/marketplace/gate2_force_branch_b.sql
```

This sets `posts.is_active = false` only. Campaign stays `active`; indent stays open.

## 3. Validate in the app (product walkthrough)

Use a Reach-eligible supplier org. Check the **same** opportunity on three surfaces:

1. **Feed card**  
2. **Story Detail**  
3. **Bid Sheet**

| Check | Feed | Story Detail | Bid Sheet |
|-------|:----:|:------------:|:---------:|
| Sponsored badge | ⬜ | ⬜ | — |
| Target price shown (not —) | ⬜ | ⬜ | ⬜ |
| Lane (pickup / destination) | ⬜ | ⬜ | ⬜ |
| Material | ⬜ | ⬜ | ⬜ |
| Vehicle | ⬜ | ⬜ | ⬜ |
| Bid CTA enabled | ⬜ | ⬜ | ⬜ |
| Commercial info identical across surfaces | ⬜ | ⬜ | ⬜ |
| Bid submission succeeds | — | — | ⬜ |
| Award → opportunity removed | ⬜ | ⬜ | — |

**Fail examples (never ship):** Sponsored + Price — ; Sponsored + price but no Bid while indent open; Feed price ≠ Story Detail price.

## 4. Restore

```bash
# same post_id in gate2_restore_post.sql
supabase db query --linked -o table -f scripts/marketplace/gate2_restore_post.sql
```

## 5. Sign Gate 2

Update `docs/MARKETPLACE_P0_VALIDATION.md` Gate 2 → ✅ when the table above is complete.
