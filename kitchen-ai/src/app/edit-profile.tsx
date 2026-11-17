import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ProfileForm } from '@/features/ProfileForm';

export default function EditProfile() {
  const { profile } = useAuth();
  return <ProfileForm initial={profile} submitLabel="Save" onDone={() => router.back()} />;
}
