import { type Page, type Locator, expect } from '@playwright/test';

export interface ClientData {
  orgName?: string;
  contactName: string;
  phone: string;
}

export interface SupplierData {
  companyName?: string;
  contactName: string;
  phone: string;
}

export interface DriverData {
  name: string;
  phone: string;
  dl: string;
  email?: string;
}

export interface VehicleData {
  reg: string;
  category: string;
  /** Pass a preset label to pick from the picker, or any string if using Other mode */
  model: string;
  capacity: string;
  /** Pass a preset label to pick from picker, or a custom string to type manually */
  bodyLength: string;
  axle?: string;
}

export class PartyPortalPage {
  readonly continueBtn: Locator;
  readonly saveBtn: Locator;
  readonly editDetailsBtn: Locator;
  readonly formError: Locator;
  readonly closeBtn: Locator;

  // Client / Supplier fields
  readonly orgNameInput: Locator;
  readonly contactNameInput: Locator;
  readonly phoneInput: Locator;
  readonly addOfflineBtn: Locator;

  // Driver fields
  readonly driverNameInput: Locator;
  readonly driverPhoneInput: Locator;
  readonly driverDlInput: Locator;
  readonly driverEmailInput: Locator;
  readonly driverAddOfflineBtn: Locator;

  // Vehicle fields
  readonly vehicleRegInput: Locator;
  readonly vehicleCapacityInput: Locator;
  readonly vehicleModelPicker: Locator;
  readonly vehicleModelInput: Locator;
  readonly vehicleBodyPicker: Locator;
  readonly vehicleBodyInput: Locator;
  readonly vehicleAxleInput: Locator;

  constructor(private readonly page: Page) {
    this.continueBtn = page.getByTestId('party-continue-btn');
    this.saveBtn = page.getByTestId('party-save-btn');
    this.editDetailsBtn = page.getByTestId('party-edit-details-btn');
    this.formError = page.getByTestId('party-form-error');
    this.closeBtn = page.getByTestId('party-close-btn');

    this.orgNameInput = page.getByTestId('party-org-name-input');
    this.contactNameInput = page.getByTestId('party-contact-name-input');
    this.phoneInput = page.getByTestId('party-phone-input');
    this.addOfflineBtn = page.getByTestId('party-add-offline-btn');

    this.driverNameInput = page.getByTestId('party-driver-name-input');
    this.driverPhoneInput = page.getByTestId('party-driver-phone-input');
    this.driverDlInput = page.getByTestId('party-driver-dl-input');
    this.driverEmailInput = page.getByTestId('party-driver-email-input');
    this.driverAddOfflineBtn = page.getByTestId('party-driver-add-offline-btn');

    this.vehicleRegInput = page.getByTestId('party-vehicle-reg-input');
    this.vehicleCapacityInput = page.getByTestId('party-vehicle-capacity-input');
    this.vehicleModelPicker = page.getByTestId('party-vehicle-model-picker');
    this.vehicleModelInput = page.getByTestId('party-vehicle-model-input');
    this.vehicleBodyPicker = page.getByTestId('party-vehicle-body-picker');
    this.vehicleBodyInput = page.getByTestId('party-vehicle-body-input');
    this.vehicleAxleInput = page.getByTestId('party-vehicle-axle-input');
  }

  async waitForForm(): Promise<void> {
    await this.continueBtn.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async fillClient(data: ClientData): Promise<void> {
    if (data.orgName) await this.orgNameInput.fill(data.orgName);
    await this.contactNameInput.fill(data.contactName);
    await this.phoneInput.fill(data.phone);
  }

  async fillSupplier(data: SupplierData): Promise<void> {
    if (data.companyName) await this.orgNameInput.fill(data.companyName);
    await this.contactNameInput.fill(data.contactName);
    await this.phoneInput.fill(data.phone);
  }

  async fillDriver(data: DriverData): Promise<void> {
    await this.driverNameInput.fill(data.name);
    await this.driverPhoneInput.fill(data.phone);
    await this.driverDlInput.fill(data.dl);
    if (data.email) await this.driverEmailInput.fill(data.email);
  }

  async fillVehicle(data: VehicleData): Promise<void> {
    await this.vehicleRegInput.fill(data.reg);
    await this.page.getByTestId(`party-vehicle-category-${data.category}`).click();

    // Model: use "Other" mode (type manually) to avoid picker modal complexity
    if (await this.vehicleModelPicker.isVisible()) {
      // Open picker
      await this.vehicleModelPicker.click();
      // Look for "Other — type manually" option in the picker sheet
      const otherOption = this.page.locator('text=/Other.*type manually/i').first();
      await otherOption.waitFor({ state: 'visible', timeout: 5_000 });
      await otherOption.click();
      // Now model text input should be visible
      await this.vehicleModelInput.waitFor({ state: 'visible', timeout: 3_000 });
    }
    await this.vehicleModelInput.fill(data.model);

    await this.vehicleCapacityInput.fill(data.capacity);

    // Body length: open picker and select "Other — type manually"
    if (await this.vehicleBodyPicker.isVisible()) {
      await this.vehicleBodyPicker.click();
      const otherOption = this.page.locator('text=/Other.*type manually/i').first();
      await otherOption.waitFor({ state: 'visible', timeout: 5_000 });
      await otherOption.click();
      await this.vehicleBodyInput.waitFor({ state: 'visible', timeout: 3_000 });
    }
    await this.vehicleBodyInput.fill(data.bodyLength);

    if (data.axle) await this.vehicleAxleInput.fill(data.axle);
  }

  async continue(): Promise<void> {
    await this.continueBtn.click();
  }

  async save(): Promise<void> {
    await this.saveBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await this.saveBtn.click();
  }

  async getErrorText(): Promise<string> {
    await this.formError.waitFor({ state: 'visible', timeout: 8_000 });
    return (await this.formError.textContent()) ?? '';
  }

  async expectError(text: string | RegExp): Promise<void> {
    await expect(this.formError).toBeVisible({ timeout: 8_000 });
    await expect(this.formError).toContainText(text);
  }

  /** After a successful save the portal closes and the URL changes away from the add-* route. */
  async expectClosed(timeout = 15_000): Promise<void> {
    await expect(this.page).not.toHaveURL(/\/(add-client|add-supplier|add-driver|add-vehicle)/, { timeout });
  }
}
