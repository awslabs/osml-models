# OSML Models – CDK Infrastructure

This CDK project deploys the infrastructure for running **OSML Models** on AWS, including SageMaker endpoints for the aircraft detection model.

---

## Prerequisites

Before deploying, ensure the following tools and resources are available:

- **AWS CLI** configured with credentials
- **AWS CDK CLI** installed (`npm install -g aws-cdk`)
- **Node.js** and **npm** installed
- **Docker** installed and running (if building container images from source)
- An existing **VPC** with private subnets and NAT Gateway (optional - a new VPC will be created if not specified)

---

## Stacks Overview

This CDK application deploys multiple stacks that work together to provide the complete OSML Models infrastructure.

### NetworkStack (`<project-name>-Network`)

The **NetworkStack** provides the foundational networking infrastructure that all other stacks depend on.

**Resources Created:**

- **VPC**: Either creates a new VPC or imports an existing one based on configuration
- **Security Groups**: Network security rules for model endpoints
- **Subnet Selection**: Configures which subnets to use for resource deployment

### ModelEndpointStack (`<project-name>-ModelEndpoint`)

The **ModelEndpointStack** deploys the SageMaker endpoints for ML model inference.

**Resources Created:**

- **SageMaker Endpoint**: Real-time inference endpoint for the aircraft detection model
- **IAM Role**: SageMaker execution role with permissions for ECR, S3, and CloudWatch
- **Container Image**: Model container (built from source or pulled from registry)

### IntegrationTestStack (`<project-name>-IntegrationTest`) (Optional)

The **IntegrationTestStack** deploys test infrastructure for development and integration testing.

---

## Project Structure

The CDK application follows a standard structure with clear separation of concerns:

```
cdk/
├── bin/                                # Application entry points
│   ├── app.ts                          # CDK application entry point - instantiates stacks
│   └── deployment/                     # Deployment configuration management
│       ├── deployment.json             # Active deployment configuration (gitignored)
│       ├── deployment.json.example     # Configuration template with examples
│       └── load-deployment.ts          # Configuration loader with validation logic
│
├── lib/                                # Stack implementations
│   ├── network-stack.ts                # VPC, subnets, and security groups
│   ├── model-endpoint-stack.ts         # SageMaker endpoint and supporting resources
│   ├── integration-test-stack.ts       # Integration test resources (optional)
│   └── constructs/                     # Reusable CDK constructs
│       ├── model-endpoint/             # Model endpoint related constructs
│       │   ├── sagemaker-endpoint.ts   # SageMaker endpoint construct (CfnModel, CfnEndpointConfig, CfnEndpoint)
│       │   ├── container.ts            # Container image management (build from source or pull from registry)
│       │   └── roles/                  # IAM role constructs
│       │       └── sagemaker-role.ts   # SageMaker execution role with ECR, S3, CloudWatch permissions
│       └── network/                    # Network related constructs
│           └── network-config.ts       # Network configuration class
│
├── test/                               # Jest unit and property-based tests
│   ├── network-stack.test.ts           # Network stack synthesis and resource tests
│   ├── model-endpoint-stack.test.ts    # Model endpoint stack tests with CDK-Nag validation
│   ├── integration-test-stack.test.ts  # Integration test stack tests
│   ├── load-deployment.test.ts         # Configuration loader validation tests (property-based)
│   └── test-utils.ts                   # Shared test utilities and CDK-Nag report generation
│
├── package.json                        # NPM dependencies and scripts
├── tsconfig.json                       # TypeScript compiler configuration
├── eslint.config.mjs                   # ESLint rules for code quality
├── jest.config.js                      # Jest test configuration with global teardown
├── .prettierrc                         # Prettier code formatting rules
├── .gitignore                          # Git ignore patterns (includes deployment.json)
├── cdk.json                            # CDK application configuration and feature flags
├── cdk.context.json                    # CDK context values (auto-generated, gitignored)
├── cdk-nag-suppressions-report.txt     # CDK-Nag suppression report (auto-generated)
└── README.md                           # This file
```

### Key Directories

- **`bin/`**: Contains the application entry point (`app.ts`) that loads configuration and instantiates all stacks. The `deployment/` subdirectory manages deployment-specific configuration.

- **`lib/`**: Contains all CDK stack implementations. Stacks are organized by purpose (network, model endpoint, integration tests). The `constructs/` subdirectory contains reusable L2/L3 constructs.

- **`test/`**: Contains Jest unit tests and property-based tests for all stacks and constructs. Tests validate stack synthesis, resource creation, and configuration validation.

