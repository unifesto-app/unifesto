import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Briefcase,
  Buildings,
  Camera,
  Clock,
  CurrencyInr,
  ListBullets,
  MapPin,
  Plus,
  Tag,
  TextAa,
  TextAlignLeft,
  User,
} from 'phosphor-react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import FormRow from '../../components/profile/FormRow';
import ChipPicker from '../../components/manage/ChipPicker';
import { shortDate } from '../../components/apex/ApexRow';
import { Button } from '../../components/ui';
import { AppAlert } from '../../components/ui/AppAlert';
import { pickImageAtAspect } from '../../utils/pickImage';
import { titleCase } from '../../lib/apexQueues';
import {
  createBlogPost,
  createCareer,
  deleteBlogPost,
  deleteCareer,
  getBlogPosts,
  getCareerApplications,
  getCareers,
  updateApplicationStatus,
  updateBlogPost,
  updateCareer,
  uploadBlogCover,
  type ApplicationStatus,
  type BlogPost,
  type BlogStatus,
  type Career,
  type CareerApplication,
  type CareerStatus,
} from '../../lib/api/apexPlatform';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

/* Apex Blog and Careers: list, create/edit, delete; careers also triage applications. */

const GUTTER = spacing[6];
const ICON = 20;

function Centered({ error }: { error?: string }) {
  const tokens = useTokens();
  return (
    <View style={[styles.center, { backgroundColor: tokens.bg }]}>
      {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
    </View>
  );
}

/** Pull-to-refresh list shell shared by both list screens. */
function ListShell({ load, children }: { load: () => Promise<void>; children: React.ReactNode }) {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
        />
      }
    >
      {children}
    </ScrollView>
  );
}

/** Scrolling form shell with keyboard avoidance. */
function FormShell({ children }: { children: React.ReactNode }) {
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const confirmDelete = (what: string, run: () => Promise<{ ok: boolean; message?: string }>, done: () => void) =>
  AppAlert.alert(`Delete ${what}?`, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: async () => {
        const r = await run();
        if (r.ok) done();
        else AppAlert.alert('Not deleted', r.message ?? 'Try again');
      },
    },
  ]);

// ── Blog ─────────────────────────────────────────────────────────────────────

export function BlogListScreen() {
  const router = useRouter();
  const tokens = useTokens();
  useAnalyticsScreenTracking('ApexBlog');
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await getBlogPosts();
    if (r.ok) {
      setPosts(r.data);
      setError('');
    } else setError(r.message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!posts) return <Centered error={error} />;

  return (
    <ListShell load={load}>
      <SettingsGroup>
        <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="New post" onPress={() => router.push('/apex/blog/new')} />
      </SettingsGroup>
      <SettingsGroup title={`${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`}>
        {posts.length ? (
          posts.map((p) => (
            <SettingsRow
              key={p.id}
              label={p.title}
              value={p.status === 'PUBLISHED' ? shortDate(p.publishedAt) : 'Draft'}
              onPress={() => router.push(`/apex/blog/${p.id}`)}
            />
          ))
        ) : (
          <SettingsRow label="No posts yet" />
        )}
      </SettingsGroup>
    </ListShell>
  );
}

const BLOG_STATUS = [
  { value: 'DRAFT' as const, label: 'Draft' },
  { value: 'PUBLISHED' as const, label: 'Published' },
];

