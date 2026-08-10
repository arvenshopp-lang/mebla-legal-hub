declare module "arabic-persian-reshaper" {
  type Shaper = { convertArabic(input: string): string };
  const reshaper: { ArabicShaper: Shaper; PersianShaper: Shaper };
  export default reshaper;
}
