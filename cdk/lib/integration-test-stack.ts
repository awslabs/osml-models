/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * @file IntegrationTestStack for deploying integration test resources.
 *
 * This stack deploys the integration test constructs which include:
 * - S3 bucket for storing test imagery
 * - Deployment of test images from local assets
 * - Lambda function for running integration tests
 * - IAM role with necessary permissions
 */

import { Environment, Stack, StackProps } from "aws-cdk-lib";
import { ISecurityGroup, IVpc, SubnetSelection } from "aws-cdk-lib/aws-ec2";
import { IRole } from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

import { DeploymentConfig } from "../bin/deployment/load-deployment";
import { MESageMakerEndpoint } from "./constructs/model-endpoint/sagemaker-endpoint";
import { TestImagery, TestImageryConfig } from "./constructs/test/imagery";
import { LambdaRole } from "./constructs/test/lambda-roles";
import { Test, TestConfig } from "./constructs/test/test";

/**
 * Model endpoint resources required by the Integration Test Stack.
 */
export interface ModelEndpointResources {
  /** The model SageMaker endpoint. */
  modelEndpoint: MESageMakerEndpoint;
}

/**
 * Properties for the Integration Test Stack.
 */
export interface IntegrationTestStackProps extends StackProps {
  /** AWS environment configuration (account and region). */
  env: Environment;

  /** Deployment configuration containing integration test settings. */
  deployment: DeploymentConfig;

  /** VPC for the integration test resources. */
  vpc: IVpc;

  /** Selected subnets for the integration test resources. */
  selectedSubnets: SubnetSelection;

  /** Security group for the integration test resources. */
  securityGroup: ISecurityGroup;

  /** Model endpoint resources from the Model Endpoint Stack. */
  modelEndpoint: ModelEndpointResources;

  /** Optional existing Lambda role to use. */
  existingLambdaRole?: IRole;
}

/**
 * Stack for deploying integration test resources.
 */
export class IntegrationTestStack extends Stack {
  /** The test imagery construct. */
  public readonly testImagery: TestImagery;

  /** The Lambda role construct. */
  public readonly role: LambdaRole;

  /** The test Lambda function construct. */
  public readonly test: Test;

  private deployment: DeploymentConfig;

  /**
   * Creates a new IntegrationTestStack.
   *
   * @param scope - The scope in which to define this construct
   * @param id - The construct ID
   * @param props - The stack properties
   */
  constructor(scope: Construct, id: string, props: IntegrationTestStackProps) {
    super(scope, id, props);

    this.deployment = props.deployment;

    // Create the test imagery construct
    const testImageryConfig = this.deployment.integrationTestConfig
      ? new TestImageryConfig(
          this.deployment.integrationTestConfig as Record<string, unknown>,
        )
      : new TestImageryConfig();

    this.testImagery = new TestImagery(this, "TestImagery", {
      account: {
        id: props.deployment.account.id,
        region: props.deployment.account.region,
        prodLike: props.deployment.account.prodLike,
        isAdc: props.deployment.account.isAdc,
      },
      vpc: props.vpc,
      config: testImageryConfig,
    });

    // Create Lambda role construct
    this.role = new LambdaRole(this, "LambdaRole", {
      account: {
        id: props.deployment.account.id,
        region: props.deployment.account.region,
        prodLike: props.deployment.account.prodLike,
        isAdc: props.deployment.account.isAdc,
      },
      roleName: `${props.deployment.projectName}-integration-test-role`,
      existingLambdaRole: props.existingLambdaRole,
      endpointName:
        props.modelEndpoint.modelEndpoint.endpoint.endpointName || "",
      testBucketArn: this.testImagery.imageBucket.bucketArn,
      projectName: props.deployment.projectName,
    });

    // Create test Lambda function construct
    const testConfig = this.deployment.integrationTestConfig
      ? new TestConfig(
          this.deployment.integrationTestConfig as Record<string, unknown>,
        )
      : new TestConfig();

    this.test = new Test(this, "IntegTest", {
      account: {
        id: props.deployment.account.id,
        region: props.deployment.account.region,
        prodLike: props.deployment.account.prodLike,
        isAdc: props.deployment.account.isAdc,
      },
      vpc: props.vpc,
      lambdaRole: this.role.lambdaRole,
      securityGroup: props.securityGroup,
      endpointName:
        props.modelEndpoint.modelEndpoint.endpoint.endpointName || "",
      projectName: props.deployment.projectName,
      config: testConfig,
    });

    // Suppress CloudWatch Logs wildcard at stack level
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-IAM5",
        reason:
          "CloudWatch Logs permissions require wildcard for log stream names which are dynamically generated. " +
          "The log group is scoped to the specific Lambda function. " +
          "S3 bucket permissions include wildcard for object access which is required for test image retrieval.",
        appliesTo: [
          {
            regex:
              "/^Resource::arn:aws:logs:.*:.*:log-group:/aws/lambda/.*:\\*$/",
          },
          {
            regex: "/^Resource::<TestImageryTestImageryBucket.*\\.Arn>/\\*$/",
          },
        ],
      },
    ]);
  }
}
