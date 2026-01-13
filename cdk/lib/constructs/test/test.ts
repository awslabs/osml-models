/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import { Duration, RemovalPolicy, SymlinkFollowMode } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SubnetType } from "aws-cdk-lib/aws-ec2";
import { Platform } from "aws-cdk-lib/aws-ecr-assets";
import { IRole } from "aws-cdk-lib/aws-iam";
import { DockerImageCode, DockerImageFunction } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { writeFileSync } from "fs";
import { join } from "path";

import { BaseConfig, ConfigType, OSMLAccount } from "../types";

export class TestConfig extends BaseConfig {
  /**
   * Whether to build container resources from source.
   * @default "false"
   */
  public BUILD_FROM_SOURCE: boolean;

  /**
   * The build path for the test container.
   * @default "../"
   */
  public TEST_CONTAINER_BUILD_PATH: string;

  /**
   * The build target for the test container.
   * @default "integ"
   */
  public TEST_CONTAINER_BUILD_TARGET: string;

  /**
   * The path to Dockerfile to use to build the container.
   * @default "docker/Dockerfile.integ"
   */
  public TEST_CONTAINER_DOCKERFILE: string;

  /**
   * The Docker image to use for the test container.
   * @default "awsosml/osml-models-test:latest"
   */
  public TEST_CONTAINER_URI: string;

  /**
   * The timeout for the test Lambda function in seconds.
   * @default 600
   */
  public TEST_TIMEOUT_SECONDS: number;

  /**
   * The memory size for the test Lambda function in MB.
   * @default 1024
   */
  public MEMORY_SIZE_MB: number;

  constructor(config: Partial<ConfigType> = {}) {
    const mergedConfig = {
      BUILD_FROM_SOURCE: false,
      TEST_CONTAINER_BUILD_PATH: "../",
      TEST_CONTAINER_BUILD_TARGET: "integ",
      TEST_CONTAINER_DOCKERFILE: "docker/Dockerfile.integ",
      TEST_CONTAINER_URI: "awsosml/osml-models-test:latest",
      TEST_TIMEOUT_SECONDS: 600,
      MEMORY_SIZE_MB: 1024,
      ...config,
    };
    super(mergedConfig);
  }
}

export interface TestProps {
  /** The OSML account configuration. */
  readonly account: OSMLAccount;
  /** The VPC configuration. */
  readonly vpc: IVpc;
  /** The Lambda role for the test function. */
  readonly lambdaRole: IRole;
  /** Optional security group to use. */
  readonly securityGroup?: ISecurityGroup;
  /** The SageMaker endpoint name to test. */
  readonly endpointName: string;
  /** The project name. */
  readonly projectName: string;
  /** The test configuration. */
  readonly config?: TestConfig;
}

export class Test extends Construct {
  /** The docker image containing the integration tests. */
  public testImageCode: DockerImageCode;

  /** The Lambda function that executes the integration tests. */
  public testingRunner: DockerImageFunction;

  /** Configuration options for Test. */
  public config: TestConfig;

  constructor(scope: Construct, id: string, props: TestProps) {
    super(scope, id);

    // Check if a custom configuration was provided
    if (props.config instanceof TestConfig) {
      this.config = props.config;
    } else {
      // Create a new default configuration
      this.config = new TestConfig(
        (props.config as unknown as Partial<ConfigType>) ?? {},
      );
    }

    this.testImageCode = this.createTestingImage();
    this.testingRunner = this.createTestingRunner(props);
  }

  private createTestingImage(): DockerImageCode {
    if (this.config.BUILD_FROM_SOURCE) {
      // Build from source using Docker
      // Specify platform to ensure compatibility with AWS Lambda (requires linux/amd64)
      return DockerImageCode.fromImageAsset(
        this.config.TEST_CONTAINER_BUILD_PATH,
        {
          file: this.config.TEST_CONTAINER_DOCKERFILE,
          followSymlinks: SymlinkFollowMode.ALWAYS,
          target: this.config.TEST_CONTAINER_BUILD_TARGET,
          platform: Platform.LINUX_AMD64,
        },
      );
    } else {
      // Use pre-built image from registry
      const tmpDockerfile = join(__dirname, "Dockerfile.tmp");
      writeFileSync(tmpDockerfile, `FROM ${this.config.TEST_CONTAINER_URI}`);
      return DockerImageCode.fromImageAsset(__dirname, {
        file: "Dockerfile.tmp",
        followSymlinks: SymlinkFollowMode.ALWAYS,
        platform: Platform.LINUX_AMD64,
      });
    }
  }

  private createTestingRunner(props: TestProps): DockerImageFunction {
    const logGroup = new LogGroup(this, "TestRunnerLogGroup", {
      logGroupName: `/aws/lambda/${props.projectName}-integration-test`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const runner = new DockerImageFunction(this, "TestRunner", {
      code: this.testImageCode,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      role: props.lambdaRole,
      timeout: Duration.seconds(this.config.TEST_TIMEOUT_SECONDS),
      memorySize: this.config.MEMORY_SIZE_MB,
      functionName: `${props.projectName}-integration-test`,
      securityGroups: props.securityGroup ? [props.securityGroup] : [],
      logGroup: logGroup,
      environment: {
        ENDPOINT_NAME: props.endpointName,
        PROJECT_NAME: props.projectName,
      },
    });

    // Suppress Lambda runtime version warning
    NagSuppressions.addResourceSuppressions(
      runner,
      [
        {
          id: "AwsSolutions-L1",
          reason:
            "Lambda runtime version is managed by the Docker base image (public.ecr.aws/lambda/python:3.13). " +
            "The function will be updated when the base image is updated.",
        },
      ],
      true,
    );

    return runner;
  }
}
