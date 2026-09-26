"use client";

import { useState, useRef } from "react";
import { uploadAvatar, deleteAvatar, getAvatarConfig } from "@/lib/api/avatar";
import { brandGradient } from "@/lib/styles";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  userName?: string;
  onUploadSuccess: (url: string) => void;
  onDeleteSuccess: () => void;
}

export default function AvatarUpload({
  currentAvatarUrl,
  userName,
  onUploadSuccess,
  onDeleteSuccess,
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = getAvatarConfig();

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");

    // Validate file type
    if (!config.allowedTypes.includes(file.type)) {
      setError(
        `Invalid file type. Please upload: ${config.allowedTypes.join(", ")}`
      );
      return;
    }

    // Validate file size
    if (file.size > config.maxFileSize) {
      setError(`File too large. Maximum size: ${config.maxFileSizeMB}MB`);
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    try {
      const result = await uploadAvatar(file);

      if (result.success && result.url) {
        onUploadSuccess(result.url);
        setPreview(null);
      } else {
        setError(result.error || "Failed to upload avatar");
        setPreview(null);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      setPreview(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove your avatar?")) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const result = await deleteAvatar();

      if (result.success) {
        onDeleteSuccess();
        setPreview(null);
      } else {
        setError(result.error || "Failed to delete avatar");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setDeleting(false);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const displayUrl = preview || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Display */}
      <div className="relative group">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt={userName || "Avatar"}
            className="w-28 h-28 rounded-full object-cover border-2 border-white/10"
          />
        ) : (
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold text-white border-2 border-white/10"
            style={{ background: brandGradient }}
          >
            {getInitials(userName)}
          </div>
        )}

        {/* Upload Overlay */}
        {!uploading && !deleting && (
          <div
            className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex items-center justify-center"
            onClick={handleClick}
          >
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>
        )}

        {/* Loading Spinner */}
        {(uploading || deleting) && (
          <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={config.allowedTypes.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleClick}
          disabled={uploading || deleting}
          className="px-4 py-2 text-xs font-semibold rounded-lg border border-white/10 text-slate-300 hover:text-white hover:border-white/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? "Uploading..." : "Change Avatar"}
        </button>

        {currentAvatarUrl && (
          <button
            onClick={handleDelete}
            disabled={uploading || deleting}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-red-500/20 text-red-400 hover:text-red-300 hover:border-red-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Removing..." : "Remove"}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="w-full max-w-xs p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400 text-center">{error}</p>
        </div>
      )}

      {/* Upload Info */}
      <div className="text-center">
        <p className="text-xs text-slate-500">
          Max size: {config.maxFileSizeMB}MB
        </p>
        <p className="text-xs text-slate-500">
          Formats: JPG, PNG, WebP
        </p>
      </div>
    </div>
  );
}