### Important Files

- **`deployment.json`**: Active deployment configuration (not committed to git). Copy from `deployment.json.example` and customize for your environment.

- **`cdk-nag-suppressions-report.txt`**: Auto-generated report of all CDK-Nag suppressions across all stacks. Generated after running `npm test`.

- **`cdk.context.json`**: Auto-generated file containing CDK context values (VPC lookups, availability zones, etc.). Can be committed to git for consistent deployments.

---

## Configuration

### Deployment File: `bin/deployment/deployment.json`

This file defines your deployment environment. Copy the example file and customize it:

```bash
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
```

Update the contents:

```json
{
  "projectName": "OSML-Models",
  "account": {
    "id": "<YOUR-ACCOUNT-ID>",
    "region": "<YOUR-REGION>",
    "prodLike": false,
    "isAdc": false
  },
  "networkConfig": {
    "VPC_ID": "<YOUR-VPC-ID>",
    "TARGET_SUBNETS": ["subnet-12345", "subnet-67890"],
    "SECURITY_GROUP_ID": "sg-1234567890abcdef0"
  },
  "modelEndpointConfig": {
    "BUILD_FROM_SOURCE": true,
    "INSTANCE_TYPE": "ml.g4dn.xlarge"
  },
  "deployIntegrationTests": false
}
```

### Configuration Options

#### Required Fields

| Field            | Type   | Description                                              | Example          |
| ---------------- | ------ | -------------------------------------------------------- | ---------------- |
| `projectName`    | string | Name prefix for all CloudFormation stacks and resources  | `"OSML-Models"`  |
| `account.id`     | string | AWS account ID (must be exactly 12 digits)               | `"123456789012"` |
| `account.region` | string | AWS region for deployment (must match AWS region format) | `"us-west-2"`    |

#### Optional Account Fields

| Field              | Type    | Default | Description                                                              |
| ------------------ | ------- | ------- | ------------------------------------------------------------------------ |
| `account.prodLike` | boolean | `false` | Enable production-like settings (stricter security, enhanced monitoring) |
| `account.isAdc`    | boolean | `false` | Air-gapped deployment flag for disconnected environments                 |

#### Optional Network Configuration

| Field                               | Type     | Default     | Description                                                                                                      |
| ----------------------------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `networkConfig.VPC_ID`              | string   | `undefined` | Existing VPC ID to import (format: `vpc-xxxxxxxx`). If not provided, a new VPC will be created                   |
| `networkConfig.TARGET_SUBNETS`      | string[] | `undefined` | Specific subnet IDs to use for endpoint deployment. If not provided, all private subnets will be used            |
| `networkConfig.SECURITY_GROUP_ID`   | string   | `undefined` | Existing security group ID to use (format: `sg-xxxxxxxx`). If not provided, a new security group will be created |
| `networkConfig.SECURITY_GROUP_NAME` | string   | `undefined` | Name for the security group (used when creating new security group)                                              |

#### Optional Model Endpoint Configuration

| Field                                        | Type    | Default                        | Description                                                                            |
| -------------------------------------------- | ------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `modelEndpointConfig.BUILD_FROM_SOURCE`      | boolean | `false`                        | Build container image from source using Docker. If `false`, pulls from `CONTAINER_URI` |
| `modelEndpointConfig.CONTAINER_URI`          | string  | `"awsosml/osml-models:latest"` | Container image URI to pull from registry (used when `BUILD_FROM_SOURCE=false`)        |
| `modelEndpointConfig.CONTAINER_BUILD_PATH`   | string  | `"."`                          | Path to Docker build context (used when `BUILD_FROM_SOURCE=true`)                      |
| `modelEndpointConfig.CONTAINER_DOCKERFILE`   | string  | `"docker/Dockerfile"`          | Path to Dockerfile relative to build context                                           |
| `modelEndpointConfig.CONTAINER_BUILD_TARGET` | string  | `undefined`                    | Docker build target stage (for multi-stage builds)                                     |
| `modelEndpointConfig.INSTANCE_TYPE`          | string  | `"ml.g4dn.xlarge"`             | SageMaker instance type (must be GPU instance for aircraft model)                      |
| `modelEndpointConfig.INITIAL_INSTANCE_COUNT` | number  | `1`                            | Number of instances to deploy initially                                                |
| `modelEndpointConfig.MODEL_NAME`             | string  | `"aircraft"`                   | Model name to load (sets `MODEL_SELECTION` environment variable)                       |

#### Optional Integration Test Configuration

