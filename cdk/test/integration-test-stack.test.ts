/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

/**
 * Unit tests for IntegrationTestStack.
 */

import "source-map-support/register";

import { App, Aspects, Stack } from "aws-cdk-lib";
import { Annotations, Match, Template } from "aws-cdk-lib/assertions";
import { SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { AwsSolutionsChecks } from "cdk-nag";

import { IntegrationTestStack } from "../lib/integration-test-stack";
import { ModelEndpointStack } from "../lib/model-endpoint-stack";
import {
  createTestApp,
  createTestDeploymentConfig,
  createTestEnvironment,
  createTestVpc,
  generateNagReport,
} from "./test-utils";

describe("IntegrationTestStack", () => {
  let app: App;
  let deploymentConfig: ReturnType<typeof createTestDeploymentConfig>;
  let vpc: Vpc;
  let securityGroup: SecurityGroup;
  let modelEndpointStack: ModelEndpointStack;
  let sagemakerRole: Role;

  beforeEach(() => {
    app = createTestApp();
    // Set BUILD_FROM_SOURCE to false to avoid Docker builds during tests
    deploymentConfig = createTestDeploymentConfig({
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });

    const vpcStack = new Stack(app, "VpcStack", {
      env: createTestEnvironment(),
    });
    vpc = createTestVpc(vpcStack);
    securityGroup = new SecurityGroup(vpcStack, "TestSecurityGroup", {
      vpc,
      description: "Test security group",
    });

    // Create SageMaker role
    const roleStack = new Stack(app, "RoleStack", {
      env: createTestEnvironment(),
    });
    sagemakerRole = new Role(roleStack, "SageMakerRole", {
      assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
    });

    // Create ModelEndpointStack to get the endpoint resource
    modelEndpointStack = new ModelEndpointStack(app, "ModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });
  });

  test("creates stack with test imagery, role, and test constructs", () => {
    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    expect(stack.testImagery).toBeDefined();
    expect(stack.testImagery.imageBucket).toBeDefined();
    expect(stack.role).toBeDefined();
    expect(stack.test).toBeDefined();
    expect(stack).toBeDefined();
  });

  test("creates S3 bucket for test imagery", () => {
    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    const template = Template.fromStack(stack);

    // Should create S3 bucket for test imagery
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test("creates bucket with correct naming pattern", () => {
    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    const template = Template.fromStack(stack);

    // Bucket name should include account ID
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: Match.stringLikeRegexp(
        `.*test-imagery.*${deploymentConfig.account.id}.*`,
      ),
    });
  });

  test("creates Lambda function for integration tests", () => {
    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    const template = Template.fromStack(stack);

    // Should create Lambda function
    template.hasResourceProperties("AWS::Lambda::Function", {
      VpcConfig: Match.anyValue(),
    });
  });

  test("creates Lambda role with correct permissions", () => {
    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    const template = Template.fromStack(stack);

    // Should create IAM role for Lambda
    template.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Principal: {
              Service: "lambda.amazonaws.com",
            },
          },
        ],
      },
    });
  });

  test("uses provided Lambda role when provided", () => {
    const roleStack = new Stack(app, "LambdaRoleStack", {
      env: createTestEnvironment(),
    });
    const existingLambdaRole = new Role(roleStack, "ExistingLambdaRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
      existingLambdaRole: existingLambdaRole,
    });

    expect(stack.role).toBeDefined();
    expect(stack.test).toBeDefined();
  });

  test("creates stack with custom integration test config", () => {
    const customConfig = {
      BUILD_FROM_SOURCE: false,
    };

    const deploymentWithConfig = createTestDeploymentConfig({
      integrationTestConfig: customConfig,
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });

    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentWithConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    expect(stack.test).toBeDefined();
    expect(stack.testImagery).toBeDefined();
  });

  test("passes account configuration to test constructs", () => {
    const prodDeploymentConfig = createTestDeploymentConfig({
      account: {
        id: "123456789012",
        region: "us-west-2",
        prodLike: true,
        isAdc: true,
      },
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });

    const stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: prodDeploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    expect(stack.test).toBeDefined();
    expect(stack.testImagery).toBeDefined();
    expect(stack.role).toBeDefined();
  });
});

describe("cdk-nag Compliance Checks - IntegrationTestStack", () => {
  let app: App;
  let stack: IntegrationTestStack;
  let vpc: Vpc;
  let securityGroup: SecurityGroup;
  let modelEndpointStack: ModelEndpointStack;
  let sagemakerRole: Role;

  beforeAll(() => {
    app = createTestApp();

    // Set BUILD_FROM_SOURCE to false to avoid Docker builds during tests
    const deploymentConfig = createTestDeploymentConfig({
      modelEndpointConfig: {
        BUILD_FROM_SOURCE: false,
        CONTAINER_URI: "test-container:latest",
      },
    });
    const vpcStack = new Stack(app, "VpcStack", {
      env: createTestEnvironment(),
    });
    vpc = createTestVpc(vpcStack);
    securityGroup = new SecurityGroup(vpcStack, "TestSecurityGroup", {
      vpc,
      description: "Test security group",
    });

    const roleStack = new Stack(app, "RoleStack", {
      env: createTestEnvironment(),
    });
    sagemakerRole = new Role(roleStack, "SageMakerRole", {
      assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
    });

    modelEndpointStack = new ModelEndpointStack(app, "ModelEndpointStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      sagemakerRole: sagemakerRole,
    });

    stack = new IntegrationTestStack(app, "IntegrationTestStack", {
      env: createTestEnvironment(),
      deployment: deploymentConfig,
      vpc: vpc,
      selectedSubnets: {
        subnetType: undefined,
      },
      securityGroup: securityGroup,
      modelEndpoint: {
        modelEndpoint: modelEndpointStack.resources.modelEndpoint,
      },
    });

    // Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
    Aspects.of(stack).add(
      new AwsSolutionsChecks({
        verbose: true,
      }),
    );

    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    generateNagReport(stack, errors, warnings);
  });

  test("No unsuppressed Warnings", () => {
    const warnings = Annotations.fromStack(stack).findWarning(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    expect(warnings).toHaveLength(0);
  });

  test("No unsuppressed Errors", () => {
    const errors = Annotations.fromStack(stack).findError(
      "*",
      Match.stringLikeRegexp("AwsSolutions-.*"),
    );
    expect(errors).toHaveLength(0);
  });
});
