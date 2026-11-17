// Onboarding + "Edit profile" share this form.
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { ALLERGY_OPTIONS, DIET_OPTIONS, GLP1_NOTE } from '@/lib/format';
import { ftInToCm, kgToLb, lbToKg, suggestTargets, type Activity, type Goal, type Sex } from '@/lib/targets';
import type { Profile } from '@/lib/types';
import { Banner, Button, Card, Chip, Field, Screen, T, colors, radius, space } from '@/ui';

const GOALS: { id: Goal; title: string; body: string }[] = [
  { id: 'cut', title: 'Lose fat', body: 'Calorie deficit, high protein to keep muscle.' },
  { id: 'maintain', title: 'Maintain', body: 'Stay where you are, eat well.' },
  { id: 'bulk', title: 'Build muscle', body: 'Small surplus, lots of protein.' },
  { id: 'glp1', title: 'GLP-1 mode', body: 'Smaller, protein-dense meals that are easy to eat.' },
];

const STEPS = ['Goal', 'About you', 'Targets', 'Diet', 'Cooking'] as const;
const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export function ProfileForm({ initial, onDone, submitLabel = 'Start cooking' }: { initial: Profile | null; onDone?: () => void; submitLabel?: string }) {
  const { session, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [units, setUnits] = useState<'us' | 'metric'>(initial?.units ?? 'us');
  const [goal, setGoal] = useState<Goal | null>(initial?.goal ?? null);
  const [sex, setSex] = useState<Sex | null>(initial?.sex ?? null);
  const [age, setAge] = useState(initial?.age ? String(initial.age) : '');
  const h = initial?.height_cm ?? null;
  const [heightCm, setHeightCm] = useState(h ? String(Math.round(h)) : '');
  const [ft, setFt] = useState(h ? String(Math.floor(h / 2.54 / 12)) : '');
  const [inch, setInch] = useState(h ? String(Math.round((h / 2.54) % 12)) : '');
  const w = initial?.weight_kg ?? null;
  const [weight, setWeight] = useState(w ? String(Math.round(units === 'us' ? kgToLb(w) : w)) : '');
  const [activity, setActivity] = useState<Activity>(initial?.activity ?? 'moderate');
  const [protein, setProtein] = useState(initial?.protein_target_g ? String(initial.protein_target_g) : '');
  const [calories, setCalories] = useState(initial?.calorie_target ? String(initial.calorie_target) : '');
  const [diet, setDiet] = useState<string[]>(initial?.diet ?? []);
  const [allergies, setAllergies] = useState<string[]>(initial?.allergies ?? []);
  const [skill, setSkill] = useState<Profile['skill']>(initial?.skill ?? 'beginner');
  const [minutes, setMinutes] = useState<number>(initial?.max_minutes ?? 30);
  const [suggested, setSuggested] = useState<{ protein: number; calories: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const body = useMemo(() => {
    const heightCmVal = units === 'us' ? ftInToCm(num(ft), num(inch) || 0) : num(heightCm);
    const weightKgVal = units === 'us' ? lbToKg(num(weight)) : num(weight);
    return { heightCm: heightCmVal, weightKg: weightKgVal, age: num(age) };
  }, [units, ft, inch, heightCm, weight, age]);

  // keep what the user typed when they flip between lb/ft and kg/cm
  function switchUnits(u: 'us' | 'metric') {
    if (u === units) return;
    if (Number.isFinite(body.weightKg)) setWeight(String(Math.round(u === 'us' ? kgToLb(body.weightKg) : body.weightKg)));
    if (Number.isFinite(body.heightCm)) {
      setHeightCm(String(Math.round(body.heightCm)));
      const totalIn = Math.round(body.heightCm / 2.54);
      setFt(String(Math.floor(totalIn / 12)));
      setInch(String(totalIn % 12));
    }
    setUnits(u);
  }

  function validateAbout(): string | null {
    if (!sex) return 'Please pick an option for sex (used only for the calorie formula).';
    if (!(body.age >= 13 && body.age <= 100)) return 'Please enter an age between 13 and 100.';
    if (!(body.heightCm >= 100 && body.heightCm <= 250)) return 'Please check your height.';
    if (!(body.weightKg >= 30 && body.weightKg <= 350)) return 'Please check your weight.';
    return null;
  }

  function next() {
    setError(null);
    if (step === 0 && !goal) return setError('Pick a goal to continue.');
    if (step === 1) {
      const e = validateAbout();
      if (e) return setError(e);
      // suggest targets on first setup; when editing, keep the user's own numbers
      const t = suggestTargets({ sex: sex!, age: body.age, heightCm: body.heightCm, weightKg: body.weightKg, activity, goal: goal! });
      if (!initial?.onboarded || !protein) setProtein(String(t.protein));
      if (!initial?.onboarded || !calories) setCalories(String(t.calories));
      setSuggested(t);
    }
    if (step === 2) {
      const p = num(protein), c = num(calories);
      if (!(p >= 20 && p <= 400)) return setError('Protein target should be between 20 and 400 g.');
      if (!(c >= 800 && c <= 6000)) return setError('Calorie target should be between 800 and 6000.');
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function save() {
    if (!session) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        goal,
        sex,
        age: Math.round(body.age),
        height_cm: Math.round(body.heightCm * 10) / 10,
        weight_kg: Math.round(body.weightKg * 10) / 10,
        activity,
        protein_target_g: Math.round(num(protein)),
        calorie_target: Math.round(num(calories)),
        diet,
        allergies,
        skill,
        max_minutes: minutes,
        units,
        onboarded: true,
      })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) return setError('Couldn’t save. Check your connection and try again.');
    await refreshProfile();
    onDone?.();
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const isLast = step === STEPS.length - 1;

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {step > 0 ? <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
          <Button title={isLast ? submitLabel : 'Continue'} onPress={isLast ? save : next} loading={saving} style={{ flex: 2 }} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: i <= step ? colors.ink : colors.surfaceAlt }} />
        ))}
      </View>

      <Animated.View key={step} entering={FadeIn.duration(250)} style={{ gap: space.xl }}>
        {step === 0 && (
          <>
            <T variant="title">What’s your goal?</T>
            <View style={{ gap: space.md }}>
              {GOALS.map((g) => (
                <Pressable key={g.id} onPress={() => setGoal(g.id)} accessibilityRole="button" accessibilityState={{ selected: goal === g.id }}>
                  <Card tone="white" style={{ borderColor: goal === g.id ? colors.ink : colors.line, borderWidth: goal === g.id ? 2 : 1 }}>
                    <T variant="heading">{g.title}</T>
                    <T color={colors.inkSoft}>{g.body}</T>
                  </Card>
                </Pressable>
              ))}
            </View>
            {goal === 'glp1' ? <Banner tone="info" text={GLP1_NOTE} /> : null}
          </>
        )}

        {step === 1 && (
          <>
            <T variant="title">About you</T>
            <T color={colors.inkSoft}>Used only to suggest starting targets. You can change them next.</T>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Chip label="US units" selected={units === 'us'} onPress={() => switchUnits('us')} />
              <Chip label="Metric" selected={units === 'metric'} onPress={() => switchUnits('metric')} />
            </View>
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>Sex</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                <Chip label="Male" selected={sex === 'male'} onPress={() => setSex('male')} />
                <Chip label="Female" selected={sex === 'female'} onPress={() => setSex('female')} />
                <Chip label="Prefer not to say" selected={sex === 'other'} onPress={() => setSex('other')} />
              </View>
            </View>
            <Field label="Age" keyboardType="number-pad" value={age} onChangeText={setAge} placeholder="30" suffix="years" />
            {units === 'us' ? (
              <View style={{ flexDirection: 'row', gap: space.md }}>
                <View style={{ flex: 1 }}><Field label="Height" keyboardType="number-pad" value={ft} onChangeText={setFt} placeholder="5" suffix="ft" /></View>
                <View style={{ flex: 1 }}><Field label=" " keyboardType="number-pad" value={inch} onChangeText={setInch} placeholder="10" suffix="in" /></View>
              </View>
            ) : (
              <Field label="Height" keyboardType="number-pad" value={heightCm} onChangeText={setHeightCm} placeholder="178" suffix="cm" />
            )}
            <Field label="Weight" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} placeholder={units === 'us' ? '180' : '82'} suffix={units === 'us' ? 'lb' : 'kg'} />
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>How active are you?</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                <Chip label="Lightly" selected={activity === 'low'} onPress={() => setActivity('low')} />
                <Chip label="3–4 workouts/wk" selected={activity === 'moderate'} onPress={() => setActivity('moderate')} />
                <Chip label="Very" selected={activity === 'high'} onPress={() => setActivity('high')} />
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <T variant="title">Your daily targets</T>
            <T color={colors.inkSoft}>
              {suggested ? `We suggest ${suggested.protein} g protein and ${suggested.calories} kcal. ` : ''}Edit them to match your plan.
            </T>
            <Card tone="accent" style={{ gap: space.lg }}>
              <Field label="Protein" keyboardType="number-pad" value={protein} onChangeText={setProtein} suffix="g / day" />
              <Field label="Calories" keyboardType="number-pad" value={calories} onChangeText={setCalories} suffix="kcal / day" />
            </Card>
            {goal === 'glp1' ? <Banner tone="info" text={GLP1_NOTE} /> : null}
            <T variant="caption" color={colors.inkFaint}>Estimates only — not medical or dietary advice.</T>
          </>
        )}

        {step === 3 && (
          <>
            <T variant="title">Diet & allergies</T>
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>Diet</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {DIET_OPTIONS.map(([id, label]) => (
                  <Chip key={id} label={label} selected={diet.includes(id)} onPress={() => toggle(diet, setDiet, id)} />
                ))}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>Allergies</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {ALLERGY_OPTIONS.map(([id, label]) => (
                  <Chip key={id} label={label} selected={allergies.includes(id)} onPress={() => toggle(allergies, setAllergies, id)} />
                ))}
              </View>
            </View>
            <Banner tone="warning" text="We double-check every recipe against these, but always read ingredient labels yourself if you have a serious allergy." />
          </>
        )}

        {step === 4 && (
          <>
            <T variant="title">How do you cook?</T>
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>Skill</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                <Chip label="Beginner" selected={skill === 'beginner'} onPress={() => setSkill('beginner')} />
                <Chip label="Comfortable" selected={skill === 'intermediate'} onPress={() => setSkill('intermediate')} />
                <Chip label="Confident" selected={skill === 'advanced'} onPress={() => setSkill('advanced')} />
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <T variant="label" color={colors.inkSoft}>Time per meal</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                {[10, 20, 30, 45, 60].map((m) => (
                  <Chip key={m} label={m === 60 ? '60+ min' : `${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
                ))}
              </View>
            </View>
          </>
        )}
        {error ? <Banner tone="danger" text={error} /> : null}
      </Animated.View>
    </Screen>
  );
}
