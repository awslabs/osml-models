/*
 * Copyright 2025-2026 Amazon.com, Inc. or its affiliates.
 */

import {
  ContainerImage as SageMakerContainerImage,
  ContainerImageConfig,
  Model,
} from "@aws-cdk/aws-sagemaker-alpha";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { ContainerImage } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";

/**
 * Custom ContainerImage implementation for registry URIs (public registries or ECR URIs without repository object).
 * SageMaker alpha module doesn't support fromRegistry, so we create a custom implementation.
 */
class RegistryContainerImage extends SageMakerContainerImage {
  private readonly imageUri: string;

  constructor(imageUri: string) {
    super();
    this.imageUri = imageUri;
  }

  bind(scope: Construct, model: Model): ContainerImageConfig {
    // Parameters are required by interface signature but not used in this implementation
    void scope;
    void model;
    return {
      imageName: this.imageUri,
    };
  }
}

/**
 * Configuration for container image management.
 */
export class ContainerConfig {
  /**
   * URI of the container image in a registry (used when BUILD_FROM_SOURCE=false).
   */
  public readonly CONTAINER_URI: string;

  /**
   * Path to the directory containing the Dockerfile (used when BUILD_FROM_SOURCE=true).
   */
  public readonly CONTAINER_BUILD_PATH?: string;

  /**
   * Docker build target stage (used when BUILD_FROM_SOURCE=true).
   */
  public readonly CONTAINER_BUILD_TARGET?: string;

  /**
   * Path to the Dockerfile relative to CONTAINER_BUILD_PATH (used when BUILD_FROM_SOURCE=true).
   */
  public readonly CONTAINER_DOCKERFILE?: string;

  /**
   * Docker build arguments (used when BUILD_FROM_SOURCE=true).
   * Example: { CUSTOM_ARG: "value" }
   * Note: Checkpoint files should be provided at runtime, not via build args.
   */
  public readonly CONTAINER_BUILD_ARGS?: Record<string, string>;

  constructor(config?: Partial<ContainerConfig>) {
    this.CONTAINER_URI = config?.CONTAINER_URI ?? "awsosml/osml-models:latest";
    this.CONTAINER_BUILD_PATH = config?.CONTAINER_BUILD_PATH ?? ".";
    this.CONTAINER_BUILD_TARGET = config?.CONTAINER_BUILD_TARGET;
    this.CONTAINER_DOCKERFILE =
      config?.CONTAINER_DOCKERFILE ?? "docker/Dockerfile.sam3";
    this.CONTAINER_BUILD_ARGS = config?.CONTAINER_BUILD_ARGS;
  }
}

/**
 * Properties for the OSMLContainer construct.
 */
export interface ContainerProps {
  /**
   * Account configuration.
   */
  account: {
    /**
     * AWS account ID.
     */
    id: string;

    /**
     * AWS region.
     */
    region: string;

    /**
     * Whether this is a production-like environment.
     */
    prodLike?: boolean;
  };

  /**
   * Whether to build the container image from source.
   * If true, builds from Dockerfile using DockerImageAsset.
   * If false, pulls from CONTAINER_URI.
   */
  buildFromSource: boolean;

  /**
   * Container configuration.
   */
  config: ContainerConfig;
}

/**
 * Construct for managing Docker container images for SageMaker endpoints.
 * Supports both building from source and pulling from a registry.
 */
export class OSMLContainer extends Construct {
  /**
   * The Docker image asset (when building from source).
   */
  public readonly dockerImageAsset?: DockerImageAsset;

  /**
   * The container image for use in ECS (legacy, kept for compatibility).
   */
  public readonly containerImage: ContainerImage;

  /**
   * The container image for use in SageMaker endpoint configuration (L2 construct).
   */
  public readonly sagemakerContainerImage: SageMakerContainerImage;

  /**
   * The full URI of the container image.
   */
  public readonly containerUri: string;

  /**
   * The repository access mode for SageMaker.
   */
  public readonly repositoryAccessMode: string;

  constructor(scope: Construct, id: string, props: ContainerProps) {
    super(scope, id);

    if (props.buildFromSource) {
      // Build container image from source
      // Use SageMaker ContainerImage.fromAsset directly (simpler than DockerImageAsset + fromEcrRepository)
      // This builds the image and handles ECR push automatically
      this.sagemakerContainerImage = SageMakerContainerImage.fromAsset(
        props.config.CONTAINER_BUILD_PATH!,
        {
          file: props.config.CONTAINER_DOCKERFILE,
          target: props.config.CONTAINER_BUILD_TARGET,
          buildArgs: props.config.CONTAINER_BUILD_ARGS,
          platform: Platform.LINUX_AMD64,
        },
      );

      // Also create DockerImageAsset for ECS compatibility (if needed elsewhere)
      this.dockerImageAsset = new DockerImageAsset(this, "DockerAsset", {
        directory: props.config.CONTAINER_BUILD_PATH!,
        file: props.config.CONTAINER_DOCKERFILE,
        target: props.config.CONTAINER_BUILD_TARGET,
        buildArgs: props.config.CONTAINER_BUILD_ARGS,
        platform: Platform.LINUX_AMD64,
      });

      // ECS ContainerImage (for legacy compatibility)
      this.containerImage = ContainerImage.fromDockerImageAsset(
        this.dockerImageAsset,
      );
      this.containerUri = this.dockerImageAsset.imageUri;
      this.repositoryAccessMode = "Platform";
    } else {
      // Pull container image from registry
      // ECS ContainerImage (for legacy compatibility)
      this.containerImage = ContainerImage.fromRegistry(
        props.config.CONTAINER_URI,
      );
      // SageMaker ContainerImage (for L2 constructs)
      // Use custom RegistryContainerImage since SageMaker alpha doesn't support fromRegistry
      this.sagemakerContainerImage = new RegistryContainerImage(
        props.config.CONTAINER_URI,
      );
      this.containerUri = props.config.CONTAINER_URI;
      this.repositoryAccessMode = "Platform";
    }
  }
}
