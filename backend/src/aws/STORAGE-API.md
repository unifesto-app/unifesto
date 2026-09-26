# Storage Management API Documentation

Real-time S3 storage management endpoints for file operations in the Unifesto backend.

## Base URL
```
/aws/storage
```

## Storage Folders

The system manages three storage folders:
- `avatars` - User profile avatars
- `space-logos` - Space/community logos
- `space-banners` - Space/community banner images

## Authentication

All endpoints require:
- JWT authentication (`JwtAuthGuard`)
- ADMIN role (`@Roles('ADMIN')`)

Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Endpoints

### 1. List Files in a Folder

Get all files in a specific storage folder with metadata.

**Endpoint:** `GET /aws/storage/folders/:folder/files`

**Parameters:**
- `folder` (path param) - Storage folder name: `avatars`, `space-logos`, or `space-banners`

**Response:**
```json
{
  "folder": "avatars/",
  "count": 5,
  "totalSizeMB": 12.45,
  "files": [
    {
      "key": "avatars/user-123.jpg",
      "fileName": "user-123.jpg",
      "size": 2048576,
      "sizeKB": 2000.5,
      "sizeMB": 1.95,
      "lastModified": "2026-06-07T10:30:00.000Z",
      "eTag": "\"d41d8cd98f00b204e9800998ecf8427e\""
    }
  ]
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 2. Get File Details

Get detailed information about a specific file including a presigned download URL.

**Endpoint:** `GET /aws/storage/folders/:folder/files/:fileName`

**Parameters:**
- `folder` (path param) - Storage folder name
- `fileName` (path param) - Name of the file

**Response:**
```json
{
  "key": "avatars/user-123.jpg",
  "fileName": "user-123.jpg",
  "size": 2048576,
  "sizeKB": 2000.5,
  "sizeMB": 1.95,
  "contentType": "image/jpeg",
  "lastModified": "2026-06-07T10:30:00.000Z",
  "eTag": "\"d41d8cd98f00b204e9800998ecf8427e\"",
  "downloadUrl": "https://s3.amazonaws.com/...",
  "downloadUrlExpiresIn": 3600
}
```

**Example:**
```bash
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files/user-123.jpg" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### 3. Get Presigned Upload URL

Generate a presigned URL for uploading a file directly to S3.

**Endpoint:** `POST /aws/storage/upload-url`

**Request Body:**
```json
{
  "folder": "avatars",
  "fileName": "user-456.jpg",
  "contentType": "image/jpeg"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...",
  "key": "avatars/user-456.jpg",
  "fileName": "user-456.jpg",
  "expiresIn": 3600,
  "method": "PUT"
}
```

**Usage:**
1. Call this endpoint to get a presigned URL
2. Use the `uploadUrl` to upload the file directly to S3 using a PUT request
3. Set the `Content-Type` header to match the one specified

**Example:**
```bash
# Step 1: Get upload URL
curl -X POST "http://localhost:3000/aws/storage/upload-url" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "fileName": "user-456.jpg",
    "contentType": "image/jpeg"
  }'

# Step 2: Upload file to S3 using the presigned URL
curl -X PUT "PRESIGNED_URL_FROM_STEP_1" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@/path/to/user-456.jpg"
```

---

### 4. Get Presigned Download URL

Generate a presigned URL for downloading a file.

**Endpoint:** `POST /aws/storage/download-url`

**Request Body:**
```json
{
  "folder": "avatars",
  "fileName": "user-123.jpg"
}
```

**Response:**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/...",
  "key": "avatars/user-123.jpg",
  "fileName": "user-123.jpg",
  "expiresIn": 3600
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/aws/storage/download-url" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "fileName": "user-123.jpg"
  }'
```

---

### 5. Upload File (Direct)

Upload a file directly through the API (for small files). For larger files, use presigned URLs instead.

**Endpoint:** `POST /aws/storage/upload`

**Request:**
- Content-Type: `multipart/form-data`
- Form fields:
  - `file` - The file to upload
  - `folder` - Storage folder name
  - `fileName` (optional) - Custom file name (uses original name if not provided)

**Response:**
```json
{
  "success": true,
  "message": "File user-456.jpg uploaded successfully",
  "key": "avatars/user-456.jpg",
  "size": 2048576,
  "sizeKB": 2000.5,
  "sizeMB": 1.95
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/aws/storage/upload" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "folder=avatars" \
  -F "fileName=custom-name.jpg"
```

---

### 6. Rename File

Rename or move a file within the same folder.

**Endpoint:** `POST /aws/storage/rename`

**Request Body:**
```json
{
  "folder": "avatars",
  "oldFileName": "user-123-old.jpg",
  "newFileName": "user-123-new.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File renamed from user-123-old.jpg to user-123-new.jpg",
  "oldKey": "avatars/user-123-old.jpg",
  "newKey": "avatars/user-123-new.jpg"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3000/aws/storage/rename" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "oldFileName": "user-123-old.jpg",
    "newFileName": "user-123-new.jpg"
  }'
```

---

### 7. Delete Single File

Delete a single file from S3.

**Endpoint:** `DELETE /aws/storage/delete`

**Request Body:**
```json
{
  "folder": "avatars",
  "fileName": "user-123.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File user-123.jpg deleted successfully",
  "key": "avatars/user-123.jpg"
}
```

**Example:**
```bash
curl -X DELETE "http://localhost:3000/aws/storage/delete" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "fileName": "user-123.jpg"
  }'
