// Shown only if the .env file with the Supabase keys is missing.
import { Screen, T, Card, colors } from '@/ui';

export default function Setup() {
  return (
    <Screen>
      <T variant="title">Almost there</T>
      <T color={colors.inkSoft}>The app isn’t connected to your Supabase project yet.</T>
      <Card>
        <T variant="label">On your computer:</T>
        <T>1. Copy the file “.env.example” to “.env” in the kitchen-ai folder.</T>
        <T>2. Paste your Supabase Project URL and anon key into it.</T>
        <T>3. Stop the app (Ctrl+C) and run “npx expo start” again.</T>
      </Card>
      <T variant="caption" color={colors.inkFaint}>See SETUP.md for step-by-step instructions.</T>
    </Screen>
  );
}