| Field                                     | Type    | Default | Description                                           |
| ----------------------------------------- | ------- | ------- | ----------------------------------------------------- |
| `deployIntegrationTests`                  | boolean | `false` | Deploy integration test stack for endpoint validation |
| `integrationTestConfig.BUILD_FROM_SOURCE` | boolean | `false` | Build test container from source                      |

### Choosing Between BUILD_FROM_SOURCE and CONTAINER_URI

The `BUILD_FROM_SOURCE` configuration option determines how the model container image is obtained. Understanding when to use each approach is critical for your deployment workflow.

#### BUILD_FROM_SOURCE = true (Build from Source)

**When to use:**

- **Development and Testing**: When actively developing and testing changes to the model code or container configuration
- **Custom Modifications**: When you need to build a customized version of the model with local changes
- **First-Time Setup**: When setting up a new deployment and want to ensure the latest code is built
- **No Pre-built Images**: When you don't have access to a container registry or pre-built images

**Requirements:**

- Docker must be installed and running on your local machine
- Sufficient disk space for Docker build process
- Network access to download base images and dependencies
- Time for the build process (can take 5-15 minutes depending on image size)

**How it works:**

- CDK uses `DockerImageAsset` to build the container from the Dockerfile
- The image is automatically pushed to Amazon ECR in your target account
- The image is tagged with a timestamp for version tracking
- Build context is determined by `CONTAINER_BUILD_PATH` (default: current directory)
- Dockerfile location is specified by `CONTAINER_DOCKERFILE` (default: `docker/Dockerfile`)

**Configuration example:**

```json
{
  "modelEndpointConfig": {
    "BUILD_FROM_SOURCE": true,
    "CONTAINER_BUILD_PATH": ".",
    "CONTAINER_DOCKERFILE": "docker/Dockerfile",
    "CONTAINER_BUILD_TARGET": "production"
  }
}
```

#### BUILD_FROM_SOURCE = false (Pull from Registry)

**When to use:**

- **Production Deployments**: When deploying stable, tested versions of the model
- **CI/CD Pipelines**: When using pre-built images from your CI/CD pipeline
- **Faster Deployments**: When you want to skip the build process and deploy quickly
- **Consistent Versions**: When you need to ensure the exact same image is deployed across environments
- **No Docker Available**: When deploying from environments without Docker installed

**Requirements:**

- Access to the container registry (Docker Hub, Amazon ECR, or private registry)
- Valid container image URI
- Appropriate IAM permissions to pull from the registry
- Network access to the registry

**How it works:**

- CDK uses `ContainerImage.fromRegistry()` to reference the pre-built image
- The image is pulled from the specified `CONTAINER_URI` during SageMaker endpoint creation
- No local build process occurs
- Deployment is faster since the image already exists

**Configuration example:**

```json
{
  "modelEndpointConfig": {
    "BUILD_FROM_SOURCE": false,
    "CONTAINER_URI": "awsosml/osml-models:latest"
  }
}
```

**Common container URIs:**

- **Docker Hub**: `awsosml/osml-models:latest` or `awsosml/osml-models:v1.2.3`
- **Amazon ECR**: `123456789012.dkr.ecr.us-west-2.amazonaws.com/osml-models:latest`
- **Private Registry**: `registry.example.com/osml-models:v1.2.3`

#### Recommended Workflow

**Development Environment:**

```json
{
  "modelEndpointConfig": {
    "BUILD_FROM_SOURCE": true
  }
}
```

Use `BUILD_FROM_SOURCE=true` to test local changes quickly.

**Staging/Production Environment:**

```json
{
  "modelEndpointConfig": {
    "BUILD_FROM_SOURCE": false,
    "CONTAINER_URI": "123456789012.dkr.ecr.us-west-2.amazonaws.com/osml-models:v1.2.3"
  }
}
```

Use `BUILD_FROM_SOURCE=false` with versioned images from your CI/CD pipeline for consistency and faster deployments.

#### Troubleshooting

**BUILD_FROM_SOURCE=true issues:**

- **Docker not running**: Start Docker daemon before deployment
- **Build failures**: Check Dockerfile syntax and ensure all dependencies are available
- **Slow builds**: Consider using Docker layer caching or switching to pre-built images

**BUILD_FROM_SOURCE=false issues:**

- **Image not found**: Verify the `CONTAINER_URI` is correct and accessible
- **Permission denied**: Ensure IAM role has ECR pull permissions
- **Wrong image version**: Double-check the image tag in `CONTAINER_URI`

### Configuration Validation