export function BlogEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const tokens = useTokens();
  useAnalyticsScreenTracking(isNew ? 'ApexBlogNew' : 'ApexBlogEdit');

  const [loaded, setLoaded] = useState(isNew);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [author, setAuthor] = useState('Team Unifesto');
  const [cover, setCover] = useState('');
  const [featured, setFeatured] = useState(false);
  const [status, setStatus] = useState<BlogStatus>('DRAFT');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // No GET /blog/:id for drafts — find it in the admin list.
  useEffect(() => {
    if (isNew) return;
    void getBlogPosts().then((r) => {
      const p = r.ok ? r.data.find((x) => x.id === id) : undefined;
      if (!p) return setLoadError(r.ok ? 'Post not found.' : r.message);
      setTitle(p.title);
      setExcerpt(p.excerpt);
      setContent(p.content);
      setCategory(p.category);
      setAuthor(p.author);
      setCover(p.coverImageUrl ?? '');
      setFeatured(p.featured);
      setStatus(p.status);
      setLoaded(true);
    });
  }, [id, isNew]);

  const pickCover = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') return AppAlert.alert('Permission required', 'Allow photo library access to add a cover.');
    const uri = await pickImageAtAspect([16, 9]).catch((e: Error) => {
      AppAlert.alert("Couldn't use that photo", e.message);
      return null;
    });
    if (!uri) return;
    setUploading(true);
    const r = await uploadBlogCover(uri);
    setUploading(false);
    if (r.ok) setCover(r.data.url);
    else AppAlert.alert('Cover not uploaded', r.message);
  };

  const save = async () => {
    if (!title.trim() || !excerpt.trim() || !content.trim() || !category.trim()) {
      return setError('Title, summary, category and body are required.');
    }
    setError('');
    setSaving(true);
    const body = {
      title: title.trim(),
      excerpt: excerpt.trim(),
      content,
      category: category.trim(),
      author: author.trim() || 'Team Unifesto',
      coverImageUrl: cover || undefined,
      featured,
      status,
    };
    const r = isNew ? await createBlogPost(body) : await updateBlogPost(id!, body);
    setSaving(false);
    if (r.ok) router.back();
    else setError(r.message);
  };

  if (!loaded) return <Centered error={loadError} />;

  return (
    <FormShell>
      <Pressable onPress={pickCover} disabled={uploading} accessibilityRole="button" accessibilityLabel={cover ? 'Change cover' : 'Add cover'}>
        <View style={[styles.cover, { backgroundColor: tokens.elevated }]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          {uploading ? (
            <ActivityIndicator color={tokens.accent} />
          ) : !cover ? (
            <View style={styles.coverEmpty}>
              <Camera size={26} color={tokens.accent} weight="fill" />
              <Text style={[styles.muted, { color: tokens.textMuted }]}>Add a 16:9 cover</Text>
            </View>
          ) : null}
        </View>
      </Pressable>

      <Text style={[styles.section, { color: tokens.textMuted }]}>Status</Text>
      <ChipPicker options={BLOG_STATUS} value={status} onChange={(v) => v && setStatus(v)} />

      <SettingsGroup title="Post">
        <FormRow icon={<TextAa size={ICON} color={tokens.text} />} value={title} onChangeText={setTitle} placeholder="Title" accessibilityLabel="Title" />
        <FormRow icon={<TextAlignLeft size={ICON} color={tokens.text} />} value={excerpt} onChangeText={setExcerpt} placeholder="One-line summary" multiline accessibilityLabel="Summary" />
        <FormRow icon={<Tag size={ICON} color={tokens.text} />} value={category} onChangeText={setCategory} placeholder="Category, e.g. Product" accessibilityLabel="Category" />
        <FormRow icon={<User size={ICON} color={tokens.text} />} value={author} onChangeText={setAuthor} placeholder="Author" accessibilityLabel="Author" />
        <SettingsRow label="Featured" trailing={<Switch value={featured} onValueChange={setFeatured} trackColor={{ true: tokens.success }} accessibilityLabel="Featured" />} />
      </SettingsGroup>

      <SettingsGroup title="Body (Markdown)">
        <FormRow
          icon={<ListBullets size={ICON} color={tokens.text} />}
          value={content}
          onChangeText={setContent}
          placeholder="Write in Markdown"
          multiline
          style={{ minHeight: 240 }}
          textAlignVertical="top"
          accessibilityLabel="Body in Markdown"
        />
      </SettingsGroup>

      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
      <View style={{ marginTop: spacing[6] }}>
        <Button label={isNew ? 'Create post' : 'Save post'} onPress={save} loading={saving} disabled={uploading} size="lg" fullWidth />
      </View>
      {!isNew ? (
        <SettingsGroup>
          <SettingsRow label="Delete post" danger onPress={() => confirmDelete('this post', () => deleteBlogPost(id!), () => router.back())} />
        </SettingsGroup>
      ) : null}
    </FormShell>
  );
}

// ── Careers ──────────────────────────────────────────────────────────────────

