"use client";

import { useState } from "react";
import { ImageSquare, Spinner, Check } from "@unifesto/unicon/react";
import Cropper, { Point, Area } from "react-easy-crop";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface ImageUploadResult {
  url: string | null;
  error: string | null;
}

interface ImageUploadCardProps {
  title: string;
  description?: string;
  /** Current image URL, or null when none is set yet. */
  imageUrl: string | null;
  /** Tailwind aspect-ratio class for the preview (e.g. "aspect-[16/9]"). */
  aspectClassName?: string;
  /** Extra classes for the preview box (e.g. rounded-full for a logo). */
  previewClassName?: string;
  /** Constrain the preview width. Defaults to a wide banner. */
  containerClassName?: string;
  emptyLabel?: string;
  maxSizeMb?: number;
  disabled?: boolean;
  /** Enable cropping with specified aspect ratio (e.g., 4/3 for banner, 1 for logo). If undefined, no cropping. */
  cropAspect?: number;
  /** Performs the upload and returns the new URL (or an error message). */
  onUpload: (file: File) => Promise<ImageUploadResult>;
  /** Called with the new URL once an upload succeeds. */
  onUploaded?: (url: string) => void;
}

/**
 * Helper to create a cropped image from canvas
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas is empty"));
      }
    }, "image/jpeg", 0.95);
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

/**
 * A card with an image preview and an upload control. Generic over the upload
 * endpoint — the parent supplies an `onUpload` adapter returning `{ url, error }`.
 * Used for space logo/banner and reusable elsewhere.
 * 
 * Now supports optional image cropping when `cropAspect` is provided.
 */
export function ImageUploadCard({
  title,
  description,
  imageUrl,
  aspectClassName = "aspect-[16/9]",
  previewClassName = "rounded-lg",
  containerClassName = "max-w-xl",
  emptyLabel = "No image yet",
  maxSizeMb = 5,
  disabled = false,
  cropAspect,
  onUpload,
  onUploaded,
}: ImageUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // Crop dialog state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);

  const onCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`Image must be ${maxSizeMb}MB or smaller.`);
      return;
    }

    setError("");

    // If cropping is enabled, open crop dialog
    if (cropAspect !== undefined) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setCropDialogOpen(true);
      };
      reader.readAsDataURL(file);
    } else {
      // No cropping - upload directly
      setUploading(true);
      const { url, error: uploadError } = await onUpload(file);
      setUploading(false);
      if (uploadError) {
        setError(uploadError);
        return;
      }
      if (url) onUploaded?.(url);
    }
  };

  const handleApplyCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    setCropping(true);
    setError("");

    try {
      // Get cropped image blob
      const croppedBlob = await getCroppedImg(imageToCrop, croppedAreaPixels);

      // Create file from blob
      const croppedFile = new File([croppedBlob], "image.jpg", {
        type: "image/jpeg",
      });

      // Upload cropped image
      setUploading(true);
      const { url, error: uploadError } = await onUpload(croppedFile);
      setUploading(false);

      if (uploadError) {
        setError(uploadError);
        return;
      }

      if (url) {
        onUploaded?.(url);
      }

      // Close dialog and reset state
      setCropDialogOpen(false);
      setImageToCrop(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to crop image");
    } finally {
      setCropping(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3 px-4 py-4">
          <div
            className={`relative w-full overflow-hidden border border-border bg-muted ${aspectClassName} ${previewClassName} ${containerClassName}`}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <ImageSquare className="h-8 w-8" weight="duotone" />
                <span className="text-sm">{emptyLabel}</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 grid place-items-center bg-background/60">
                <Spinner className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleChange}
                disabled={uploading || disabled}
              />
              <span
                className={`inline-flex items-center gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm font-medium shadow-sm ${
                  uploading || disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:bg-muted"
                }`}
              >
                <ImageSquare className="h-4 w-4" />
                {imageUrl ? "Replace image" : "Upload image"}
              </span>
            </label>
            <span className="text-xs text-muted-foreground">
              JPG, PNG or WebP · up to {maxSizeMb}MB
            </span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {/* Crop Dialog */}
      {cropAspect !== undefined && (
        <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Crop Image</DialogTitle>
            </DialogHeader>
            <div className="relative h-[400px] w-full bg-black">
              {imageToCrop && (
                <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={cropAspect}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoom">Zoom</Label>
              <input
                id="zoom"
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCropDialogOpen(false);
                  setImageToCrop(null);
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                  setCroppedAreaPixels(null);
                }}
                disabled={cropping}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleApplyCrop}
                disabled={cropping || !croppedAreaPixels}
              >
                {cropping ? (
                  <>
                    <Spinner className="h-4 w-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Apply Crop
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
