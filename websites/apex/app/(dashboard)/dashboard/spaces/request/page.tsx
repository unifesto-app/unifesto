"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Buildings,
} from "@phosphor-icons/react";
import {
  createSpaceRequest,
  getMySpaceRequests,
  type SpaceRequest,
  type CreateSpaceRequestInput,
} from "@/lib/api/requests-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SPACE_TYPES = [
  { label: "Regular (Community/Club/Startup)", value: "REGULAR" },
  { label: "Super (University/College/Institution)", value: "SUPER" },
];

const INDIAN_CITIES = [
  "Hyderabad",
  "Bangalore",
  "Mumbai",
  "Delhi",
  "Chennai",
  "Pune",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
  "Other",
];

export default function RequestSpacePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<SpaceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [form, setForm] = useState<CreateSpaceRequestInput>({
    name: "",
    description: "",
    type: "REGULAR",
    city: "",
    websiteUrl: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getMySpaceRequests();
    if (error) {
      console.error("Failed to load requests:", error);
    } else {
      setRequests(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Please enter a space name");
      return;
    }
    if (!form.description?.trim()) {
      setError("Please describe your space");
      return;
    }

    setSubmitting(true);
    const { data, error } = await createSpaceRequest({
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      city: form.city || undefined,
      websiteUrl: form.websiteUrl?.trim() || undefined,
    });

    if (error) {
      setError(error.message || "Failed to submit request");
    } else {
      setSuccess(
        "Request submitted! We'll review it and get back to you within 2-3 business days."
      );
      setForm({
        name: "",
        description: "",
        type: "REGULAR",
        city: "",
        websiteUrl: "",
      });
      void load();
    }
    setSubmitting(false);
  };

  const pendingRequest = requests.find((r) => r.status === "PENDING");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <PageHeader
        title="Request a Space"
        subtitle="Submit a request to create a new space for your community, club, or institution"
      />

      {error && <ErrorNotice message={error} />}
      {success && (
        <Card className="border-success/30 bg-success-soft">
          <CardContent className="py-4">
            <p className="text-sm text-success">{success}</p>
          </CardContent>
        </Card>
      )}

      {/* Pending Request Notice */}
      {pendingRequest && (
        <Card className="border-warning/30 bg-warning-soft">
          <CardContent className="flex items-start gap-4 py-6">
            <Clock className="h-10 w-10 flex-shrink-0 text-warning" weight="fill" />
            <div>
              <h3 className="font-semibold text-warning">
                Request Under Review
              </h3>
              <p className="mt-1 text-sm text-warning-foreground">
                We're reviewing your request for "{pendingRequest.name}". You'll
                hear from us within 2-3 business days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request Form */}
      {!pendingRequest && (
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Space Details</CardTitle>
              <CardDescription>
                Tell us about the space you'd like to create
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Space Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Space Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Tech Community Hyderabad"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={255}
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe your space, its purpose, and what events you plan to host..."
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={4}
                  maxLength={2000}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {form.description?.length || 0} / 2000 characters
                </p>
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label htmlFor="type">Space Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm({ ...form, type: value })}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Regular spaces are for communities, clubs, and startups. Super
                  spaces are for universities, colleges, and large institutions.
                </p>
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city">City (Optional)</Label>
                <Select
                  value={form.city}
                  onValueChange={(value) => setForm({ ...form, city: value })}
                >
                  <SelectTrigger id="city">
                    <SelectValue placeholder="Select a city" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_CITIES.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Website */}
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website (Optional)</Label>
                <Input
                  id="websiteUrl"
                  type="url"
                  placeholder="https://example.com"
                  value={form.websiteUrl}
                  onChange={(e) =>
                    setForm({ ...form, websiteUrl: e.target.value })
                  }
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Submitting..." : "Submit Request"}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}

      {/* Previous Requests */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My Requests</CardTitle>
            <CardDescription>
              History of your space requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {requests.map((req) => {
                const isPending = req.status === "PENDING";
                const isApproved = req.status === "APPROVED";
                const color = isPending
                  ? "warning"
                  : isApproved
                    ? "success"
                    : "destructive";
                const Icon = isPending
                  ? Clock
                  : isApproved
                    ? CheckCircle
                    : XCircle;

                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Buildings
                        className="h-5 w-5 flex-shrink-0 text-muted-foreground"
                        weight="duotone"
                      />
                      <div>
                        <h4 className="font-medium text-foreground">
                          {req.name}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {new Date(req.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={color} className="flex items-center gap-1">
                      <Icon className="h-3.5 w-3.5" weight="fill" />
                      {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