export function CareersListScreen() {
  const router = useRouter();
  const tokens = useTokens();
  useAnalyticsScreenTracking('ApexCareers');
  const [jobs, setJobs] = useState<Career[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await getCareers();
    if (r.ok) {
      setJobs(r.data);
      setError('');
    } else setError(r.message);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!jobs) return <Centered error={error} />;

  return (
    <ListShell load={load}>
      <SettingsGroup>
        <SettingsRow icon={<Plus size={ICON} color={tokens.accent} weight="bold" />} label="New job" onPress={() => router.push('/apex/careers/new')} />
      </SettingsGroup>
      <SettingsGroup title={`${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'}`}>
        {jobs.length ? (
          jobs.map((j) => {
            const n = j._count?.applications ?? 0;
            return (
              <SettingsRow
                key={j.id}
                label={j.title}
                value={`${titleCase(j.status)}${n ? ` · ${n} applied` : ''}`}
                onPress={() => router.push(`/apex/careers/${j.id}`)}
              />
            );
          })
        ) : (
          <SettingsRow label="No jobs yet" />
        )}
      </SettingsGroup>
    </ListShell>
  );
}

const CAREER_STATUS = [
  { value: 'DRAFT' as const, label: 'Draft' },
  { value: 'OPEN' as const, label: 'Open' },
  { value: 'CLOSED' as const, label: 'Closed' },
];

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

export function CareerEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const router = useRouter();
  const tokens = useTokens();
  useAnalyticsScreenTracking(isNew ? 'ApexCareerNew' : 'ApexCareerEdit');

  const [loaded, setLoaded] = useState(isNew);
  const [loadError, setLoadError] = useState('');
  const [f, setF] = useState({
    title: '',
    department: '',
    location: '',
    type: 'Full-time',
    experienceLevel: '',
    salaryRange: '',
    description: '',
    requirements: '',
    responsibilities: '',
    benefits: '',
  });
  const [status, setStatus] = useState<CareerStatus>('DRAFT');
  const [applications, setApplications] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    void getCareers().then((r) => {
      const j = r.ok ? r.data.find((x) => x.id === id) : undefined;
      if (!j) return setLoadError(r.ok ? 'Job not found.' : r.message);
      setF({
        title: j.title,
        department: j.department,
        location: j.location,
        type: j.type,
        experienceLevel: j.experienceLevel,
        salaryRange: j.salaryRange ?? '',
        description: j.description,
        requirements: j.requirements.join('\n'),
        responsibilities: j.responsibilities.join('\n'),
        benefits: j.benefits.join('\n'),
      });
      setStatus(j.status);
      setApplications(j._count?.applications ?? 0);
      setLoaded(true);
    });
  }, [id, isNew]);

  const set = (k: keyof typeof f) => (v: string) => {
    setError('');
    setF((cur) => ({ ...cur, [k]: v }));
  };

  const save = async () => {
    if (!f.title.trim() || !f.department.trim() || !f.location.trim() || !f.description.trim()) {
      return setError('Title, team, location and description are required.');
    }
    setSaving(true);
    const body = {
      title: f.title.trim(),
      department: f.department.trim(),
      location: f.location.trim(),
      type: f.type.trim() || 'Full-time',
      experienceLevel: f.experienceLevel.trim(),
      salaryRange: f.salaryRange.trim() || undefined,
      description: f.description.trim(),
      requirements: lines(f.requirements),
      responsibilities: lines(f.responsibilities),
      benefits: lines(f.benefits),
      status,
    };
    const r = isNew ? await createCareer(body) : await updateCareer(id!, body);
    setSaving(false);
    if (r.ok) router.back();
    else setError(r.message);
  };

  if (!loaded) return <Centered error={loadError} />;

  const row = (k: keyof typeof f, placeholder: string, icon: React.ReactNode, multiline = false) => (
    <FormRow key={k} icon={icon} value={f[k]} onChangeText={set(k)} placeholder={placeholder} multiline={multiline} accessibilityLabel={placeholder} />
  );
  const c = tokens.text;

  return (
    <FormShell>
      {!isNew ? (
        <SettingsGroup>
          <SettingsRow
            icon={<User size={ICON} color={tokens.accent} />}
            label="Applications"
            value={String(applications)}
            onPress={() => router.push(`/apex/careers/${id}/applications`)}
          />
        </SettingsGroup>
      ) : null}

      <Text style={[styles.section, { color: tokens.textMuted }]}>Status</Text>
      <ChipPicker options={CAREER_STATUS} value={status} onChange={(v) => v && setStatus(v)} />

      <SettingsGroup title="Role">
        {row('title', 'Title, e.g. Backend engineer', <TextAa size={ICON} color={c} />)}
        {row('department', 'Team, e.g. Engineering', <Buildings size={ICON} color={c} />)}
        {row('location', 'Location, e.g. Hyderabad', <MapPin size={ICON} color={c} />)}
        {row('type', 'Type, e.g. Full-time', <Clock size={ICON} color={c} />)}
        {row('experienceLevel', 'Experience, e.g. 2+ years', <Briefcase size={ICON} color={c} />)}
        {row('salaryRange', 'Salary range (optional)', <CurrencyInr size={ICON} color={c} />)}
      </SettingsGroup>

      <SettingsGroup title="About the role">{row('description', 'Description', <TextAlignLeft size={ICON} color={c} />, true)}</SettingsGroup>
      <SettingsGroup title="One per line">
        {row('responsibilities', 'Responsibilities', <ListBullets size={ICON} color={c} />, true)}
        {row('requirements', 'Requirements', <ListBullets size={ICON} color={c} />, true)}
        {row('benefits', 'Benefits', <ListBullets size={ICON} color={c} />, true)}
      </SettingsGroup>

      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
      <View style={{ marginTop: spacing[6] }}>
        <Button label={isNew ? 'Create job' : 'Save job'} onPress={save} loading={saving} size="lg" fullWidth />
      </View>
      {!isNew ? (
        <SettingsGroup>
          <SettingsRow label="Delete job" danger onPress={() => confirmDelete('this job', () => deleteCareer(id!), () => router.back())} />
        </SettingsGroup>
      ) : null}
    </FormShell>
  );
}

