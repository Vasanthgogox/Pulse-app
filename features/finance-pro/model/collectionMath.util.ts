export function ratioPct(numerator: number, denominator: number): number {
  if (!(denominator > 0) || !Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  return (numerator / denominator) * 100;
}
