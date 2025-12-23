/*
 * Copyright 2025 Amazon.com, Inc. or its affiliates.
 */

import { Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import {
  ContainerConfig,
  OSMLContainer
} from "../lib/constructs/model-endpoint/container";
import { createTestApp } from "./test-utils";

// Mock DockerImageAsset to avoid requiring actual Dockerfile during tests
jest.mock("aws-cdk-lib/aws-ecr-assets", () => {
  return {
    DockerImageAsset: jest.fn().mockImplementation(() => ({
      imageUri: "123456789012.dkr.ecr.us-west-2.amazonaws.com/mock-image:latest"
    })),
    Platform: {
      LINUX_AMD64: "linux/amd64"
    }
  };
});

describe("ContainerConfig", () => {
  test("uses default values when no config provided", () => {
    const config = new ContainerConfig();

    expect(config.CONTAINER_URI).toBe("awsosml/osml-models:latest");
    expect(config.CONTAINER_BUILD_PATH).toBe(".");
    expect(config.CONTAINER_BUILD_TARGET).toBeUndefined();
    expect(config.CONTAINER_DOCKERFILE).toBe("docker/Dockerfile");
  });

  test("accepts custom configuration values", () => {
    const config = new ContainerConfig({
      CONTAINER_URI: "custom/image:v1.0",
      CONTAINER_BUILD_PATH: "/custom/path",
      CONTAINER_BUILD_TARGET: "production",
      CONTAINER_DOCKERFILE: "custom.Dockerfile"
    });

    expect(config.CONTAINER_URI).toBe("custom/image:v1.0");
    expect(config.CONTAINER_BUILD_PATH).toBe("/custom/path");
    expect(config.CONTAINER_BUILD_TARGET).toBe("production");
    expect(config.CONTAINER_DOCKERFILE).toBe("custom.Dockerfile");
  });

  test("allows partial configuration", () => {
    const config = new ContainerConfig({
      CONTAINER_URI: "custom/image:v2.0"
    });

    expect(config.CONTAINER_URI).toBe("custom/image:v2.0");
    expect(config.CONTAINER_BUILD_PATH).toBe(".");
    expect(config.CONTAINER_DOCKERFILE).toBe("docker/Dockerfile");
  });
});

describe("OSMLContainer", () => {
  let stack: Stack;

  beforeEach(() => {
    const app = createTestApp();
    stack = new Stack(app, "TestStack");
  });

  test("creates DockerImageAsset when BUILD_FROM_SOURCE=true", () => {
    const container = new OSMLContainer(stack, "TestContainer", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: true,
      config: new ContainerConfig({
        CONTAINER_BUILD_PATH: ".",
        CONTAINER_DOCKERFILE: "docker/Dockerfile"
      })
    });

    const template = Template.fromStack(stack);

    // When building from source, CDK creates an asset
    // The asset will be referenced in the CloudFormation template
    expect(container.dockerImageAsset).toBeDefined();
    expect(container.containerUri).toBeDefined();
    expect(container.repositoryAccessMode).toBe("Platform");

    // Verify that the template contains asset-related parameters
    const templateJson = template.toJSON();
    expect(templateJson.Parameters).toBeDefined();
  });

  test("uses container URI when BUILD_FROM_SOURCE=false", () => {
    const container = new OSMLContainer(stack, "TestContainer", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: false,
      config: new ContainerConfig({
        CONTAINER_URI: "awsosml/osml-models:v1.0"
      })
    });

    expect(container.dockerImageAsset).toBeUndefined();
    expect(container.containerUri).toBe("awsosml/osml-models:v1.0");
    expect(container.repositoryAccessMode).toBe("Platform");
  });

  test("containerUri property is accessible", () => {
    const container = new OSMLContainer(stack, "TestContainer", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: false,
      config: new ContainerConfig({
        CONTAINER_URI: "test/image:latest"
      })
    });

    expect(container.containerUri).toBeDefined();
    expect(typeof container.containerUri).toBe("string");
    expect(container.containerUri).toBe("test/image:latest");
  });

  test("sets repositoryAccessMode to Platform", () => {
    const containerFromSource = new OSMLContainer(stack, "TestContainer1", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: true,
      config: new ContainerConfig()
    });

    const containerFromRegistry = new OSMLContainer(stack, "TestContainer2", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: false,
      config: new ContainerConfig()
    });

    expect(containerFromSource.repositoryAccessMode).toBe("Platform");
    expect(containerFromRegistry.repositoryAccessMode).toBe("Platform");
  });

  test("uses custom Dockerfile path when building from source", () => {
    const container = new OSMLContainer(stack, "TestContainer", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: true,
      config: new ContainerConfig({
        CONTAINER_BUILD_PATH: "./custom",
        CONTAINER_DOCKERFILE: "custom/Dockerfile.prod"
      })
    });

    expect(container.dockerImageAsset).toBeDefined();
    expect(container.containerUri).toBeDefined();
  });

  test("uses build target when specified", () => {
    const container = new OSMLContainer(stack, "TestContainer", {
      account: {
        id: "123456789012",
        region: "us-west-2"
      },
      buildFromSource: true,
      config: new ContainerConfig({
        CONTAINER_BUILD_PATH: ".",
        CONTAINER_DOCKERFILE: "docker/Dockerfile",
        CONTAINER_BUILD_TARGET: "production"
      })
    });

    expect(container.dockerImageAsset).toBeDefined();
    expect(container.containerUri).toBeDefined();
  });
});
