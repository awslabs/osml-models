/*
 * Copyright 2023-2026 Amazon.com, Inc. or its affiliates.
 */

import { RemovalPolicy, Stack } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import {
  BlockPublicAccess,
  Bucket,
  BucketAccessControl,
  BucketEncryption,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";
import {
  BucketDeployment,
  ServerSideEncryption,
  Source,
} from "aws-cdk-lib/aws-s3-deployment";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { BaseConfig, ConfigType, OSMLAccount } from "../types";

/**
 * Configuration class for TestImagery Construct.
 */
export class TestImageryConfig extends BaseConfig {
  /**
   * The name of the S3 bucket where images will be stored.
   * @default "osml-models-test-imagery"
   */
  public S3_IMAGE_BUCKET_PREFIX: string;

  /**
   * The local path to the test images to deploy.
   * @default "assets/imagery/"
   */
  public S3_TEST_IMAGES_PATH: string;

  /**
   * Creates an instance of TestImageryConfig.
   * @param config - The configuration object for TestImagery.
   */
  constructor(config: ConfigType = {}) {
    super({
      S3_IMAGE_BUCKET_PREFIX: "osml-models-test-imagery",
      S3_TEST_IMAGES_PATH: "assets/imagery/",
      ...config,
    });
  }
}

/**
 * Represents the properties for configuring the TestImagery Construct.
 */
export interface TestImageryProps {
  /** The OSML account to use. */
  account: OSMLAccount;

  /** The target vpc for the s3 bucket deployment. */
  vpc: IVpc;

  /** Optional custom configuration for TestImagery. */
  config?: TestImageryConfig;
}

/**
 * Represents a TestImagery construct for managing test imagery resources.
 */
export class TestImagery extends Construct {
  /** The image bucket where OSML imagery data is stored. */
  public imageBucket: Bucket;

  /** The removal policy for this resource. */
  public removalPolicy: RemovalPolicy;

  /** Configuration options for TestImagery. */
  public config: TestImageryConfig;

  /**
   * Creates a TestImagery cdk construct.
   * @param scope The scope/stack in which to define this construct.
   * @param id The id of this construct within the current scope.
   * @param props The properties of this construct.
   */
  constructor(scope: Construct, id: string, props: TestImageryProps) {
    super(scope, id);

    // Check if a custom configuration was provided
    if (props.config != undefined) {
      this.config = props.config;
    } else {
      // Create a new default configuration
      this.config = new TestImageryConfig();
    }

    // Set up a removal policy based on the 'prodLike' property
    this.removalPolicy = props.account.prodLike
      ? RemovalPolicy.RETAIN
      : RemovalPolicy.DESTROY;

    // Create an image bucket to store OSML test imagery
    this.imageBucket = new Bucket(this, `TestImageryBucket`, {
      bucketName: `${this.config.S3_IMAGE_BUCKET_PREFIX}-${props.account.id}`,
      autoDeleteObjects: !props.account.prodLike,
      enforceSSL: true,
      encryption: BucketEncryption.KMS_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: this.removalPolicy,
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      versioned: props.account.prodLike,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
    });

    // Suppress S3 bucket logging for test bucket
    NagSuppressions.addResourceSuppressions(
      this.imageBucket,
      [
        {
          id: "AwsSolutions-S1",
          reason:
            "Test imagery bucket does not require server access logging as it only contains " +
            "non-sensitive test data used for integration testing.",
        },
      ],
      true,
    );

    // Deploy test images into the bucket
    new BucketDeployment(this, "TestImageryDeployment", {
      sources: [Source.asset(this.config.S3_TEST_IMAGES_PATH)],
      destinationBucket: this.imageBucket,
      accessControl: BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      memoryLimit: 10240,
      useEfs: true,
      vpc: props.vpc,
      retainOnDelete: props.account.prodLike,
      serverSideEncryption: ServerSideEncryption.AES_256,
    });

    // CDK BucketDeployment creates a default role and policy with deeply nested constructs
    // Add stack-level suppressions for BucketDeployment's ServiceRole, DefaultPolicy, and Lambda runtime
    // These are deeply nested constructs that resource-level suppressions may not catch
    const stack = Stack.of(this);
    NagSuppressions.addStackSuppressions(stack, [
      {
        id: "AwsSolutions-IAM4",
        reason:
          "CDK BucketDeployment creates a default service role with AWS managed policies. " +
          "These are required by the CDK BucketDeployment construct and cannot be replaced.",
      },
      {
        id: "AwsSolutions-IAM5",
        reason:
          "CDK BucketDeployment creates a default policy with wildcard permissions. " +
          "These are required for the deployment functionality.",
      },
      {
        id: "AwsSolutions-L1",
        reason:
          "CDK BucketDeployment uses a Lambda function with a runtime version managed by CDK. " +
          "The runtime version is controlled by the CDK framework and cannot be directly configured.",
      },
    ]);
  }
}
