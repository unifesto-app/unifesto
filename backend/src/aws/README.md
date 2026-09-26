# AWS Admin Module

This module provides comprehensive AWS infrastructure monitoring and management endpoints for the Unifesto admin dashboard.

## Features

- **Overview**: Summary of all AWS services with cost estimates
- **Compute**: EC2 instance details, resource usage metrics, and PM2 process monitoring
- **Database**: RDS instance information, CloudWatch metrics, table row counts, and migration history
- **Cache**: ElastiCache cluster details, Redis statistics, and OTP store monitoring
- **Storage**: S3 bucket information, object counts, and folder breakdown
- **Security**: IAM roles, attached policies, and security group rules
- **Cost**: Budget tracking, service cost breakdown, and optimization tips

## Endpoints

All endpoints require:
- JWT authentication (`JwtAuthGuard`)
- ADMIN role (`RolesGuard` with `@Roles('ADMIN')`)

### Base Path: `/aws`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/aws/health` | Infrastructure health check (DB, Redis, S3, App) |
| GET | `/aws/overview` | Summary of all AWS services with costs |
| GET | `/aws/compute` | EC2 instance details and PM2 processes |
| GET | `/aws/database` | RDS metrics, tables, and migrations |
| GET | `/aws/cache` | ElastiCache and Redis information |
| GET | `/aws/storage` | S3 bucket stats and folder breakdown |
| GET | `/aws/security` | IAM roles and security groups |
| GET | `/aws/cost` | Cost breakdown and budget tracking |

## Configuration

The following environment variables are used:

```env
# AWS Region
AWS_REGION=ap-south-1

# S3 Bucket
S3_BUCKET_NAME=unifesto-storage-bucket

# Database (from DATABASE_URL)
# Redis (from REDIS_HOST, REDIS_PORT, REDIS_TLS)
```

### Hardcoded AWS Resources

- EC2 Instance ID: `i-079d51280d1964117`
- RDS Identifier: `unifesto-db`
- ElastiCache Cluster: `unifesto-redis`
- IAM Role: `unifesto-ec2-role`
- Security Groups: `sg-011ff00ff3d1d9c85`, `sg-04c9d4a9d74c780e0`, `unifesto-rds-sg`

## Dependencies

```json
{
  "@aws-sdk/client-ec2": "^3.x",
  "@aws-sdk/client-rds": "^3.x",
  "@aws-sdk/client-elasticache": "^3.x",
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/client-iam": "^3.x",
  "@aws-sdk/client-cloudwatch": "^3.x"
}
```

## AWS Permissions Required

The IAM role/user running the application needs these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeSecurityGroups",
        "rds:DescribeDBInstances",
        "elasticache:DescribeCacheClusters",
        "s3:HeadBucket",
        "s3:ListBucket",
        "s3:GetBucketVersioning",
        "s3:GetPublicAccessBlock",
        "iam:GetRole",
        "iam:ListAttachedRolePolicies",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

## Usage Example

```typescript
// Make authenticated request to admin endpoint
const response = await axios.get('https://api.unifesto.app/aws/overview', {
  headers: {
    Authorization: `Bearer ${adminToken}`
  }
});
```

## Error Handling

The module gracefully handles AWS SDK failures by:
- Logging errors with context
- Returning fallback data with configuration values
- Not blocking other endpoints if one service fails

## Development

```bash
# Build the module
npm run build

# Run in development mode
npm run start:dev
```

## Notes

- CloudWatch metrics use 5-minute averages
- OTP keys are masked in responses (e.g., `ab***@gmail.com`)
- PM2 data requires PM2 to be installed and accessible
- Disk usage requires Linux/Unix system commands