const APP_STATUS: { value: ApplicationStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'REVIEWING', label: 'Reviewing' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'HIRED', label: 'Hired' },
];

export function CareerApplicationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useTokens();
  useAnalyticsScreenTracking('ApexCareerApplications');
  const [apps, setApps] = useState<CareerApplication[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await getCareerApplications(id!);
    if (r.ok) {
      setApps(r.data.applications);
      setError('');
    } else setError(r.message);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (a: CareerApplication, status: ApplicationStatus) => {
    setApps((cur) => cur?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? cur);
    const r = await updateApplicationStatus(a.id, status);
    if (!r.ok) {
      AppAlert.alert('Not updated', r.message);
      void load();
    }
  };

  if (!apps) return <Centered error={error} />;
  if (!apps.length) return <Centered error="No applications yet." />;

  return (
    <ListShell load={load}>
      {apps.map((a) => {
        const open = openId === a.id;
        return (
          <SettingsGroup key={a.id}>
            <SettingsRow
              label={a.fullName}
              value={`${titleCase(a.status)} · ${shortDate(a.createdAt)}`}
              onPress={() => setOpenId(open ? null : a.id)}
            />
            {open ? (
              <View style={styles.appBody}>
                <ChipPicker options={APP_STATUS} value={a.status} onChange={(s) => s && void setStatus(a, s)} />
                {a.coverLetter ? <Text style={[styles.letter, { color: tokens.textSecondary }]}>{a.coverLetter}</Text> : null}
              </View>
            ) : null}
            {open ? <SettingsRow label="Résumé" external onPress={() => void Linking.openURL(a.resumeUrl)} /> : null}
            {open ? <SettingsRow label={a.email} external onPress={() => void Linking.openURL(`mailto:${a.email}`)} /> : null}
            {open && a.phone ? <SettingsRow label={a.phone} external onPress={() => void Linking.openURL(`tel:${a.phone}`)} /> : null}
            {open && a.linkedinUrl ? <SettingsRow label="LinkedIn" external onPress={() => void Linking.openURL(a.linkedinUrl!)} /> : null}
            {open && a.portfolioUrl ? <SettingsRow label="Portfolio" external onPress={() => void Linking.openURL(a.portfolioUrl!)} /> : null}
          </SettingsGroup>
        );
      })}
    </ListShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...font() },
  section: { marginTop: spacing[6], marginBottom: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
  error: { marginTop: spacing[4], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: borderRadius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverEmpty: { alignItems: 'center', gap: spacing[2] },
  appBody: { padding: spacing[4], gap: spacing[3] },
  letter: { fontSize: typography.fontSize.sm, lineHeight: 20, ...font() },
});