The configuration loader (`bin/deployment/load-deployment.ts`) performs strict validation:

- **Account ID**: Must be exactly 12 digits (e.g., `123456789012`)
- **Region**: Must match AWS region format (e.g., `us-west-2`, `eu-central-1`, `ap-southeast-1`)
- **VPC ID**: Must match format `vpc-` followed by 8 or 17 hexadecimal characters
- **Security Group ID**: Must match format `sg-` followed by 8 or 17 hexadecimal characters
- **Subnet IDs**: Must match format `subnet-` followed by 8 or 17 hexadecimal characters

Invalid configurations will throw a `DeploymentConfigError` with a descriptive error message.

---

## Deployment Instructions

### Prerequisites Checklist

Before deploying, ensure you have:

- [ ] **AWS CLI** installed and configured with valid credentials
- [ ] **AWS CDK CLI** installed globally (`npm install -g aws-cdk`)
- [ ] **Node.js** (recommend latest LTS) and **npm** installed
- [ ] **Docker** installed and running (required if `BUILD_FROM_SOURCE=true`)
- [ ] **AWS Account** with appropriate IAM permissions for CDK deployment
- [ ] **VPC** with private subnets (optional - will be created if not specified)

### Step-by-Step Deployment

#### 1. Install Dependencies

Navigate to the CDK directory and install all required packages:

```bash
cd osml-models/cdk
npm install
```

This installs all dependencies listed in `package.json`, including:

- AWS CDK libraries (`aws-cdk-lib`, `constructs`)
- Development tools (TypeScript, ESLint, Prettier, Jest)
- CDK-Nag for security validation
- fast-check for property-based testing

#### 2. Configure Deployment

Create your deployment configuration file:

```bash
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
```

Edit `bin/deployment/deployment.json` with your AWS account details:

```json
{
  "projectName": "OSML-Models",
  "account": {
    "id": "123456789012",
    "region": "us-west-2"
  },
  "modelEndpointConfig": {
    "BUILD_FROM_SOURCE": false,
    "INSTANCE_TYPE": "ml.g4dn.xlarge"
  }
}
```

**Important**: The `deployment.json` file is gitignored to prevent committing sensitive account information.

#### 3. Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

This runs the TypeScript compiler (`tsc`) and generates JavaScript files in the same directory structure.

#### 4. Run Tests

Execute the test suite to validate the infrastructure code:

```bash
npm test
```

This runs:

- Unit tests for all stacks and constructs
- Property-based tests for configuration validation
- CDK-Nag security validation
- Generates `cdk-nag-suppressions-report.txt`

**Expected Output**: All tests should pass with no errors. Review the CDK-Nag report for any security findings.

#### 5. Bootstrap CDK (First Time Only)

If this is your first CDK deployment in this account/region, bootstrap the CDK toolkit:

```bash
cdk bootstrap aws://123456789012/us-west-2
```

Replace with your actual account ID and region. This creates:

- S3 bucket for CDK assets (container images, Lambda code)
- IAM roles for CloudFormation execution
- ECR repository for Docker images

**Note**: You only need to bootstrap once per account/region combination.

#### 6. Synthesize CloudFormation Templates

Generate CloudFormation templates to preview what will be deployed:

```bash
cdk synth
```

This creates CloudFormation templates in the `cdk.out/` directory. Review these templates to understand what resources will be created.

**Optional**: Use `cdk synth --quiet` to suppress template output and only show errors.

#### 7. Preview Changes (Optional)

If updating an existing deployment, preview the changes:

```bash
cdk diff
```

This compares your local stack definitions with the deployed stacks and shows:

- Resources to be added (green)
- Resources to be modified (yellow)
- Resources to be removed (red)

#### 8. Deploy All Stacks

Deploy the infrastructure to AWS:

```bash
cdk deploy --all
```

This deploys stacks in dependency order:

1. Network Stack (VPC, subnets, security groups)
2. Model Endpoint Stack (SageMaker endpoint, IAM roles, container)
3. Integration Test Stack (if `deployIntegrationTests=true`)

**Deployment Time**: Expect 10-15 minutes for initial deployment. SageMaker endpoint creation takes the longest.

**Interactive Approval**: CDK will prompt you to approve security-sensitive changes (IAM roles, security groups). Review and approve each change.

#### 9. Verify Deployment

After deployment completes, verify the resources:

```bash
# List all stacks
cdk list

# Check stack outputs
aws cloudformation describe-stacks --stack-name OSML-Models-ModelEndpoint --query 'Stacks[0].Outputs'

# Verify SageMaker endpoint is in service
aws sagemaker describe-endpoint --endpoint-name <endpoint-name>
```

