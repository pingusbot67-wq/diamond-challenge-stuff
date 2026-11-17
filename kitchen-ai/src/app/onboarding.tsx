import { useAuth } from '@/lib/auth';
import { ProfileForm } from '@/features/ProfileForm';

export default function Onboarding() {
  const { profile } = useAuth();
  return <ProfileForm initial={profile} />;
}
