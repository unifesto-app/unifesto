"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FloppyDisk,
  ArrowClockwise,
  CheckCircle,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getSpace,
  updateSpace,
  uploadSpaceLogo,
  uploadSpaceBanner,
  type UpdateSpacePayload,
  type SpaceVisibility,
} from "@/lib/api/spaces-api";
import { ImageUploadCard } from "@/components/shared/ImageUploadCard";
import { can, type SpaceWithHierarchy } from "@/lib/types/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const VISIBILITY_OPTIONS: Array<{
  value: SpaceVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "PUBLIC",
    label: "Public",
    description: "Anyone can view and discover this space",
  },
  {
    value: "PRIVATE",
    label: "Private",
    description: "Only members can view this space. Add people from Members",
  },
];

const INDIAN_STATES = [
  { value: "AN", label: "Andaman and Nicobar Islands" },
  { value: "AP", label: "Andhra Pradesh" },
  { value: "AR", label: "Arunachal Pradesh" },
  { value: "AS", label: "Assam" },
  { value: "BR", label: "Bihar" },
  { value: "CH", label: "Chandigarh" },
  { value: "CT", label: "Chhattisgarh" },
  { value: "DH", label: "Dadra and Nagar Haveli and Daman and Diu" },
  { value: "DL", label: "Delhi" },
  { value: "GA", label: "Goa" },
  { value: "GJ", label: "Gujarat" },
  { value: "HR", label: "Haryana" },
  { value: "HP", label: "Himachal Pradesh" },
  { value: "JK", label: "Jammu and Kashmir" },
  { value: "JH", label: "Jharkhand" },
  { value: "KA", label: "Karnataka" },
  { value: "KL", label: "Kerala" },
  { value: "LA", label: "Ladakh" },
  { value: "LD", label: "Lakshadweep" },
  { value: "MP", label: "Madhya Pradesh" },
  { value: "MH", label: "Maharashtra" },
  { value: "MN", label: "Manipur" },
  { value: "ML", label: "Meghalaya" },
  { value: "MZ", label: "Mizoram" },
  { value: "NL", label: "Nagaland" },
  { value: "OR", label: "Odisha" },
  { value: "PY", label: "Puducherry" },
  { value: "PB", label: "Punjab" },
  { value: "RJ", label: "Rajasthan" },
  { value: "SK", label: "Sikkim" },
  { value: "TN", label: "Tamil Nadu" },
  { value: "TG", label: "Telangana" },
  { value: "TR", label: "Tripura" },
  { value: "UP", label: "Uttar Pradesh" },
  { value: "UT", label: "Uttarakhand" },
  { value: "WB", label: "West Bengal" },
];

