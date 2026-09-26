# Storage Management - Quick Start Guide

## Real-time S3 Storage Operations

All storage endpoints are now live with real S3 integration. No mock data!

## Quick Test Commands

### 1. List Files in Avatars Folder
```bash
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. Upload a File (Small Files)
```bash
curl -X POST "http://localhost:3000/aws/storage/upload" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "folder=avatars"
```

### 3. Get Upload URL for Large Files
```bash
curl -X POST "http://localhost:3000/aws/storage/upload-url" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "space-logos",
    "fileName": "my-logo.png",
    "contentType": "image/png"
  }'
```

Then upload to the returned URL:
```bash
curl -X PUT "PRESIGNED_URL_FROM_ABOVE" \
  -H "Content-Type: image/png" \
  --data-binary "@/path/to/my-logo.png"
```

### 4. Get File Details with Download URL
```bash
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files/user-123.jpg" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. Rename a File
```bash
curl -X POST "http://localhost:3000/aws/storage/rename" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "oldFileName": "old-name.jpg",
    "newFileName": "new-name.jpg"
  }'
```

### 6. Delete a File
```bash
curl -X DELETE "http://localhost:3000/aws/storage/delete" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "avatars",
    "fileName": "file-to-delete.jpg"
  }'
```

### 7. Delete Multiple Files
```bash
curl -X DELETE "http://localhost:3000/aws/storage/delete-multiple" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "space-banners",
    "fileNames": ["banner1.jpg", "banner2.jpg", "banner3.jpg"]
  }'
```

## Available Folders

1. **avatars** - User profile avatars
2. **space-logos** - Space/community logos
3. **space-banners** - Space/community banners

## Features Implemented

✅ **Real-time operations** - All operations interact with actual S3 bucket
✅ **Presigned URLs** - Secure, time-limited URLs for uploads/downloads
✅ **Direct uploads** - For small files via multipart/form-data
✅ **Batch operations** - Delete multiple files at once
✅ **File management** - List, rename, get details
✅ **Metadata** - File size, type, last modified, etc.
✅ **Security** - Admin-only access with JWT authentication

## How It Works

### Upload Flow (Large Files - Recommended)
1. Client requests presigned upload URL from backend
2. Backend generates presigned URL from S3 (valid for 1 hour)
3. Client uploads file directly to S3 using presigned URL
4. No file data passes through backend server

### Upload Flow (Small Files - Simple)
1. Client uploads file to backend endpoint
2. Backend receives file and uploads to S3
3. Returns success response with file metadata

### Download Flow
1. Client requests file details or download URL
2. Backend generates presigned download URL (valid for 1 hour)
3. Client downloads file directly from S3

## Testing Workflow

```bash
# 1. Start the backend
npm run start:dev

# 2. Get admin JWT token
curl -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your_password"
  }'

# Save the token
export JWT_TOKEN="your_jwt_token_here"

# 3. List current files
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files" \
  -H "Authorization: Bearer $JWT_TOKEN"

# 4. Upload a test file
curl -X POST "http://localhost:3000/aws/storage/upload" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-image.jpg" \
  -F "folder=avatars" \
  -F "fileName=test-avatar-$(date +%s).jpg"

# 5. Verify upload
curl -X GET "http://localhost:3000/aws/storage/folders/avatars/files" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## Environment Setup

Make sure these are in your `.env`:

```env
AWS_REGION=ap-south-1
S3_BUCKET_NAME=unifesto-storage-bucket
```

AWS credentials should be available via:
- EC2 IAM Role (if running on EC2)
- ~/.aws/credentials file
- Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)

## Integration with Frontend

### React/Next.js Example

```typescript
const uploadAvatar = async (file: File) => {
  // Get presigned URL
  const response = await fetch('/api/aws/storage/upload-url', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      folder: 'avatars',
      fileName: `avatar-${userId}-${Date.now()}.jpg`,
      contentType: file.type,
    }),
  });
  
  const { uploadUrl } = await response.json();
  
  // Upload directly to S3
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  
  return true;
};
```

## Performance Notes

- **Presigned URLs**: Best for files > 5MB (bypasses backend)
- **Direct upload**: Best for files < 5MB (simpler code)
- **Batch delete**: More efficient than multiple single deletes
- **URL expiration**: All presigned URLs expire after 1 hour

## Next Steps

1. Test all endpoints with real files
2. Integrate with frontend file upload components
3. Add file validation (size limits, file types)
4. Implement caching for frequently accessed files
5. Add CloudFront CDN for faster delivery
6. Monitor S3 costs and usage patterns

## Support

For issues or questions:
- Check AWS CloudWatch logs
- Verify IAM permissions
- Ensure S3 bucket exists and is accessible
- Check CORS configuration if accessing from browser

## API Documentation

See `STORAGE-API.md` for complete API reference.
