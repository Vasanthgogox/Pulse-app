import type { IdentitySupabase } from '../db/client';
import { platformSchema } from '../db/client';

export class BusinessUnitRepository {
  constructor(private readonly db: IdentitySupabase) {}

  async findCodeByInternalId(id: string): Promise<string | null> {
    const { data, error } = await platformSchema(this.db)
      .from('business_units')
      .select('code')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle<{ code: string }>();
    if (error) throw error;
    return data?.code ?? null;
  }

  async findInternalIdByUnitCode(organizationInternalId: string, unitCode: string): Promise<string | null> {
    const { data, error } = await platformSchema(this.db)
      .from('business_units')
      .select('id')
      .eq('organization_id', organizationInternalId)
      .eq('unit_code', unitCode)
      .is('deleted_at', null)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    return data?.id ?? null;
  }
}