export default function SpaceSettingsPage() {
  const router = useRouter();
  const spaceId = useSpaceId();
  const { spaces, currentRole, refresh: refreshSession } = useSession();
  const currentSpace = spaces.find((s) => s.id === spaceId);

  // Editing space settings is a Space-Admin capability. Gate through the same
  // matrix the sidebar and backend use — never a raw role-code literal, which
  // silently locks out the canonical SPACE_ADMIN code (and any future rename).
  const canEdit = can(currentRole, "space:manage-members");

  const [space, setSpace] = useState<SpaceWithHierarchy | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state
  const [formData, setFormData] = useState<UpdateSpacePayload>({
    name: "",
    slug: "",
    description: "",
    websiteUrl: "",
    city: "",
    state: "",
    country: "India",
    tags: [],
    visibility: "PUBLIC",
  });

  const [tagsInput, setTagsInput] = useState("");

  const loadSpace = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getSpace(spaceId);
    if (error) {
      setError(error.message);
    } else if (data) {
      setSpace(data);
      setLogoUrl(
        ((data as any).logoUrl ?? (data as any).logo_url ?? null) as
          | string
          | null
      );
      setBannerUrl(
        ((data as any).bannerUrl ?? (data as any).banner_url ?? null) as
          | string
          | null
      );
      setFormData({
        name: data.name || "",
        slug: data.slug || "",
        description: data.description || "",
        websiteUrl: (data as any).websiteUrl || (data as any).website || "",
        city: (data as any).city || "",
        state: (data as any).state || "",
        country: (data as any).country || "India",
        tags: (data as any).tags || [],
        visibility: ((data as any).visibility as SpaceVisibility) || "PUBLIC",
      });
      setTagsInput(((data as any).tags || []).join(", "));
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void loadSpace();
  }, [loadSpace]);

  const handleInputChange = (
    field: keyof UpdateSpacePayload,
    value: string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  };

  const handleTagsChange = (value: string) => {
    setTagsInput(value);
    const tags = value
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    setFormData((prev) => ({ ...prev, tags }));
    setSaveSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    const { data, error } = await updateSpace(spaceId, formData);

    if (error) {
      setSaveError(error.message);
    } else if (data) {
      setSpace(data);
      setSaveSuccess(true);
      // Refresh session to update space name in sidebar
      await refreshSession();
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    }

    setSaving(false);
  };

  const hasChanges = () => {
    if (!space) return false;
    return (
      formData.name !== (space.name || "") ||
      formData.slug !== (space.slug || "") ||
      formData.description !== (space.description || "") ||
      formData.websiteUrl !== ((space as any).websiteUrl || (space as any).website || "") ||
      formData.city !== ((space as any).city || "") ||
      formData.state !== ((space as any).state || "") ||
      formData.country !== ((space as any).country || "") ||
      formData.visibility !== ((space as any).visibility || "PUBLIC") ||
      JSON.stringify(formData.tags || []) !== JSON.stringify((space as any).tags || [])
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" subtitle="Manage space settings" />
        <ErrorNotice message={error} />
      </div>
    );
  }

  if (!space) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" subtitle="Manage space settings" />
        <ErrorNotice message="Space not found" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your space profile and configuration"
      />

      {!canEdit && (
        <Card className="border-warning/30 bg-warning-soft">
          <CardContent className="py-4">
            <p className="text-sm text-warning">
              You need Space Admin permissions to edit space settings.
            </p>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Update your space's name, description, and identifier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Space Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  disabled={!canEdit}
                  required
                  placeholder="My Amazing Space"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">
                  Slug <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleInputChange("slug", e.target.value)}
                  disabled={!canEdit}
                  required
                  placeholder="my-amazing-space"
                />
                {space && formData.slug !== space.slug ? (
                  <p className="text-xs text-warning">
                    Your page moves to /space/{formData.slug || "…"}. Short
                    links and their QR codes follow it. Other links to
                    /space/{space.slug} forward here until another space
                    takes that name.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Your page address: /space/{formData.slug}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                disabled={!canEdit}
                rows={4}
                placeholder="Tell people about your space..."
              />
              <p className="text-xs text-muted-foreground">
                A brief description of what your space is about
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => handleTagsChange(e.target.value)}
                disabled={!canEdit}
                placeholder="tech, community, events"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated tags to help people discover your space
              </p>
              {formData.tags && formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {formData.tags.map((tag, idx) => (
                    <Badge key={idx} variant="neutral">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Branding — logo & banner */}
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
            <CardDescription>
              Upload a logo and banner to personalise your space.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <ImageUploadCard
              title="Logo"
              description="Square image works best."
              imageUrl={logoUrl}
              aspectClassName="aspect-square"
              containerClassName="max-w-[10rem]"
              emptyLabel="No logo yet"
              maxSizeMb={2}
              disabled={!canEdit}
              cropAspect={1}
              onUpload={async (file) => {
                const { data, error } = await uploadSpaceLogo(spaceId, file);
                return { url: data?.logoUrl ?? null, error: error?.message ?? null };
              }}
              onUploaded={(url) => {
                setLogoUrl(url);
                void refreshSession();
              }}
            />
            <ImageUploadCard
              title="Banner"
              description="Wide image shown at the top of your space."
              imageUrl={bannerUrl}
              aspectClassName="aspect-[16/9]"
              containerClassName="max-w-md"
              emptyLabel="No banner yet"
              maxSizeMb={5}
              disabled={!canEdit}
              cropAspect={4 / 3}
              onUpload={async (file) => {
                const { data, error } = await uploadSpaceBanner(spaceId, file);
                return {
                  url: data?.bannerUrl ?? null,
                  error: error?.message ?? null,
                };
              }}
              onUploaded={(url) => setBannerUrl(url)}
            />
          </CardContent>
        </Card>

        {/* Location & Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Location & Contact</CardTitle>
            <CardDescription>
              Add location and website information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <Input
                id="websiteUrl"
                type="url"
                value={formData.websiteUrl}
                onChange={(e) =>
                  handleInputChange("websiteUrl", e.target.value)
                }
                disabled={!canEdit}
                placeholder="https://example.com"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  disabled={!canEdit}
                  placeholder="Mumbai"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State/Union Territory</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) => handleInputChange("state", value)}
                  disabled={!canEdit}
                >
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state.value} value={state.label}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={formData.country}
                  disabled={true}
                  className="bg-muted"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy & Visibility */}
        <Card>
          <CardHeader>
            <CardTitle>Privacy & Visibility</CardTitle>
            <CardDescription>
              Control who can view and access your space.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value) =>
                  handleInputChange("visibility", value)
                }
                disabled={!canEdit}
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Space Information (Read-only) */}
        <Card>
          <CardHeader>
            <CardTitle>Space Information</CardTitle>
            <CardDescription>
              Additional details about your space (read-only).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Space ID
                </p>
                <p className="text-sm font-mono">{space.id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Status
                </p>
                <Badge variant={space.is_active ? "success" : "neutral"}>
                  {space.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Members
                </p>
                <p className="text-sm">{space.member_count || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Created
                </p>
                <p className="text-sm">
                  {new Date(space.created_at).toLocaleDateString("en-IN")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {canEdit && (
          <Card>
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex-1">
                {saveError && <ErrorNotice message={saveError} />}
                {saveSuccess && (
                  <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
                    <CheckCircle className="h-4 w-4" weight="fill" />
                    Changes saved successfully
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadSpace}
                  disabled={saving}
                >
                  <ArrowClockwise className="h-4 w-4" />
                  Reset
                </Button>
                <Button
                  type="submit"
                  disabled={saving || !hasChanges()}
                >
                  <FloppyDisk className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </form>
    </div>
  );
}
