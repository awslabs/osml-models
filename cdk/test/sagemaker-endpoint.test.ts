/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import {
  MESageMakerEndpoint,
  SageMakerEndpointConfig
} from "../lib/constructs/model-endpoint/sagemaker-endpoint";
import { createTestApp } from "./test-utils";

describe("SageMakerEndpointConfig", () => {
  test("uses default values when no config provided", () => {
    const config = new SageMakerEndpointConfig();

    expect(config.INITIAL_INSTANCE_COUNT).toBe(1);
    expect(config.INITIAL_VARIANT_WEIGHT).toBe(1);
    expect(config.VARIANT_NAME).toBe("AllTraffic");
    expect(config.SECURITY_GROUP_ID).toBe("");
    expect(config.CONTAINER_ENV).toEqual({});
    expect(config.REPOSITORY_ACCESS_MODE).toBe("Platform");
  });

  test("accepts custom configuration values", () => {
    const config = new SageMakerEndpointConfig({
      INITIAL_INSTANCE_COUNT: 2,
      INITIAL_VARIANT_WEIGHT: 0.5,
      VARIANT_NAME: "CustomVariant",
      SECURITY_GROUP_ID: "sg-12345678",
      CONTAINER_ENV: { MODEL_SELECTION: "aircraft" },
      REPOSITORY_ACCESS_MODE: "Vpc"
    });

    expect(config.INITIAL_INSTANCE_COUNT).toBe(2);
    expect(config.INITIAL_VARIANT_WEIGHT).toBe(0.5);
    expect(config.VARIANT_NAME).toBe("CustomVariant");
    expect(config.SECURITY_GROUP_ID).toBe("sg-12345678");
    expect(config.CONTAINER_ENV).toEqual({ MODEL_SELECTION: "aircraft" });
    expect(config.REPOSITORY_ACCESS_MODE).toBe("Vpc");
  });

  test("allows partial configuration", () => {
    const config = new SageMakerEndpointConfig({
      INITIAL_INSTANCE_COUNT: 3
    });

    expect(config.INITIAL_INSTANCE_COUNT).toBe(3);
    expect(config.INITIAL_VARIANT_WEIGHT).toBe(1);
    expect(config.VARIANT_NAME).toBe("AllTraffic");
  });
});

describe("MESageMakerEndpoint", () => {
  let stack: Stack;

  beforeEach(() => {
    const app = createTestApp();
    stack = new Stack(app, "TestStack");
  });

  test("creates CfnModel with correct properties", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: ["subnet-12345678", "subnet-87654321"],
      config: new SageMakerEndpointConfig({
        SECURITY_GROUP_ID: "sg-12345678",
        CONTAINER_ENV: { MODEL_SELECTION: "aircraft" }
      })
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::Model", {
      ModelName: Match.stringLikeRegexp("^test-model-[A-Z0-9]{8}$"),
      ExecutionRoleArn: "arn:aws:iam::123456789012:role/test-role",
      PrimaryContainer: {
        Image: "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
        Mode: "SingleModel",
        Environment: {
          MODEL_SELECTION: "aircraft"
        }
      }
    });
  });

  test("creates CfnEndpointConfig with GPU instance type", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: []
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::EndpointConfig", {
      EndpointConfigName: Match.stringLikeRegexp(
        "^test-model-config-[A-Z0-9]{8}$"
      ),
      ProductionVariants: [
        {
          VariantName: "AllTraffic",
          ModelName: Match.objectLike({
            "Fn::GetAtt": Match.arrayWith([Match.stringLikeRegexp(".*Model.*")])
          }),
          InitialInstanceCount: 1,
          InitialVariantWeight: 1,
          InstanceType: "ml.g4dn.xlarge"
        }
      ]
    });
  });

  test("creates CfnEndpoint", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: []
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::Endpoint", {
      EndpointName: Match.stringLikeRegexp("^test-model-endpoint-[A-Z0-9]{8}$"),
      EndpointConfigName: Match.objectLike({
        "Fn::GetAtt": Match.arrayWith([
          Match.stringLikeRegexp(".*EndpointConfig.*")
        ])
      })
    });
  });

  test("sets MODEL_SELECTION environment variable to aircraft", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "aircraft-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: [],
      config: new SageMakerEndpointConfig({
        CONTAINER_ENV: { MODEL_SELECTION: "aircraft" }
      })
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::Model", {
      PrimaryContainer: {
        Environment: {
          MODEL_SELECTION: "aircraft"
        }
      }
    });
  });

  test("configures VPC subnet attachment", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: ["subnet-12345678", "subnet-87654321"],
      config: new SageMakerEndpointConfig({
        SECURITY_GROUP_ID: "sg-12345678"
      })
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::Model", {
      VpcConfig: {
        Subnets: ["subnet-12345678", "subnet-87654321"],
        SecurityGroupIds: ["sg-12345678"]
      }
    });
  });

  test("configures security group association", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: ["subnet-12345678"],
      config: new SageMakerEndpointConfig({
        SECURITY_GROUP_ID: "sg-abcdef12"
      })
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::Model", {
      VpcConfig: {
        SecurityGroupIds: ["sg-abcdef12"]
      }
    });
  });

  test("does not include VpcConfig when no subnets provided", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: []
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::Model", {
      VpcConfig: Match.absent()
    });
  });

  test("exports model, endpointConfig, and endpoint properties", () => {
    const endpoint = new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: []
    });

    expect(endpoint.model).toBeDefined();
    expect(endpoint.endpointConfig).toBeDefined();
    expect(endpoint.endpoint).toBeDefined();
  });

  test("uses custom variant settings", () => {
    new MESageMakerEndpoint(stack, "TestEndpoint", {
      roleArn: "arn:aws:iam::123456789012:role/test-role",
      containerImageUri:
        "123456789012.dkr.ecr.us-west-2.amazonaws.com/test:latest",
      modelName: "test-model",
      instanceType: "ml.g4dn.xlarge",
      subnetIds: [],
      config: new SageMakerEndpointConfig({
        INITIAL_INSTANCE_COUNT: 2,
        INITIAL_VARIANT_WEIGHT: 0.5,
        VARIANT_NAME: "CustomVariant"
      })
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties("AWS::SageMaker::EndpointConfig", {
      ProductionVariants: [
        {
          VariantName: "CustomVariant",
          InitialInstanceCount: 2,
          InitialVariantWeight: 0.5
        }
      ]
    });
  });
});