```

---

### 8. Delete Multiple Files

Delete multiple files in a single operation.

**Endpoint:** `DELETE /aws/storage/delete-multiple`

**Request Body:**
```json
{
  "folder": "avatars",
  "fileNames": ["user-1.jpg", "user-2.jpg", "user-3.jpg"]
}
```

**Response:**
```json
{
  "success": true,
  "deleted": 3,
  "errors": 0,
  "deletedFiles": ["user-1.jpg", "user-2.jpg", "user-3.jpg"],
  "failedFiles": []
}
```

If some files fail:
```json
{
  "success": true,
  "deleted": 2,
  "errors": 1,
  "deletedFiles": ["user-1.jpg", "user-2.jpg"],
  "failedFiles": [
    {
      "file": "user-3.jpg",
      "code": "NoSuchKey",
      "message": "The specified key does not exist."
    }
  ]
}
```

**Example:**
```bash
curl -X DELETE "http://localhost:3000/aws/storage/delete-multiple" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "fileNames": ["user-1.jpg", "user-2.jpg", "user-3.jpg"]
  }'
```

---

## Error Handling

All endpoints return standard HTTP error codes:

- `400 Bad Request` - Invalid input or missing required fields
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - User doesn't have ADMIN role
- `404 Not Found` - File or folder not found
- `500 Internal Server Error` - Server error (with error message)

**Error Response Format:**
```json
{
  "statusCode": 400,
  "message": "Failed to upload file: Invalid file type",
  "error": "Bad Request"
}
```

---

## Best Practices

### For Large Files (> 5MB)
Use presigned URLs for better performance:
1. Call `/aws/storage/upload-url` to get a presigned URL
2. Upload directly to S3 from client using the presigned URL
3. This bypasses the backend server for the actual file transfer

### For Small Files (< 5MB)
Use the direct upload endpoint `/aws/storage/upload` for simplicity.

### File Naming
- Use lowercase alphanumeric characters and hyphens
- Avoid spaces and special characters
- Include appropriate file extensions
- Consider using UUIDs or user IDs in filenames to avoid conflicts

### Security
- All endpoints are restricted to ADMIN role only
- Presigned URLs expire after 1 hour (3600 seconds)
- Files are stored in private S3 buckets
- Access is controlled through presigned URLs

---

## Testing with curl

### Complete Upload Workflow

```bash
# 1. Get upload URL
UPLOAD_RESPONSE=$(curl -s -X POST "http://localhost:3000/aws/storage/upload-url" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "fileName": "test-avatar.jpg",
    "contentType": "image/jpeg"
  }')

# 2. Extract upload URL
UPLOAD_URL=$(echo $UPLOAD_RESPONSE | jq -r '.uploadUrl')

# 3. Upload file to S3
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@/path/to/test-avatar.jpg"

# 4. Verify upload
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Environment Variables

Required environment variables in `.env`:

```env
AWS_REGION=ap-south-1
S3_BUCKET_NAME=unifesto-storage-bucket
```

AWS credentials should be configured through:
- EC2 IAM Role (recommended for production)
- AWS credentials file (`~/.aws/credentials`)
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)

---

## Integration Examples

### JavaScript/TypeScript (Frontend)

```typescript
// Get upload URL
const getUploadUrl = async (folder: string, fileName: string) => {
  const response = await fetch('/aws/storage/upload-url', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      folder,
      fileName,
      contentType: 'image/jpeg',
    }),
  });
  return response.json();
};

// Upload file to S3
const uploadToS3 = async (presignedUrl: string, file: File) => {
  await fetch(presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });
};

// Complete workflow
const uploadFile = async (folder: string, file: File) => {
  const { uploadUrl } = await getUploadUrl(folder, file.name);
  await uploadToS3(uploadUrl, file);
  console.log('File uploaded successfully!');
};
```

---

## Summary

This API provides complete real-time storage management with:
- ✅ List files with metadata
- ✅ Upload files (direct or presigned URLs)
- ✅ Download files with presigned URLs
- ✅ Rename/move files
- ✅ Delete single or multiple files
- ✅ Get detailed file information
- ✅ Secure ADMIN-only access
- ✅ Real S3 integration (no mock data)