### Automated Deployment (CI/CD)

For automated deployments in CI/CD pipelines:

```bash
# Non-interactive deployment with parallel stack deployment
cdk deploy --all --require-approval never --concurrency 3

# With specific profile
cdk deploy --all --require-approval never --profile production
```

**CI/CD Best Practices**:

- Use IAM roles with least-privilege permissions
- Store `deployment.json` in secure parameter store or secrets manager
- Run tests before deployment (`npm test`)
- Use `cdk diff` to validate changes before applying
- Deploy to development environment first, then production

### Updating an Existing Deployment

To update an existing deployment:

```bash
# 1. Pull latest code
git pull

# 2. Install any new dependencies
npm install

# 3. Build
npm run build

# 4. Run tests
npm test

# 5. Preview changes
cdk diff

# 6. Deploy updates
cdk deploy --all
```

### Destroying the Deployment

To remove all deployed resources:

```bash
cdk destroy --all
```

**Warning**: This will delete all resources including:

- SageMaker endpoints
- Security groups
- VPC (if created by CDK)
- All associated data

**Note**: Some resources may have deletion protection enabled. You may need to manually disable protection before destroying.

---

## Development & Testing

### Useful Commands

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `npm run build`    | Compile TypeScript to JavaScript          |
| `npm run watch`    | Auto-recompile on file changes            |
| `npm run test`     | Run Jest unit tests                       |
| `npm run lint`     | Run ESLint                                |
| `npm run lint:fix` | Fix ESLint issues                         |
| `cdk synth`        | Generate CloudFormation template          |
| `cdk diff`         | Compare local stack with deployed version |
| `cdk deploy`       | Deploy the CDK stack                      |
| `cdk destroy`      | Remove the deployed stack                 |
| `cdk list`         | List all stacks in the app                |

---

## Security & Best Practices

This project integrates **cdk-nag** to validate infrastructure against AWS security best practices. Running `npm run test` will:

- Detect overly permissive IAM roles and security groups
- Ensure encryption is enabled where applicable
- Warn about missing logging or compliance settings

**Review the cdk-nag report** to maintain compliance and security posture before production deployments.

### CDK-NAG Report Generation

The test suite automatically generates comprehensive cdk-nag compliance reports during test execution. The reporting system works as follows:

#### How Reports Are Generated

1. **During Test Execution**: Each stack test (`model-endpoint-stack.test.ts`, `network-stack.test.ts`, etc.) runs cdk-nag's `AwsSolutionsChecks` and calls `generateNagReport()` which:
   - Extracts errors and warnings from stack annotations
   - Collects suppressed violations from stack template metadata
   - Displays a formatted compliance report to stdout
   - Aggregates suppressed violations for the final report

2. **After All Tests Complete**: The Jest global teardown hook (configured in `jest.config.js`) automatically calls `generateFinalSuppressedViolationsReport()`, which:
   - Consolidates all suppressed violations from all test stacks
   - Generates a comprehensive report file: `cdk-nag-suppressions-report.txt`
   - Includes summary statistics by rule type and detailed breakdowns by stack

#### Report Files

After running tests, you'll find:

- **`cdk-nag-suppressions-report.txt`**: Comprehensive report of all suppressed NAG violations across all stacks
  - Summary by rule type showing violation counts
  - Detailed breakdown per stack with resource-level information
  - Suppression reasons for each violation

#### Viewing Reports

```bash
# Run tests to generate reports
npm run test

# View the final suppressed violations report
cat cdk-nag-suppressions-report.txt
```

#### Understanding Suppressions

The report distinguishes between:

- **Errors**: Unsuppressed violations that need to be fixed
- **Warnings**: Unsuppressed warnings that should be reviewed
- **Suppressed Violations**: Violations that have been explicitly suppressed with documented reasons

Each suppressed violation includes:

- The NAG rule that was suppressed (e.g., `AwsSolutions-S1`)
- The resource where the suppression applies
- The reason for suppression (as documented in the code)

For deeper hardening guidance, refer to:

