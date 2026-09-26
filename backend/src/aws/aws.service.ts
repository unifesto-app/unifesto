import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeSecurityGroupsCommand,
} from '@aws-sdk/client-ec2';
import {
  RDSClient,
  DescribeDBInstancesCommand,
} from '@aws-sdk/client-rds';
import {
  ElastiCacheClient,
  DescribeCacheClustersCommand,
  DescribeReplicationGroupsCommand,
} from '@aws-sdk/client-elasticache';
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  IAMClient,
  GetRoleCommand,
  ListAttachedRolePoliciesCommand,
} from '@aws-sdk/client-iam';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  GetCostForecastCommand,
} from '@aws-sdk/client-cost-explorer';
import {
  SESv2Client,
  GetAccountCommand,
  ListEmailIdentitiesCommand,
} from '@aws-sdk/client-sesv2';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class AwsService {
  private readonly logger = new Logger(AwsService.name);
  private readonly region = 'ap-south-1';
  private readonly ec2InstanceId = 'i-079d51280d1964117';
  private readonly rdsIdentifier = 'unifesto-db';
  private readonly cacheClusterId = 'unifesto-redis';
  private readonly s3BucketName: string;
  private readonly iamRoleName = 'unifesto-ec2-role';

  private readonly ec2Client: EC2Client;
  private readonly rdsClient: RDSClient;
  private readonly cacheClient: ElastiCacheClient;
  private readonly s3Client: S3Client;
  private readonly iamClient: IAMClient;
  private readonly cloudWatchClient: CloudWatchClient;
  private readonly costExplorerClient: CostExplorerClient;
  private readonly sesClient: SESv2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.s3BucketName = this.configService.get<string>('S3_BUCKET_NAME', 'unifesto-storage-bucket');

    // Initialize AWS clients
    const awsConfig = { region: this.region };
    this.ec2Client = new EC2Client(awsConfig);
    this.rdsClient = new RDSClient(awsConfig);
    this.cacheClient = new ElastiCacheClient(awsConfig);
    this.s3Client = new S3Client(awsConfig);
    this.iamClient = new IAMClient(awsConfig);
    this.cloudWatchClient = new CloudWatchClient(awsConfig);
    this.costExplorerClient = new CostExplorerClient(awsConfig);
    this.sesClient = new SESv2Client(awsConfig);
  }

  // =====================================================
  // INFRASTRUCTURE HEALTH
  // =====================================================
  async getInfrastructureHealth() {
    const [dbStatus, redisStatus, s3Status, appStatus] = await Promise.all([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkS3Health(),
      this.checkAppHealth(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      overall: this.calculateOverallStatus([dbStatus, redisStatus, s3Status, appStatus]),
      services: {
        database: dbStatus,
        redis: redisStatus,
        s3: s3Status,
        app: appStatus,
      },
    };
  }

  private async checkDatabaseHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', latencyMs: 0, message: 'Connected' };
    } catch (error) {
      return { status: 'unhealthy', latencyMs: null, message: error.message };
    }
  }

  private async checkRedisHealth() {
    try {
      const isHealthy = this.redisService.isHealthy();
      if (!isHealthy) {
        return { status: 'unhealthy', latencyMs: null, message: 'Not connected' };
      }
      const start = Date.now();
      await this.redisService.ping();
      const latency = Date.now() - start;
      return { status: 'healthy', latencyMs: latency, message: 'Connected' };
    } catch (error) {
      return { status: 'unhealthy', latencyMs: null, message: error.message };
    }
  }

  private async checkS3Health() {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.s3BucketName }));
      return { status: 'healthy', message: 'Accessible' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  private async checkAppHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      message: 'Running',
    };
  }

  private calculateOverallStatus(statuses: any[]): string {
    if (statuses.every((s) => s.status === 'healthy')) return 'healthy';
    if (statuses.some((s) => s.status === 'unhealthy')) return 'degraded';
    return 'unknown';
  }

  // =====================================================
  // OVERVIEW
  // =====================================================
  async getOverview() {
    const [ec2Data, rdsData, cacheData, s3Data] = await Promise.allSettled([
      this.getEC2Instance(),
      this.getRDSInstance(),
      this.getElastiCacheCluster(),
      this.getS3BucketInfo(),
    ]);

    return {
      region: this.region,
      services: {
        ec2: ec2Data.status === 'fulfilled' ? ec2Data.value : { error: 'Failed to fetch' },
        rds: rdsData.status === 'fulfilled' ? rdsData.value : { error: 'Failed to fetch' },
        elasticache: cacheData.status === 'fulfilled' ? cacheData.value : { error: 'Failed to fetch' },
        s3: s3Data.status === 'fulfilled' ? s3Data.value : { error: 'Failed to fetch' },
      },
    };
  }

  private async getEC2Instance() {
    try {
      const command = new DescribeInstancesCommand({
        InstanceIds: [this.ec2InstanceId],
      });
      const response = await this.ec2Client.send(command);
      const instance = response.Reservations?.[0]?.Instances?.[0];

      if (!instance) throw new Error('Instance not found');

      return {
        instanceId: instance.InstanceId,
        instanceType: instance.InstanceType,
        state: instance.State?.Name,
        publicIp: instance.PublicIpAddress,
        launchTime: instance.LaunchTime,
      };
    } catch (error) {
      this.logger.error('Failed to fetch EC2 data', error);
      return {
        instanceId: this.ec2InstanceId,
        instanceType: 't3.small',
        state: 'unknown',
        publicIp: null,
        launchTime: null,
      };
    }
  }

  private async getRDSInstance() {
    try {
      const command = new DescribeDBInstancesCommand({
        DBInstanceIdentifier: this.rdsIdentifier,
      });
      const response = await this.rdsClient.send(command);
      const instance = response.DBInstances?.[0];

      if (!instance) throw new Error('RDS instance not found');

      return {
        identifier: instance.DBInstanceIdentifier,
        status: instance.DBInstanceStatus,
        instanceClass: instance.DBInstanceClass,
        engine: instance.Engine,
        storageGB: instance.AllocatedStorage,
      };
    } catch (error) {
      this.logger.error('Failed to fetch RDS data', error);
      return {
        identifier: this.rdsIdentifier,
        status: 'unknown',
        instanceClass: 'db.t4g.small',
        engine: 'postgres',
        storageGB: 20,
      };
    }
  }

  private async getElastiCacheCluster() {
    try {
      const command = new DescribeCacheClustersCommand({
        CacheClusterId: this.cacheClusterId,
      });
      const response = await this.cacheClient.send(command);
      const cluster = response.CacheClusters?.[0];

      if (!cluster) throw new Error('ElastiCache cluster not found');

      return {
        clusterId: cluster.CacheClusterId,
        status: cluster.CacheClusterStatus,
        nodeType: cluster.CacheNodeType,
        engine: cluster.Engine,
      };
    } catch (error) {
      this.logger.error('Failed to fetch ElastiCache data', error);
      return {
        clusterId: this.cacheClusterId,
        status: 'unknown',
        nodeType: 'cache.t4g.micro',
        engine: 'redis',
      };
    }
  }

  private async getS3BucketInfo() {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.s3BucketName }));
      return {
        bucketName: this.s3BucketName,
        region: this.region,
      };
    } catch (error) {
      this.logger.error('Failed to fetch S3 data', error);
      return {
        bucketName: this.s3BucketName,
        region: this.region,
      };
    }
  }

  private async getIAMRole() {
    try {
      const command = new GetRoleCommand({ RoleName: this.iamRoleName });
      const response = await this.iamClient.send(command);
      return {
        roleName: response.Role?.RoleName,
      };
    } catch (error) {
      this.logger.error('Failed to fetch IAM data', error);
      return {
        roleName: this.iamRoleName,
      };
    }
  }

  // =====================================================
  // COMPUTE
  // =====================================================
  async getCompute() {
    const ec2Data = await this.getEC2InstanceDetails();
    const pm2Data = await this.getPM2Processes();

    return {
      ec2: ec2Data,
      pm2: pm2Data,
    };
  }

  private async getEC2InstanceDetails() {
    try {
      const [instanceData, cpuMetric, diskUsage] = await Promise.all([
        this.getEC2Instance(),
        this.getEC2CpuMetrics(),
        this.getDiskUsage(),
      ]);

      const command = new DescribeInstancesCommand({
        InstanceIds: [this.ec2InstanceId],
      });
      const response = await this.ec2Client.send(command);
      const instance = response.Reservations?.[0]?.Instances?.[0];

      const memoryUsage = process.memoryUsage();
      const totalMemoryMB = 2048; // t3.small has 2GB RAM

      return {
        ...instanceData,
        privateIp: instance?.PrivateIpAddress,
        availabilityZone: instance?.Placement?.AvailabilityZone,
        platform: instance?.Platform || 'Linux',
        cpu: {
          utilizationPercent: cpuMetric,
        },
        memory: {
          usedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          totalMB: totalMemoryMB,
          usedPercent: Math.round((memoryUsage.heapUsed / 1024 / 1024 / totalMemoryMB) * 100),
        },
        disk: diskUsage,
      };
    } catch (error) {
      this.logger.error('Failed to get EC2 details', error);
      throw error;
    }
  }

  private async getEC2CpuMetrics(): Promise<number> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // 5 minutes ago

      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/EC2',
        MetricName: 'CPUUtilization',
        Dimensions: [{ Name: 'InstanceId', Value: this.ec2InstanceId }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Average'],
      });

      const response = await this.cloudWatchClient.send(command);
      const datapoint = response.Datapoints?.[0];
      return datapoint?.Average ? Math.round(datapoint.Average) : 0;
    } catch (error) {
      this.logger.error('Failed to get CPU metrics', error);
      return 0;
    }
  }

  private async getDiskUsage() {
    try {
      const { stdout } = await execAsync("df -BG / | tail -1 | awk '{print $2,$3,$5}'");
      const [totalStr, usedStr, percentStr] = stdout.trim().split(' ');
      
      return {
        totalGB: parseInt(totalStr.replace('G', '')),
        usedGB: parseInt(usedStr.replace('G', '')),
        usedPercent: parseInt(percentStr.replace('%', '')),
      };
    } catch (error) {
      this.logger.error('Failed to get disk usage', error);
      return { totalGB: 30, usedGB: 10, usedPercent: 33 };
    }
  }

  private async getPM2Processes() {
    try {
      const { stdout } = await execAsync('pm2 jlist');
      const processes = JSON.parse(stdout);

      return processes.map((proc: any) => ({
        name: proc.name,
        pid: proc.pid,
        status: proc.pm2_env.status,
        uptime: Math.floor((Date.now() - proc.pm2_env.pm_uptime) / 1000),
        restarts: proc.pm2_env.restart_time,
        memoryMB: Math.round(proc.monit.memory / 1024 / 1024),
        cpu: proc.monit.cpu,
        mode: proc.pm2_env.exec_mode,
      }));
    } catch {
      // pm2 isn't present in the containerised deploy (the app runs as PID 1
      // via `node dist/src/main.js`). Treat as "no pm2 processes" rather than
      // an error so it doesn't spam the logs on every /aws/compute poll.
      this.logger.debug('pm2 not available — reporting no PM2 processes');
      return [];
    }
  }

  // =====================================================
  // DATABASE
  // =====================================================
  async getDatabase() {
    const [rdsData, tablesData, migrationsData] = await Promise.all([
      this.getRDSDetails(),
      this.getTableCounts(),
      this.getMigrations(),
    ]);

    return {
      rds: rdsData,
      tables: tablesData,
      migrations: migrationsData,
    };
  }

  private async getRDSDetails() {
    try {
      const command = new DescribeDBInstancesCommand({
        DBInstanceIdentifier: this.rdsIdentifier,
      });
      const response = await this.rdsClient.send(command);
      const instance = response.DBInstances?.[0];

      if (!instance) throw new Error('RDS instance not found');

      // Fetch CloudWatch metrics
      const [cpuPercent, connectionCount, freeStorage, readLatency, writeLatency] = 
        await Promise.all([
          this.getRDSMetric('CPUUtilization'),
          this.getRDSMetric('DatabaseConnections'),
          this.getRDSMetric('FreeStorageSpace'),
          this.getRDSMetric('ReadLatency'),
          this.getRDSMetric('WriteLatency'),
        ]);

      return {
        identifier: instance.DBInstanceIdentifier,
        status: instance.DBInstanceStatus,
        instanceClass: instance.DBInstanceClass,
        engine: instance.Engine,
        engineVersion: instance.EngineVersion,
        storageGB: instance.AllocatedStorage,
        storageType: instance.StorageType,
        multiAZ: instance.MultiAZ,
        backupRetention: instance.BackupRetentionPeriod,
        endpoint: instance.Endpoint?.Address,
        port: instance.Endpoint?.Port,
        metrics: {
          cpuPercent: Math.round(cpuPercent || 0),
          connectionCount: Math.round(connectionCount || 0),
          freeStorageGB: Math.round((freeStorage || 0) / 1024 / 1024 / 1024),
          readLatencyMs: Math.round((readLatency || 0) * 1000),
          writeLatencyMs: Math.round((writeLatency || 0) * 1000),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get RDS details', error);
      throw error;
    }
  }

  private async getRDSMetric(metricName: string): Promise<number> {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000);

      const command = new GetMetricStatisticsCommand({
        Namespace: 'AWS/RDS',
        MetricName: metricName,
        Dimensions: [{ Name: 'DBInstanceIdentifier', Value: this.rdsIdentifier }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Average'],
      });

      const response = await this.cloudWatchClient.send(command);
      return response.Datapoints?.[0]?.Average || 0;
    } catch (error) {
      return 0;
    }
  }

  private async getTableCounts() {
    const tables = [
      'users',
      'user_identities',
      'roles',
      'user_roles',
      'spaces',
      'discussions',
      'discussion_replies',
    ];

    const counts = await Promise.all(
      tables.map(async (table) => {
        try {
          const [countResult, sizeResult]: any = await Promise.all([
            this.prisma.$queryRawUnsafe(
              `SELECT COUNT(*) as count FROM "${table}"`,
            ),
            this.prisma.$queryRawUnsafe(
              `SELECT pg_total_relation_size('"${table}"') as size`,
            ),
          ]);
          
          const rowCount = parseInt(countResult[0].count);
          const sizeMB = sizeResult[0].size 
            ? parseFloat((parseInt(sizeResult[0].size) / 1024 / 1024).toFixed(2))
            : 0;
            
          return { name: table, rowCount, sizeMB };
        } catch (error) {
          this.logger.error(`Failed to count ${table}`, error);
          return { name: table, rowCount: 0, sizeMB: 0 };
        }
      }),
    );

    return counts;
  }

  private async getMigrations() {
    try {
      const migrations: any = await this.prisma.$queryRaw`
        SELECT migration_name as name, finished_at as "appliedAt"
        FROM _prisma_migrations
        ORDER BY finished_at DESC
        LIMIT 10
      `;

      return migrations.map((m: any) => ({
        name: m.name,
        appliedAt: m.appliedAt,
      }));
    } catch (error) {
      this.logger.error('Failed to get migrations', error);
      return [];
    }
  }

  // =====================================================
  // TABLE DETAILS
  // =====================================================
  async getTableDetails(tableName: string) {
    try {
      // Get table schema
      const schema: any = await this.prisma.$queryRawUnsafe(`
        SELECT 
          column_name as "columnName",
          data_type as "dataType",
          is_nullable as "isNullable",
          column_default as "columnDefault",
          CASE 
            WHEN column_name IN (
              SELECT a.attname
              FROM pg_index i
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
              WHERE i.indrelid = '${tableName}'::regclass AND i.indisprimary
            ) THEN 'PRI'
            WHEN column_name IN (
              SELECT a.attname
              FROM pg_index i
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
              WHERE i.indrelid = '${tableName}'::regclass AND i.indisunique AND NOT i.indisprimary
            ) THEN 'UNI'
            WHEN column_name IN (
              SELECT a.attname
              FROM pg_index i
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
              WHERE i.indrelid = '${tableName}'::regclass AND NOT i.indisunique AND NOT i.indisprimary
            ) THEN 'MUL'
            ELSE ''
          END as "columnKey"
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `);

      // Get row count
      const countResult: any = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as count FROM "${tableName}"`,
      );
      const rowCount = parseInt(countResult[0].count);

      // Get table size
      const sizeResult: any = await this.prisma.$queryRawUnsafe(`
        SELECT pg_total_relation_size('"${tableName}"') as size
      `);
      const sizeMB = sizeResult[0].size 
        ? parseFloat((parseInt(sizeResult[0].size) / 1024 / 1024).toFixed(2))
        : 0;

      // Get sample data (first 50 rows)
      const rows = await this.prisma.$queryRawUnsafe(
        `SELECT * FROM "${tableName}" LIMIT 50`,
      );

      return {
        tableName,
        schema,
        rows,
        stats: {
          rowCount,
          sizeMB,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get table details for ${tableName}`, error);
      throw error;
    }
  }

  // =====================================================
  // CACHE
  // =====================================================
  async getCache() {
    const [elasticacheData, redisData, otpData] = await Promise.all([
      this.getElastiCacheDetails(),
      this.getRedisInfo(),
      this.getOTPStoreInfo(),
    ]);

    return {
      elasticache: elasticacheData,
      redis: redisData,
      otpStore: otpData,
    };
  }

  private async getElastiCacheDetails() {
    try {
      // Use DescribeReplicationGroups instead of DescribeCacheClusters
      // for the cluster status since it's a replication group
      const command = new DescribeReplicationGroupsCommand({
        ReplicationGroupId: 'unifesto-redis',
      });
      const response = await this.cacheClient.send(command);
      const group = response.ReplicationGroups?.[0];

      return {
        clusterId: 'unifesto-redis',
        status: group?.Status || 'unknown',
        nodeType: 'cache.t4g.micro',
        engine: 'valkey',
        engineVersion: '7.2.6',
        endpoint: group?.NodeGroups?.[0]?.PrimaryEndpoint?.Address || null,
        port: 6379,
        tls: true,
      };
    } catch (error) {
      this.logger.error('Failed to get ElastiCache details', error);
      return {
        clusterId: 'unifesto-redis',
        status: 'unknown',
        nodeType: 'cache.t4g.micro',
        engine: 'valkey',
        engineVersion: '7.2.6',
        endpoint: null,
        port: 6379,
        tls: true,
      };
    }
  }

  private async getRedisInfo() {
    try {
      const client = this.redisService.getClient();
      if (!client) {
        return {
          connected: false,
          info: null,
        };
      }

      const infoStr = await client.info();
      const info = this.parseRedisInfo(infoStr);

      // Get keyspace info
      const dbKeys = await client.dbsize();
      const keyspaceInfo = info['keyspace_hits'] && info['keyspace_misses']
        ? {
            hits: parseInt(info['keyspace_hits']),
            misses: parseInt(info['keyspace_misses']),
          }
        : null;

      const hitRate = keyspaceInfo
        ? Math.round((keyspaceInfo.hits / (keyspaceInfo.hits + keyspaceInfo.misses)) * 100)
        : 0;

      return {
        connected: true,
        info: {
          usedMemoryMB: Math.round(parseInt(info['used_memory'] || '0') / 1024 / 1024),
          maxMemoryMB: Math.round(parseInt(info['maxmemory'] || '512000000') / 1024 / 1024),
          usedMemoryPercent: parseInt(info['used_memory_rss_human'] || '0'),
          connectedClients: parseInt(info['connected_clients'] || '0'),
          totalKeysCount: dbKeys,
          hitRate,
          uptimeSeconds: parseInt(info['uptime_in_seconds'] || '0'),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get Redis info', error);
      return {
        connected: false,
        info: null,
      };
    }
  }

  private parseRedisInfo(infoStr: string): Record<string, string> {
    const info: Record<string, string> = {};
    const lines = infoStr.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          info[key] = value;
        }
      }
    }
    
    return info;
  }

  private async getOTPStoreInfo() {
    try {
      const client = this.redisService.getClient();
      if (!client) {
        return { activeCount: 0, keys: [] };
      }

      const otpKeys = await client.keys('otp:*');
      const maskedKeys = otpKeys.map((key) => {
        const identifier = key.replace('otp:', '');
        if (identifier.includes('@')) {
          // Email masking: ab***@gmail.com
          const [local, domain] = identifier.split('@');
          return `${local.substring(0, 2)}***@${domain}`;
        } else {
          // Phone masking: +91***1234
          return `${identifier.substring(0, 3)}***${identifier.slice(-4)}`;
        }
      });

      return {
        activeCount: otpKeys.length,
        keys: maskedKeys,
      };
    } catch (error) {
      this.logger.error('Failed to get OTP store info', error);
      return { activeCount: 0, keys: [] };
    }
  }

  // =====================================================
  // STORAGE
  // =====================================================
  async getStorage() {
    try {
      const [bucketInfo, stats, folders] = await Promise.all([
        this.getS3BucketDetails(),
        this.getS3Stats(),
        this.getS3Folders(),
      ]);

      return {
        bucket: bucketInfo,
        stats,
        folders,
      };
    } catch (error) {
      this.logger.error('Failed to get storage info', error);
      throw error;
    }
  }

  private async getS3BucketDetails() {
    try {
      const [versioning, publicAccess] = await Promise.all([
        this.s3Client.send(
          new GetBucketVersioningCommand({ Bucket: this.s3BucketName }),
        ),
        this.s3Client
          .send(
            new GetPublicAccessBlockCommand({ Bucket: this.s3BucketName }),
          )
          .catch(() => null),
      ]);

      return {
        name: this.s3BucketName,
        region: this.region,
        versioning: versioning.Status === 'Enabled',
        publicAccess: publicAccess
          ? !publicAccess.PublicAccessBlockConfiguration?.BlockPublicAcls
          : false,
      };
    } catch (error) {
      this.logger.error('Failed to get S3 bucket details', error);
      return {
        name: this.s3BucketName,
        region: this.region,
        versioning: false,
        publicAccess: false,
      };
    }
  }

  private async getS3Stats() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.s3BucketName,
      });
      const response = await this.s3Client.send(command);

      const totalObjects = response.KeyCount || 0;
      const totalSizeMB = response.Contents
        ? Math.round(
            response.Contents.reduce((sum, obj) => sum + (obj.Size || 0), 0) /
              1024 /
              1024,
          )
        : 0;

      return {
        totalObjects,
        totalSizeMB,
      };
    } catch (error) {
      this.logger.error('Failed to get S3 stats', error);
      return {
        totalObjects: 0,
        totalSizeMB: 0,
      };
    }
  }

  private async getS3Folders() {
    try {
      // First, get all top-level prefixes (folders)
      const command = new ListObjectsV2Command({
        Bucket: this.s3BucketName,
        Delimiter: '/',
      });
      
      const response = await this.s3Client.send(command);
      
      // Get all top-level prefixes (folders)
      const prefixes = response.CommonPrefixes?.map(p => p.Prefix) || [];

      const folders = await Promise.all(
        prefixes.map(async (prefix) => {
          try {
            const folderObjects = new ListObjectsV2Command({
              Bucket: this.s3BucketName,
              Prefix: prefix,
            });
            const folderResponse = await this.s3Client.send(folderObjects);
            const objects = folderResponse.Contents || [];
            const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
            
            return {
              prefix,
              objectCount: objects.length,
              sizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
              recentFiles: objects
                .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0))
                .slice(0, 5)
                .map(obj => ({
                  key: obj.Key,
                  size: obj.Size,
                  lastModified: obj.LastModified,
                  url: `https://${this.s3BucketName}.s3.${this.region}.amazonaws.com/${obj.Key}`,
                })),
            };
          } catch (error) {
            this.logger.error(`Failed to get S3 folder ${prefix}`, error);
            return {
              prefix,
              objectCount: 0,
              sizeMB: 0,
              recentFiles: [],
            };
          }
        }),
      );

      return folders;
    } catch (error) {
      this.logger.error('Failed to get S3 folders', error);
      return [];
    }
  }

  // =====================================================
  // STORAGE FILE MANAGEMENT (Real-time S3 Operations)
  // =====================================================

  /**
   * List all files in a specific folder
   */
  async listFiles(folder: string) {
    try {
      const prefix = folder.endsWith('/') ? folder : `${folder}/`;
      const command = new ListObjectsV2Command({
        Bucket: this.s3BucketName,
        Prefix: prefix,
        MaxKeys: 1000,
      });
      
      const response = await this.s3Client.send(command);
      const objects = response.Contents || [];

      // Filter out the folder itself (empty key)
      const files = objects
        .filter((obj) => obj.Key !== prefix)
        .map((obj) => ({
          key: obj.Key,
          fileName: obj.Key?.replace(prefix, ''),
          size: obj.Size || 0,
          sizeKB: Math.round((obj.Size || 0) / 1024 * 100) / 100,
          sizeMB: Math.round((obj.Size || 0) / 1024 / 1024 * 100) / 100,
          lastModified: obj.LastModified,
          eTag: obj.ETag,
        }))
        .sort((a, b) => (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0));

      return {
        folder: prefix,
        count: files.length,
        totalSizeMB: Math.round(files.reduce((sum, f) => sum + f.sizeMB, 0) * 100) / 100,
        files,
      };
    } catch (error) {
      this.logger.error(`Failed to list files in folder ${folder}`, error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for uploading a file
   */
  async getUploadUrl(folder: string, fileName: string, contentType?: string) {
    try {
      const key = `${folder}/${fileName}`;
      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: key,
        ContentType: contentType || 'application/octet-stream',
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour

      return {
        uploadUrl,
        key,
        fileName,
        expiresIn: 3600,
        method: 'PUT',
      };
    } catch (error) {
      this.logger.error(`Failed to generate upload URL for ${fileName}`, error);
      throw new Error(`Failed to generate upload URL: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async getDownloadUrl(folder: string, fileName: string) {
    try {
      const key = `${folder}/${fileName}`;
      const command = new GetObjectCommand({
        Bucket: this.s3BucketName,
        Key: key,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 }); // 1 hour

      return {
        downloadUrl,
        key,
        fileName,
        expiresIn: 3600,
      };
    } catch (error) {
      this.logger.error(`Failed to generate download URL for ${fileName}`, error);
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }
  }

  /**
   * Delete a single file
   */
  async deleteFile(folder: string, fileName: string) {
    try {
      const key = `${folder}/${fileName}`;
      const command = new DeleteObjectCommand({
        Bucket: this.s3BucketName,
        Key: key,
      });

      await this.s3Client.send(command);

      return {
        success: true,
        message: `File ${fileName} deleted successfully`,
        key,
      };
    } catch (error) {
      this.logger.error(`Failed to delete file ${fileName}`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(folder: string, fileNames: string[]) {
    try {
      const keys = fileNames.map((name) => ({ Key: `${folder}/${name}` }));
      
      const command = new DeleteObjectsCommand({
        Bucket: this.s3BucketName,
        Delete: {
          Objects: keys,
          Quiet: false,
        },
      });

      const response = await this.s3Client.send(command);

      return {
        success: true,
        deleted: response.Deleted?.length || 0,
        errors: response.Errors?.length || 0,
        deletedFiles: response.Deleted?.map((d) => d.Key?.split('/').pop()),
        failedFiles: response.Errors?.map((e) => ({
          file: e.Key?.split('/').pop(),
          code: e.Code,
          message: e.Message,
        })),
      };
    } catch (error) {
      this.logger.error(`Failed to delete multiple files`, error);
      throw new Error(`Failed to delete files: ${error.message}`);
    }
  }

  /**
   * Rename/move a file (copy + delete)
   */
  async renameFile(folder: string, oldFileName: string, newFileName: string) {
    try {
      const oldKey = `${folder}/${oldFileName}`;
      const newKey = `${folder}/${newFileName}`;

      // Copy to new location
      const copyCommand = new CopyObjectCommand({
        Bucket: this.s3BucketName,
        CopySource: `${this.s3BucketName}/${oldKey}`,
        Key: newKey,
      });

      await this.s3Client.send(copyCommand);

      // Delete old file
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.s3BucketName,
        Key: oldKey,
      });

      await this.s3Client.send(deleteCommand);

      return {
        success: true,
        message: `File renamed from ${oldFileName} to ${newFileName}`,
        oldKey,
        newKey,
      };
    } catch (error) {
      this.logger.error(`Failed to rename file ${oldFileName}`, error);
      throw new Error(`Failed to rename file: ${error.message}`);
    }
  }

  /**
   * Get file metadata and presigned URL
   */
  async getFileDetails(folder: string, fileName: string) {
    try {
      const key = `${folder}/${fileName}`;
      
      // Get file metadata
      const headCommand = new GetObjectCommand({
        Bucket: this.s3BucketName,
        Key: key,
      });

      const metadata = await this.s3Client.send(headCommand);

      // Generate download URL
      const downloadUrl = await getSignedUrl(this.s3Client, headCommand, { expiresIn: 3600 });

      return {
        key,
        fileName,
        size: metadata.ContentLength || 0,
        sizeKB: Math.round((metadata.ContentLength || 0) / 1024 * 100) / 100,
        sizeMB: Math.round((metadata.ContentLength || 0) / 1024 / 1024 * 100) / 100,
        contentType: metadata.ContentType,
        lastModified: metadata.LastModified,
        eTag: metadata.ETag,
        downloadUrl,
        downloadUrlExpiresIn: 3600,
      };
    } catch (error) {
      this.logger.error(`Failed to get file details for ${fileName}`, error);
      throw new Error(`Failed to get file details: ${error.message}`);
    }
  }

  /**
   * Upload file directly (for small files)
   */
  async uploadFile(folder: string, fileName: string, fileBuffer: Buffer, contentType?: string) {
    try {
      const key = `${folder}/${fileName}`;
      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType || 'application/octet-stream',
      });

      await this.s3Client.send(command);

      return {
        success: true,
        message: `File ${fileName} uploaded successfully`,
        key,
        size: fileBuffer.length,
        sizeKB: Math.round(fileBuffer.length / 1024 * 100) / 100,
        sizeMB: Math.round(fileBuffer.length / 1024 / 1024 * 100) / 100,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file ${fileName}`, error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  // =====================================================
  // SECURITY
  // =====================================================
  async getSecurity() {
    const [iamData, securityGroups] = await Promise.all([
      this.getIAMRoleDetails(),
      this.getSecurityGroups(),
    ]);

    return {
      iamRole: iamData,
      securityGroups,
    };
  }

  private async getIAMRoleDetails() {
    try {
      const [roleData, policiesData] = await Promise.all([
        this.iamClient.send(new GetRoleCommand({ RoleName: this.iamRoleName })),
        this.iamClient.send(
          new ListAttachedRolePoliciesCommand({ RoleName: this.iamRoleName }),
        ),
      ]);

      return {
        name: roleData.Role?.RoleName,
        arn: roleData.Role?.Arn,
        createDate: roleData.Role?.CreateDate,
        attachedPolicies:
          policiesData.AttachedPolicies?.map((p) => ({
            name: p.PolicyName,
            arn: p.PolicyArn,
          })) || [],
        lastUsed: null,
      };
    } catch (error) {
      this.logger.error('Failed to get IAM role details', error);
      return {
        name: this.iamRoleName,
        arn: null,
        createDate: null,
        attachedPolicies: [],
        lastUsed: null,
      };
    }
  }

  private async getSecurityGroups() {
    try {
      const sgIds = [
        'sg-011ff00ff3d1d9c85',
        'sg-04c9d4a9d74c780e0',
        'unifesto-rds-sg',
      ];

      const command = new DescribeSecurityGroupsCommand({
        Filters: [
          {
            Name: 'group-id',
            Values: sgIds.filter((id) => id.startsWith('sg-')),
          },
        ],
      });
      const response = await this.ec2Client.send(command);

      return (
        response.SecurityGroups?.map((sg) => ({
          id: sg.GroupId,
          name: sg.GroupName,
          description: sg.Description,
          inboundRules:
            sg.IpPermissions?.map((rule) => ({
              type: rule.IpProtocol === '-1' ? 'All' : rule.IpProtocol || 'Custom',
              port:
                rule.FromPort === rule.ToPort
                  ? rule.FromPort
                  : `${rule.FromPort}-${rule.ToPort}`,
              protocol: rule.IpProtocol,
              source:
                rule.IpRanges?.[0]?.CidrIp ||
                rule.UserIdGroupPairs?.[0]?.GroupId ||
                'N/A',
            })) || [],
          outboundRules:
            sg.IpPermissionsEgress?.map((rule) => ({
              type: rule.IpProtocol === '-1' ? 'All' : rule.IpProtocol || 'Custom',
              port:
                rule.FromPort === rule.ToPort
                  ? rule.FromPort
                  : `${rule.FromPort}-${rule.ToPort}`,
              protocol: rule.IpProtocol,
              destination:
                rule.IpRanges?.[0]?.CidrIp ||
                rule.UserIdGroupPairs?.[0]?.GroupId ||
                'N/A',
            })) || [],
        })) || []
      );
    } catch (error) {
      this.logger.error('Failed to get security groups', error);
      return [];
    }
  }

  // =====================================================
  // COST
  // =====================================================
  async getCost() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(1); // First day of current month

      // Get cost and usage for current month
      const costCommand = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.toISOString().split('T')[0],
          End: endDate.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['UnblendedCost'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      });

      const costResponse = await this.costExplorerClient.send(costCommand);

      // Get forecast for rest of month
      const forecastEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0); // Last day of month
      const forecastCommand = new GetCostForecastCommand({
        TimePeriod: {
          Start: endDate.toISOString().split('T')[0],
          End: forecastEndDate.toISOString().split('T')[0],
        },
        Metric: 'UNBLENDED_COST',
        Granularity: 'MONTHLY',
      });

      const forecastResponse = await this.costExplorerClient.send(forecastCommand);

      // Parse current month costs by service
      const servicesCost: Record<string, number> = {};
      let totalCost = 0;

      if (costResponse.ResultsByTime && costResponse.ResultsByTime.length > 0) {
        const groups = costResponse.ResultsByTime[0].Groups || [];
        
        for (const group of groups) {
          const serviceName = group.Keys?.[0] || 'Other';
          const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0');
          servicesCost[serviceName] = Math.round(amount * 100) / 100;
          totalCost += amount;
        }
      }

      // Get forecast amount
      const forecastAmount = forecastResponse.Total?.Amount 
        ? parseFloat(forecastResponse.Total.Amount)
        : 0;

      const projectedTotal = Math.round((totalCost + forecastAmount) * 100) / 100;
      totalCost = Math.round(totalCost * 100) / 100;

      return {
        currentMonthCost: totalCost,
        forecastedCost: Math.round(forecastAmount * 100) / 100,
        projectedMonthEndCost: projectedTotal,
        currency: 'USD',
        billingPeriod: {
          start: startDate.toISOString().split('T')[0],
          end: forecastEndDate.toISOString().split('T')[0],
          current: endDate.toISOString().split('T')[0],
        },
        serviceBreakdown: Object.entries(servicesCost)
          .sort(([, a], [, b]) => b - a)
          .map(([service, cost]) => ({
            service,
            cost,
            percentage: totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0,
          })),
      };
    } catch (error) {
      this.logger.error('Failed to fetch cost data from AWS Cost Explorer', error);
      
      // Fallback to estimated data if Cost Explorer fails
      return {
        currentMonthCost: 65,
        forecastedCost: 10,
        projectedMonthEndCost: 75,
        currency: 'USD',
        billingPeriod: {
          start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
          current: new Date().toISOString().split('T')[0],
        },
        serviceBreakdown: [
          { service: 'Amazon Relational Database Service', cost: 33, percentage: 51 },
          { service: 'Amazon Elastic Compute Cloud', cost: 15, percentage: 23 },
          { service: 'Amazon ElastiCache', cost: 12, percentage: 18 },
          { service: 'Amazon Simple Storage Service', cost: 5, percentage: 8 },
        ],
        error: 'Using estimated costs - Cost Explorer data unavailable',
      };
    }
  }

  // =====================================================
  // SES (Simple Email Service)
  // =====================================================
  async getSES() {
    try {
      const [accountInfo, identities, quota, stats] = await Promise.allSettled([
        this.getSESAccount(),
        this.getSESIdentities(),
        this.getSESSendQuota(),
        this.getSESSendStats(),
      ]);

      return {
        config: accountInfo.status === 'fulfilled' ? accountInfo.value : {},
        identities: identities.status === 'fulfilled' ? identities.value : [],
        quota: quota.status === 'fulfilled' ? quota.value : {},
        stats: stats.status === 'fulfilled' ? stats.value : {},
        recentActivity: [], // Can be populated from database logs if available
      };
    } catch (error) {
      this.logger.error('Failed to get SES data', error);
      throw error;
    }
  }

  private async getSESAccount() {
    try {
      const command = new GetAccountCommand({});
      const response = await this.sesClient.send(command);

      return {
        region: this.region,
        sendingEnabled: response.SendingEnabled || false,
        productionAccess: response.ProductionAccessEnabled || false,
        accountStatus: response.SendingEnabled ? 'verified' : 'pending',
      };
    } catch (error) {
      this.logger.error('Failed to get SES account info', error);
      return {
        region: this.region,
        sendingEnabled: false,
        productionAccess: false,
        accountStatus: 'unknown',
      };
    }
  }

  private async getSESIdentities() {
    try {
      const command = new ListEmailIdentitiesCommand({});
      const response = await this.sesClient.send(command);

      return (
        response.EmailIdentities?.map((identity) => ({
          identity: identity.IdentityName,
          type: identity.IdentityType,
          verificationStatus: identity.SendingEnabled ? 'verified' : 'pending',
        })) || []
      );
    } catch (error) {
      this.logger.error('Failed to get SES identities', error);
      return [];
    }
  }

  private async getSESSendQuota() {
    try {
      // Note: SESv2 doesn't have a direct GetSendQuota command
      // You would typically get this from CloudWatch metrics or account settings
      // For now, returning estimated values based on typical SES sandbox/production limits
      
      const accountInfo = await this.getSESAccount();
      const isProduction = accountInfo.productionAccess;

      return {
        max24HourSend: isProduction ? 50000 : 200, // Production: 50k, Sandbox: 200
        maxSendRate: isProduction ? 14 : 1, // Production: 14/sec, Sandbox: 1/sec
        sentLast24Hours: 0, // Would need to track this in your own database
      };
    } catch (error) {
      this.logger.error('Failed to get SES send quota', error);
      return {
        max24HourSend: 200,
        maxSendRate: 1,
        sentLast24Hours: 0,
      };
    }
  }

  private async getSESSendStats() {
    try {
      // Note: SESv2 doesn't have GetSendStatistics
      // You would need to track these metrics yourself via CloudWatch or in your database
      // This is a placeholder implementation
      
      // You could enhance this by querying your email logs from database
      // Example: const emailLogs = await this.prisma.emailLog.findMany({ ... });
      
      return {
        sentLast24h: 0,
        bouncesLast24h: 0,
        complaintsLast24h: 0,
        rejectsLast24h: 0,
        deliveryRate: 100,
        bounceRate: '0.00',
        complaintRate: '0.00',
      };
    } catch (error) {
      this.logger.error('Failed to get SES send statistics', error);
      return {
        sentLast24h: 0,
        bouncesLast24h: 0,
        complaintsLast24h: 0,
        rejectsLast24h: 0,
        deliveryRate: 100,
        bounceRate: '0.00',
        complaintRate: '0.00',
      };
    }
  }
}
