// Suggested daily targets from height/weight/age/goal (the user can edit them).
// Mifflin-St Jeor for calories; protein in g per kg of a sensible reference weight.
export type Goal = 'cut' | 'maintain' | 'bulk' | 'glp1';
export type Sex = 'male' | 'female' | 'other';
export type Activity = 'low' | 'moderate' | 'high';

export function suggestTargets(i: { sex: Sex; age: number; heightCm: number; weightKg: number; activity: Activity; goal: Goal }) {
  const s = i.sex === 'male' ? 5 : i.sex === 'female' ? -161 : -78;
  const bmr = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age + s;
  const tdee = bmr * { low: 1.375, moderate: 1.55, high: 1.725 }[i.activity];
  const goalFactor = { cut: 0.8, maintain: 1, bulk: 1.1, glp1: 0.8 }[i.goal];
  const floor = i.sex === 'male' ? 1500 : 1200;
  const calories = Math.round(Math.max(floor, tdee * goalFactor) / 10) * 10;

  // for higher body weights, base protein on the weight at BMI 25 so numbers stay realistic
  const h = i.heightCm / 100;
  const refWeight = Math.min(i.weightKg, 25 * h * h);
  const perKg = { cut: 2.0, maintain: 1.6, bulk: 1.8, glp1: 1.6 }[i.goal];
  const protein = Math.round(Math.min(250, Math.max(60, refWeight * perKg)) / 5) * 5;
  return { calories, protein };
}

export const lbToKg = (lb: number) => lb * 0.45359237;
export const kgToLb = (kg: number) => kg / 0.45359237;
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;