- [AWS CDK Security and Safety Dev Guide](https://docs.aws.amazon.com/cdk/v2/guide/security.html)
- Use of [`CliCredentialsStackSynthesizer`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.CliCredentialsStackSynthesizer.html) for controlling credential use

### Security Best Practices

#### IAM Roles and Policies

- **Least Privilege**: Grant only the minimum permissions required
- **Avoid Wildcards**: Use specific resource ARNs instead of `*` when possible
- **Managed Policies**: Prefer AWS managed policies for common use cases, but document why
- **Custom Policies**: Create custom policies for application-specific permissions

#### Network Security

- **VPC Isolation**: Deploy endpoints in private subnets with no direct internet access
- **Security Groups**: Use restrictive security group rules (allow only necessary traffic)
- **VPC Endpoints**: Use VPC endpoints for AWS service access to avoid internet routing
- **Network ACLs**: Add network ACLs for additional layer of defense

#### Data Protection

- **Encryption at Rest**: Enable encryption for S3 buckets, EBS volumes, and SageMaker endpoints
- **Encryption in Transit**: Use TLS/SSL for all data transmission
- **Key Management**: Use AWS KMS for encryption key management
- **Data Classification**: Tag resources with data classification levels

#### Monitoring and Logging

- **CloudWatch Logs**: Enable logging for all resources (SageMaker, Lambda, VPC Flow Logs)
- **CloudWatch Alarms**: Set up alarms for errors, latency, and security events
- **AWS CloudTrail**: Enable CloudTrail for API call auditing
- **Log Retention**: Configure appropriate log retention periods

#### Cost Optimization

- **Right-Sizing**: Use appropriate instance types (GPU only where needed)
- **Auto-Scaling**: Configure auto-scaling for endpoints based on traffic patterns
- **Spot Instances**: Use spot instances for non-production environments
- **Resource Cleanup**: Regularly clean up unused resources and old container images

---

## Troubleshooting

This section covers common issues you may encounter during deployment and how to resolve them.

### Configuration Issues

#### Missing deployment.json File

**Error**:

```
Error: ENOENT: no such file or directory, open 'bin/deployment/deployment.json'
```

**Cause**: The deployment configuration file doesn't exist.

**Solution**:

```bash
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
# Edit deployment.json with your account details
```

#### Invalid JSON Syntax

**Error**:

```
SyntaxError: Unexpected token } in JSON at position 123
```

**Cause**: Malformed JSON in deployment.json (missing comma, extra comma, unquoted strings, etc.).

**Solution**:

- Use a JSON validator or linter to check syntax
- Common issues: trailing commas, missing quotes around strings, unclosed brackets
- Validate with: `node -e "JSON.parse(require('fs').readFileSync('bin/deployment/deployment.json'))"`

#### Invalid Account ID

**Error**:

```
DeploymentConfigError: Invalid account.id format: '12345'. Account ID must be exactly 12 digits.
```

**Cause**: Account ID is not exactly 12 digits.

**Solution**: Verify your AWS account ID is correct (should be 12 digits). Find it with:

```bash
aws sts get-caller-identity --query Account --output text
```

#### Invalid Region Format

**Error**:

```
DeploymentConfigError: Invalid account.region format: 'us-west'. Region must follow AWS region naming conventions.
```

**Cause**: Region doesn't match AWS region format (e.g., `us-west-2`, `eu-central-1`).

**Solution**: Use a valid AWS region name. List available regions:

```bash
aws ec2 describe-regions --query 'Regions[].RegionName' --output table
```

### CDK Bootstrap Issues

#### CDK Bootstrap Not Run

**Error**:

```
This stack uses assets, so the toolkit stack must be deployed to the environment
```

**Cause**: CDK toolkit stack hasn't been deployed to your account/region.

**Solution**: Bootstrap CDK in your account/region:

```bash
cdk bootstrap aws://123456789012/us-west-2
```

Replace with your actual account ID and region.

#### Insufficient Permissions for Bootstrap

**Error**:

```
User: arn:aws:iam::123456789012:user/myuser is not authorized to perform: cloudformation:CreateStack
```

**Cause**: Your IAM user/role lacks permissions to create CloudFormation stacks.

**Solution**: Ensure your IAM user/role has the following permissions:

- `cloudformation:*`
- `s3:*` (for CDK asset bucket)
- `iam:*` (for CDK execution roles)
- `ecr:*` (for container images)

Or attach the `AdministratorAccess` policy for initial setup (not recommended for production).

### Docker and Container Issues

#### Docker Daemon Not Running

**Error**:

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

**Cause**: Docker daemon is not running or not accessible.

**Solution**:

- **Linux**: `sudo systemctl start docker`
- **macOS**: Start Docker Desktop application
- **Windows**: Start Docker Desktop application
- Verify Docker is running: `docker ps`

#### Docker Build Failure

**Error**:

```
ERROR: failed to solve: failed to compute cache key: failed to calculate checksum
```

**Cause**: Dockerfile syntax error, missing files, or build context issues.

**Solution**:

- Verify Dockerfile exists at the specified path
- Check Dockerfile syntax
- Ensure all files referenced in Dockerfile exist in build context
- Try building manually: `docker build -f docker/Dockerfile .`

#### ECR Push Permission Denied

**Error**:

```
denied: User: arn:aws:iam::123456789012:user/myuser is not authorized to perform: ecr:PutImage
```

**Cause**: IAM user/role lacks ECR push permissions.

**Solution**: Add ECR permissions to your IAM user/role:

```json
{
  "Effect": "Allow",
  "Action": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchCheckLayerAvailability",
    "ecr:PutImage",
    "ecr:InitiateLayerUpload",
    "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload"
  ],
  "Resource": "*"
}
```

### Network and VPC Issues

#### VPC Not Found

**Error**:

```
VPC vpc-abc123 not found
```

**Cause**: The VPC ID specified in `networkConfig.VPC_ID` doesn't exist in your account/region.

**Solution**:

- Verify VPC ID is correct: `aws ec2 describe-vpcs --vpc-ids vpc-abc123`
- Ensure you're deploying to the correct region
- Remove `VPC_ID` from config to create a new VPC

#### Subnet Not Found

**Error**:

```
Subnet subnet-12345 not found
```

**Cause**: Subnet ID in `TARGET_SUBNETS` doesn't exist or is in a different VPC.

**Solution**:

- Verify subnet IDs: `aws ec2 describe-subnets --subnet-ids subnet-12345`
- Ensure subnets belong to the VPC specified in `VPC_ID`
- Remove `TARGET_SUBNETS` to use all private subnets

#### Security Group Not Found

**Error**:

```
Security group sg-1234567890abcdef0 not found
```

**Cause**: Security group ID doesn't exist or is in a different VPC.

**Solution**:

- Verify security group: `aws ec2 describe-security-groups --group-ids sg-1234567890abcdef0`
- Ensure security group belongs to the correct VPC
- Remove `SECURITY_GROUP_ID` to create a new security group

### SageMaker Endpoint Issues

#### Endpoint Creation Timeout

**Error**:

```
Resource creation cancelled
```

**Cause**: SageMaker endpoint failed to start within the timeout period (usually due to container issues).

**Solution**:

1. Check CloudWatch Logs for the endpoint:
   ```bash
   aws logs tail /aws/sagemaker/Endpoints/<endpoint-name> --follow
   ```
2. Common causes:
   - Container image doesn't exist or is inaccessible
   - Container fails to start (check application logs)
   - Insufficient instance capacity in the region
   - Model artifacts missing or inaccessible

#### Insufficient Capacity

**Error**:

```
Could not provision requested ML compute capacity. Please retry using a different ML instance type.
```

**Cause**: AWS doesn't have available capacity for the requested instance type in your region/AZ.

**Solution**:

- Try a different instance type (e.g., `ml.g4dn.2xlarge` instead of `ml.g4dn.xlarge`)
- Try a different region
- Wait and retry later
- Contact AWS support to request capacity

#### Model Container Fails to Start

**Error**: Endpoint shows "Failed" status in SageMaker console.

**Cause**: Container application fails to start or crashes immediately.

**Solution**:

1. Check CloudWatch Logs for error messages
2. Verify container image works locally:
   ```bash
   docker run -p 8080:8080 <container-uri>
   ```
3. Check environment variables are set correctly
4. Verify model files are accessible in the container

### CDK-Nag Validation Issues

#### Unsuppressed CDK-Nag Violations

**Error**:

```
AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
```

**Cause**: Infrastructure violates AWS security best practices.

**Solution**: Either fix the violation or add a documented suppression:

```typescript
import { NagSuppressions } from "cdk-nag";

NagSuppressions.addResourceSuppressions(myRole, [
  {
    id: "AwsSolutions-IAM4",
    reason: "AWS managed policy required for SageMaker execution",
    appliesTo: ["Policy::arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"]
  }
]);
```

#### CDK-Nag Report Not Generated

**Error**: `cdk-nag-suppressions-report.txt` file is not created after running tests.

**Cause**: Tests didn't complete successfully or Jest global teardown didn't run.

**Solution**:

- Ensure all tests pass: `npm test`
- Check for test failures that prevent teardown
- Verify `jest.config.js` has `globalTeardown` configured
- Manually check for temporary file: `.cdk-nag-suppressions-temp.json`

### TypeScript and Build Issues

#### TypeScript Compilation Errors

**Error**:

```
error TS2304: Cannot find name 'IVpc'
```

**Cause**: Missing type imports or incorrect TypeScript configuration.

**Solution**:

- Ensure all dependencies are installed: `npm install`
- Check import statements are correct
- Verify `tsconfig.json` is properly configured
- Clean and rebuild: `rm -rf node_modules && npm install && npm run build`

#### ESLint Errors

**Error**:

```
error  'myVariable' is assigned a value but never used  @typescript-eslint/no-unused-vars
```

**Cause**: Code quality issues detected by ESLint.

**Solution**:

- Fix the linting errors manually
- Run auto-fix: `npm run lint:fix`
- Review ESLint configuration in `eslint.config.mjs`

### Deployment and CloudFormation Issues

#### Stack Already Exists

**Error**:

```
Stack [OSML-Models-Network] already exists
```

**Cause**: Attempting to create a stack that already exists.

**Solution**:

- Use `cdk deploy` to update existing stack
- Use `cdk destroy` to delete stack before recreating
- Check CloudFormation console for stack status

#### Rollback Failed

**Error**:

```
Stack [OSML-Models-ModelEndpoint] is in ROLLBACK_FAILED state
```

**Cause**: Stack creation failed and rollback also failed (usually due to resource dependencies).

**Solution**:

1. Identify the resource causing the issue in CloudFormation console
2. Manually delete or fix the problematic resource
3. Continue rollback: `aws cloudformation continue-update-rollback --stack-name OSML-Models-ModelEndpoint`
4. Or delete the stack: `cdk destroy OSML-Models-ModelEndpoint`

#### Insufficient IAM Permissions

**Error**:

```
User: arn:aws:iam::123456789012:user/myuser is not authorized to perform: sagemaker:CreateEndpoint
```

**Cause**: IAM user/role lacks permissions for specific AWS service operations.

**Solution**: Grant required permissions. For full CDK deployment, you need:

- CloudFormation: `cloudformation:*`
- IAM: `iam:*` (for creating roles)
- SageMaker: `sagemaker:*`
- EC2: `ec2:*` (for VPC resources)
- S3: `s3:*` (for CDK assets)
- ECR: `ecr:*` (for container images)
- CloudWatch: `logs:*` (for logging)

### Testing Issues

#### Tests Fail with "Cannot find module"

**Error**:

```
Cannot find module 'aws-cdk-lib' from 'test/network-stack.test.ts'
```

**Cause**: Dependencies not installed or incorrect module resolution.

**Solution**:

```bash
npm install
npm run build
npm test
```

#### Property-Based Tests Fail

**Error**:

```
Property failed after 1 tests
{ seed: 123456789, path: "0", endOnFailure: true }
Counterexample: [...]
```

**Cause**: Property-based test found an input that violates the property.

**Solution**:

- Review the counterexample to understand the failure
- Fix the code to handle the edge case
- Or adjust the test if the property is incorrectly specified
- Use the seed to reproduce: `fc.assert(property, { seed: 123456789 })`

### Getting Help

If you encounter issues not covered here:

1. **Check CloudWatch Logs**: Most AWS services log errors to CloudWatch
2. **Review CloudFormation Events**: Check the Events tab in CloudFormation console
3. **Enable Debug Logging**: Set `CDK_DEBUG=true` environment variable
4. **Check AWS Service Health**: Visit https://status.aws.amazon.com/
5. **Consult AWS Documentation**: https://docs.aws.amazon.com/
6. **Open an Issue**: Report bugs or request features in the GitHub repository

### Useful Debugging Commands

```bash
# View CDK version
cdk --version

# List all stacks
cdk list

# Show stack differences
cdk diff

# Synthesize with verbose output
cdk synth --verbose

# View CloudFormation template
cdk synth OSML-Models-Network

# Check AWS credentials
aws sts get-caller-identity

# View CloudWatch logs
aws logs tail /aws/sagemaker/Endpoints/<endpoint-name> --follow

# Describe SageMaker endpoint
aws sagemaker describe-endpoint --endpoint-name <endpoint-name>

# List CloudFormation stacks
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# View stack events
aws cloudformation describe-stack-events --stack-name OSML-Models-Network
```

---

## Summary

This CDK project provides infrastructure-as-code for deploying the OSML Models aircraft detection model as a SageMaker endpoint. It includes security validations via cdk-nag and supports deployment across multiple environments through configuration files.

For questions or contributions, please open an issue or PR.
