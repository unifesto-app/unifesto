import { useEffect, useRef, useState } from 'react';
import {} from 'react-native';
import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router/react-navigation';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import * as AuthAPI from '../lib/api/auth';
import { AppAlert } from '../components/ui/AppAlert';

export const GENDER_OPTIONS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'NON_BINARY' },
  { label: 'Prefer not to say', value: 'PREFER_NOT_TO_SAY' },
] as const;

type Fields = {
  username: string;
  fullName: string;
  bio: string;
  gender: string;
  linkedinUrl: string;
  instagramUrl: string;
  githubUrl: string;
  websiteUrl: string;
};

const EMPTY: Fields = {
  username: '',
  fullName: '',
  bio: '',
  gender: '',
  linkedinUrl: '',
  instagramUrl: '',
  githubUrl: '',
  websiteUrl: '',
};

const fromUser = (u: AuthAPI.User): Fields => ({
  username: u.username || '',
  fullName: u.fullName || '',
  bio: u.bio || '',
  gender: u.gender || '',
  linkedinUrl: u.linkedinUrl || '',
  instagramUrl: u.instagramUrl || '',
  githubUrl: u.githubUrl || '',
  websiteUrl: u.websiteUrl || '',
});

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Edit-profile form state. Explicit save (no autosave): the avatar uploads and
 * the profile PATCHes only on Save, and leaving with unsaved edits asks first.
 */
export function useEditProfile() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // The values as last loaded/saved — the baseline for dirty detection so the
  // Save action only appears when something actually changed.
  const initialRef = useRef<Fields>(EMPTY);

  // Username availability (name + username + gender are the registration
  // prerequisites, so username has to be settable and validated right here).
  const [usernameError, setUsernameError] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const set = <K extends keyof Fields>(key: K) => (value: Fields[K]) =>
    setFields((f) => ({ ...f, [key]: value }));

  const applyServer = (u: AuthAPI.User) => {
    setProfile(u);
    const next = fromUser(u);
    setFields(next);
    initialRef.current = next;
  };

  useEffect(() => {
    (async () => {
      if (!user || !token) {
        router.back();
        return;
      }
      try {
        setLoading(true);
        applyServer(await AuthAPI.getCurrentUser());
      } catch (error) {
        if (__DEV__) console.error('Failed to load profile:', error);
        AppAlert.alert('Error', 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const base = initialRef.current;
  const isDirty =
    avatarUri !== null ||
    (Object.keys(fields) as (keyof Fields)[]).some((k) =>
      k === 'gender' ? fields[k] !== base[k] : fields[k].trim() !== base[k],
    );

  // A "Saved" state should clear the moment the user edits again.
  useEffect(() => {
    if (saveStatus === 'saved' && isDirty) setSaveStatus('idle');
  }, [isDirty, saveStatus]);

  // Warn before leaving with unsaved changes (native back button included).
  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty || saveStatus === 'saving') return;
      e.preventDefault();
      AppAlert.alert('Discard changes?', 'You have unsaved changes. Leave without saving them?', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return sub;
  }, [navigation, isDirty, saveStatus]);

  const onChangeUsername = (text: string) => {
    set('username')(text);
    setUsernameError('');
    setUsernameAvailable(null);
    if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);

    const trimmed = text.trim();
    if (!trimmed || trimmed === initialRef.current.username) return;

    // Debounced availability check (best-effort; Save re-verifies before commit).
    usernameCheckRef.current = setTimeout(async () => {
      try {
        setCheckingUsername(true);
        const { available } = await AuthAPI.checkUsernameAvailability(trimmed);
        setUsernameAvailable(available);
        if (!available) setUsernameError('Username is already taken');
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 600);
  };

  const save = async () => {
    if (!token || saveStatus === 'saving') return;

    const trimmedUsername = fields.username.trim();
    if (!trimmedUsername) {
      setUsernameError('Username cannot be empty');
      return;
    }
    if (usernameError) return;

    // If the debounce hasn't confirmed a changed username yet, verify now so we
    // never commit a taken handle.
    if (trimmedUsername !== initialRef.current.username && usernameAvailable !== true) {
      try {
        setCheckingUsername(true);
        const { available } = await AuthAPI.checkUsernameAvailability(trimmedUsername);
        setUsernameAvailable(available);
        if (!available) {
          setUsernameError('Username is already taken');
          return;
        }
      } catch {
        // Network hiccup on the check — let the PATCH be the last line of defence.
      } finally {
        setCheckingUsername(false);
      }
    }

    try {
      setSaveStatus('saving');
      if (avatarUri) {
        await AuthAPI.uploadAvatar(avatarUri);
        setAvatarUri(null);
      }
      const updated = await AuthAPI.updateUserProfile({
        username: trimmedUsername,
        fullName: fields.fullName.trim() || undefined,
        bio: fields.bio.trim() || undefined,
        gender: fields.gender || undefined,
        linkedinUrl: fields.linkedinUrl.trim() || undefined,
        instagramUrl: fields.instagramUrl.trim() || undefined,
        githubUrl: fields.githubUrl.trim() || undefined,
        websiteUrl: fields.websiteUrl.trim() || undefined,
      });
      // Re-sync form + baseline to the server's canonical values so the screen
      // reads as clean immediately after saving.
      applyServer(updated);
      setUsernameAvailable(null);
      setSaveStatus('saved');
    } catch (error: any) {
      setSaveStatus('error');
      AppAlert.alert('Could not save', error?.message || 'Check your connection and try again.');
    }
  };

  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        AppAlert.alert('Permission Required', 'Please grant photo library access to change your photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setAvatarUri(result.assets[0].uri);
    } catch {
      AppAlert.alert('Error', 'Failed to pick image');
    }
  };

  return {
    loading,
    fields,
    set,
    onChangeUsername,
    usernameError,
    usernameAvailable,
    checkingUsername,
    avatarUrl: avatarUri || profile?.avatarUrl || null,
    pickAvatar,
    isDirty,
    saveStatus,
    save,
  };
}
